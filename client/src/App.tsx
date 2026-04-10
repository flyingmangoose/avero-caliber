import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import Dashboard from "@/pages/dashboard";
import ProjectView from "@/pages/project-view";
import TemplateLibrary from "@/pages/template-library";
import VendorEvaluation from "@/pages/vendor-evaluation";
import StakeholderFeedback from "@/pages/stakeholder-feedback";
import CompliancePage from "@/pages/compliance";
import GoLivePage from "@/pages/go-live";
import HealthCheckPage from "@/pages/health-check";
import KnowledgeBasePage from "@/pages/knowledge-base";
import DiscoveryPage from "@/pages/discovery";
import FutureStatePage from "@/pages/future-state";
import ClientProfilePage from "@/pages/client-profile";
import NotFound from "@/pages/not-found";
import WorkshopView from "@/pages/workshop";
import Portfolio from "@/pages/portfolio";
import VendorMonitoringPage from "@/pages/vendor-monitoring";
import AboutPage from "@/pages/about";
import AdminPage from "@/pages/admin";
import OutcomesPage from "@/pages/outcomes";
import EvaluationScorecardPage from "@/pages/evaluation-scorecard";
import LoginPage from "@/pages/login";

const sidebarStyle = {
  "--sidebar-width": "15rem",
  "--sidebar-width-icon": "3.5rem",
};

function AppLayout() {
  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full overflow-hidden">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <AppHeader />
          <main className="flex-1 overflow-y-auto overscroll-contain">
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/portfolio" component={Portfolio} />
              <Route path="/projects/:id/evaluation" component={VendorEvaluation} />
              <Route path="/projects/:id/stakeholder-feedback" component={StakeholderFeedback} />
              <Route path="/projects/:id/compliance" component={CompliancePage} />
              <Route path="/projects/:id/go-live" component={GoLivePage} />
              <Route path="/projects/:id/health-check" component={HealthCheckPage} />
              <Route path="/projects/:id/client-profile" component={ClientProfilePage} />
              <Route path="/projects/:id/discovery" component={DiscoveryPage} />
              <Route path="/projects/:id/outcomes" component={OutcomesPage} />
              <Route path="/projects/:id/scorecard" component={EvaluationScorecardPage} />
              <Route path="/projects/:id/future-state" component={FutureStatePage} />
              <Route path="/clients/:id/profile" component={ClientProfilePage} />
              <Route path="/projects/:id" component={ProjectView} />
              <Route path="/templates" component={TemplateLibrary} />
              <Route path="/knowledge-base" component={KnowledgeBasePage} />
              <Route path="/vendor-monitoring" component={VendorMonitoringPage} />
              <Route path="/about" component={AboutPage} />
              <Route path="/admin" component={AdminPage} />
              <Route component={NotFound} />
            </Switch>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function AuthGate() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["/auth/me"],
    queryFn: () => fetch("/auth/me").then(r => {
      if (!r.ok) return { authRequired: false }; // treat errors as no-auth mode
      return r.json();
    }),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }

  // Show login ONLY when auth is configured AND user is not logged in (data is strictly null)
  // Any error, undefined, or { authRequired: false } → skip login
  if (data === null && !isError) {
    return <LoginPage />;
  }

  return <AppLayout />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Router hook={useHashLocation}>
            <Switch>
              <Route path="/workshop/:token" component={WorkshopView} />
              <Route path="/login" component={LoginPage} />
              <Route component={AuthGate} />
            </Switch>
          </Router>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
