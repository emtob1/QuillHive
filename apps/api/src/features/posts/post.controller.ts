import { Request, Response } from "express";
import { getSessionUserId } from "../../lib/auth";
import * as PostService from "./post.service";
import { db } from "@workspace/db";
import {
  postsTable, likesTable, commentsTable, followsTable,
  postSharesTable, repostsTable, savedPostsTable,
  commentLikesTable, userTrustScoresTable, usersTable, boostRequestsTable,
} from "@workspace/db/schema";
import { eq, and, desc, inArray, notInArray, sql, isNull, gte, lte, gt, or } from "drizzle-orm";
import { enrichPost } from "../profiles/profile.service";
import { recordPostView } from "../analytics/analytics.service";
import { updateUserTrustScoreSafe } from "../trust/trust.service";
import { getCache, setCache, deleteCachePattern } from "../../lib/cache";
import { memGet, memSet, memDeletePattern } from "../../lib/memCache";
import { addReputationEvent } from "../trust/reputation.service";
import { calculateRankingScore } from "./ranking.service";
import { logger } from "../../lib/logger";
import { isFeatureEnabled } from "../../lib/featureFlags";

function refreshTrustForUsers(...userIds: Array<number | null | undefined>) {
  for (const userId of [...new Set(userIds.filter(Boolean) as number[])]) {
    void updateUserTrustScoreSafe(userId);
  }
}

async function getRankingContext(postIds: number[], authorIds: number[]) {
  if (postIds.length === 0) return { authors: new Map(), trust: new Map(), boosts: new Map() };
  const now = new Date();
  try {
    const [authors, trustScores, boosts] = await Promise.all([
      db.select({ id: usersTable.id, isOfficialAccount: usersTable.isOfficialAccount, role: usersTable.role, reachMultiplier: usersTable.reachMultiplier })
        .from(usersTable).where(inArray(usersTable.id, [...new Set(authorIds)])),
      db.select({ userId: userTrustScoresTable.userId, uti: userTrustScoresTable.uti, visibilityMultiplier: userTrustScoresTable.visibilityMultiplier, tier: userTrustScoresTable.tier, creatorLevel: userTrustScoresTable.creatorLevel })
        .from(userTrustScoresTable).where(inArray(userTrustScoresTable.userId, [...new Set(authorIds)])),
      db.select({ postId: boostRequestsTable.postId, reachMultiplier: boostRequestsTable.reachMultiplier, placementPriority: boostRequestsTable.placementPriority })
        .from(boostRequestsTable).where(and(
          inArray(boostRequestsTable.postId, postIds),
          eq(boostRequestsTable.status, "approved"),
          or(isNull(boostRequestsTable.boostStartsAt), lte(boostRequestsTable.boostStartsAt, now)),
          or(isNull(boostRequestsTable.boostEndsAt), gt(boostRequestsTable.boostEndsAt, now)),
        )),
    ]);
    return {
      authors: new Map(authors.map(author => [author.id, author])),
      trust: new Map(trustScores.map(score => [score.userId, score])),
      boosts: new Map(boosts.map(boost => [boost.postId, boost])),
    };
  } catch (err) {
    logger.warn({ err }, "Optional ranking context unavailable; continuing with base feed order");
    return { authors: new Map(), trust: new Map(), boosts: new Map() };
  }
}

function getViewerId(req: Request): number | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  return getSessionUserId(auth.slice(7));
}

export const saveDraft = async (req: Request, res: Response) => {
  const viewerId = getViewerId(req);
  if (!viewerId) return res.status(401).json({ error: "Unauthorized" });

  const { draftId, title, content, type, tags, imageUrl } = req.body as {
    draftId?: number; title?: string; content: string; type?: string; tags?: string[]; imageUrl?: string;
  };

  const VALID_TYPES = ["post", "article", "story", "novel", "artwork", "spark"];
  const resolvedType = type === "blog" || type === "note" ? "post" : type && VALID_TYPES.includes(type) ? type : "post";

  if (draftId) {
    const [existing] = await db
      .select({ id: postsTable.id, authorId: postsTable.authorId, isPublished: postsTable.isPublished })
      .from(postsTable)
      .where(eq(postsTable.id, draftId));
    if (!existing || existing.authorId !== viewerId || existing.isPublished) {
      return res.status(404).json({ error: "Draft not found" });
    }
    await db.update(postsTable).set({
      title: title ?? null,
      content,
      type: resolvedType,
      tags: JSON.stringify(tags ?? []),
      imageUrl: imageUrl ?? null,
      updatedAt: new Date(),
    }).where(eq(postsTable.id, draftId));
    return res.json({ draftId });
  }

  const [created] = await db.insert(postsTable).values({
    authorId: viewerId,
    title: title ?? null,
    content,
    type: resolvedType,
    tags: JSON.stringify(tags ?? []),
    imageUrl: imageUrl ?? null,
    isPublished: false,
  }).returning({ id: postsTable.id });

  return res.json({ draftId: created.id });
};

export const listMyDrafts = async (req: Request, res: Response) => {
  const viewerId = getViewerId(req);
  if (!viewerId) return res.status(401).json({ error: "Unauthorized" });

  const drafts = await db
    .select({
      id: postsTable.id,
      title: postsTable.title,
      type: postsTable.type,
      content: postsTable.content,
      updatedAt: postsTable.updatedAt,
      createdAt: postsTable.createdAt,
    })
    .from(postsTable)
    .where(and(eq(postsTable.authorId, viewerId), eq(postsTable.isPublished, false), eq(postsTable.isDeleted, false)))
    .orderBy(desc(postsTable.updatedAt))
    .limit(50);

  return res.json({ drafts });
};

