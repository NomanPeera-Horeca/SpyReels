import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import OnboardingGate from "@/components/OnboardingGate";
import NotFound from "@/pages/NotFound";
import OnboardingPage from "@/pages/onboarding";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import ScrapingProgress from "./pages/ScrapingProgress";
import History from "./pages/History";
import SavedReels from "./pages/SavedReels";
import MyScripts from "./pages/MyScripts";
import ScriptEditor from "./pages/ScriptEditor";
import Settings from "./pages/Settings";
import Pricing from "./pages/Pricing";
import Billing from "./pages/Billing";
import TermsOfService from "./pages/TermsOfService";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import Contact from "./pages/Contact";
import BlogList from "./pages/BlogList";
import BlogPost from "./pages/BlogPost";
import BlogEditor from "./pages/BlogEditor";
import Extension from "./pages/Extension";
import CollectedReels from "./pages/CollectedReels";
import IdeaToScript from "./pages/IdeaToScript";
import Library from "./pages/Library";
import PasteScript from "./pages/PasteScript";
import Interests from "./pages/Interests";
import AdminDashboard from "./pages/AdminDashboard";
import ResetPassword from "./pages/ResetPassword";

function DashboardRouter() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/research" component={Home} />
        <Route path="/interests" component={Interests} />
        <Route path="/scraping" component={ScrapingProgress} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/saved" component={SavedReels} />
        <Route path="/scripts" component={MyScripts} />
        <Route path="/scripts/:id" component={ScriptEditor} />
        <Route path="/collected" component={CollectedReels} />
        <Route path="/ideas" component={IdeaToScript} />
        <Route path="/library" component={Library} />
        <Route path="/paste" component={PasteScript} />
        <Route path="/history" component={History} />
        <Route path="/settings" component={Settings} />
        <Route path="/pricing" component={Pricing} />
        <Route path="/billing" component={Billing} />
        <Route path="/admin" component={AdminDashboard} />
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
      <Route path="/blog" component={BlogList} />
      <Route path="/blog/:slug" component={BlogPost} />
      {/* <Route path="/extension" component={Extension} /> */}
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/onboarding" component={OnboardingPage} />
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
          <Toaster richColors />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
