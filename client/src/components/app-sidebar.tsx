import { LayoutDashboard, FolderOpen, BookTemplate, Sun, Moon, BarChart3, PieChart, MessageSquare, Shield, Rocket, Stethoscope, BookOpen, Compass, ArrowRightLeft, Building2, Radar, Info, Target, Trophy } from "lucide-react";
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
  { title: "Vendor Intelligence", url: "/vendor-monitoring", icon: Radar },
];

function AveroLogo() {
  return (
    <div className="w-7 h-7 shrink-0 rounded-lg bg-foreground dark:bg-foreground flex items-center justify-center">
      <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4" aria-label="Caliber logo">
        <path d="M6 16L10 4L14 16" stroke="hsl(var(--background))" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <line x1="7.5" y1="12" x2="12.5" y2="12" stroke="hsl(var(--background))" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </div>
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

  const clientId = project?.clientId;
  const { data: client } = useQuery<any>({
    queryKey: ["/api/clients", clientId],
    queryFn: () => apiRequest("GET", `/api/clients/${clientId}`).then(r => r.json()),
    enabled: !!clientId,
  });

  const modules: string[] = project?.engagementModules ? (typeof project.engagementModules === "string" ? JSON.parse(project.engagementModules) : project.engagementModules) : ["selection"];
  const hasModule = (m: string) => modules.includes(m);

  return (
    <Sidebar data-testid="sidebar-nav">
      <SidebarHeader className="px-4 py-4">
        <Link href="/" className="flex items-center gap-2 no-underline">
          <img src="/avero-logo.png" alt="Avero" className="h-6" />
          <span className="text-xs font-medium text-sidebar-foreground/50">|</span>
          <span className="text-sm font-semibold tracking-tight text-sidebar-foreground/90">Caliber</span>
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
            {client && (
              <div className="px-3 pb-1">
                <Link href={`/clients/${clientId}/profile`} className="text-xs font-semibold text-accent hover:underline truncate block">
                  {client.name}
                </Link>
              </div>
            )}
            <SidebarGroupLabel className="text-sidebar-foreground/50 text-[10px] uppercase tracking-widest font-semibold">Project</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {/* Client Profile - now links to client level */}
                {/* ── DISCOVERY ── */}
                <p className="text-[9px] font-semibold text-sidebar-foreground/40 uppercase tracking-widest px-2.5 pt-3 pb-1">Discovery</p>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === `/clients/${clientId}/profile`}>
                    <Link href={clientId ? `/clients/${clientId}/profile` : `/projects/${projectId}/client-profile`} data-testid="nav-client-profile">
                      <Building2 className="w-4 h-4" />
                      <span>Client Profile</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === `/projects/${projectId}/discovery`}>
                    <Link href={`/projects/${projectId}/discovery`} data-testid="nav-discovery">
                      <Compass className="w-4 h-4" />
                      <span>Discovery</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === `/projects/${projectId}/future-state`}>
                    <Link href={`/projects/${projectId}/future-state`} data-testid="nav-future-state">
                      <ArrowRightLeft className="w-4 h-4" />
                      <span>Future State</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                {/* ── SELECTION ── */}
                <p className="text-[9px] font-semibold text-sidebar-foreground/40 uppercase tracking-widest px-2.5 pt-3 pb-1">Selection</p>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === `/projects/${projectId}/outcomes`}>
                    <Link href={`/projects/${projectId}/outcomes`} data-testid="nav-outcomes">
                      <Target className="w-4 h-4" />
                      <span>Outcomes</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === `/projects/${projectId}`}>
                    <Link href={`/projects/${projectId}`} data-testid="nav-project-requirements">
                      <FolderOpen className="w-4 h-4" />
                      <span>Requirements</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === `/projects/${projectId}/evaluation`}>
                    <Link href={`/projects/${projectId}/evaluation`} data-testid="nav-vendor-evaluation">
                      <BarChart3 className="w-4 h-4" />
                      <span>Vendor Evaluation</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === `/projects/${projectId}/stakeholder-feedback`}>
                    <Link href={`/projects/${projectId}/stakeholder-feedback`} data-testid="nav-stakeholder-feedback">
                      <MessageSquare className="w-4 h-4" />
                      <span>Stakeholder Feedback</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === `/projects/${projectId}/scorecard`}>
                    <Link href={`/projects/${projectId}/scorecard`} data-testid="nav-scorecard">
                      <Trophy className="w-4 h-4" />
                      <span>Scorecard</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                {/* ── IMPLEMENTATION ── */}
                <p className="text-[9px] font-semibold text-sidebar-foreground/40 uppercase tracking-widest px-2.5 pt-3 pb-1">Implementation</p>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === `/projects/${projectId}/compliance`}>
                    <Link href={`/projects/${projectId}/compliance`} data-testid="nav-contract-compliance">
                      <Shield className="w-4 h-4" />
                      <span>Contract Compliance</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === `/projects/${projectId}/health-check`}>
                    <Link href={`/projects/${projectId}/health-check`} data-testid="nav-health-check">
                      <Stethoscope className="w-4 h-4" />
                      <span>Health Check</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === `/projects/${projectId}/go-live`}>
                    <Link href={`/projects/${projectId}/go-live`} data-testid="nav-go-live">
                      <Rocket className="w-4 h-4" />
                      <span>Go-Live Readiness</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="px-3 py-3 space-y-1">
        {(() => {
          const { data: me } = useQuery<any>({ queryKey: ["/auth/me"], queryFn: () => fetch("/auth/me").then(r => r.json()), retry: false, staleTime: 5 * 60 * 1000 });
          return me?.role === "admin" ? (
            <Link href="/admin">
              <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent">
                <Shield className="w-4 h-4" /><span>Admin</span>
              </Button>
            </Link>
          ) : null;
        })()}
        <Link href="/about">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          >
            <Info className="w-4 h-4" />
            <span>About</span>
          </Button>
        </Link>
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
