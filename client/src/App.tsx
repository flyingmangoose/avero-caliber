import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
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

const sidebarStyle = {
  "--sidebar-width": "18rem",
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
              <Route path="/projects/:id/future-state" component={FutureStatePage} />
              <Route path="/clients/:id/profile" component={ClientProfilePage} />
              <Route path="/projects/:id" component={ProjectView} />
              <Route path="/templates" component={TemplateLibrary} />
              <Route path="/knowledge-base" component={KnowledgeBasePage} />
              <Route path="/vendor-monitoring" component={VendorMonitoringPage} />
              <Route path="/about" component={AboutPage} />
              <Route component={NotFound} />
            </Switch>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Router hook={useHashLocation}>
            <Switch>
              <Route path="/workshop/:token" component={WorkshopView} />
              <Route component={AppLayout} />
            </Switch>
          </Router>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
