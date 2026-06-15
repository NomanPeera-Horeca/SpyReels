import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UpgradeProvider } from "@/components/UpgradeSidesheet";
import OnboardingGate from "@/components/OnboardingGate";
import NotFound from "@/pages/NotFound";
import OnboardingPage from "@/pages/onboarding";
import { Route, Switch, Redirect } from "wouter";
import { isDiscoveryV1Enabled } from "@/lib/featureFlags";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import ScrapingProgress from "./pages/ScrapingProgress";
import History from "./pages/History";
import HookGenerator from "@/pages/HookGenerator";
import SavedReels from "./pages/SavedReels";
import MyScripts from "./pages/MyScripts";
import ScriptEditor from "./pages/ScriptEditor";
import Settings from "./pages/Settings";
import WorkspaceSettings from "./pages/WorkspaceSettings";
import Pricing from "./pages/Pricing";
import Billing from "./pages/Billing";
import TermsOfService from "./pages/TermsOfService";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import Contact from "./pages/Contact";
import Affiliate from "./pages/Affiliate";
import About from "./pages/About";
import ViralReelFinder from "./pages/ViralReelFinder";
import BlogList from "./pages/BlogList";
import BlogPost from "./pages/BlogPost";
import BlogEditor from "./pages/BlogEditor";
import Extension from "./pages/Extension";
import CollectedReels from "./pages/CollectedReels";
import Discovery from "./pages/Discovery";
import CreatorDiscovery from "./pages/CreatorDiscovery";
import IdeaToScript from "./pages/IdeaToScript";
import Library from "./pages/Library";
import PasteScript from "./pages/PasteScript";
import Interests from "./pages/Interests";
import AdminEntry from "./admin/AdminEntry";
import ResetPassword from "./pages/ResetPassword";
import AcceptInvitation from "./pages/AcceptInvitation";
import PublicScriptView from "./pages/PublicScriptView";

function DashboardRouter() {
  return (
    <DashboardLayout>
      <Switch>
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
        <Route path="/saved" component={SavedReels} />
        <Route path="/scripts" component={MyScripts} />
        <Route path="/scripts/:id" component={ScriptEditor} />
        <Route path="/collected" component={CollectedReels} />
        <Route path="/ideas" component={IdeaToScript} />
        <Route path="/library" component={Library} />
        <Route path="/paste" component={PasteScript} />
        <Route path="/history" component={History} />
        <Route path="/settings" component={Settings} />
        <Route path="/workspace/settings" component={WorkspaceSettings} />
        <Route path="/billing" component={Billing} />
        <Route path="/admin/traffic" component={AdminEntry} />
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
    </DashboardLayout>
  );
}

function Router() {
  return (
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
      <Route path="/onboarding" component={OnboardingPage} />
      <Route path="/free-tools/viral-hooks" component={HookGenerator} />
      <Route path="/features/viral-reel-finder" component={ViralReelFinder} />
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
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="system" switchable={true}>
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
