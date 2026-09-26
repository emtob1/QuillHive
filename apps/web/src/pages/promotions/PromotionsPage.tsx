import { useState, useEffect, useRef, useCallback } from "react";
import { Zap, TrendingUp, Eye, MousePointerClick, Clock, CheckCircle2, XCircle, Plus, BarChart3 } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { BoostModal } from "@/components/boost/BoostModal";
import { useAuthStore } from "@/store/auth";
import { getStoredToken } from "@/lib/api";

type Range = "7d" | "30d" | "90d" | "all";
type PlanKey = "starter" | "growth" | "spotlight";

interface CampaignRow {
  id: number;
  plan: string;
  status: string;
  postId: number;
  postTitle: string | null;
  boostEndsAt: string | null;
  createdAt: string;
  paidAmountCents?: number;
  grantedByAdminId?: number | null;
  adminNote?: string | null;
}

interface SpendPoint {
  date: string;
  amountCents: number;
}

interface Overview {
  totalSpendCents: number;
  activeCampaigns: number;
  totalImpressions: number;
  avgEngagementRate: number;
}

interface SpendBreakdown {
  type?: string;
  currency?: string;
  amountCents: number;
}

interface IncomeTransaction {
  id: number;
  amount: number;
  currency: string;
  source: string;
  description: string | null;
  date: string;
}

type PostOption = { id: number; title: string };

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter Boost",
  growth: "Growth Boost",
  spotlight: "Spotlight",
};

const PLAN_COLORS: Record<string, string> = {
  starter: "bg-blue-500/20 text-blue-300",
  growth: "bg-purple-500/20 text-purple-300",
  spotlight: "bg-amber-500/20 text-amber-300",
};

/** Returns true if the campaign is currently live */
function isLive(c: CampaignRow): boolean {
  return c.status === "approved" && !!c.boostEndsAt && new Date(c.boostEndsAt) > new Date();
}

/** Returns true if the campaign has definitively ended */
function isExpired(c: CampaignRow): boolean {
  if (c.status === "expired") return true;
  if (c.status === "approved" && c.boostEndsAt && new Date(c.boostEndsAt) <= new Date()) return true;
  return false;
}

