import { useState, useCallback, useEffect, useRef } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Link, useLocation } from "wouter";
import {
  Compass, PenLine, MessageCircle, User as UserIcon,
  Bell, Moon, Sun, LogOut, Briefcase, Film, Settings, ShieldCheck,
  BarChart3, BookOpen, Users, Users2, Handshake,
  Bookmark, Star, Sparkles, Link2,
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { getInitials } from "@/lib/utils";
import { useGetNotifications } from "@workspace/api-client-react";
import { useSocketEvent, useSocketConnection } from "@/hooks/useSocket";
import { useT } from "@/lib/i18n";
import { StrikesBanner } from "@/components/StrikesBanner";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useRealtimeNotifications } from "@/hooks/useRealtimeNotifications";
import { CreateTypeSelector } from "@/components/compose/CreateTypeSelector";
import { GlobalSearch } from "@/components/search/GlobalSearch";
import { useFeature } from "@/lib/features";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { RouteProgress } from "./RouteProgress";
import { mediaUrl } from "@/lib/api";

interface AppLayoutProps {
  children: React.ReactNode;
  publicPage?: boolean;
}

const MOBILE_PRIMARY = [
  { href: "/", icon: Compass, label: "Home" },
  { href: "/network", icon: Users, label: "Network" },
  { href: "__create__", icon: PenLine, label: "Create" },
  { href: "/notifications", icon: Bell, label: "Alerts", badge: true },
  { href: "/groups", icon: Users2, label: "Group" },
  { href: "/workspace", icon: Briefcase, label: "Workspace" },
];