export const deleteDraft = async (req: Request, res: Response) => {
  const viewerId = getViewerId(req);
  if (!viewerId) return res.status(401).json({ error: "Unauthorized" });

  const draftId = parseInt(req.params.id, 10);
  if (!draftId || isNaN(draftId)) return res.status(400).json({ error: "Invalid draft id" });

  const [existing] = await db
    .select({ id: postsTable.id, authorId: postsTable.authorId, isPublished: postsTable.isPublished })
    .from(postsTable)
    .where(and(eq(postsTable.id, draftId), eq(postsTable.isDeleted, false)));

  if (!existing) return res.status(404).json({ error: "Draft not found" });
  if (existing.authorId !== viewerId) return res.status(403).json({ error: "Forbidden" });
  if (existing.isPublished) return res.status(400).json({ error: "Cannot delete a published post via this endpoint" });

  await db.update(postsTable).set({ isDeleted: true, updatedAt: new Date() }).where(eq(postsTable.id, draftId));
  return res.json({ ok: true });
};

export const getDraft = async (req: Request, res: Response) => {
  const viewerId = getViewerId(req);
  if (!viewerId) return res.status(401).json({ error: "Unauthorized" });

  const draftId = parseInt(req.params.id, 10);
  if (!draftId || isNaN(draftId)) return res.status(400).json({ error: "Invalid draft id" });

  const [draft] = await db
    .select({
      id: postsTable.id,
      title: postsTable.title,
      type: postsTable.type,
      content: postsTable.content,
      tags: postsTable.tags,
      imageUrl: postsTable.imageUrl,
      updatedAt: postsTable.updatedAt,
      createdAt: postsTable.createdAt,
    })
    .from(postsTable)
    .where(and(eq(postsTable.id, draftId), eq(postsTable.isPublished, false), eq(postsTable.isDeleted, false)));

  if (!draft) return res.status(404).json({ error: "Draft not found" });

  const [row] = await db.select({ authorId: postsTable.authorId }).from(postsTable).where(eq(postsTable.id, draftId));
  if (!row || row.authorId !== viewerId) return res.status(403).json({ error: "Forbidden" });

  return res.json({ draft });
};

export const listPosts = async (req: Request, res: Response) => {
  const viewerId = getViewerId(req);
  const type = req.query.type as string | undefined;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const feed = req.query.feed as string | undefined;
  const mine = req.query.mine === "true";

  if (mine) {
    if (!viewerId) return res.status(401).json({ error: "Unauthorized" });
    const posts = await db
      .select(PostService.stablePostSelection)
      .from(postsTable)
      .where(and(
        eq(postsTable.authorId, viewerId),
        eq(postsTable.isPublished, true),
        eq(postsTable.isDeleted, false),
        or(eq(postsTable.type, "spark"), isNull(postsTable.expiresAt), gt(postsTable.expiresAt, new Date())),
      ))
      .orderBy(desc(postsTable.createdAt))
      .limit(Math.min(limit, 50));
    return res.json({ posts });
  }

  const result = await PostService.listPosts(viewerId, { type, feed, page, limit });
  return res.json(result);
};

export const listRecentSparks = async (req: Request, res: Response) => {
  const viewerId = (req as any).currentUser.id as number;
  const recentCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const following = await db
    .select({ userId: followsTable.followingId })
    .from(followsTable)
    .where(eq(followsTable.followerId, viewerId));
  const authorIds = [...new Set([viewerId, ...following.map(row => row.userId)])];
  const rows = await db
    .select({
      id: postsTable.id,
      authorId: usersTable.id,
      authorUsername: usersTable.username,
      authorDisplayName: usersTable.displayName,
      authorAvatarUrl: usersTable.avatarUrl,
      content: postsTable.content,
      mediaUrl: postsTable.imageUrl,
      createdAt: postsTable.createdAt,
      expiresAt: postsTable.expiresAt,
      viewedBy: postsTable.viewedBy,
    })
    .from(postsTable)
    .innerJoin(usersTable, eq(usersTable.id, postsTable.authorId))
    .where(and(
      eq(postsTable.type, "spark"),
      eq(postsTable.isPublished, true),
      eq(postsTable.isDeleted, false),
      inArray(postsTable.authorId, authorIds),
      gte(postsTable.createdAt, recentCutoff),
    ))
    .orderBy(desc(postsTable.createdAt));

  const stories = new Map<number, {
    authorId: number;
    authorUsername: string;
    authorDisplayName: string;
    authorAvatarUrl: string | null;
    sparks: Array<{ id: number; content: string; mediaUrl: string | null; createdAt: Date; expiresAt: Date | null; viewed: boolean }>;
    hasUnviewed: boolean;
  }>();

  for (const row of rows) {
    const viewedBy = Array.isArray(row.viewedBy) ? row.viewedBy : [];
    const viewed = viewedBy.includes(viewerId);
    const story = stories.get(row.authorId) ?? {
      authorId: row.authorId,
      authorUsername: row.authorUsername,
      authorDisplayName: row.authorDisplayName,
      authorAvatarUrl: row.authorAvatarUrl,
      sparks: [],
      hasUnviewed: false,
    };
    story.sparks.push({ id: row.id, content: row.content, mediaUrl: row.mediaUrl, createdAt: row.createdAt, expiresAt: row.expiresAt, viewed });
    story.hasUnviewed ||= !viewed;
    stories.set(row.authorId, story);
  }

  return res.json({ stories: [...stories.values()] });
};

