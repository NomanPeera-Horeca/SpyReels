import { Suspense, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UpgradeProvider } from "@/components/UpgradeSidesheet";
import OnboardingGate from "@/components/OnboardingGate";
import { Route, Switch, Redirect, useLocation } from "wouter";
import { isDiscoveryV1Enabled } from "@/lib/featureFlags";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import MobileAppLayout from "./components/MobileAppLayout";
import { DashboardLayoutSkeleton } from "./components/DashboardLayoutSkeleton";
import { MobileAppLayoutSkeleton } from "./components/MobileAppLayoutSkeleton";
import { MobileCreateAppProvider } from "./contexts/MobileCreateAppContext";
import { isMobileCreateApp, isMobileCreateAllowedPath } from "@/lib/mobileCreateApp";
import { ThemeProvider } from "./contexts/ThemeContext";
import { RetellChatWidget } from "@/components/RetellChatWidget";

const NotFound = lazyWithRetry(() => import("@/pages/NotFound"));
const OnboardingPage = lazyWithRetry(() => import("@/pages/onboarding"));
const Home = lazyWithRetry(() => import("./pages/Home"));
const Dashboard = lazyWithRetry(() => import("./pages/Dashboard"));
const ScrapingProgress = lazyWithRetry(() => import("./pages/ScrapingProgress"));
const TikTokScrapingProgress = lazyWithRetry(() => import("./pages/TikTokScrapingProgress"));
const YouTubeScrapingProgress = lazyWithRetry(() => import("./pages/YouTubeScrapingProgress"));
const History = lazyWithRetry(() => import("./pages/History"));
const HookGenerator = lazyWithRetry(() => import("@/pages/HookGenerator"));
const BrollGenerator = lazyWithRetry(() => import("@/pages/BrollGenerator"));
const AiScriptGeneratorHubPage = lazyWithRetry(() =>
  import("@/pages/AiScriptGeneratorLanding").then((m) => ({ default: m.AiScriptGeneratorHubPage }))
);
const TikTokScriptGeneratorPage = lazyWithRetry(() =>
  import("@/pages/AiScriptGeneratorLanding").then((m) => ({ default: m.TikTokScriptGeneratorPage }))
);
const InstagramReelsScriptGeneratorPage = lazyWithRetry(() =>
  import("@/pages/AiScriptGeneratorLanding").then((m) => ({
    default: m.InstagramReelsScriptGeneratorPage,
  }))
);
const InstagramTranscriptGeneratorPage = lazyWithRetry(() =>
  import("@/pages/TranscriptGeneratorLanding").then((m) => ({
    default: m.InstagramTranscriptGeneratorPage,
  }))
);
const TikTokTranscriptGeneratorPage = lazyWithRetry(() =>
  import("@/pages/TranscriptGeneratorLanding").then((m) => ({
    default: m.TikTokTranscriptGeneratorPage,
  }))
);
const YouTubeShortsTranscriptPage = lazyWithRetry(() =>
  import("@/pages/TranscriptGeneratorLanding").then((m) => ({
    default: m.YouTubeShortsTranscriptPage,
  }))
);
const YouTubeTranscriptGeneratorPage = lazyWithRetry(() =>
  import("@/pages/TranscriptGeneratorLanding").then((m) => ({
    default: m.YouTubeTranscriptGeneratorPage,
  }))
);
const FreeTools = lazyWithRetry(() => import("./pages/FreeTools"));
const SavedReels = lazyWithRetry(() => import("./pages/SavedReels"));
const MyScripts = lazyWithRetry(() => import("./pages/MyScripts"));
const ScriptEditor = lazyWithRetry(() => import("./pages/ScriptEditor"));
const Settings = lazyWithRetry(() => import("./pages/Settings"));
const WorkspaceSettings = lazyWithRetry(() => import("./pages/WorkspaceSettings"));
const Pricing = lazyWithRetry(() => import("./pages/Pricing"));
const Billing = lazyWithRetry(() => import("./pages/Billing"));
const TermsOfService = lazyWithRetry(() => import("./pages/TermsOfService"));
const PrivacyPolicy = lazyWithRetry(() => import("./pages/PrivacyPolicy"));
const Contact = lazyWithRetry(() => import("./pages/Contact"));
const Affiliate = lazyWithRetry(() => import("./pages/Affiliate"));
const About = lazyWithRetry(() => import("./pages/About"));
const ViralReelFinder = lazyWithRetry(() => import("./pages/ViralReelFinder"));
const TikTokViralVideoFinder = lazyWithRetry(() => import("./pages/TikTokViralVideoFinder"));
const YouTubeShortsViralFinder = lazyWithRetry(() => import("./pages/YouTubeShortsViralFinder"));
const ThirtyDayContentPlanFeature = lazyWithRetry(() => import("./pages/ThirtyDayContentPlanFeature"));
const AiPersonalBrandCoachFeature = lazyWithRetry(() => import("./pages/AiPersonalBrandCoachFeature"));
const BlogList = lazyWithRetry(() => import("./pages/BlogList"));
const BlogPost = lazyWithRetry(() => import("./pages/BlogPost"));
const BlogEditor = lazyWithRetry(() => import("./pages/BlogEditor"));
const Extension = lazyWithRetry(() => import("./pages/Extension"));
const CollectedReels = lazyWithRetry(() => import("./pages/CollectedReels"));
const Discovery = lazyWithRetry(() => import("./pages/Discovery"));
const CreatorDiscovery = lazyWithRetry(() => import("./pages/CreatorDiscovery"));
const ViralityDiagnostic = lazyWithRetry(() => import("./pages/ViralityDiagnostic"));
// Idea to Script paused: keep page file, route redirects to /studio
// const IdeaToScript = lazyWithRetry(() => import("./pages/IdeaToScript"));
const ThirtyDayPlan = lazyWithRetry(() => import("./pages/ThirtyDayPlan"));
const AiCoach = lazyWithRetry(() => import("./pages/AiCoach"));
const CarouselLibrary = lazyWithRetry(() => import("./pages/CarouselLibrary"));
const BrollLibrary = lazyWithRetry(() => import("./pages/BrollLibrary"));
const PasteScript = lazyWithRetry(() => import("./pages/PasteScript"));
const Interests = lazyWithRetry(() => import("./pages/Interests"));
const AdminEntry = lazyWithRetry(() => import("./admin/AdminEntry"));
const ResetPassword = lazyWithRetry(() => import("./pages/ResetPassword"));
const AcceptInvitation = lazyWithRetry(() => import("./pages/AcceptInvitation"));
const PublicScriptView = lazyWithRetry(() => import("./pages/PublicScriptView"));

