import { useEffect, useState } from "react";
import { Link } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { BarChart3, Eye, Heart, MessageCircle, TrendingUp, Users, ArrowUpRight, Zap, ShieldCheck, RefreshCw, Activity, Target, Globe, DollarSign, Rocket, Clock, Check, Trophy, Flag, Star, Lock, PenLine } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { getStoredToken } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { useT } from "@/lib/i18n";
import { GrowthScoreCard } from "@/components/dashboard/GrowthScoreCard";
import { OpportunityPanel } from "@/components/dashboard/OpportunityPanel";
import { MomentumCard } from "@/components/dashboard/MomentumCard";
import { ContentIntelligenceCard } from "@/components/dashboard/ContentIntelligenceCard";
import { OpportunitySignals } from "@/components/dashboard/OpportunitySignals";
import { ProfileStrengthMeter } from "@/components/profile/ProfileStrengthMeter";
import { CreatorMomentumHQ } from "@/components/profile/CreatorMomentumHQ";

type TrustScore = {
  uti: number;
  cvs: number;
  bcs: number;
  cts: number;
  avgCis: number;
  tier: string;
  visibilityMultiplier: number;
  creatorLevel: string;
};

type DailyPoint = { date: string; count: number };

type GeoEntry = { country: string; views: number };
type IncomeEntry = { id: number; amount: number; currency: string; source: string; description?: string; earnedAt?: string };

type BoostRequest = {
  id: number;
  plan: string;
  status: "pending" | "approved" | "rejected";
  adminNote?: string | null;
  createdAt: string;
  boostStartsAt?: string | null;
  boostEndsAt?: string | null;
  postId?: number | null;
  postTitle?: string | null;
};

type Analytics = {
  totalViews?: number;
  totalLikes?: number;
  totalComments?: number;
  totalPosts?: number;
  followers?: number;
  engagementRate?: number;
  postReach?: number;
  reachMultiplier?: number;
  followerGrowth?: { last30Days?: number; percentage?: number };
  dailyFollowerGrowth?: DailyPoint[];
  topPosts?: Array<{ id: number; title: string; views?: number; likes?: number; comments?: number }>;
  totals?: { posts?: number; views?: number; likes?: number; comments?: number; followers?: number };
};

type WeeklyReport = {
  newFollowers?: number;
  totalViews?: number;
  postsPublished?: number;
  topPost?: { id: number; title: string; views?: number; likes?: number } | null;
  engagementRate?: number;
  prevWeekViews?: number;
};

