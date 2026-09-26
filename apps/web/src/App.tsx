import { useEffect, lazy, Suspense, useState } from "react";
import "@/lib/api";
import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { useFeature } from "@/lib/features";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuthStore } from "@/store/auth";
import { useT, useI18n } from "@/lib/i18n";
import NotFound from "@/pages/not-found";
import Auth from "@/pages/auth/Auth";
import VerifyEmailPage from "@/pages/auth/VerifyEmailPage";
import ForgotPasswordPage from "@/pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "@/pages/auth/ResetPasswordPage";
import { Footer } from './components/Footer';
import { CookieConsent } from './components/CookieConsent';
import { PwaInstallBanner } from './components/PwaInstallBanner';
import { NotificationToast } from './components/NotificationToast';
import { ErrorBoundary } from "@/components/ErrorBoundary";

const Home = lazy(() => import("@/pages/home/Home"));
const Network = lazy(() => import("@/pages/network/Network"));
const Explore = lazy(() => import("@/pages/explore/Explore"));
const Write = lazy(() => import("@/pages/write/Write"));
const Profile = lazy(() => import("@/pages/profile/Profile"));
const PostDetail = lazy(() => import("@/pages/post/PostDetail"));
const Messages = lazy(() => import("@/pages/messages/Messages"));
const Groups = lazy(() => import("@/pages/groups/Groups"));
const Jobs = lazy(() => import("@/pages/jobs/Jobs"));
const Workspace = lazy(() => import("@/pages/workspace/Workspace"));
const Notifications = lazy(() => import("@/pages/notifications/Notifications"));
const Settings = lazy(() => import("@/pages/settings/Settings"));
const Gallery = lazy(() => import("@/pages/gallery/Gallery"));
const Search = lazy(() => import("@/pages/search/Search"));
const Admin = lazy(() => import("@/pages/admin/Admin"));
const CreatorDashboard = lazy(() => import("@/pages/dashboard/CreatorDashboard"));
const ProfileViewers = lazy(() => import("@/pages/profile/ProfileViewers"));
const Saved = lazy(() => import("@/pages/saved/Saved"));
const Trending = lazy(() => import("@/pages/trending/Trending"));
const UploadCenter = lazy(() => import("@/pages/upload/UploadCenter"));
const SupportHub = lazy(() => import("@/pages/support/SupportHub"));
const Terms = lazy(() => import("./pages/legal/Terms").then(m => ({ default: m.Terms })));
const Privacy = lazy(() => import("./pages/legal/Privacy").then(m => ({ default: m.Privacy })));
const Safety = lazy(() => import("./pages/legal/Safety").then(m => ({ default: m.Safety })));
const ContentPolicy = lazy(() => import("./pages/legal/ContentPolicy").then(m => ({ default: m.ContentPolicy })));
const About = lazy(() => import("./pages/legal/About").then(m => ({ default: m.About })));
const Contact = lazy(() => import("./pages/legal/Contact").then(m => ({ default: m.Contact })));
const CommunityGuidelines = lazy(() => import("./pages/legal/CommunityGuidelines").then(m => ({ default: m.CommunityGuidelines })));
const CopyrightPolicy = lazy(() => import("./pages/legal/CopyrightPolicy").then(m => ({ default: m.CopyrightPolicy })));
const Onboarding = lazy(() => import("@/pages/onboarding/Onboarding"));
const TopicFeed = lazy(() => import("@/pages/topics/TopicFeed"));
const Collections = lazy(() => import("@/pages/collections/Collections"));
const Series = lazy(() => import("@/pages/series/Series"));
const IncomePage = lazy(() => import("@/pages/income/IncomePage"));
const PromotionsPage = lazy(() => import("@/pages/promotions/PromotionsPage"));
const InvitePage = lazy(() => import("@/pages/invite/InvitePage"));
const Portfolio = lazy(() => import("@/pages/portfolio/Portfolio"));
const Inbox = lazy(() => import("@/pages/collaboration/Inbox"));
const Motion = lazy(() => import("@/pages/motion/Motion"));
const Challenges = lazy(() => import("@/pages/challenges/Challenges"));
const Pricing = lazy(() => import("@/pages/pricing/Pricing"));
const Drafts = lazy(() => import("@/pages/drafts/Drafts"));
const Opportunities = lazy(() => import("@/pages/opportunities/Opportunities"));
const TalentScout = lazy(() => import("@/pages/opportunities/TalentScout"));
const PostJob = lazy(() => import("@/pages/jobs/PostJob"));
const Library = lazy(() => import("@/pages/library/Library"));
const LibraryEntry = lazy(() => import("@/pages/library/LibraryEntry"));
const AddToLibrary = lazy(() => import("@/pages/library/AddToLibrary"));
const PollNew = lazy(() => import("@/pages/polls/PollNew"));
const SparksNew = lazy(() => import("@/pages/sparks/SparksNew"));
const MotionUpload = lazy(() => import("@/pages/motion/MotionUpload"));
const ChainDiscover = lazy(() => import("@/pages/chains/ChainDiscover"));
const ChainNew = lazy(() => import("@/pages/chains/ChainNew"));
const ChainView = lazy(() => import("@/pages/chains/ChainView"));
const ChainMine = lazy(() => import("@/pages/chains/ChainMine"));
const ChainAnalytics = lazy(() => import("@/pages/chains/ChainAnalytics"));
const CarouselGenerator = lazy(() => import("@/pages/carousel/CarouselGenerator"));
const PaymentComplete = lazy(() => import("@/pages/payments/PaymentComplete"));