export const viewSpark = async (req: Request, res: Response) => {
  const viewerId = (req as any).currentUser.id as number;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid spark id" });

  const updated = await db
    .update(postsTable)
    .set({ viewedBy: sql`coalesce(${postsTable.viewedBy}, '[]'::jsonb) || jsonb_build_array(${viewerId})` })
    .where(and(
      eq(postsTable.id, id),
      eq(postsTable.type, "spark"),
      eq(postsTable.isDeleted, false),
      sql`not (coalesce(${postsTable.viewedBy}, '[]'::jsonb) @> jsonb_build_array(${viewerId}))`,
    ));

  if ((updated as { rowCount?: number }).rowCount === 0) {
    const [spark] = await db.select({ id: postsTable.id }).from(postsTable).where(and(eq(postsTable.id, id), eq(postsTable.type, "spark")));
    if (!spark) return res.status(404).json({ error: "Spark not found" });
  }
  return res.json({ success: true });
};

export const createPost = async (req: Request, res: Response) => {
  const viewerId = getViewerId(req);
  if (!viewerId) return res.status(401).json({ error: "Unauthorized" });

  const { title, titleA, titleB, content, excerpt, type, imageUrl, attachments, tags, isPublished, groupId, seriesId, quotedPostId, scheduledAt } = req.body;
  if (!content || !type) return res.status(400).json({ error: "Content and type are required" });
  if (!(await isFeatureEnabled("post_creation_enabled"))) {
    return res.status(403).json({ error: "post_creation_disabled", message: "Post creation is temporarily disabled." });
  }
  if (type === "spark" && !(await isFeatureEnabled("quick_posts_enabled"))) {
    return res.status(403).json({ error: "quick_posts_disabled", message: "Quick posts are temporarily disabled." });
  }
  if (type === "poll" && !(await isFeatureEnabled("polls_enabled"))) {
    return res.status(403).json({ error: "polls_disabled", message: "Polls are temporarily disabled." });
  }

  try {
    const post = await PostService.createPost(viewerId, { title, titleA, titleB, content, excerpt, type, imageUrl, attachments, tags, isPublished, groupId, seriesId, quotedPostId, scheduledAt });
    refreshTrustForUsers(viewerId);
    void deleteCachePattern(`feed:*`);
    void deleteCachePattern(`trending:*`); memDeletePattern("trending:");
    return res.status(201).json(post);
  } catch (e) {
    const err = e as { code?: string; status?: number; message?: string; similarPostIds?: number[]; topSimilarity?: number };
    if (err?.code === "DUPLICATE_CONTENT") {
      return res.status(err.status ?? 409).json({
        error: "DUPLICATE_CONTENT",
        message: err.message ?? "This post is very similar to existing content.",
        similarPostIds: err.similarPostIds ?? [],
        topSimilarity: err.topSimilarity ?? 0,
      });
    }
    throw e;
  }
};

// A/B title click tracking. Increments titleAClicks or titleBClicks; never errors hard.
export const trackAbClick = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const variant = String(req.params.variant);
  if (!Number.isInteger(id) || (variant !== "a" && variant !== "b")) {
    return res.status(400).json({ error: "Invalid id or variant" });
  }
  const col = variant === "a" ? postsTable.titleAClicks : postsTable.titleBClicks;
  await db
    .update(postsTable)
    .set({ [variant === "a" ? "titleAClicks" : "titleBClicks"]: sql`${col} + 1` })
    .where(eq(postsTable.id, id));
  return res.json({ ok: true });
};

export const getPost = async (req: Request, res: Response) => {
  const viewerId = getViewerId(req);
  const id = parseInt(req.params.id);
  const post = await PostService.getPostById(id, viewerId);
  if (!post) return res.status(404).json({ error: "Post not found" });
  await recordPostView(id, viewerId, req);
  return res.json(post);
};

export const updatePost = async (req: Request, res: Response) => {
  const viewerId = getViewerId(req);
  if (!viewerId) return res.status(401).json({ error: "Unauthorized" });
  const id = parseInt(req.params.id);
  try {
    const post = await PostService.updatePost(id, viewerId, req.body);
    if (!post) return res.status(404).json({ error: "Post not found" });
    return res.json(post);
  } catch (e: any) {
    if (e.message === "Forbidden") return res.status(403).json({ error: "Forbidden" });
    throw e;
  }
};

export const deletePost = async (req: Request, res: Response) => {
  const viewerId = getViewerId(req);
  if (!viewerId) return res.status(401).json({ error: "Unauthorized" });
  const id = parseInt(req.params.id);
  try {
    const ok = await PostService.deletePost(id, viewerId);
    if (!ok) return res.status(404).json({ error: "Post not found" });
    return res.json({ success: true });
  } catch (e: any) {
    if (e.message === "Forbidden") return res.status(403).json({ error: "Forbidden" });
    throw e;
  }
};

export const getComments = async (req: Request, res: Response) => {
  const viewerId = getViewerId(req);
  const id = parseInt(req.params.id);
  const comments = await PostService.getComments(id, viewerId);
  return res.json(comments);
};