/** THROWAWAY: carousel layout preview. Remove with DevCarouselPreview page. */
const DevCarouselPreview = lazyWithRetry(() => import("./pages/DevCarouselPreview"));

/** THROWAWAY: video B-roll upload + transcription Phase 2 test. */
const VideoBrollUploadTest = lazyWithRetry(
  () => import("./pages/VideoBrollUploadTest")
);

const MobileMore = lazyWithRetry(() => import("./pages/MobileMore"));

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
          <Route path="/tiktok-scraping" component={TikTokScrapingProgress} />
          <Route path="/youtube-scraping" component={YouTubeScrapingProgress} />
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
          <Route path="/carousel-library" component={CarouselLibrary} />
          <Route path="/broll-library" component={BrollLibrary} />
          <Route path="/video-broll-upload-test" component={VideoBrollUploadTest} />
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
        <Route path="/free-tools" component={FreeTools} />
        <Route path="/free-tools/viral-hooks" component={HookGenerator} />
        <Route path="/free-tools/broll-generator" component={BrollGenerator} />
        <Route path="/free-tools/ai-script-generator" component={AiScriptGeneratorHubPage} />
        <Route path="/free-tools/tiktok-script-generator" component={TikTokScriptGeneratorPage} />
        <Route
          path="/free-tools/instagram-reels-script-generator"
          component={InstagramReelsScriptGeneratorPage}
        />
        <Route
          path="/free-tools/instagram-transcript-generator"
          component={InstagramTranscriptGeneratorPage}
        />
        <Route
          path="/free-tools/tiktok-transcript-generator"
          component={TikTokTranscriptGeneratorPage}
        />
        <Route
          path="/free-tools/youtube-shorts-transcript"
          component={YouTubeShortsTranscriptPage}
        />
        <Route
          path="/free-tools/youtube-transcript-generator"
          component={YouTubeTranscriptGeneratorPage}
        />
        <Route path="/free-tools/tiktok-viral-video-finder" component={TikTokViralVideoFinder} />
        <Route path="/free-tools/youtube-shorts-viral-finder" component={YouTubeShortsViralFinder} />
        {/* THROWAWAY: carousel remake visual proof. Remove with DevCarouselPreview. */}
        <Route path="/dev/carousel-preview" component={DevCarouselPreview} />
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
        <Route path="/features/tiktok-viral-video-finder">
          {() => {
            if (typeof window !== "undefined") {
              window.location.replace("/free-tools/tiktok-viral-video-finder");
            }
            return null;
          }}
        </Route>
        <Route path="/features/youtube-shorts-viral-finder">
          {() => {
            if (typeof window !== "undefined") {
              window.location.replace("/free-tools/youtube-shorts-viral-finder");
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
            <RetellChatWidget />
          </UpgradeProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
