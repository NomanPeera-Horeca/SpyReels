import { lazy, Suspense, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UpgradeProvider } from "@/components/UpgradeSidesheet";
import OnboardingGate from "@/components/OnboardingGate";
import { Route, Switch, Redirect, useLocation } from "wouter";
import { isDiscoveryV1Enabled } from "@/lib/featureFlags";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import MobileAppLayout from "./components/MobileAppLayout";
import { DashboardLayoutSkeleton } from "./components/DashboardLayoutSkeleton";
import { MobileAppLayoutSkeleton } from "./components/MobileAppLayoutSkeleton";
import { MobileCreateAppProvider } from "./contexts/MobileCreateAppContext";
import { isMobileCreateApp, isMobileCreateAllowedPath } from "@/lib/mobileCreateApp";
import { ThemeProvider } from "./contexts/ThemeContext";

const NotFound = lazy(() => import("@/pages/NotFound"));
const OnboardingPage = lazy(() => import("@/pages/onboarding"));
const Home = lazy(() => import("./pages/Home"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const ScrapingProgress = lazy(() => import("./pages/ScrapingProgress"));
const History = lazy(() => import("./pages/History"));
const HookGenerator = lazy(() => import("@/pages/HookGenerator"));
const SavedReels = lazy(() => import("./pages/SavedReels"));
const MyScripts = lazy(() => import("./pages/MyScripts"));
const ScriptEditor = lazy(() => import("./pages/ScriptEditor"));
const Settings = lazy(() => import("./pages/Settings"));
const WorkspaceSettings = lazy(() => import("./pages/WorkspaceSettings"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Billing = lazy(() => import("./pages/Billing"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const Contact = lazy(() => import("./pages/Contact"));
const Affiliate = lazy(() => import("./pages/Affiliate"));
const About = lazy(() => import("./pages/About"));
const ViralReelFinder = lazy(() => import("./pages/ViralReelFinder"));
const ThirtyDayContentPlanFeature = lazy(() => import("./pages/ThirtyDayContentPlanFeature"));
const AiPersonalBrandCoachFeature = lazy(() => import("./pages/AiPersonalBrandCoachFeature"));
const BlogList = lazy(() => import("./pages/BlogList"));
const BlogPost = lazy(() => import("./pages/BlogPost"));
const BlogEditor = lazy(() => import("./pages/BlogEditor"));
const Extension = lazy(() => import("./pages/Extension"));
const CollectedReels = lazy(() => import("./pages/CollectedReels"));
const Discovery = lazy(() => import("./pages/Discovery"));
const CreatorDiscovery = lazy(() => import("./pages/CreatorDiscovery"));
const ViralityDiagnostic = lazy(() => import("./pages/ViralityDiagnostic"));
// Idea to Script paused: keep page file, route redirects to /studio
// const IdeaToScript = lazy(() => import("./pages/IdeaToScript"));
const ThirtyDayPlan = lazy(() => import("./pages/ThirtyDayPlan"));
const AiCoach = lazy(() => import("./pages/AiCoach"));
const Library = lazy(() => import("./pages/Library"));
const PasteScript = lazy(() => import("./pages/PasteScript"));
const Interests = lazy(() => import("./pages/Interests"));
const AdminEntry = lazy(() => import("./admin/AdminEntry"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const AcceptInvitation = lazy(() => import("./pages/AcceptInvitation"));
const PublicScriptView = lazy(() => import("./pages/PublicScriptView"));

const MobileMore = lazy(() => import("./pages/MobileMore"));

function MobileCreateRouteGuard({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  if (!isMobileCreateAllowedPath(location)) {
    return <Redirect to="/plan" />;
  }
  return <>{children}</>;
}

function MobileHomeRedirect() {
  return <Redirect to="/plan" />;
}

function MobileCreateRouter() {
  return (
    <MobileAppLayout>
      <Suspense fallback={<MobileAppLayoutSkeleton />}>
        <MobileCreateRouteGuard>
          <Switch>
            <Route path="/onboarding" component={OnboardingPage} />
            <Route path="/" component={MobileHomeRedirect} />
            <Route path="/research" component={MobileHomeRedirect} />
            <Route path="/dashboard" component={MobileHomeRedirect} />
            <Route path="/plan" component={ThirtyDayPlan} />
            <Route path="/studio" component={AiCoach} />
            <Route path="/scripts" component={MyScripts} />
            <Route path="/scripts/:id" component={ScriptEditor} />
            <Route path="/ideas">{() => <Redirect to="/studio" />}</Route>
            <Route path="/more" component={MobileMore} />
            <Route path="/settings" component={Settings} />
            <Route path="/workspace/settings" component={WorkspaceSettings} />
            <Route path="/billing" component={Billing} />
            <Route component={MobileHomeRedirect} />
          </Switch>
        </MobileCreateRouteGuard>
      </Suspense>
    </MobileAppLayout>
  );
}

function DesktopDashboardRouter() {
  return (
    <DashboardLayout>
      <Suspense fallback={<DashboardLayoutSkeleton />}>
        <Switch>
          <Route path="/onboarding" component={OnboardingPage} />
          <Route path="/" component={Home} />
          <Route path="/research" component={Home} />
          <Route path="/interests" component={Interests} />
          <Route path="/scraping" component={ScrapingProgress} />
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/discovery">
            {isDiscoveryV1Enabled ? <Discovery /> : <Redirect to="/dashboard" />}
          </Route>
          <Route path="/discover-creators">
            {isDiscoveryV1Enabled ? (
              <CreatorDiscovery />
            ) : (
              <Redirect to="/dashboard" />
            )}
          </Route>
          <Route path="/my-virality-report">
            <ViralityDiagnostic />
          </Route>
          <Route path="/saved" component={SavedReels} />
          <Route path="/scripts" component={MyScripts} />
          <Route path="/scripts/:id" component={ScriptEditor} />
          <Route path="/collected" component={CollectedReels} />
          <Route path="/ideas">{() => <Redirect to="/studio" />}</Route>
          <Route path="/plan" component={ThirtyDayPlan} />
          <Route path="/studio" component={AiCoach} />
          <Route path="/library" component={Library} />
          <Route path="/paste" component={PasteScript} />
          <Route path="/history" component={History} />
          <Route path="/settings" component={Settings} />
          <Route path="/workspace/settings" component={WorkspaceSettings} />
          <Route path="/billing" component={Billing} />
          <Route path="/admin/traffic" component={AdminEntry} />
          <Route path="/admin/script-quality" component={AdminEntry} />
          <Route path="/admin/blogs/:slug?" component={AdminEntry} />
          <Route path="/admin/creators/:segment?" component={AdminEntry} />
          <Route path="/admin/users/:userId" component={AdminEntry} />
          <Route path="/admin/emails" component={AdminEntry} />
          <Route path="/admin/outreach" component={AdminEntry} />
          <Route path="/admin/users" component={AdminEntry} />
          <Route path="/admin/seo/:tab?" component={AdminEntry} />
          <Route path="/admin" component={AdminEntry} />
          <Route path="/blog/new" component={BlogEditor} />
          <Route path="/blog/edit/:slug" component={BlogEditor} />
          <Route path="/404" component={NotFound} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </DashboardLayout>
  );
}

function DashboardRouter() {
  const [mobileCreate] = useState(() => isMobileCreateApp());

  return (
    <MobileCreateAppProvider active={mobileCreate}>
      {mobileCreate ? <MobileCreateRouter /> : <DesktopDashboardRouter />}
    </MobileCreateAppProvider>
  );
}

function Router() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      }
    >
      <Switch>
        {/* Public pages - no dashboard layout */}
        <Route path="/terms" component={TermsOfService} />
        <Route path="/privacy" component={PrivacyPolicy} />
        <Route path="/contact" component={Contact} />
        <Route path="/about" component={About} />
        <Route path="/affiliate" component={Affiliate} />
        <Route path="/pricing" component={Pricing} />
        <Route path="/blog" component={BlogList} />
        <Route path="/blog/:slug" component={BlogPost} />
        <Route path="/extension" component={Extension} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route path="/invitations/accept/:token" component={AcceptInvitation} />
        <Route path="/s/:token" component={PublicScriptView} />
        <Route path="/free-tools/viral-hooks" component={HookGenerator} />
        <Route path="/features/viral-reel-finder" component={ViralReelFinder} />
        <Route path="/features/30-day-content-plan" component={ThirtyDayContentPlanFeature} />
        <Route path="/features/ai-personal-brand-coach" component={AiPersonalBrandCoachFeature} />
        <Route path="/hooks">
          {() => {
            if (typeof window !== "undefined") {
              window.location.replace("/free-tools/viral-hooks");
            }
            return null;
          }}
        </Route>
        {/* Everything else goes through DashboardLayout (which shows landing page if not auth'd) */}
        <Route>
          <OnboardingGate>
            <DashboardRouter />
          </OnboardingGate>
        </Route>
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark" switchable={true}>
        <TooltipProvider>
          <UpgradeProvider>
            <Toaster richColors />
            <Router />
          </UpgradeProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