export const createComment = async (req: Request, res: Response) => {
  const viewerId = getViewerId(req);
  if (!viewerId) return res.status(401).json({ error: "Unauthorized" });
  const id = parseInt(req.params.id);
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: "Content is required" });
  const comment = await PostService.createComment(id, viewerId, content);
  const [post] = await db.select({ authorId: postsTable.authorId }).from(postsTable).where(eq(postsTable.id, id));
  refreshTrustForUsers(viewerId, post?.authorId);
  void addReputationEvent(viewerId, "comment_added", "You added a comment");
  if (post?.authorId && post.authorId !== viewerId) {
    void addReputationEvent(post.authorId, "comment_added", "Someone commented on your post");
  }
  return res.status(201).json(comment);
};

export const likePost = async (req: Request, res: Response) => {
  const viewerId = getViewerId(req);
  if (!viewerId) return res.status(401).json({ error: "Unauthorized" });
  const id = parseInt(req.params.id);
  const result = await PostService.toggleLike(id, viewerId);
  const [post] = await db.select({ authorId: postsTable.authorId }).from(postsTable).where(eq(postsTable.id, id));
  refreshTrustForUsers(viewerId, post?.authorId);
  void deleteCachePattern(`feed:${viewerId}:*`);
  void deleteCachePattern(`trending:*`); memDeletePattern("trending:");
  if (result.liked && post?.authorId && post.authorId !== viewerId) {
    void addReputationEvent(post.authorId, "post_like", "Someone liked your post");
    // Weighted curation karma: trusted/established curators signal higher-quality content
    db.select({ tier: userTrustScoresTable.tier, creatorLevel: userTrustScoresTable.creatorLevel })
      .from(userTrustScoresTable)
      .where(eq(userTrustScoresTable.userId, viewerId))
      .limit(1)
      .then(([curatorScore]) => {
        if (!curatorScore) return;
        const isHighSignal =
          curatorScore.tier === "trusted" ||
          ["established", "featured", "luminary"].includes(curatorScore.creatorLevel ?? "");
        if (isHighSignal) {
          void addReputationEvent(post.authorId!, "post_saved" as any, "Your post was curated by a verified expert");
        }
      })
      .catch(() => {});
  }
  return res.json(result);
};

export const getCurators = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const rows = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      displayName: usersTable.displayName,
      avatarUrl: usersTable.avatarUrl,
      tier: userTrustScoresTable.tier,
      creatorLevel: userTrustScoresTable.creatorLevel,
      uti: userTrustScoresTable.uti,
    })
    .from(likesTable)
    .innerJoin(usersTable, eq(likesTable.userId, usersTable.id))
    .leftJoin(userTrustScoresTable, eq(usersTable.id, userTrustScoresTable.userId))
    .where(eq(likesTable.postId, id))
    .orderBy(desc(userTrustScoresTable.uti))
    .limit(30);

  const notable = rows.filter(c =>
    c.tier === "trusted" ||
    ["established", "featured", "luminary"].includes(c.creatorLevel ?? "")
  );
  return res.json({ curators: notable.slice(0, 12), total: rows.length });
};