function StatusBadge({ status, endsAt }: { status: string; endsAt: string | null }) {
  const expired = status === "expired" || (status === "approved" && endsAt && new Date(endsAt) <= new Date());

  if (status === "approved" && !expired) {
    return (
      <span className="flex items-center gap-1 text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full text-xs font-medium">
        <CheckCircle2 className="w-3 h-3" /> Active
      </span>
    );
  }
  if (expired) {
    return (
      <span className="flex items-center gap-1 text-white/40 bg-white/5 px-2 py-0.5 rounded-full text-xs font-medium">
        <Clock className="w-3 h-3" /> Expired
      </span>
    );
  }
  if (status === "pending_payment" || status === "pending") {
    return (
      <span className="flex items-center gap-1 text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full text-xs font-medium">
        <Clock className="w-3 h-3" /> Pending
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full text-xs font-medium">
      <XCircle className="w-3 h-3" /> {status}
    </span>
  );
}

export default function PromotionsPage() {
  const { token } = useAuthStore();
  const storedToken = getStoredToken();
  const [range, setRange] = useState<Range>("30d");
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [trend, setTrend] = useState<SpendPoint[]>([]);
  const [spendByType, setSpendByType] = useState<SpendBreakdown[]>([]);
  const [spendByCurrency, setSpendByCurrency] = useState<SpendBreakdown[]>([]);
  const [transactions, setTransactions] = useState<IncomeTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [boostTarget, setBoostTarget] = useState<{ id: number; title: string; plan?: PlanKey } | null>(null);
  const [myPosts, setMyPosts] = useState<PostOption[]>([]);
  const [showPostPicker, setShowPostPicker] = useState(false);
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const campaignRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Parse ?highlight=<id> from URL and auto-scroll + pulse that row
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const highlightParam = params.get("highlight");
    if (!highlightParam) return;
    const id = parseInt(highlightParam, 10);
    if (Number.isNaN(id)) return;
    setHighlightedId(id);
    // Wait for campaigns to load and refs to attach before scrolling
    const tryScroll = () => {
      const el = campaignRefs.current.get(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        // Remove pulsing highlight after 3 seconds
        const timer = setTimeout(() => setHighlightedId(null), 3000);
        return timer;
      }
      return null;
    };
    // Retry a few times while campaigns are loading
    let attempts = 0;
    const interval = setInterval(() => {
      const timer = tryScroll();
      if (timer !== null || ++attempts > 20) clearInterval(interval);
    }, 150);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setLoading(true);
    void fetch(`/api/analytics/creator/spending?range=${range}`, {
      credentials: "include",
      headers: { ...(storedToken ? { Authorization: `Bearer ${storedToken}` } : {}) },
    })
      .then(r => r.json())
      .then((data: {
        overview?: Overview;
        campaigns?: CampaignRow[];
        spendingTrend?: SpendPoint[];
        spendByType?: SpendBreakdown[];
        spendByCurrency?: SpendBreakdown[];
        transactions?: IncomeTransaction[];
      }) => {
        setOverview(data.overview ?? null);
        setCampaigns(Array.isArray(data.campaigns) ? data.campaigns : []);
        setTrend(Array.isArray(data.spendingTrend) ? data.spendingTrend : []);
        setSpendByType(Array.isArray(data.spendByType) ? data.spendByType : []);
        setSpendByCurrency(Array.isArray(data.spendByCurrency) ? data.spendByCurrency : []);
        setTransactions(Array.isArray(data.transactions) ? data.transactions : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [range, storedToken]);

  useEffect(() => {
    if (!token) return;
    void fetch("/api/posts?mine=true&limit=20", {
      credentials: "include",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then((d: { posts?: PostOption[] }) => setMyPosts(Array.isArray(d?.posts) ? d.posts : []))
      .catch(() => {});
  }, [token]);

  const activeCampaigns = campaigns.filter(isLive);
  const pastCampaigns = campaigns.filter(c => !isLive(c));

  const trendData = trend.map(p => ({
    date: new Date(p.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    spend: parseFloat((p.amountCents / 100).toFixed(2)),
  }));

  const handleBoostPickerOpen = useCallback(() => {
    if (myPosts.length === 1) {
      setBoostTarget(myPosts[0]);
    } else {
      setShowPostPicker(true);
    }
  }, [myPosts]);

  const registerRef = useCallback((id: number, el: HTMLDivElement | null) => {
    if (el) {
      campaignRefs.current.set(id, el);
    } else {
      campaignRefs.current.delete(id);
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Zap className="w-6 h-6 text-amber-400" />
            My Promotions
          </h1>
          <p className="text-white/50 text-sm mt-1">Track your boost campaigns, spend, and reach</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-white/5 border border-white/10 rounded-xl overflow-hidden">
            {(["7d", "30d", "90d", "all"] as Range[]).map(r => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${range === r ? "bg-amber-500 text-black" : "text-white/60 hover:text-white"}`}
              >
                {r === "all" ? "All" : r}
              </button>
            ))}
          </div>
          <button
            onClick={handleBoostPickerOpen}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold px-4 py-2 rounded-xl transition-colors text-sm"
          >
            <Plus className="w-4 h-4" />
            Boost a Post
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-4 animate-pulse h-24" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="Total Spent"
            value={`$${((overview?.totalSpendCents ?? 0) / 100).toFixed(2)}`}
            icon={<Zap className="w-4 h-4 text-amber-400" />}
            sub="USD"
          />
          <StatCard
            label="Active Campaigns"
            value={String(activeCampaigns.length)}
            icon={<TrendingUp className="w-4 h-4 text-green-400" />}
            sub="running now"
          />
          <StatCard
            label="Total Impressions"
            value={formatNum(overview?.totalImpressions ?? 0)}
            icon={<Eye className="w-4 h-4 text-blue-400" />}
            sub="boosted views"
          />
          <StatCard
            label="Avg Engagement"
            value={`${(overview?.avgEngagementRate ?? 0).toFixed(1)}%`}
            icon={<MousePointerClick className="w-4 h-4 text-purple-400" />}
            sub="engagement rate"
          />
        </div>
      )}

      {trendData.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-8">
          <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-amber-400" />
            Spend Over Time
          </h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis dataKey="date" stroke="#ffffff30" tick={{ fill: "#ffffff60", fontSize: 11 }} />
              <YAxis stroke="#ffffff30" tick={{ fill: "#ffffff60", fontSize: 11 }} tickFormatter={v => `$${v}`} />
              <Tooltip
                contentStyle={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 8, color: "#fff" }}
                formatter={(v: number) => [`$${v}`, "Spend"]}
              />
              <Line type="monotone" dataKey="spend" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 mb-8">
        <section className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h2 className="text-white font-semibold mb-4">Spend by promotion type</h2>
          {spendByType.length === 0 ? (
            <p className="text-sm text-white/40">No promotion spend in this period.</p>
          ) : (
            <div className="space-y-3">
              {spendByType.map(item => (
                <div key={item.type}>
                  <div className="flex justify-between gap-3 text-sm mb-1">
                    <span className="text-white/70">{PLAN_LABELS[item.type ?? ""] ?? item.type}</span>
                    <span className="text-white font-medium">${((item.amountCents ?? 0) / 100).toFixed(2)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-amber-400"
                      style={{ width: `${Math.min(100, (item.amountCents / Math.max(...spendByType.map(entry => entry.amountCents), 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h2 className="text-white font-semibold mb-4">Spend by currency</h2>
          {spendByCurrency.length === 0 ? (
            <p className="text-sm text-white/40">No currency totals in this period.</p>
          ) : (
            <div className="divide-y divide-white/10">
              {spendByCurrency.map(item => (
                <div key={item.currency} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="text-white/60">{item.currency}</span>
                  <span className="text-white font-medium">{item.currency} {(item.amountCents / 100).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {activeCampaigns.length > 0 && (
        <div className="mb-8">
          <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            Active Campaigns
          </h2>
          <div className="space-y-3">
            {activeCampaigns.map(c => (
              <CampaignCard
                key={c.id}
                campaign={c}
                highlighted={highlightedId === c.id}
                onBoost={(post, plan) => setBoostTarget({ ...post, plan })}
                registerRef={el => registerRef(c.id, el)}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-white/40" />
          Campaign History
          {pastCampaigns.length > 0 && (
            <span className="text-xs text-white/30 font-normal">({pastCampaigns.length})</span>
          )}
        </h2>
        {campaigns.length === 0 && !loading ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
            <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Zap className="w-8 h-8 text-amber-400" />
            </div>
            <h3 className="text-white font-bold text-lg mb-2">No campaigns yet</h3>
            <p className="text-white/50 text-sm mb-6 max-w-xs mx-auto">
              Boost a post to amplify your reach with a 3.5× visibility multiplier in the discovery feed.
            </p>
            <button
              onClick={handleBoostPickerOpen}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold px-6 py-2.5 rounded-xl transition-colors mx-auto"
            >
              <Zap className="w-4 h-4" />
              Boost Your First Post
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {pastCampaigns.map(c => (
              <CampaignCard
                key={c.id}
                campaign={c}
                highlighted={highlightedId === c.id}
                onBoost={(post, plan) => setBoostTarget({ ...post, plan })}
                registerRef={el => registerRef(c.id, el)}
              />
            ))}
          </div>
        )}
      </div>

      <section className="mt-8">
        <h2 className="text-white font-semibold mb-4">Income transactions</h2>
        {transactions.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-xl p-8 text-center">
            <p className="text-white/60 text-sm">No income transactions in this period.</p>
          </div>
        ) : (
          <div className="overflow-x-auto bg-white/5 border border-white/10 rounded-xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-white/40 text-xs">
                  <th className="p-3 text-left font-medium">Date</th>
                  <th className="p-3 text-left font-medium">Source</th>
                  <th className="p-3 text-left font-medium hidden md:table-cell">Description</th>
                  <th className="p-3 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {transactions.map(transaction => (
                  <tr key={transaction.id}>
                    <td className="p-3 text-white/60 whitespace-nowrap">{new Date(transaction.date).toLocaleDateString()}</td>
                    <td className="p-3 text-white/70 capitalize">{transaction.source}</td>
                    <td className="p-3 text-white/50 hidden md:table-cell">{transaction.description ?? "-"}</td>
                    <td className="p-3 text-right text-emerald-400 font-medium whitespace-nowrap">
                      +{transaction.currency} {transaction.amount.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showPostPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#111] border border-white/10 rounded-2xl w-full max-w-md p-5 shadow-2xl">
            <h2 className="text-white font-bold mb-4">Select a Post to Boost</h2>
            {myPosts.length === 0 ? (
              <p className="text-white/50 text-sm">No posts found. Create a post first.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {myPosts.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { setBoostTarget(p); setShowPostPicker(false); }}
                    className="w-full text-left p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
                  >
                    <p className="text-white text-sm font-medium line-clamp-2">{p.title ?? "Untitled post"}</p>
                    <p className="text-white/40 text-xs mt-1">Post #{p.id}</p>
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowPostPicker(false)}
              className="mt-4 w-full py-2 text-white/50 hover:text-white text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {boostTarget && (
        <BoostModal
          postId={boostTarget.id}
          postTitle={boostTarget.title ?? `Post #${boostTarget.id}`}
          defaultPlan={boostTarget.plan}
          onClose={() => setBoostTarget(null)}
          onSuccess={() => {
            setBoostTarget(null);
            setRange(r => r);
          }}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, icon, sub }: { label: string; value: string; icon: React.ReactNode; sub: string }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-white/50">{label}</span>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs text-white/30 mt-1">{sub}</div>
    </div>
  );
}

function CampaignCard({
  campaign,
  highlighted,
  onBoost,
  registerRef,
}: {
  campaign: CampaignRow;
  highlighted: boolean;
  onBoost: (post: PostOption, plan: PlanKey) => void;
  registerRef: (el: HTMLDivElement | null) => void;
}) {
  const active = isLive(campaign);
  const expired = isExpired(campaign);
  const planClass = PLAN_COLORS[campaign.plan] ?? "bg-white/10 text-white/60";
  const spent = campaign.paidAmountCents ? `$${(campaign.paidAmountCents / 100).toFixed(2)}` : "-";

  return (
    <div
      ref={registerRef}
      className={[
        "bg-white/5 border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all duration-300",
        highlighted
          ? "border-amber-400 ring-2 ring-amber-400/50 animate-pulse"
          : "border-white/10",
      ].join(" ")}
      // Stop pulsing after CSS animation ends (belt-and-suspenders)
      style={highlighted ? { animationDuration: "1s", animationIterationCount: 3 } : undefined}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${planClass}`}>
            {PLAN_LABELS[campaign.plan] ?? campaign.plan}
          </span>
          {campaign.grantedByAdminId ? <span className="flex items-center gap-1 rounded-full bg-cyan-500/15 px-2 py-0.5 text-xs font-medium text-cyan-300"><Zap className="h-3 w-3" /> Admin boosted</span> : null}
          <StatusBadge status={campaign.status} endsAt={campaign.boostEndsAt} />
        </div>
        <p className="text-white font-medium text-sm line-clamp-1 mt-1">
          {campaign.postTitle ?? `Post #${campaign.postId}`}
        </p>
        <div className="flex items-center gap-4 mt-1">
          <span className="text-xs text-white/40">
            {new Date(campaign.createdAt).toLocaleDateString()}
          </span>
          {campaign.boostEndsAt && (
            <span className="text-xs text-white/40">
              {active ? "Ends" : "Ended"} {new Date(campaign.boostEndsAt).toLocaleDateString()}
            </span>
          )}
          <span className={`text-xs font-medium ${campaign.grantedByAdminId ? "text-cyan-300" : "text-amber-400"}`}>{campaign.grantedByAdminId ? "Free" : spent}</span>
        </div>
      </div>

      {/* Show "Boost Again →" for any non-active campaign that has a known post */}
      {!active && campaign.postTitle && (
        <button
          onClick={() => onBoost(
            { id: campaign.postId, title: campaign.postTitle! },
            (campaign.plan as PlanKey) ?? "growth",
          )}
          className={[
            "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap font-medium",
            expired
              ? "bg-amber-500/20 hover:bg-amber-500/35 text-amber-300 border border-amber-500/20"
              : "bg-white/10 hover:bg-white/15 text-white/60",
          ].join(" ")}
        >
          <Zap className="w-3 h-3" />
          Boost Again →
        </button>
      )}
    </div>
  );
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