export function AppLayout({ children, publicPage = false }: AppLayoutProps) {
  const motionEnabled = useFeature("motion_enabled");
  const chainsEnabled = useFeature("chains_enabled");
  const [location, navigate] = useLocation();
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useTheme();
  const [liveNotifCount, setLiveNotifCount] = useState(0);
  const [liveMessageCount, setLiveMessageCount] = useState(0);
  const [baseMessageCount, setBaseMessageCount] = useState(0);
  const [trustTier, setTrustTier] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const t = useT();

  useKeyboardShortcuts({
    onOpenCreate: () => setCreateOpen(true),
    onFocusSearch: () => {
      document.getElementById("global-search")?.focus();
    },
  });

  useRealtimeNotifications();

  useEffect(() => {
    if (!user) return;
    const token = (user as any).token ?? localStorage.getItem("qh_token");
    fetch("/api/trust/me", { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.tier) setTrustTier(d.tier); })
      .catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    const token = (user as any).token ?? localStorage.getItem("qh_token");
    fetch("/api/messages/unread-count", { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (typeof d?.count === "number") setBaseMessageCount(d.count); })
      .catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    if (location.startsWith("/messages")) { setLiveMessageCount(0); setBaseMessageCount(0); }
    if (location.startsWith("/notifications")) setLiveNotifCount(0);
  }, [location]);

  useSocketConnection();
  usePushNotifications();

  const { data: notifications } = useGetNotifications({
    query: { enabled: !!user, queryKey: ["/api/notifications"] },
  });
  const unreadNotifCount = Array.isArray(notifications) ? notifications.filter(n => !n.isRead).length : 0;
  const unreadMessageCount = baseMessageCount + liveMessageCount;

  usePageTitle(undefined, unreadNotifCount > 0 ? unreadNotifCount : undefined);

  useSocketEvent<{ type: string }>("notification:new", useCallback((data) => {
    if (data.type === "message") {
      if (!location.startsWith("/messages")) setLiveMessageCount(prev => prev + 1);
    } else {
      setLiveNotifCount(prev => prev + 1);
    }
  }, [location]));

  const isActive = (href: string, exact?: boolean) => {
    if (href === "__create__") return false;
    return exact ? location === href : location.startsWith(href);
  };

  const handleNavClick = (href: string) => {
    if (href === "__create__") { setCreateOpen(true); return; }
    if (href === "/messages") { setLiveMessageCount(0); setBaseMessageCount(0); }
    if (href === "/notifications") setLiveNotifCount(0);
  };

  const NAV_ITEMS = [
    { href: "/", icon: Compass, label: "Home", exact: true },
    { href: "/network", icon: Users, label: "Network" },
    { href: "/notifications", icon: Bell, label: "Alerts", showBadge: "notif" as const },
    { href: "__create__", icon: PenLine, label: "Create", primary: true },
    ...(motionEnabled ? [{ href: "/motion", icon: Film, label: "Studio" }] : []),
    { href: "/groups", icon: Users, label: "Groups" },
    { href: "/workspace", icon: Briefcase, label: "Workspace" },
    { href: "/workspace?tab=collaborate", icon: Handshake, label: "Exchange" },
    { href: "/library", icon: BookOpen, label: "Library" },
    { href: "/saved", icon: Bookmark, label: "Saved" },
  ];
  const avatarUrl = mediaUrl(user?.avatarUrl);

  const SidebarNavItem = ({ item }: { item: (typeof NAV_ITEMS)[0] }) => {
    const Icon = item.icon;
    const active = isActive(item.href, item.exact);
    const badge = item.showBadge === "notif" ? unreadNotifCount : 0;
    const isCreate = item.href === "__create__";

    if (isCreate) {
      return (
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl w-full text-left bg-primary text-primary-foreground hover:bg-primary/90 font-semibold transition-all"
        >
          <Icon className="w-5 h-5 shrink-0" />
          <span className="text-sm">{item.label}</span>
        </button>
      );
    }
    return (
      <Link
        href={item.href}
        onClick={() => handleNavClick(item.href)}
        className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl w-full transition-all ${
          active ? "bg-primary/10 text-primary font-semibold" : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        <Icon className="w-5 h-5 shrink-0" />
        <span className="text-sm">{item.label}</span>
        {badge > 0 && (
          <span className="ml-auto w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </Link>
    );
  };

  if (publicPage) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <header className="border-b border-border bg-background/95">
          <div className="max-w-7xl mx-auto flex h-16 items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2">
              <img src="/logo.png" alt="QuillHive" className="w-8 h-8 rounded-lg" />
              <span className="font-serif text-lg font-bold"><span className="text-white">Quill</span><span className="text-primary">Hive</span></span>
            </Link>
            <div className="flex items-center gap-3 text-sm">
              {user ? <Link href="/" className="rounded-lg bg-primary px-3 py-2 font-medium text-primary-foreground">Go to QuillHive</Link> : <>
                <Link href="/login" className="text-muted-foreground hover:text-foreground">Sign in</Link>
                <Link href="/signup" className="rounded-lg bg-primary px-3 py-2 font-medium text-primary-foreground">Join free</Link>
              </>}
            </div>
          </div>
        </header>
        <main>{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <RouteProgress />
      {/* ── TOP HEADER ── */}
      <header className="fixed top-0 left-0 right-0 z-40 h-16 bg-background/90 backdrop-blur-lg border-b border-border">
        <div className="h-full flex items-center gap-3 px-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group shrink-0">
            <img src="/logo.png" alt="QuillHive" className="w-8 h-8 rounded-lg group-hover:scale-105 transition-transform" />
            <span className="font-serif font-bold text-lg tracking-tight hidden sm:block"><span className="text-white">Quill</span><span className="text-primary">Hive</span></span>
          </Link>

          {/* Search - fills centre */}
          <GlobalSearch />

          {/* Right: Messages + Theme + Avatar */}
          <div className="flex items-center gap-1 shrink-0">
            <Link
              href="/messages"
              onClick={() => { setLiveMessageCount(0); setBaseMessageCount(0); }}
              className="relative p-2 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted transition-colors"
              title="Messages"
            >
              <MessageCircle className="w-5 h-5" />
              {unreadMessageCount > 0 && (
                <span className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {unreadMessageCount > 9 ? "9+" : unreadMessageCount}
                </span>
              )}
            </Link>

            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-full ml-1">
                    <Avatar className="h-8 w-8 border-2 border-transparent hover:border-primary transition-colors">
                      {avatarUrl ? <AvatarImage src={avatarUrl} alt={user.displayName} /> : null}
                      <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs">
                        {getInitials(user.displayName || user.username || "?")}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 rounded-2xl">
                  <div className="px-3 py-3">
                    <p className="font-semibold truncate text-sm">{user.displayName || user.username}</p>
                    <p className="text-xs text-muted-foreground">@{user.username}</p>
                    {trustTier && (
                      <span className={`mt-1 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        trustTier === "trusted" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          : trustTier === "restricted" ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                          : "bg-primary/10 text-primary"
                      }`}>
                        <ShieldCheck className="w-2.5 h-2.5" />
                        {trustTier === "trusted" ? "Trusted Creator" : trustTier === "restricted" ? "Restricted" : "Creator Member"}
                      </span>
                    )}
                  </div>
                  <DropdownMenuSeparator />

                  <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wider px-3 py-1">Profile & Content</DropdownMenuLabel>
                  <DropdownMenuItem asChild>
                    <Link href={`/profile/${user.username}`} className="cursor-pointer w-full flex items-center gap-2">
                      <UserIcon className="w-4 h-4" /> My Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/drafts" className="cursor-pointer w-full flex items-center gap-2">
                      <Bookmark className="w-4 h-4" /> Drafts
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard" className="cursor-pointer w-full flex items-center gap-2">
                      <BarChart3 className="w-4 h-4" /> Growth Dashboard
                    </Link>
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wider px-3 py-1">Creative Tools</DropdownMenuLabel>
                  <DropdownMenuItem asChild>
                    <Link href="/library" className="cursor-pointer w-full flex items-center gap-2">
                      <BookOpen className="w-4 h-4" /> Library
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/saved" className="cursor-pointer w-full flex items-center gap-2">
                      <Bookmark className="w-4 h-4" /> Saved Posts
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/motion" className="cursor-pointer w-full flex items-center gap-2">
                      <Film className="w-4 h-4" /> Studio
                    </Link>
                  </DropdownMenuItem>
                  {chainsEnabled && (
                    <DropdownMenuItem asChild>
                      <Link href="/chains" className="cursor-pointer w-full flex items-center gap-2">
                        <Link2 className="w-4 h-4" /> Chains
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wider px-3 py-1">Professional</DropdownMenuLabel>
                  <DropdownMenuItem asChild>
                    <Link href="/promotions" className="cursor-pointer w-full flex items-center gap-2">
                      <Sparkles className="w-4 h-4" /> Promotions
                    </Link>
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wider px-3 py-1">Account</DropdownMenuLabel>
                  <DropdownMenuItem asChild>
                    <Link href="/invite" className="cursor-pointer w-full flex items-center gap-2">
                      <Users className="w-4 h-4" /> Invite Creators
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/settings" className="cursor-pointer w-full flex items-center gap-2">
                      <Settings className="w-4 h-4" /> Settings
                    </Link>
                  </DropdownMenuItem>
                  {(user as any)?.role && ["moderator", "admin", "super_admin"].includes((user as any).role) && (
                    <DropdownMenuItem asChild>
                      <Link href="/admin" className="cursor-pointer w-full flex items-center gap-2 text-violet-600 dark:text-violet-400">
                        <ShieldCheck className="w-4 h-4" /> Admin Panel
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} className="text-destructive focus:bg-destructive/10 cursor-pointer flex items-center gap-2">
                    <LogOut className="w-4 h-4" /> Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </header>

      {/* ── LAYOUT BODY ── */}
      <div className="flex pt-16">
        {/* Desktop Left Sidebar */}
        <aside className="hidden md:flex flex-col fixed top-16 left-0 w-56 h-[calc(100vh-4rem)] border-r border-border bg-background z-30 overflow-y-auto">
          <nav className="flex flex-col gap-1 p-3 flex-1">
            {NAV_ITEMS.map(item => (
              <SidebarNavItem key={item.href} item={item} />
            ))}
          </nav>
          <div className="p-3 border-t border-border">
            <Button variant="ghost" size="sm" onClick={toggleTheme} className="w-full justify-start gap-2 text-muted-foreground text-sm rounded-xl">
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </Button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 md:ml-56 pb-20 md:pb-6 min-h-[calc(100vh-4rem)] w-full">
          {user && <StrikesBanner />}
          {children}
        </main>
      </div>

      {/* ── MOBILE BOTTOM NAV ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-xl border-t border-border pb-safe">
        <div className="flex items-center justify-around px-1 py-1">
          {MOBILE_PRIMARY.map(item => {
            const Icon = item.icon;
            const active = isActive(item.href, item.href === "/");
            const isCreate = item.href === "__create__";

            return (
              <button
                key={item.href}
                onClick={() => {
                  if (isCreate) { setCreateOpen(true); return; }
                  handleNavClick(item.href);
                  navigate(item.href);
                }}
                className="flex flex-col items-center justify-center p-1 min-w-[3.5rem]"
              >
                <div className={`relative flex items-center justify-center rounded-xl transition-all duration-200 ${
                  isCreate
                    ? "w-12 h-12 bg-primary text-primary-foreground shadow-lg shadow-primary/30 -translate-y-2 rounded-2xl"
                    : active ? "p-2.5 bg-primary/10 text-primary" : "p-2.5 text-muted-foreground"
                }`}>
                  <Icon className={isCreate ? "w-6 h-6" : "w-5 h-5"} />
                </div>
                {!isCreate && (
                  <span className={`text-[9px] mt-0.5 font-medium ${active ? "text-primary" : "text-muted-foreground"}`}>
                    {item.label}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Create Type Selector */}
      <CreateTypeSelector open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