export const getFeed = async (req: Request, res: Response) => {
  const viewerId = getViewerId(req);
  const type = (req.query.type as string) || "algorithmic";
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const offset = (page - 1) * limit;
  const since = typeof req.query.since === "string" ? new Date(req.query.since) : null;
  const hasSince = since && !Number.isNaN(since.getTime());
  const mutedIds = await PostService.getMutedUserIds(viewerId);

  const cacheKey = `feed:${viewerId ?? "anon"}:${type}:${page}:${limit}:${mutedIds.join(",")}:${hasSince ? since.toISOString() : "all"}`;
  const cached = await getCache<object>(cacheKey);
  if (cached) return res.json(cached);

  const posts = await db
    .select(PostService.stablePostSelection)
    .from(postsTable)
    .where(and(
      eq(postsTable.isPublished, true),
      eq(postsTable.isDeleted, false),
      or(eq(postsTable.type, "spark"), isNull(postsTable.expiresAt), gt(postsTable.expiresAt, new Date())),
      ...(mutedIds.length > 0 ? [notInArray(postsTable.authorId, mutedIds)] : []),
      ...(hasSince ? [gt(postsTable.createdAt, since)] : []),
    ))
    .orderBy(desc(postsTable.createdAt))
    .limit(type === "chronological" ? limit : Math.max(limit * 10, 200))
    .offset(type === "chronological" ? offset : 0);

  if (type === "chronological") {
    const enriched = await Promise.all(posts.slice(0, limit).map(p => enrichPost(p, viewerId)));
    const result = { posts: enriched, total: enriched.length, page, limit, type };
    await setCache(cacheKey, result, 60);
    return res.json(result);
  }

  const postIds = posts.map(p => p.id);

  const likeCounts = postIds.length > 0
    ? await db.select({ postId: likesTable.postId, count: sql<number>`count(*)::int` })
        .from(likesTable).where(inArray(likesTable.postId, postIds)).groupBy(likesTable.postId)
    : [];

  const commentCounts = postIds.length > 0
    ? await db.select({ postId: commentsTable.postId, count: sql<number>`count(*)::int` })
        .from(commentsTable).where(inArray(commentsTable.postId, postIds)).groupBy(commentsTable.postId)
    : [];

  const shareCounts = postIds.length > 0
    ? await db.select({ postId: postSharesTable.postId, count: sql<number>`count(*)::int` })
        .from(postSharesTable).where(inArray(postSharesTable.postId, postIds)).groupBy(postSharesTable.postId)
    : [];

  const repostCounts = postIds.length > 0
    ? await db.select({ postId: repostsTable.postId, count: sql<number>`count(*)::int` })
        .from(repostsTable).where(inArray(repostsTable.postId, postIds)).groupBy(repostsTable.postId)
    : [];

  const likeMap = new Map<number, number>(likeCounts.map(l => [l.postId, Number(l.count)]));
  const commentMap = new Map<number, number>(commentCounts.map(c => [c.postId, Number(c.count)]));
  const shareMap = new Map<number, number>(shareCounts.map(s => [s.postId, Number(s.count)]));
  const repostMap = new Map<number, number>(repostCounts.map(r => [r.postId, Number(r.count)]));
  const now = Date.now();

  const authorIds = [...new Set(posts.map(p => p.authorId))];
  const trustScores = authorIds.length > 0
    ? await db.select({ userId: userTrustScoresTable.userId, uti: userTrustScoresTable.uti, tier: userTrustScoresTable.tier, creatorLevel: userTrustScoresTable.creatorLevel, vm: userTrustScoresTable.visibilityMultiplier })
        .from(userTrustScoresTable)
        .where(inArray(userTrustScoresTable.userId, authorIds))
    : [];
  const trustMap = new Map<number, { tier: string; creatorLevel: string; vm: number }>(
    trustScores.map(t => [t.userId, { tier: t.tier ?? "normal", creatorLevel: t.creatorLevel ?? "new_voice", vm: Number(t.vm ?? 1) }])
  );

  const authorProfiles = authorIds.length > 0
    ? await db.select({
        id: usersTable.id,
        reachMultiplier: usersTable.reachMultiplier,
        isOfficialAccount: usersTable.isOfficialAccount,
        role: usersTable.role,
      }).from(usersTable).where(inArray(usersTable.id, authorIds))
    : [];
  const authorProfileMap = new Map(authorProfiles.map(author => [author.id, author]));

  const activeBoosts = postIds.length > 0
    ? await (async () => {
        try {
          return await db.select({
            postId: boostRequestsTable.postId,
            reachMultiplier: boostRequestsTable.reachMultiplier,
            placementPriority: boostRequestsTable.placementPriority,
          }).from(boostRequestsTable).where(and(
            inArray(boostRequestsTable.postId, postIds),
            eq(boostRequestsTable.status, "approved"),
            or(isNull(boostRequestsTable.boostStartsAt), lte(boostRequestsTable.boostStartsAt, new Date())),
            or(isNull(boostRequestsTable.boostEndsAt), gt(boostRequestsTable.boostEndsAt, new Date())),
          ));
        } catch (err) {
          logger.warn({ err }, "Optional boost ranking unavailable; continuing without boosts");
          return [];
        }
      })()
    : [];
  const boostMap = new Map(activeBoosts.map(boost => [boost.postId, boost]));

  // Cold-start boost: query join dates for all authors to identify new creators
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const authorJoinDates = authorIds.length > 0
    ? await db.select({ id: usersTable.id, createdAt: usersTable.createdAt })
        .from(usersTable)
        .where(and(inArray(usersTable.id, authorIds), gte(usersTable.createdAt, thirtyDaysAgo)))
    : [];
  const newCreatorSet = new Set(authorJoinDates.map(a => a.id));

  const scored = posts.map(post => {
    const likes = Number(likeMap.get(post.id) ?? 0);
    const comments = Number(commentMap.get(post.id) ?? 0);
    const shares = Number(shareMap.get(post.id) ?? 0);
    const reposts = Number(repostMap.get(post.id) ?? 0);
    const ageHours = (now - new Date(post.createdAt).getTime()) / (1000 * 60 * 60);

    const trust = trustMap.get(post.authorId);
    const tier = trust?.tier ?? "normal";
    const vm = trust?.vm ?? 1.0;
    const author = authorProfileMap.get(post.authorId);
    const activeBoost = boostMap.get(post.id);
    const score = calculateRankingScore({
      ageHours,
      engagementScore: likes * 2 + comments * 3 + shares * 4 + reposts * 5,
      authorTrustScore: trustScores.find(t => t.userId === post.authorId)?.uti,
      visibilityMultiplier: vm,
      authorReachMultiplier: Number(author?.reachMultiplier ?? 1),
      author: {
      isOfficialAccount: author?.isOfficialAccount,
      role: author?.role,
      tier,
      creatorLevel: trust?.creatorLevel,
      },
      post,
      isOfficialPost: (post as { isOfficialPost?: boolean | null }).isOfficialPost,
      activeBoost,
    });
    return { post, score, tier };
  });

  scored.sort((a, b) => b.score - a.score);
  const topPosts = scored.slice(offset, offset + limit).map(s => s.post);
  const enriched = await Promise.all(topPosts.map(p => enrichPost(p, viewerId)));
  const feedResult = { posts: enriched, total: enriched.length, page, limit, type };
  await setCache(cacheKey, feedResult, 90);
  return res.json(feedResult);
};