const PUBLIC_ROUTES = [
  "/about",
  "/contact",
  "/content-policy",
  "/copyright",
  "/community-guidelines",
  "/forgot-password",
  "/library",
  "/pricing",
  "/privacy",
  "/register",
  "/reset-password",
  "/signup",
  "/terms",
  "/safety",
  "/verify-email",
  "/copyright",
  "/auth/oauth-complete",
];

function isPublicRoute(location: string) {
  const pathname = location.split("?", 1)[0].replace(/\/$/, "") || "/";
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function PageLoader() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-4 animate-pulse">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-9 w-9 rounded-full bg-muted" />
        <div className="space-y-1.5">
          <div className="h-3 w-28 rounded bg-muted" />
          <div className="h-2.5 w-20 rounded bg-muted" />
        </div>
      </div>
      <div className="h-40 rounded-2xl bg-muted" />
      <div className="h-4 w-full rounded bg-muted" />
      <div className="h-4 w-4/5 rounded bg-muted" />
      <div className="h-4 w-3/5 rounded bg-muted" />
      <div className="mt-6 h-40 rounded-2xl bg-muted" />
      <div className="h-4 w-full rounded bg-muted" />
      <div className="h-4 w-2/3 rounded bg-muted" />
    </div>
  );
}

function AppRoot({ children }: { children: React.ReactNode }) {
  const { refreshUser, setInitializing } = useAuthStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    refreshUser().finally(() => {
      setInitializing(false);
      setReady(true);
    });
  }, []);

  if (!ready) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-4 animate-pulse">
        <div className="h-9 w-9 rounded-full bg-muted" />
        <div className="h-40 rounded-2xl bg-muted" />
      </div>
    );
  }

  return <>{children}</>;
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const t = useT();
  const { isAuthenticated } = useAuthStore();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!isAuthenticated) {
      if (location !== "/" && location !== "/login" && location !== "/explore" && !isPublicRoute(location)) {
        setLocation("/login");
      }
    }
  }, [isAuthenticated, location, setLocation]);

  // Bug A3: sync user language preference after login
  useEffect(() => {
    if (isAuthenticated) {
      const u = useAuthStore.getState().user as any;
      if (u?.languagePreference) {
        useI18n.getState().setLang(u.languagePreference);
      }
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const u = useAuthStore.getState().user as any;
    if (isAuthenticated && u && u.onboardingComplete === false) {
      if (location !== "/onboarding") {
        setLocation("/onboarding");
      }
    }
  }, [isAuthenticated, location, setLocation]);

  return <>{children}</>;
}

function GuestGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isInitializing } = useAuthStore();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isInitializing && isAuthenticated) setLocation("/");
  }, [isAuthenticated, isInitializing, setLocation]);

  if (isInitializing || isAuthenticated) return null;
  return <>{children}</>;
}

const ADMIN_ALLOWED_ROLES = ["moderator", "admin", "super_admin"];

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isInitializing } = useAuthStore();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isInitializing) return;
    if (!isAuthenticated) { setLocation("/login"); return; }
    const role = (user as any)?.role;
    if (!ADMIN_ALLOWED_ROLES.includes(role)) { setLocation("/"); }
  }, [isInitializing, isAuthenticated, user]);

  if (isInitializing) return null;
  const role = (user as any)?.role;
  if (!isAuthenticated || !ADMIN_ALLOWED_ROLES.includes(role)) return null;
  return <>{children}</>;
}

function FeatureRoute({
  flag,
  children,
}: {
  flag: string;
  children: React.ReactNode;
}) {
  const enabled = useFeature(flag);
  if (!enabled) return <Redirect to="/" />;
  return <>{children}</>;
}

