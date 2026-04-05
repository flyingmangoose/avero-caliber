import { LayoutDashboard, FolderOpen, BookTemplate, Sun, Moon, BarChart3, PieChart, MessageSquare, Shield, Rocket, Stethoscope, BookOpen } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useTheme } from "@/lib/theme";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Portfolio", url: "/portfolio", icon: PieChart },
  { title: "Template Library", url: "/templates", icon: BookTemplate },
  { title: "Knowledge Base", url: "/knowledge-base", icon: BookOpen },
];

function AveroLogo() {
  return (
    <svg viewBox="0 0 32 32" fill="none" className="w-8 h-8 shrink-0" aria-label="Avero Caliber logo">
      <rect x="2" y="6" width="28" height="20" rx="3" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M10 22L16 10L22 22" stroke="hsl(40,60%,58%)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <line x1="12" y1="18" x2="20" y2="18" stroke="hsl(40,60%,58%)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const MODULE_BADGES: Record<string, { label: string; color: string }> = {
  selection: { label: "SEL", color: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400" },
  ivv: { label: "IV&V", color: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400" },
  health_check: { label: "HC", color: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400" },
};

export function AppSidebar() {
  const [location] = useLocation();
  const { theme, toggleTheme } = useTheme();

  // Extract project ID from URL if we're in a project context
  const projectMatch = location.match(/^\/projects\/(\d+)/);
  const projectId = projectMatch ? projectMatch[1] : null;

  const { data: project } = useQuery<any>({
    queryKey: ["/api/projects", projectId],
    queryFn: () => apiRequest("GET", `/api/projects/${projectId}`).then(r => r.json()),
    enabled: !!projectId,
  });

  const modules: string[] = project?.engagementModules ? (typeof project.engagementModules === "string" ? JSON.parse(project.engagementModules) : project.engagementModules) : ["selection"];
  const hasModule = (m: string) => modules.includes(m);

  return (
    <Sidebar data-testid="sidebar-nav">
      <SidebarHeader className="px-4 py-4">
        <Link href="/" className="flex items-center gap-2.5 no-underline">
          <AveroLogo />
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">Avero Caliber</span>
            <span className="text-[11px] text-sidebar-foreground/60 font-medium">Vendor Evaluation Platform</span>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50 text-[10px] uppercase tracking-widest font-semibold">Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = item.url === "/" ? location === "/" : location.startsWith(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link href={item.url} data-testid={`nav-${item.title.toLowerCase().replace(/\s/g, '-')}`}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Project-context navigation */}
        {projectId && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/50 text-[10px] uppercase tracking-widest font-semibold">Project</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {/* Selection module items */}
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === `/projects/${projectId}`}>
                    <Link href={`/projects/${projectId}`} data-testid="nav-project-requirements">
                      <FolderOpen className="w-4 h-4" />
                      <span>Requirements</span>
                      {!hasModule("selection") && <Badge className="ml-auto text-[8px] px-1 py-0 bg-muted text-muted-foreground">SEL</Badge>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === `/projects/${projectId}/evaluation`}>
                    <Link href={`/projects/${projectId}/evaluation`} data-testid="nav-vendor-evaluation">
                      <BarChart3 className="w-4 h-4" />
                      <span>Vendor Evaluation</span>
                      {!hasModule("selection") && <Badge className="ml-auto text-[8px] px-1 py-0 bg-muted text-muted-foreground">SEL</Badge>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                {/* IV&V module items */}
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === `/projects/${projectId}/compliance`}>
                    <Link href={`/projects/${projectId}/compliance`} data-testid="nav-contract-compliance">
                      <Shield className="w-4 h-4" />
                      <span>Contract Compliance</span>
                      {!hasModule("ivv") && <Badge className="ml-auto text-[8px] px-1 py-0 bg-muted text-muted-foreground">IV&V</Badge>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === `/projects/${projectId}/stakeholder-feedback`}>
                    <Link href={`/projects/${projectId}/stakeholder-feedback`} data-testid="nav-stakeholder-feedback">
                      <MessageSquare className="w-4 h-4" />
                      <span>Stakeholder Feedback</span>
                      {!hasModule("ivv") && <Badge className="ml-auto text-[8px] px-1 py-0 bg-muted text-muted-foreground">IV&V</Badge>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === `/projects/${projectId}/go-live`}>
                    <Link href={`/projects/${projectId}/go-live`} data-testid="nav-go-live">
                      <Rocket className="w-4 h-4" />
                      <span>Go-Live Readiness</span>
                      {!hasModule("ivv") && <Badge className="ml-auto text-[8px] px-1 py-0 bg-muted text-muted-foreground">IV&V</Badge>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                {/* Health Check module items */}
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === `/projects/${projectId}/health-check`}>
                    <Link href={`/projects/${projectId}/health-check`} data-testid="nav-health-check">
                      <Stethoscope className="w-4 h-4" />
                      <span>Health Check</span>
                      {!hasModule("health_check") && <Badge className="ml-auto text-[8px] px-1 py-0 bg-muted text-muted-foreground">HC</Badge>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="px-3 py-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleTheme}
          className="w-full justify-start gap-2 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          data-testid="button-theme-toggle"
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