export const sharePost = async (req: Request, res: Response) => {
  const viewerId = getViewerId(req);
  if (!viewerId) return res.status(401).json({ error: "Unauthorized" });
  const id = parseInt(req.params.id);
  const [post] = await db.select().from(postsTable).where(eq(postsTable.id, id));
  if (!post) return res.status(404).json({ error: "Post not found" });
  const existing = await db.select().from(postSharesTable).where(and(eq(postSharesTable.postId, id), eq(postSharesTable.userId, viewerId)));
  if (existing.length === 0) {
    await db.insert(postSharesTable).values({ postId: id, userId: viewerId });
  }
  refreshTrustForUsers(viewerId, post.authorId);
  const [sharesResult] = await db.select({ count: sql<number>`count(*)::int` }).from(postSharesTable).where(eq(postSharesTable.postId, id));
  return res.json({ shared: true, sharesCount: sharesResult?.count ?? 0 });
};

// Public, anonymous share-click tracking (fire-and-forget from frontend ShareSheet)
export const trackShareClick = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const sourceRaw = String(req.body?.source ?? "direct").slice(0, 40);
  const source = sourceRaw.replace(/[^a-z0-9_-]/gi, "").toLowerCase() || "direct";
  try {
    await db
      .update(postsTable)
      .set({ shareClickCount: sql`${postsTable.shareClickCount} + 1` })
      .where(eq(postsTable.id, id));
    await db.insert(postSharesTable).values({ postId: id, userId: null, source, clickCount: 1 });
  } catch {
    // never throw - fire-and-forget
  }
  return res.json({ ok: true });
};

export const repostPost = async (req: Request, res: Response) => {
  const viewerId = getViewerId(req);
  if (!viewerId) return res.status(401).json({ error: "Unauthorized" });
  const id = parseInt(req.params.id);
  const [post] = await db.select().from(postsTable).where(eq(postsTable.id, id));
  if (!post) return res.status(404).json({ error: "Post not found" });

  const [existing] = await db
    .select()
    .from(repostsTable)
    .where(and(eq(repostsTable.postId, id), eq(repostsTable.userId, viewerId)));

  let isReposted: boolean;
  if (existing) {
    await db.delete(repostsTable).where(and(eq(repostsTable.postId, id), eq(repostsTable.userId, viewerId)));
    isReposted = false;
  } else {
    await db.insert(repostsTable).values({ postId: id, userId: viewerId });
    isReposted = true;
  }
  refreshTrustForUsers(viewerId, post.authorId);

  const [repostsResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(repostsTable)
    .where(eq(repostsTable.postId, id));

  return res.json({ isReposted, repostsCount: repostsResult?.count ?? 0 });
};

export const getReposts = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const reposts = await db
    .select({ userId: repostsTable.userId, createdAt: repostsTable.createdAt })
    .from(repostsTable)
    .where(eq(repostsTable.postId, id))
    .orderBy(desc(repostsTable.createdAt))
    .limit(50);
  return res.json(reposts);
};

export const savePost = async (req: Request, res: Response) => {
  const viewerId = getViewerId(req);
  if (!viewerId) return res.status(401).json({ error: "Unauthorized" });
  const id = parseInt(req.params.id);
  const [post] = await db.select().from(postsTable).where(eq(postsTable.id, id));
  if (!post) return res.status(404).json({ error: "Post not found" });

  const [existing] = await db
    .select()
    .from(savedPostsTable)
    .where(and(eq(savedPostsTable.postId, id), eq(savedPostsTable.userId, viewerId)));

  if (existing) {
    return res.status(409).json({ error: "Already saved" });
  }

  await db.insert(savedPostsTable).values({ postId: id, userId: viewerId });
  refreshTrustForUsers(viewerId, post.authorId);
  return res.json({ saved: true });
};

export const unsavePost = async (req: Request, res: Response) => {
  const viewerId = getViewerId(req);
  if (!viewerId) return res.status(401).json({ error: "Unauthorized" });
  const id = parseInt(req.params.id);

  await db.delete(savedPostsTable).where(
    and(eq(savedPostsTable.postId, id), eq(savedPostsTable.userId, viewerId))
  );
  return res.json({ saved: false });
};