function MaintenanceNotice() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="max-w-md text-center space-y-3">
        <h1 className="text-2xl font-serif font-bold text-foreground">QuillHive is temporarily unavailable</h1>
        <p className="text-muted-foreground">
          We’re making a few improvements. Please check back shortly.
        </p>
        <a href="/login" className="inline-block pt-4 text-sm text-primary hover:underline">
          Site admin? Sign in →
        </a>
      </div>
    </div>
  );
}

function Router() {
  const { user } = useAuthStore();

  return (
    <Switch>
      <Route path="/login"><GuestGuard><Auth /></GuestGuard></Route>
      <Route path="/signup"><GuestGuard><Auth /></GuestGuard></Route>
      <Route path="/register"><Redirect to={`/signup${window.location.search}`} /></Route>
      <Route path="/join/:code">{params => <Redirect to={`/signup?invite=${encodeURIComponent(params.code)}`} />}</Route>
      <Route path="/auth/magic" component={Auth} />
      <Route path="/auth/oauth-complete" component={Auth} />
      <Route path="/verify-email" component={VerifyEmailPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />

      <Route path="/">
        <AuthGuard><Home /></AuthGuard>
      </Route>
      <Route path="/explore">
        <AuthGuard><Explore /></AuthGuard>
      </Route>
      <Route path="/network">
        <AuthGuard><Network /></AuthGuard>
      </Route>
      <Route path="/polls/new">
        <AuthGuard><PollNew /></AuthGuard>
      </Route>
      <Route path="/chains/new">
        <AuthGuard><FeatureRoute flag="chains_enabled"><ChainNew /></FeatureRoute></AuthGuard>
      </Route>
      <Route path="/chains/mine">
        <AuthGuard><FeatureRoute flag="chains_enabled"><ChainMine /></FeatureRoute></AuthGuard>
      </Route>
      <Route path="/chains/:id/analytics">
        <AuthGuard><FeatureRoute flag="chains_enabled"><ChainAnalytics /></FeatureRoute></AuthGuard>
      </Route>
      <Route path="/chains/:id">
        <AuthGuard><FeatureRoute flag="chains_enabled"><ChainView /></FeatureRoute></AuthGuard>
      </Route>
      <Route path="/chains">
        <AuthGuard><FeatureRoute flag="chains_enabled"><ChainDiscover /></FeatureRoute></AuthGuard>
      </Route>
      <Route path="/write">
        <AuthGuard><Write /></AuthGuard>
      </Route>
      <Route path="/profile/:username">
        <AuthGuard><Profile /></AuthGuard>
      </Route>
      <Route path="/post/:id">
        <AuthGuard><PostDetail /></AuthGuard>
      </Route>
      <Route path="/messages">
        <AuthGuard><Messages /></AuthGuard>
      </Route>
      <Route path="/messages/:convId">
        <AuthGuard><Messages /></AuthGuard>
      </Route>
      <Route path="/groups/:id">
        <AuthGuard><Groups /></AuthGuard>
      </Route>
      <Route path="/workspace">
        <AuthGuard><Workspace /></AuthGuard>
      </Route>
      <Route path="/groups">
        <AuthGuard><Groups /></AuthGuard>
      </Route>

      <Route path="/profile">
        <AuthGuard><Profile /></AuthGuard>
      </Route>
      <Route path="/jobs">
        <Redirect to="/workspace?tab=work" />
      </Route>
      <Route path="/motion/upload">
        <AuthGuard><FeatureRoute flag="motion_enabled"><MotionUpload /></FeatureRoute></AuthGuard>
      </Route>
      <Route path="/motion">
        <AuthGuard><FeatureRoute flag="motion_enabled"><Motion /></FeatureRoute></AuthGuard>
      </Route>
      <Route path="/notifications">
        <AuthGuard><Notifications /></AuthGuard>
      </Route>
      <Route path="/settings">
        <AuthGuard><Settings /></AuthGuard>
      </Route>
      <Route path="/dashboard">
        <AuthGuard><CreatorDashboard /></AuthGuard>
      </Route>
      <Route path="/profile-viewers">
        <AuthGuard><ProfileViewers /></AuthGuard>
      </Route>
      <Route path="/saved">
        <AuthGuard><Saved /></AuthGuard>
      </Route>
      <Route path="/drafts">
        <AuthGuard><Drafts /></AuthGuard>
      </Route>
      <Route path="/trending">
        <AuthGuard><Trending /></AuthGuard>
      </Route>
      <Route path="/sparks/new">
        <AuthGuard><SparksNew /></AuthGuard>
      </Route>
      <Route path="/challenges">
        <AuthGuard><Challenges /></AuthGuard>
      </Route>
      <Route path="/inbox">
        <Redirect to="/workspace?tab=collaborate" />
      </Route>
      <Route path="/upload">
        <AuthGuard><UploadCenter /></AuthGuard>
      </Route>
      <Route path="/support">
        <AuthGuard><SupportHub /></AuthGuard>
      </Route>
      <Route path="/gallery">
        <AuthGuard><FeatureRoute flag="gallery_enabled"><Gallery /></FeatureRoute></AuthGuard>
      </Route>
      <Route path="/search">
        <AuthGuard><Search /></AuthGuard>
      </Route>
      <Route path="/onboarding">
        <AuthGuard><Onboarding /></AuthGuard>
      </Route>
      <Route path="/topics/:slug">
        <AuthGuard><TopicFeed /></AuthGuard>
      </Route>
      <Route path="/collections">
        <AuthGuard><FeatureRoute flag="collections_enabled"><Collections /></FeatureRoute></AuthGuard>
      </Route>
      <Route path="/series/:id">
        <AuthGuard><FeatureRoute flag="series_enabled"><Series /></FeatureRoute></AuthGuard>
      </Route>
      <Route path="/series">
        <AuthGuard><FeatureRoute flag="series_enabled"><Series /></FeatureRoute></AuthGuard>
      </Route>
      <Route path="/income">
        <AuthGuard><FeatureRoute flag="income_tracker_enabled"><IncomePage /></FeatureRoute></AuthGuard>
      </Route>
      <Route path="/payments/complete">
        <AuthGuard><PaymentComplete /></AuthGuard>
      </Route>
      <Route path="/analytics">
        <Redirect to="/promotions" />
      </Route>
      <Route path="/promotions">
        <AuthGuard><PromotionsPage /></AuthGuard>
      </Route>
      <Route path="/carousel">
        {user?.role === 'admin' || user?.role === 'super_admin'
          ? <Suspense fallback={<PageLoader />}><CarouselGenerator /></Suspense>
          : <Redirect to="/" />
        }
      </Route>
      <Route path="/invite">
        <AuthGuard><InvitePage /></AuthGuard>
      </Route>

      <Route path="/opportunities/search">
        <Redirect to="/workspace?tab=talent" />
      </Route>
      <Route path="/opportunities">
        <Redirect to="/workspace?tab=talent" />
      </Route>
      <Route path="/jobs/post">
        <AuthGuard><PostJob /></AuthGuard>
      </Route>

      <Route path="/portfolio/:username"><Portfolio /></Route>
      <Route path="/portfolio"><Portfolio /></Route>

      {/* Library - public, no auth required */}
      <Route path="/library" component={Library} />
      <Route path="/library/new" component={AddToLibrary} />
      <Route path="/library/:slug" component={LibraryEntry} />

      {/* Public profile at /u/:username - SEO-friendly canonical URL */}
      <Route path="/u/:username">
        <Profile />
      </Route>

      <Route path="/admin">
        <AdminGuard><Admin /></AdminGuard>
      </Route>
      <Route path="/pricing"><Pricing /></Route>
      <Route path="/terms"><Terms /></Route>
      <Route path="/privacy"><Privacy /></Route>
      <Route path="/safety"><Safety /></Route>
      <Route path="/content-policy"><ContentPolicy /></Route>
      <Route path="/community-guidelines"><CommunityGuidelines /></Route>
      <Route path="/copyright"><CopyrightPolicy /></Route>
      <Route path="/about"><About /></Route>
      <Route path="/contact"><Contact /></Route>
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <TooltipProvider>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <AppShell />
      </WouterRouter>
      <NotificationToast />
      <Toaster />
      <CookieConsent />
      <PwaInstallBanner />
    </TooltipProvider>
  );
}

function AppShell() {
  const [location] = useLocation();
  const { user } = useAuthStore();
  const showFooter = isPublicRoute(location) || location === "/explore" || (location === "/" && !user);
  const maintenanceMode = useFeature("maintenance_mode");
  const isAdminUser = user?.role === "admin" || user?.role === "super_admin";
  const blockedByMaintenance = maintenanceMode && !isAdminUser;

  return (
    <>
      {blockedByMaintenance ? <MaintenanceNotice /> : (
        <ErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <AppRoot><Router /></AppRoot>
          </Suspense>
        </ErrorBoundary>
      )}
      {showFooter && <Footer />}
    </>
  );
}