function SparkLine({ data, color = "#8b5cf6" }: { data: DailyPoint[]; color?: string }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map(d => d.count), 1);
  const W = 280;
  const H = 60;
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - (d.count / max) * (H - 8) - 4;
    return `${x},${y}`;
  });
  const pathD = `M ${pts.join(" L ")}`;
  const areaD = `M 0,${H} L ${pts.join(" L ")} L ${W},${H} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sparkg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.03" />
        </linearGradient>
      </defs>
      <path d={areaD} fill="url(#sparkg)" />
      <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const LEVEL_LABELS: Record<string, { label: string; color: string; description: string }> = {
  new_voice: { label: "New Voice", color: "text-slate-500", description: "starting without an earned track record" },
  rising: { label: "Rising Creator", color: "text-amber-500", description: "building consistent contribution and community trust" },
  established: { label: "Established Creator", color: "text-blue-500", description: "showing a sustained, trusted contribution history" },
  featured: { label: "Featured Creator", color: "text-violet-500", description: "demonstrating strong quality and community value" },
  luminary: { label: "Luminary", color: "text-emerald-500", description: "an exceptional, consistently trusted contributor" },
};

export default function CreatorDashboard() {
  usePageTitle('Dashboard');
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [trust, setTrust] = useState<TrustScore | null>(null);
  const [geography, setGeography] = useState<GeoEntry[]>([]);
  const [income, setIncome] = useState<IncomeEntry[]>([]);
  const [boosts, setBoosts] = useState<BoostRequest[]>([]);
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const { user } = useAuthStore();
  const t = useT();

  const fetchTrust = async (token: string | null) => {
    try {
      const res = await fetch("/api/trust/me", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (res.ok) setTrust(await res.json());
    } catch {
      // Trust is optional dashboard context; the core analytics view can load.
    }
  };

  const handleRecalculate = async () => {
    const token = getStoredToken();
    setRecalculating(true);
    try {
      const res = await fetch("/api/trust/recalculate", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) setTrust(await res.json());
    } finally {
      setRecalculating(false);
    }
  };

  useEffect(() => {
    const token = getStoredToken();
    const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    Promise.all([
      fetch("/api/analytics/dashboard", { headers: authHeaders })
        .then(async res => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || t("common.error", "Something went wrong"));
          setAnalytics(data);
        })
        .catch(err => setError(err.message)),
      fetchTrust(token),
      fetch("/api/analytics/geography", { headers: authHeaders })
        .then(async res => { if (res.ok) setGeography(await res.json()); })
        .catch(() => {}),
      fetch("/api/income?limit=5", { headers: authHeaders })
        .then(async res => {
          if (res.status === 403 || res.status === 503) {
            setIncome([]);
          } else if (res.ok) {
            const data = await res.json();
            setIncome(Array.isArray(data?.logs) ? data.logs : []);
          }
        })
        .catch(() => {}),
      fetch("/api/boost/my", { headers: authHeaders })
        .then(async res => {
          if (res.ok) {
            const d = await res.json();
            setBoosts(Array.isArray(d) ? d : Array.isArray(d?.requests) ? d.requests : []);
          }
        })
        .catch(() => {}),
      fetch("/api/analytics/weekly-report", { headers: authHeaders })
        .then(async res => { if (res.ok) setWeeklyReport(await res.json()); })
        .catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const totalViews = analytics?.totalViews ?? analytics?.totals?.views ?? 0;
  const totalLikes = analytics?.totalLikes ?? analytics?.totals?.likes ?? 0;
  const totalComments = analytics?.totalComments ?? analytics?.totals?.comments ?? 0;
  const totalPosts = analytics?.totalPosts ?? analytics?.totals?.posts ?? 0;
  const followers = analytics?.followers ?? analytics?.totals?.followers ?? 0;
  const engagementRate = analytics?.engagementRate ?? 0;
  const postReach = analytics?.postReach ?? 0;
  const reachMultiplier = analytics?.reachMultiplier ?? 1.0;
  const followerGrowth = analytics?.followerGrowth?.last30Days ?? 0;
  const followerGrowthPct = analytics?.followerGrowth?.percentage ?? 0;
  const dailyGrowth = Array.isArray(analytics?.dailyFollowerGrowth)
    ? analytics.dailyFollowerGrowth
    : [];
  const topPosts = Array.isArray(analytics?.topPosts) ? analytics.topPosts : [];

  const cards = [
    { label: t("dashboard.totalViews", "Total Views"), value: totalViews.toLocaleString(), icon: Eye, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: t("dashboard.totalLikes", "Total Likes"), value: totalLikes.toLocaleString(), icon: Heart, color: "text-rose-500", bg: "bg-rose-500/10" },
    { label: t("dashboard.comments", "Comments"), value: totalComments.toLocaleString(), icon: MessageCircle, color: "text-violet-500", bg: "bg-violet-500/10" },
    { label: t("dashboard.postsPublished", "Posts Published"), value: totalPosts.toLocaleString(), icon: BarChart3, color: "text-primary", bg: "bg-primary/10" },
    { label: t("dashboard.followers", "Followers"), value: followers.toLocaleString(), icon: Users, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: t("dashboard.engagementRate", "Engagement Rate"), value: `${engagementRate}%`, icon: Zap, color: "text-amber-500", bg: "bg-amber-500/10" },
  ];

  return (
    <AppLayout>
      <ErrorBoundary>
        <div className="max-w-5xl mx-auto px-4 md:px-0 space-y-6 pb-8">
        <div className="pt-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-serif font-bold text-foreground">{t("dashboard.title", "Your Dashboard")}</h1>
              <p className="text-muted-foreground text-sm mt-1">{t("home.tagline", "Build proof of work.")} {t("home.taglineHighlight", "Earn trust through consistency.")} {t("home.taglineEnd", "Get discovered for opportunities.")}</p>
            </div>
            <Badge variant="secondary" className="rounded-xl px-3 py-1.5 text-xs font-medium gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" /> QuillHive Member
            </Badge>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
        )}

        {loading && (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="h-28 bg-muted animate-pulse rounded-2xl" />
            ))}
          </div>
        )}

        {!loading && (
          <>
            {/* Stat Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {cards.map(card => {
                const Icon = card.icon;
                return (
                  <Card key={card.label} className="rounded-2xl border-border/60 hover:shadow-md transition-shadow">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">{card.label}</p>
                          <p className="text-2xl font-bold text-foreground">{card.value}</p>
                        </div>
                        <div className={`w-11 h-11 rounded-xl ${card.bg} ${card.color} flex items-center justify-center`}>
                          <Icon className="w-5 h-5" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <Link href="/profile-viewers" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              See who&apos;s been checking you out → <ArrowUpRight className="w-4 h-4" />
            </Link>

            {/* Growth Intelligence Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <GrowthScoreCard />
              <OpportunityPanel />
            </div>

            {user?.id && <CreatorMomentumHQ userId={user.id} isMe />}

            {/* Profile Strength + Opportunity Signals */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ProfileStrengthMeter />
              <OpportunitySignals />
            </div>

            {/* Momentum Card */}
            {weeklyReport && <MomentumCard report={weeklyReport} />}

            {/* Performance Insights */}
            <ContentIntelligenceCard />

            {/* Growth Timeline */}
            {(() => {
              type Metric = "views" | "posts" | "followers" | "likes" | "engagement";
              const MILESTONES: Array<{
                id: string; label: string; badge: string; metric: Metric;
                threshold: number; ringColor: string; dotColor: string; barColor: string;
              }> = [
                { id: "first_post",    label: "First Post Published",  badge: "✍️",  metric: "posts",      threshold: 1,       ringColor: "border-primary",       dotColor: "bg-primary",        barColor: "bg-primary"       },
                { id: "first_view",    label: "First 100 Views",        badge: "👁️",  metric: "views",      threshold: 100,     ringColor: "border-blue-500",      dotColor: "bg-blue-500",       barColor: "bg-blue-500"      },
                { id: "first_follow",  label: "First Follower",         badge: "👥",  metric: "followers",  threshold: 1,       ringColor: "border-emerald-500",   dotColor: "bg-emerald-500",    barColor: "bg-emerald-500"   },
                { id: "posts_5",       label: "5 Posts Published",      badge: "📝",  metric: "posts",      threshold: 5,       ringColor: "border-violet-500",    dotColor: "bg-violet-500",     barColor: "bg-violet-500"    },
                { id: "views_1k",      label: "1,000 Views",            badge: "🎯",  metric: "views",      threshold: 1000,    ringColor: "border-blue-500",      dotColor: "bg-blue-500",       barColor: "bg-blue-500"      },
                { id: "followers_10",  label: "10 Followers",           badge: "🌱",  metric: "followers",  threshold: 10,      ringColor: "border-emerald-500",   dotColor: "bg-emerald-500",    barColor: "bg-emerald-500"   },
                { id: "posts_10",      label: "10 Posts Published",     badge: "🔥",  metric: "posts",      threshold: 10,      ringColor: "border-orange-500",    dotColor: "bg-orange-500",     barColor: "bg-orange-500"    },
                { id: "views_10k",     label: "10,000 Views",           badge: "🚀",  metric: "views",      threshold: 10000,   ringColor: "border-amber-500",     dotColor: "bg-amber-500",      barColor: "bg-amber-500"     },
                { id: "followers_50",  label: "50 Followers",           badge: "⭐",  metric: "followers",  threshold: 50,      ringColor: "border-emerald-500",   dotColor: "bg-emerald-500",    barColor: "bg-emerald-500"   },
                { id: "views_100k",    label: "100K Views",             badge: "💫",  metric: "views",      threshold: 100000,  ringColor: "border-rose-500",      dotColor: "bg-rose-500",       barColor: "bg-rose-500"      },
                { id: "followers_100", label: "100 Followers",          badge: "🏆",  metric: "followers",  threshold: 100,     ringColor: "border-amber-500",     dotColor: "bg-amber-500",      barColor: "bg-amber-500"     },
                { id: "followers_1k",  label: "1,000 Followers",        badge: "👑",  metric: "followers",  threshold: 1000,    ringColor: "border-yellow-500",    dotColor: "bg-yellow-400",     barColor: "bg-yellow-400"    },
              ];

              const metricValue = (m: Metric) => {
                if (m === "views")      return totalViews;
                if (m === "posts")      return totalPosts;
                if (m === "followers")  return followers;
                if (m === "likes")      return totalLikes;
                if (m === "engagement") return engagementRate;
                return 0;
              };

              const completedCount = MILESTONES.filter(m => metricValue(m.metric) >= m.threshold).length;
              const nextIdx = MILESTONES.findIndex(m => metricValue(m.metric) < m.threshold);
              const nextMilestone = nextIdx >= 0 ? MILESTONES[nextIdx] : null;

              const joinedAt = user?.createdAt ? new Date(user.createdAt) : null;
              const dayNumber = joinedAt
                ? Math.max(1, Math.floor((Date.now() - joinedAt.getTime()) / 86400000) + 1)
                : null;

              const motivationalMsg = completedCount === 0
                ? "Post your first piece and start your journey."
                : completedCount < 4
                ? "You're building momentum - keep going."
                : completedCount < 8
                ? "Solid progress - the community is noticing you."
                : "You're an established voice on QuillHive.";

              return (
                <Card className="rounded-2xl border-border/60">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <Trophy className="w-4 h-4 text-amber-500" />
                        {t("dashboard.growthJourney", "Your Growth Journey")}
                      </CardTitle>
                      <Badge variant="secondary" className="text-xs">
                        {completedCount}/{MILESTONES.length} {t("dashboard.milestones", "milestones")}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Journey header */}
                    <div className="flex items-center gap-3 bg-muted/30 rounded-xl p-3">
                      <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                        <Flag className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        {dayNumber && (
                          <p className="text-xs font-semibold text-foreground">
                            {t("dashboard.dayOfJourney", "Day {{n}} of your journey").replace("{{n}}", String(dayNumber))}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">{motivationalMsg}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-lg font-bold text-amber-500">{Math.round((completedCount / MILESTONES.length) * 100)}%</p>
                        <p className="text-[10px] text-muted-foreground">{t("dashboard.complete", "complete")}</p>
                      </div>
                    </div>

                    {/* Overall progress bar */}
                    <div>
                      <Progress value={(completedCount / MILESTONES.length) * 100} className="h-2" />
                    </div>

                    {/* Next milestone highlighted */}
                    {nextMilestone && (() => {
                      const val = metricValue(nextMilestone.metric);
                      const pct = Math.min((val / nextMilestone.threshold) * 100, 99);
                      const remaining = nextMilestone.threshold - val;
                      return (
                        <div className={`rounded-xl border-2 ${nextMilestone.ringColor} bg-muted/20 p-3`}>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-semibold flex items-center gap-1.5">
                              <span className="text-base">{nextMilestone.badge}</span>
                              {t("dashboard.nextMilestone", "Next:")} {nextMilestone.label}
                            </p>
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {val.toLocaleString()} / {nextMilestone.threshold.toLocaleString()}
                            </span>
                          </div>
                          <Progress value={pct} className="h-2 mb-1.5" />
                          <p className="text-xs text-muted-foreground">
                            {remaining.toLocaleString()} {t("dashboard.moreToGo", "more to unlock this milestone")}
                          </p>
                        </div>
                      );
                    })()}

                    {/* Milestone timeline */}
                    <div className="space-y-0">
                      {MILESTONES.map((ms, idx) => {
                        const val = metricValue(ms.metric);
                        const done = val >= ms.threshold;
                        const isNext = idx === nextIdx;
                        const isLocked = !done && !isNext;

                        return (
                          <div key={ms.id} className="flex gap-3">
                            {/* Connector + dot */}
                            <div className="flex flex-col items-center">
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-1 ${
                                done    ? `${ms.dotColor} text-white` :
                                isNext  ? `bg-background border-2 ${ms.ringColor} text-primary` :
                                          "bg-muted border border-border/60 text-muted-foreground"
                              }`}>
                                {done
                                  ? <Check className="w-3.5 h-3.5" />
                                  : isLocked
                                  ? <Lock className="w-3 h-3" />
                                  : <Star className="w-3.5 h-3.5" />
                                }
                              </div>
                              {idx < MILESTONES.length - 1 && (
                                <div className={`w-0.5 flex-1 min-h-[18px] ${done ? ms.dotColor : "bg-border/60"} opacity-${done ? "70" : "40"}`} />
                              )}
                            </div>

                            {/* Label row */}
                            <div className={`flex-1 flex items-center justify-between py-2 ${idx < MILESTONES.length - 1 ? "border-b border-border/20" : ""}`}>
                              <p className={`text-sm flex items-center gap-1.5 ${done ? "text-foreground font-medium" : isNext ? "text-foreground font-semibold" : "text-muted-foreground"}`}>
                                <span className={isLocked ? "opacity-50" : ""}>{ms.badge}</span>
                                <span className={isLocked ? "opacity-60" : ""}>{ms.label}</span>
                              </p>
                              {done ? (
                                <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px]">
                                  {t("dashboard.reached", "Reached")} ✓
                                </Badge>
                              ) : isNext ? (
                                <span className={`text-xs font-semibold ${ms.ringColor.replace("border-", "text-")}`}>
                                  {Math.round((metricValue(ms.metric) / ms.threshold) * 100)}%
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground opacity-50 tabular-nums">
                                  {ms.threshold.toLocaleString()}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {completedCount === MILESTONES.length && (
                      <div className="rounded-xl bg-gradient-to-r from-amber-500/10 to-yellow-500/10 border border-amber-500/20 p-4 text-center">
                        <p className="text-2xl mb-1">👑</p>
                        <p className="font-semibold text-sm">{t("dashboard.allMilestonesReached", "All milestones reached!")}</p>
                        <p className="text-xs text-muted-foreground">{t("dashboard.legendaryStatus", "You've achieved legendary status on QuillHive.")}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })()}

            {/* Boost Status Card */}
            {(() => {
              const now = new Date();
              const activeBoosts = boosts.filter(b => b.status === "approved" && b.boostEndsAt && new Date(b.boostEndsAt) > now);
              const pendingBoosts = boosts.filter(b => b.status === "pending");
              const recentBoosts = [...activeBoosts, ...pendingBoosts].slice(0, 3);
              const PLAN_LABELS: Record<string, string> = { starter: "⚡ Starter", growth: "🚀 Growth", spotlight: "🌟 Spotlight" };

              return (
                <Card className="rounded-2xl border-border/60">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <Rocket className="w-4 h-4 text-violet-500" /> {t("dashboard.boostActivity", "Boost Activity")}
                        {activeBoosts.length > 0 && (
                          <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] font-semibold ml-1">
                            {activeBoosts.length} {activeBoosts.length === 1 ? t("dashboard.boostLive", "live") : t("dashboard.boostsLive", "live")}
                          </Badge>
                        )}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        {user?.username && (
                          <Link href={`/profile/${user.username}?tab=boosts`}>
                            <button className="text-xs text-primary hover:underline">{t("dashboard.viewAll", "View all")}</button>
                          </Link>
                        )}
                        <Link href="/pricing">
                          <Button size="sm" className="h-7 px-3 text-xs rounded-lg bg-gradient-to-r from-violet-600 to-purple-500 text-white border-0">
                            <Rocket className="w-3 h-3 mr-1.5" /> {t("dashboard.requestBoost", "Request Boost")}
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {recentBoosts.length === 0 ? (
                      <div className="flex items-center justify-between rounded-xl bg-muted/30 border border-dashed border-border p-4 gap-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-violet-500/10 text-violet-500 flex items-center justify-center shrink-0">
                            <Rocket className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">{t("dashboard.noActiveBoosts", "No active boosts")}</p>
                            <p className="text-xs text-muted-foreground">{t("dashboard.boostCta", "Boost a post to expand your reach beyond your followers.")}</p>
                          </div>
                        </div>
                        <Link href="/pricing">
                          <Button size="sm" variant="outline" className="shrink-0 rounded-xl text-xs gap-1.5">
                            <Zap className="w-3.5 h-3.5" /> {t("dashboard.seePlans", "See Plans")}
                          </Button>
                        </Link>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {recentBoosts.map(boost => {
                          const endsAt = boost.boostEndsAt ? new Date(boost.boostEndsAt) : null;
                          const isActive = boost.status === "approved" && endsAt && endsAt > now;
                          const planLabel = PLAN_LABELS[boost.plan] ?? boost.plan;

                          return (
                            <div
                              key={boost.id}
                              className={`flex items-center justify-between rounded-xl border p-3 gap-3 ${
                                isActive ? "border-emerald-500/25 bg-emerald-500/5" : "border-amber-500/25 bg-amber-500/5"
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                  isActive ? "bg-emerald-500/15 text-emerald-500" : "bg-amber-500/15 text-amber-500"
                                }`}>
                                  {isActive ? <Check className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold truncate">{planLabel}</p>
                                  {boost.postTitle && (
                                    <p className="text-xs text-muted-foreground truncate">"{boost.postTitle}"</p>
                                  )}
                                </div>
                              </div>
                              <div className="shrink-0 text-right">
                                {isActive ? (
                                  <>
                                    <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] font-semibold block mb-1">● {t("dashboard.boostActive", "Active")}</Badge>
                                    <p className="text-[10px] text-muted-foreground whitespace-nowrap">
                                      {t("dashboard.boostEnds", "Ends")} {formatDistanceToNow(endsAt!, { addSuffix: true })}
                                    </p>
                                  </>
                                ) : (
                                  <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px] font-semibold">
                                    {t("dashboard.boostPending", "Pending Review")}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          );
                        })}

                        {(activeBoosts.length + pendingBoosts.length) > 3 && (
                          <p className="text-xs text-muted-foreground text-center pt-1">
                            +{(activeBoosts.length + pendingBoosts.length) - 3} {t("dashboard.moreBoosts", "more")} -{" "}
                            {user?.username && (
                              <Link href={`/profile/${user.username}?tab=boosts`}>
                                <span className="text-primary hover:underline cursor-pointer">{t("dashboard.viewAll", "view all")}</span>
                              </Link>
                            )}
                          </p>
                        )}
                      </div>
                    )}

                    {(activeBoosts.length > 0 || pendingBoosts.length > 0) && (
                      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/40 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                          {activeBoosts.length} {t("dashboard.active", "active")}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                          {pendingBoosts.length} {t("dashboard.pending", "pending")}
                        </span>
                        <Link href="/pricing" className="ml-auto text-primary hover:underline">
                          + {t("dashboard.addBoost", "add boost")}
                        </Link>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })()}

            {/* Trust Score Card */}
            {trust && (() => {
              const tierInfo = LEVEL_LABELS[trust.creatorLevel] ?? LEVEL_LABELS.new_voice;
              const tips = trust.uti < 50
                ? [
                    t("dashboard.tip1a", "Write longer, more thoughtful content"),
                    t("dashboard.tip1b", "Engage in deeper discussions (comments > 50 chars)"),
                    t("dashboard.tip1c", "Maintain consistent posting habits"),
                  ]
                : trust.uti < 80
                ? [
                    t("dashboard.tip2a", "Encourage saves and shares on your posts"),
                    t("dashboard.tip2b", "Post diverse content across multiple topics"),
                    t("dashboard.tip2c", "Build authentic community trust"),
                  ]
                : [
                    t("dashboard.tip3a", "Maintain your excellent contribution quality"),
                    t("dashboard.tip3b", "Help mentor newer creators"),
                    t("dashboard.tip3c", "Keep your engagement authentic"),
                  ];
              return (
                <Card className="rounded-2xl border-border/60">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-primary" /> {t("dashboard.trustScore", "Your Trust Score")}
                      </CardTitle>
                      <Button variant="ghost" size="sm" onClick={handleRecalculate} disabled={recalculating} className="h-7 px-2 text-xs rounded-lg">
                        <RefreshCw className={`w-3.5 h-3.5 mr-1 ${recalculating ? "animate-spin" : ""}`} />
                        {t("dashboard.recalculate", "Recalculate")}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-xs text-muted-foreground">A living signal of the quality and consistency behind your work. Stronger trust makes your profile more credible when opportunity seekers find you.</p>
                    <div className="flex items-center gap-4">
                      <div className="text-center">
                        <p className="text-4xl font-bold text-foreground">{Math.round(trust.uti)}</p>
                        <p className="text-xs text-muted-foreground">{t("dashboard.of100", "/100")}</p>
                      </div>
                      <div className="flex-1">
                        <Progress value={trust.uti} className="h-2 mb-2" />
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className={`text-xs ${tierInfo.color}`}>
                            {tierInfo.label}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{tierInfo.description}</span>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                      <div className="bg-muted/30 rounded-xl p-3">
                        <p className="font-medium text-foreground mb-1">Content Value</p>
                        <p className="text-lg font-bold text-violet-500">{Math.round(trust.cvs)}</p>
                        <p>quality and meaningful engagement</p>
                      </div>
                      <div className="bg-muted/30 rounded-xl p-3">
                        <p className="font-medium text-foreground mb-1">Community Trust</p>
                        <p className="text-lg font-bold text-rose-500">{Math.round(trust.cts)}</p>
                        <p>reciprocity and contribution</p>
                      </div>
                      <div className="bg-muted/30 rounded-xl p-3">
                        <p className="font-medium text-foreground mb-1">Content Impact</p>
                        <p className="text-lg font-bold text-emerald-500">{Math.round(trust.avgCis)}</p>
                        <p>post-level engagement</p>
                      </div>
                      <div className="bg-muted/30 rounded-xl p-3">
                        <p className="font-medium text-foreground mb-1">{t("dashboard.visibility", "Visibility")}</p>
                        <p className="text-lg font-bold text-primary">{(trust.visibilityMultiplier * 100).toFixed(0)}%</p>
                        <p>{t("dashboard.ofMaxReach", "of max reach")}</p>
                      </div>
                      <div className="bg-muted/30 rounded-xl p-3">
                        <p className="font-medium text-foreground mb-1">{t("dashboard.behaviorScore", "Behavior Score")}</p>
                        <p className="text-lg font-bold text-blue-500">{Math.round(trust.bcs)}</p>
                        <p>{t("dashboard.consistencyRating", "consistency rating")}</p>
                      </div>
                      <div className="bg-muted/30 rounded-xl p-3">
                        <p className="font-medium text-foreground mb-1">{t("dashboard.reachMultiplier", "Reach Multiplier")}</p>
                        <p className={`text-lg font-bold ${reachMultiplier >= 1 ? "text-emerald-500" : "text-amber-500"}`}>{reachMultiplier.toFixed(2)}×</p>
                        <p>{t("dashboard.feedAmplification", "feed amplification")}</p>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-foreground">{t("dashboard.improvementTips", "Improvement tips")}</p>
                      {tips.map((tip, i) => (
                        <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <span className="text-primary mt-0.5">•</span> {tip}
                        </p>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })()}

            {/* Follower Growth Chart + Post Reach */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="rounded-2xl border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Users className="w-4 h-4 text-emerald-500" /> {t("dashboard.followerGrowth", "Follower Growth")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-end gap-3 mb-3">
                    <span className="text-4xl font-bold text-foreground">+{followerGrowth}</span>
                    <div className="mb-1">
                      <div className="flex items-center gap-1 text-emerald-500 text-sm font-medium">
                        <ArrowUpRight className="w-4 h-4" />
                        {followerGrowthPct}%
                      </div>
                      <p className="text-xs text-muted-foreground">{t("dashboard.last30Days", "last 30 days")}</p>
                    </div>
                  </div>
                  {dailyGrowth.length > 0 && (
                    <div className="mt-1">
                      <SparkLine data={dailyGrowth} color="#10b981" />
                      <div className="flex justify-between text-xs text-muted-foreground mt-1">
                        <span>{dailyGrowth[0]?.date?.slice(5)}</span>
                        <span>{dailyGrowth[dailyGrowth.length - 1]?.date?.slice(5)}</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Target className="w-4 h-4 text-blue-500" /> {t("dashboard.postReach", "Post Reach")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-end gap-3 mb-3">
                    <span className="text-4xl font-bold text-foreground">{postReach.toLocaleString()}</span>
                    <p className="mb-1 text-xs text-muted-foreground">{t("dashboard.uniqueViewers", "unique viewers")}</p>
                  </div>
                  <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${Math.min((postReach / Math.max(totalViews, 1)) * 100, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {totalViews > 0 ? Math.round((postReach / totalViews) * 100) : 0}% {t("dashboard.uniqueReachRate", "unique reach rate")}
                  </p>
                  <div className="mt-3 flex items-center gap-2 rounded-xl bg-muted/40 p-2.5">
                    <Activity className="w-4 h-4 text-primary shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-foreground">{t("dashboard.reachMultiplier", "Reach Multiplier")}: <span className={`font-bold ${reachMultiplier >= 1 ? "text-emerald-500" : "text-amber-500"}`}>{reachMultiplier.toFixed(2)}×</span></p>
                      <p className="text-xs text-muted-foreground">{reachMultiplier < 1 ? t("dashboard.reachReducedByAdmin", "Reach limited by platform policy") : t("dashboard.reachNormal", "Normal reach distribution")}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Top Posts */}
            <Card className="rounded-2xl border-border/60">
              <CardHeader>
                <CardTitle className="text-base font-semibold">{t("dashboard.topPerformingPosts", "Top Performing Posts")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {topPosts.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">{t("dashboard.noPostData", "No post data yet. Start creating!")}</p>
                )}
                {topPosts.map((post, idx) => (
                  <div key={post.id} className="flex items-center justify-between rounded-xl border border-border/60 p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{post.title || t("common.untitled", "Untitled")}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Eye className="w-3 h-3" /> {post.views ?? 0}
                          </span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Heart className="w-3 h-3" /> {post.likes ?? 0}
                          </span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <MessageCircle className="w-3 h-3" /> {post.comments ?? 0}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Badge variant="secondary" className="ml-2 flex-shrink-0">
                      {(post.likes ?? 0) + (post.comments ?? 0)} {t("dashboard.eng", "eng.")}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Audience Geography */}
            {geography.length > 0 && (
              <Card className="rounded-2xl border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Globe className="w-4 h-4 text-sky-500" /> {t("dashboard.audienceGeography", "Audience Geography")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {geography.slice(0, 8).map((g, i) => {
                      const maxViews = geography[0]?.views ?? 1;
                      const pct = Math.round((g.views / maxViews) * 100);
                      return (
                        <div key={g.country} className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-6 text-right">{i + 1}</span>
                          <span className="text-sm font-medium w-32 truncate">{g.country || 'Unknown'}</span>
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-sky-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground w-12 text-right">{g.views.toLocaleString()}</span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Income Tracker */}
            <Card className="rounded-2xl border-border/60">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-emerald-500" /> {t("dashboard.creatorIncome", "Creator Income")}
                  </CardTitle>
                  <a href="/income" className="text-xs text-primary hover:underline">{t("dashboard.viewAll", "View all")}</a>
                </div>
              </CardHeader>
              <CardContent>
                {income.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">{t("dashboard.noIncomeYet", "No income logged yet.")} <a href="/income" className="text-primary hover:underline">{t("dashboard.logFirstEntry", "Log your first entry")}</a></p>
                ) : (
                  <div className="space-y-2">
                    {income.map(entry => (
                      <div key={entry.id} className="flex items-center justify-between rounded-xl border border-border/60 p-3">
                        <div>
                          <p className="text-sm font-medium capitalize">{entry.source}</p>
                          {entry.description && <p className="text-xs text-muted-foreground">{entry.description}</p>}
                        </div>
                        <span className="text-sm font-bold text-emerald-600">+{entry.currency}{entry.amount.toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-border/40 flex justify-between text-sm font-semibold">
                      <span>{t("dashboard.totalShown", "Total (shown)")}</span>
                      <span className="text-emerald-600">
                        {income[0]?.currency ?? '$'}{income.reduce((s, e) => s + e.amount, 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

          </>
        )}
        </div>
      </ErrorBoundary>
    </AppLayout>
  );
}
