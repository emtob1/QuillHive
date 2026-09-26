import { useState, useEffect } from "react";
import { Link2, Copy, Check, Users, Gift, Share2, ChevronRight } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { getStoredToken } from "@/lib/api";
import { BackButton } from "@/components/ui/BackButton";

interface InviteCode {
  id: number;
  code: string;
  usedBy: number | null;
  usedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

interface InviteStats {
  codes: InviteCode[];
  totalInvited: number;
  activeCode?: string;
}

interface GenerateInviteResponse {
  invite?: InviteCode;
  error?: string;
}

export default function InvitePage() {
  const { user } = useAuthStore();
  const token = getStoredToken();
  const [data, setData] = useState<InviteStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [error, setError] = useState("");

  const appUrl = import.meta.env.VITE_PUBLIC_APP_URL as string | undefined ?? window.location.origin;

  useEffect(() => {
    void fetch("/api/invites/mine", {
      credentials: "include",
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    })
      .then(r => r.json())
      .then((d: InviteStats) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  const generateCode = async () => {
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/invites/generate", {
        method: "POST",
        credentials: "include",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const d = await res.json() as GenerateInviteResponse;
      const invite = d.invite;
      if (invite) {
        setData(prev => prev ? {
          ...prev,
          codes: [invite, ...prev.codes.filter(code => code.id !== invite.id)],
          activeCode: invite.code,
        } : { codes: [invite], totalInvited: 0, activeCode: invite.code });
      } else {
        setError(d.error ?? "Failed to generate invite code.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const copyLink = (code: string) => {
    const url = `${appUrl}/signup?invite=${encodeURIComponent(code)}`;
    void navigator.clipboard.writeText(url).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    });
  };

  const activeCode = data?.codes.find(c => c.isActive && !c.usedBy);
  const usedCodes = (Array.isArray(data?.codes) ? data.codes : []).filter(c => c.usedBy);

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-4 md:p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <BackButton />
        <p className="text-white/50 text-sm mt-1">
          Invite creators to QuillHive. When they join, you both grow together.
        </p>
      </div>

      <div className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border border-amber-500/20 rounded-2xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center">
            <Users className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-white font-bold">Your Invite Link</h2>
            <p className="text-white/50 text-xs">{data?.totalInvited ?? 0} creators joined via your invites</p>
          </div>
        </div>

        {loading ? (
          <div className="h-12 bg-white/5 rounded-xl animate-pulse" />
        ) : activeCode ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 flex items-center gap-2 min-w-0">
              <Link2 className="w-4 h-4 text-white/40 shrink-0" />
              <span className="text-white text-sm font-mono truncate">
                {appUrl}/signup?invite={activeCode.code}
              </span>
            </div>
            <button
              onClick={() => copyLink(activeCode.code)}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold px-4 py-2.5 rounded-xl transition-colors whitespace-nowrap text-sm"
            >
              {copiedCode === activeCode.code ? (
                <><Check className="w-4 h-4" /> Copied!</>
              ) : (
                <><Copy className="w-4 h-4" /> Copy</>
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-white/50 text-sm">You don&apos;t have an active invite code yet.</p>
            <button
              onClick={() => void generateCode()}
              disabled={generating}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold px-4 py-2 rounded-xl transition-colors text-sm disabled:opacity-60"
            >
              <Gift className="w-4 h-4" />
              {generating ? "Generating…" : "Generate Invite Link"}
            </button>
          </div>
        )}

        {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { icon: Share2, label: "Share your link", desc: "Send to creators you know" },
          { icon: Users, label: "They join QuillHive", desc: "New creator signs up" },
          { icon: Gift, label: "You both grow", desc: "Build the community together" },
        ].map(({ icon: Icon, label, desc }) => (
          <div key={label} className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
            <Icon className="w-5 h-5 text-amber-400 mx-auto mb-2" />
            <p className="text-white text-xs font-semibold">{label}</p>
            <p className="text-white/40 text-xs mt-1">{desc}</p>
          </div>
        ))}
      </div>

      {usedCodes.length > 0 && (
        <div>
          <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
            <Users className="w-4 h-4 text-white/40" />
            Creators You&apos;ve Invited
            <span className="text-xs text-white/30 font-normal">({usedCodes.length})</span>
          </h2>
          <div className="space-y-2">
            {usedCodes.map(code => (
              <div key={code.id} className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-amber-500/20 rounded-full flex items-center justify-center">
                    <Users className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-white text-sm font-medium">Invited creator</p>
                    <p className="text-white/40 text-xs">
                      Joined {code.usedAt ? new Date(code.usedAt).toLocaleDateString() : "-"}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">Joined</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 p-4 bg-white/5 border border-white/10 rounded-xl">
        <p className="text-white/50 text-xs text-center">
          Want to manage all your invite codes?{" "}
          <a href="/settings#invites" className="text-amber-400 hover:underline">
            Go to Settings → Invite Friends
          </a>
        </p>
      </div>

      {user && (
        <div className="mt-4 flex items-center justify-center gap-1 text-xs text-white/30">
          <span>Signed in as</span>
          <span className="text-white/50 font-medium">@{user.username}</span>
          <ChevronRight className="w-3 h-3" />
          <a href="/profile" className="text-amber-400 hover:underline">View Profile</a>
        </div>
      )}
    </div>
  );
}