export const getMySavedPosts = async (req: Request, res: Response) => {
  const viewerId = getViewerId(req);
  if (!viewerId) return res.status(401).json({ error: "Unauthorized" });
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(savedPostsTable)
    .where(eq(savedPostsTable.userId, viewerId));

  const savedRows = await db
    .select({ postId: savedPostsTable.postId })
    .from(savedPostsTable)
    .where(eq(savedPostsTable.userId, viewerId))
    .orderBy(desc(savedPostsTable.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  const postIds = savedRows.map(r => r.postId);
  if (postIds.length === 0) return res.json({ posts: [], total, page, limit, hasMore: false });

  const posts = await db
    .select()
    .from(postsTable)
    .where(and(inArray(postsTable.id, postIds), eq(postsTable.isDeleted, false)));

  const postsById = new Map(posts.map(post => [post.id, post]));
  const enriched = await Promise.all(postIds.flatMap(postId => {
    const post = postsById.get(postId);
    return post ? [enrichPost(post, viewerId)] : [];
  }));
  return res.json({ posts: enriched, total, page, limit, hasMore: page * limit < total });
};

export const replyToComment = async (req: Request, res: Response) => {
  const viewerId = getViewerId(req);
  if (!viewerId) return res.status(401).json({ error: "Unauthorized" });

  const commentId = parseInt(req.params.id);
  if (isNaN(commentId)) return res.status(400).json({ error: "Invalid comment id" });

  const [parent] = await db.select().from(commentsTable).where(eq(commentsTable.id, commentId));
  if (!parent) return res.status(404).json({ error: "Comment not found" });

  const newDepth = (parent.depth ?? 0) + 1;
  if (newDepth > 3) return res.status(400).json({ error: "Max thread depth (3) reached" });

  const { content } = req.body;
  if (!content) return res.status(400).json({ error: "Content is required" });

  const [reply] = await db.insert(commentsTable).values({
    postId: parent.postId,
    authorId: viewerId,
    content,
    parentCommentId: commentId,
    depth: newDepth,
  }).returning();

  await db.update(commentsTable)
    .set({ replyCount: sql`${commentsTable.replyCount} + 1` })
    .where(eq(commentsTable.id, commentId));

  refreshTrustForUsers(viewerId, parent.authorId);
  const { notify } = await import("../notifications/notification.service");
  await notify({
    userId: parent.authorId,
    actorId: viewerId,
    type: "reply",
    message: "replied to your comment",
    postId: parent.postId,
    digestGroup: `reply:${commentId}`,
  });
  return res.status(201).json(reply);
};

export const getCommentReplies = async (req: Request, res: Response) => {
  const commentId = parseInt(req.params.id);
  if (isNaN(commentId)) return res.status(400).json({ error: "Invalid comment id" });

  const replies = await db
    .select()
    .from(commentsTable)
    .where(eq(commentsTable.parentCommentId, commentId))
    .orderBy(desc(commentsTable.createdAt))
    .limit(50);

  return res.json(replies);
};

export const likeComment = async (req: Request, res: Response) => {
  const viewerId = getViewerId(req);
  if (!viewerId) return res.status(401).json({ error: "Unauthorized" });

  const commentId = parseInt(req.params.id);
  if (isNaN(commentId)) return res.status(400).json({ error: "Invalid comment id" });

  const [existing] = await db
    .select()
    .from(commentLikesTable)
    .where(and(eq(commentLikesTable.commentId, commentId), eq(commentLikesTable.userId, viewerId)));

  if (existing) {
    await db.delete(commentLikesTable)
      .where(and(eq(commentLikesTable.commentId, commentId), eq(commentLikesTable.userId, viewerId)));
    await db.update(commentsTable)
      .set({ likeCount: sql`GREATEST(0, ${commentsTable.likeCount} - 1)` })
      .where(eq(commentsTable.id, commentId));
    const [comment] = await db.select({ authorId: commentsTable.authorId, likeCount: commentsTable.likeCount }).from(commentsTable).where(eq(commentsTable.id, commentId));
    refreshTrustForUsers(viewerId, comment?.authorId);
    return res.json({ liked: false, likeCount: comment?.likeCount ?? 0 });
  }

  await db.insert(commentLikesTable).values({ commentId, userId: viewerId });
  await db.update(commentsTable)
    .set({ likeCount: sql`${commentsTable.likeCount} + 1` })
    .where(eq(commentsTable.id, commentId));

  const [comment] = await db.select({ authorId: commentsTable.authorId, likeCount: commentsTable.likeCount, postId: commentsTable.postId }).from(commentsTable).where(eq(commentsTable.id, commentId));
  refreshTrustForUsers(viewerId, comment?.authorId);
  if (comment?.authorId) {
    const { notify } = await import("../notifications/notification.service");
    await notify({
      userId: comment.authorId,
      actorId: viewerId,
      type: "comment_like",
      message: "liked your comment",
      postId: comment.postId,
      digestGroup: `clike:${commentId}`,
    });
  }
  return res.json({ liked: true, likeCount: comment?.likeCount ?? 1 });
};

export const getTopLevelComments = async (req: Request, res: Response) => {
  const postId = parseInt(req.params.id);
  if (isNaN(postId)) return res.status(400).json({ error: "Invalid post id" });

  const comments = await db
    .select()
    .from(commentsTable)
    .where(and(eq(commentsTable.postId, postId), isNull(commentsTable.parentCommentId)))
    .orderBy(desc(commentsTable.createdAt))
    .limit(50);

  return res.json(comments);
};

export const getTrending = async (req: Request, res: Response) => {
  const viewerId = getViewerId(req);
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

  const cacheKey = `trending:posts:${limit}`;
  const memHit = memGet<object>(cacheKey);
  if (memHit) return res.json(memHit);
  const cached = await getCache<object>(cacheKey);
  if (cached) {
    memSet(cacheKey, cached, 60);
    return res.json(cached);
  }

  const posts = await db
    .select()
    .from(postsTable)
    .where(and(
      eq(postsTable.isPublished, true),
      eq(postsTable.isDeleted, false),
      or(eq(postsTable.type, "spark"), isNull(postsTable.expiresAt), gt(postsTable.expiresAt, new Date())),
    ))
    .orderBy(desc(postsTable.createdAt))
    .limit(200);

  if (posts.length === 0) return res.json({ posts: [], total: 0 });

  const postIds = posts.map(p => p.id);
  const rankingContext = await getRankingContext(postIds, [...new Set(posts.map(p => p.authorId))]);

  const [likeCounts, commentCounts, repostCounts] = await Promise.all([
    db.select({ postId: likesTable.postId, count: sql<number>`count(*)::int` })
      .from(likesTable).where(inArray(likesTable.postId, postIds)).groupBy(likesTable.postId),
    db.select({ postId: commentsTable.postId, count: sql<number>`count(*)::int` })
      .from(commentsTable).where(inArray(commentsTable.postId, postIds)).groupBy(commentsTable.postId),
    db.select({ postId: repostsTable.postId, count: sql<number>`count(*)::int` })
      .from(repostsTable).where(inArray(repostsTable.postId, postIds)).groupBy(repostsTable.postId),
  ]);

  const likeMap = new Map<number, number>(likeCounts.map(l => [l.postId, Number(l.count)]));
  const commentMap = new Map<number, number>(commentCounts.map(c => [c.postId, Number(c.count)]));
  const repostMap = new Map<number, number>(repostCounts.map(r => [r.postId, Number(r.count)]));
  const now = Date.now();

  const scored = posts.map(post => {
    const likes = Number(likeMap.get(post.id) ?? 0);
    const comments = Number(commentMap.get(post.id) ?? 0);
    const reposts = Number(repostMap.get(post.id) ?? 0);
    const rawScore = likes * 2 + comments * 3 + reposts * 5;
    const ageHours = (now - new Date(post.createdAt).getTime()) / (1000 * 60 * 60);
    const author = rankingContext.authors.get(post.authorId);
    const trust = rankingContext.trust.get(post.authorId);
    const score = calculateRankingScore({
      ageHours,
      engagementScore: rawScore,
      authorTrustScore: trust?.uti,
      visibilityMultiplier: trust?.visibilityMultiplier,
      authorReachMultiplier: author?.reachMultiplier,
      author: { isOfficialAccount: author?.isOfficialAccount, role: author?.role, tier: trust?.tier, creatorLevel: trust?.creatorLevel },
      post,
      isOfficialPost: post.isOfficialPost,
      activeBoost: rankingContext.boosts.get(post.id),
    });
    return { post, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, limit).map(s => s.post);
  const enriched = await Promise.all(top.map(p => enrichPost(p, viewerId)));
  const trendingResult = { posts: enriched, total: enriched.length };
  memSet(cacheKey, trendingResult, 60);
  await setCache(cacheKey, trendingResult, 120);
  return res.json(trendingResult);
};

// Motion - creator-first video feed. Filters posts where type='video'
// or attachments contain a video MIME type / video file extension.
export const getMotion = async (req: Request, res: Response) => {
  const viewerId = getViewerId(req);
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
  const feed = req.query.feed as string | undefined;

  let followingIds: number[] = [];
  if (viewerId) {
    const f = await db.select({ userId: followsTable.followingId })
      .from(followsTable).where(eq(followsTable.followerId, viewerId));
    followingIds = f.map(x => x.userId);
  }

  const baseConds = [
    eq(postsTable.isPublished, true),
    eq(postsTable.isDeleted, false),
    or(eq(postsTable.type, "spark"), isNull(postsTable.expiresAt), gt(postsTable.expiresAt, new Date())),
    sql`(${postsTable.type} = 'video' OR ${postsTable.attachments} ILIKE '%"mimeType":"video/%' OR ${postsTable.attachments} ~* '\\.(mp4|mov|webm|m4v|ogv)"')`,
  ];

  if (feed === "following") {
    if (!viewerId || followingIds.length === 0) {
      return res.json({ posts: [], total: 0, page, limit });
    }
    baseConds.push(inArray(postsTable.authorId, followingIds));
  }

  const candidates = await db.select().from(postsTable)
    .where(and(...baseConds))
    .orderBy(desc(postsTable.createdAt))
    .limit(limit * 3)
    .offset((page - 1) * limit);

  if (candidates.length === 0) return res.json({ posts: [], total: 0, page, limit });

  const postIds = candidates.map(p => p.id);
  const rankingContext = await getRankingContext(postIds, [...new Set(candidates.map(p => p.authorId))]);
  const [likeCounts, commentCounts] = await Promise.all([
    db.select({ postId: likesTable.postId, count: sql<number>`count(*)::int` })
      .from(likesTable).where(inArray(likesTable.postId, postIds)).groupBy(likesTable.postId),
    db.select({ postId: commentsTable.postId, count: sql<number>`count(*)::int` })
      .from(commentsTable).where(inArray(commentsTable.postId, postIds)).groupBy(commentsTable.postId),
  ]);
  const likeMap = new Map<number, number>(likeCounts.map(l => [l.postId, Number(l.count)]));
  const commentMap = new Map<number, number>(commentCounts.map(c => [c.postId, Number(c.count)]));
  const now = Date.now();

  const scored = candidates.map(post => {
    const likes = Number(likeMap.get(post.id) ?? 0);
    const comments = Number(commentMap.get(post.id) ?? 0);
    const ageHours = (now - new Date(post.createdAt).getTime()) / 3_600_000;
    const author = rankingContext.authors.get(post.authorId);
    const trust = rankingContext.trust.get(post.authorId);
    const score = calculateRankingScore({
      ageHours,
      engagementScore: likes * 2 + comments * 3,
      relevanceScore: feed === "trending" ? 1.1 : 1,
      authorTrustScore: trust?.uti,
      visibilityMultiplier: trust?.visibilityMultiplier,
      authorReachMultiplier: author?.reachMultiplier,
      author: { isOfficialAccount: author?.isOfficialAccount, role: author?.role, tier: trust?.tier, creatorLevel: trust?.creatorLevel },
      post,
      isOfficialPost: post.isOfficialPost,
      activeBoost: rankingContext.boosts.get(post.id),
    });
    return { post, score };
  });
  scored.sort((a, b) => b.score - a.score);

  const top = scored.slice(0, limit).map(s => s.post);
  const enriched = await Promise.all(top.map(p => enrichPost(p, viewerId)));
  return res.json({ posts: enriched, total: enriched.length, page, limit });
};
