import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import { inviteCodesTable, usersTable } from "@workspace/db/schema";
import { eq, and, isNull, or, count } from "drizzle-orm";
import { requireAuth } from "../../middleware/admin";

interface AuthedReq extends Request {
  currentUser: { id: number };
}

export const invitesRouter: IRouter = Router();

invitesRouter.post("/generate", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedReq).currentUser.id;

  const [existingPermanent] = await db
    .select()
    .from(inviteCodesTable)
    .where(
      and(
        eq(inviteCodesTable.createdBy, userId),
        isNull(inviteCodesTable.expiresAt),
      ),
    );

  const origin = process.env["APP_URL"] || `${req.protocol}://${req.get("host")}`;

  if (existingPermanent) {
    res.json({
      invite: existingPermanent,
      shareUrl: `${origin}/signup?invite=${existingPermanent.code}`,
    });
    return;
  }

  const code = crypto.randomBytes(6).toString("hex").toUpperCase();
  const [invite] = await db
    .insert(inviteCodesTable)
    .values({ code, createdBy: userId, expiresAt: null })
    .returning();

  res.json({ invite, shareUrl: `${origin}/signup?invite=${code}` });
});

invitesRouter.get("/mine", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedReq).currentUser.id;
  const codes = await db
    .select()
    .from(inviteCodesTable)
    .where(eq(inviteCodesTable.createdBy, userId))
    .orderBy(inviteCodesTable.createdAt);
  const [{ totalInvited }] = await db
    .select({ totalInvited: count() })
    .from(usersTable)
    .where(eq(usersTable.referredBy, userId));
  res.json({ codes, totalInvited });
});

invitesRouter.get("/validate/:code", async (req: Request, res: Response) => {
  const code = String(req.params["code"] || "").toUpperCase();
  const [invite] = await db
    .select()
    .from(inviteCodesTable)
    .where(
      and(
        eq(inviteCodesTable.code, code),
        eq(inviteCodesTable.isActive, true),
        or(
          isNull(inviteCodesTable.usedBy),
          isNull(inviteCodesTable.expiresAt),
        ),
      ),
    );
  if (!invite) {
    res.json({ valid: false });
    return;
  }
  res.json({ valid: true, code: invite.code });
});

export async function consumeInvite(code: string, newUserId: number): Promise<number | null> {
  const upper = code.toUpperCase();
  const [invite] = await db
    .select()
    .from(inviteCodesTable)
    .where(and(eq(inviteCodesTable.code, upper), eq(inviteCodesTable.isActive, true)));
  if (!invite) return null;

  if (invite.expiresAt !== null) {
    await db
      .update(inviteCodesTable)
      .set({ usedBy: newUserId, usedAt: new Date() })
      .where(eq(inviteCodesTable.id, invite.id));
  }

  // Non-blocking: tiered referral reward notifications
  void (async () => {
    try {
      const { notify } = await import("../notifications/notification.service");
      const { usersTable, userTrustScoresTable, loginEventsTable } = await import("@workspace/db/schema");
      const { eq: eqOp, and: andOp, or: orOp, gte: gteFn, count: countFn, avg: avgFn } = await import("drizzle-orm");
      const [newUser] = await db
        .select({ username: usersTable.username, displayName: usersTable.displayName, signupIpHash: usersTable.signupIpHash })
        .from(usersTable)
        .where(eqOp(usersTable.id, newUserId));
      const name = newUser?.displayName || newUser?.username || "Someone";

      const [inviter] = await db
        .select({ signupIpHash: usersTable.signupIpHash })
        .from(usersTable)
        .where(eqOp(usersTable.id, invite.createdBy));
      const recentLoginWindow = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const [matchingLogin] = newUser?.signupIpHash
        ? await db
          .select({ id: loginEventsTable.id })
          .from(loginEventsTable)
          .where(andOp(
            eqOp(loginEventsTable.userId, invite.createdBy),
            eqOp(loginEventsTable.ipHash, newUser.signupIpHash),
            gteFn(loginEventsTable.createdAt, recentLoginWindow),
          ))
          .limit(1)
        : [];
      const suspicious = Boolean(newUser?.signupIpHash) && (
        inviter?.signupIpHash === newUser.signupIpHash || Boolean(matchingLogin)
      );

      if (suspicious) {
        const admins = await db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(orOp(
            eqOp(usersTable.role, "admin"),
            eqOp(usersTable.role, "super_admin"),
          ));
        await Promise.all(admins.map((admin) => notify({
          userId: admin.id,
          actorId: 0,
          type: "admin_alert",
          title: "Suspicious referral flagged",
          message: `Referral from user ${invite.createdBy} matched the signup IP of the referred account. Reward withheld pending review.`,
          url: "/admin",
        })));
        return;
      }

      // Count users linked to this inviter and include their trust in the reward.
      const [{ total, averageTrust }] = await db
        .select({ total: countFn(), averageTrust: avgFn(userTrustScoresTable.uti) })
        .from(usersTable)
        .leftJoin(userTrustScoresTable, eqOp(userTrustScoresTable.userId, usersTable.id))
        .where(eqOp(usersTable.referredBy, invite.createdBy));
      const referralCount = Number(total) + 1;

      const { isFeatureEnabled } = await import("../../lib/featureFlags");
      const rewardsOn = await isFeatureEnabled("referral_rewards_enabled");
      if (rewardsOn) {
        const { addReputationEvent } = await import("../trust/reputation.service");
        const { updateUserTrustScore } = await import("../trust/trust.service");
        const averageTrustScore = Number(averageTrust) || 0;
        const bonus = Math.min(10, Math.max(1, referralCount + averageTrustScore / 20));
        await addReputationEvent(invite.createdBy, "milestone", "referral_reward", bonus);
        await updateUserTrustScore(invite.createdBy);
      }

      const MILESTONES: Record<number, string> = {
        1:  `🎉 ${name} just joined using your invite! Your first referral reward is on its way.`,
        3:  `🚀 ${name} joined - that's 3 referrals! You've unlocked a bonus creator badge.`,
        10: `🏆 10 friends joined through your link! You've reached Elite Referrer status.`,
        25: `👑 Incredible - 25 referrals! You've unlocked the Ambassador tier.`,
      };

      const message = MILESTONES[referralCount]
        ?? `🎁 ${name} joined using your invite! (Referral #${referralCount})`;

      await notify({
        userId: invite.createdBy,
        actorId: newUserId,
        type: "referral_reward",
        message,
      });
    } catch { /* best-effort */ }
  })();

  return invite.createdBy;
}
