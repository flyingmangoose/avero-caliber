import { LayoutDashboard, FolderOpen, BookTemplate, Sun, Moon, BarChart3, PieChart, MessageSquare, Shield, Rocket, Stethoscope, BookOpen, Compass, ArrowRightLeft, Building2, Radar, Info, Target, Trophy, LogOut, TrendingUp, ArrowUpRight, Sparkles } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useTheme } from "@/lib/theme";
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
  { title: "Executive", url: "/executive", icon: TrendingUp },
  { title: "Template Library", url: "/templates", icon: BookTemplate },
  { title: "Knowledge Base", url: "/knowledge-base", icon: BookOpen },
  { title: "Vendor Intelligence", url: "/vendor-monitoring", icon: Radar },
];

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
  const moduleCount = modules.length;

  return (
    <Sidebar variant="floating" data-testid="sidebar-nav">
      <SidebarHeader className="px-4 pb-3 pt-4">
        <Link href="/" className="rounded-[28px] border border-white/10 bg-white/5 p-3.5 no-underline transition-colors hover:bg-white/10">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 via-amber-400 to-orange-500 shadow-lg shadow-amber-950/20">
              <img src="/avero-logo.png" alt="Avero" className="h-5 brightness-[0.12]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold tracking-tight text-sidebar-foreground">Caliber</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-sidebar-foreground/80">
                  <Sparkles className="h-2.5 w-2.5" />
                  AI
                </span>
              </div>
              <p className="text-[11px] text-sidebar-foreground/55">by Avero Advisors</p>
            </div>
          </div>
          <div className="mt-3 rounded-2xl border border-white/8 bg-black/10 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/55">
              Delivery workspace
            </p>
            <p className="mt-1 text-xs leading-5 text-sidebar-foreground/72">
              Selection, IV&amp;V, health checks, and executive reporting in one operating surface.
            </p>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="px-3">
          <SidebarGroupLabel className="px-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-sidebar-foreground/45">Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = item.url === "/" ? location === "/" : location.startsWith(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link href={item.url} className="rounded-2xl px-3 py-2.5" data-testid={`nav-${item.title.toLowerCase().replace(/\s/g, '-')}`}>
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
          <SidebarGroup className="px-3">
            {projectId && client && (
              <div className="mx-1 mb-2 rounded-2xl border border-white/10 bg-white/5 p-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-sidebar-foreground/45">Active Client</p>
                <Link href={`/clients/${clientId}/profile`} className="mt-1 flex items-center gap-2 truncate text-sm font-semibold text-white transition-colors hover:text-amber-200">
                  <span className="truncate">{client.name}</span>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
                </Link>
                <p className="mt-1 text-xs text-sidebar-foreground/60">
                  {moduleCount} active module{moduleCount === 1 ? "" : "s"} in this engagement.
                </p>
              </div>
            )}
            {!projectId && (
              <div className="mx-1 mb-2 rounded-2xl border border-dashed border-white/10 bg-white/5 px-3 py-3">
                <p className="text-xs text-sidebar-foreground/65 text-center">Select or create a project to unlock the delivery workspace.</p>
              </div>
            )}
            <SidebarGroupLabel className="px-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-sidebar-foreground/45">Project</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className={projectId ? "" : "opacity-40 pointer-events-none"}>
                {/* ── DISCOVERY ── always visible */}
                <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/35">Discovery</p>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === `/clients/${clientId}/profile`}>
                    <Link href={`/projects/${projectId}/client-profile`} className="rounded-2xl px-3 py-2.5" data-testid="nav-client-profile">
                      <Building2 className="w-4 h-4" />
                      <span>Client Profile</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === `/projects/${projectId}/discovery`}>
                    <Link href={`/projects/${projectId}/discovery`} className="rounded-2xl px-3 py-2.5" data-testid="nav-discovery">
                      <Compass className="w-4 h-4" />
                      <span>Discovery</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === `/projects/${projectId}/future-state`}>
                    <Link href={`/projects/${projectId}/future-state`} className="rounded-2xl px-3 py-2.5" data-testid="nav-future-state">
                      <ArrowRightLeft className="w-4 h-4" />
                      <span>Future State</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                {/* ── SELECTION ── dimmed if not in modules */}
                <div className={hasModule("selection") ? "" : "opacity-40"}>
                  <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/35">Selection</p>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location === `/projects/${projectId}/outcomes`}>
                      <Link href={`/projects/${projectId}/outcomes`} className="rounded-2xl px-3 py-2.5" data-testid="nav-outcomes">
                        <Target className="w-4 h-4" />
                        <span>Outcomes</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location === `/projects/${projectId}`}>
                      <Link href={`/projects/${projectId}`} className="rounded-2xl px-3 py-2.5" data-testid="nav-project-requirements">
                        <FolderOpen className="w-4 h-4" />
                        <span>Requirements</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location === `/projects/${projectId}/evaluation`}>
                      <Link href={`/projects/${projectId}/evaluation`} className="rounded-2xl px-3 py-2.5" data-testid="nav-vendor-evaluation">
                        <BarChart3 className="w-4 h-4" />
                        <span>Vendor Evaluation</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location === `/projects/${projectId}/stakeholder-feedback`}>
                      <Link href={`/projects/${projectId}/stakeholder-feedback`} className="rounded-2xl px-3 py-2.5" data-testid="nav-stakeholder-feedback">
                        <MessageSquare className="w-4 h-4" />
                        <span>Stakeholder Feedback</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location === `/projects/${projectId}/scorecard`}>
                      <Link href={`/projects/${projectId}/scorecard`} className="rounded-2xl px-3 py-2.5" data-testid="nav-scorecard">
                        <Trophy className="w-4 h-4" />
                        <span>Scorecard</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </div>

                {/* ── IMPLEMENTATION ── always visible for health_check/ivv */}
                <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/35">Implementation</p>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === `/projects/${projectId}/compliance`}>
                    <Link href={`/projects/${projectId}/compliance`} className="rounded-2xl px-3 py-2.5" data-testid="nav-contract-compliance">
                      <Shield className="w-4 h-4" />
                      <span>Contract Compliance</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === `/projects/${projectId}/health-check`}>
                    <Link href={`/projects/${projectId}/health-check`} className="rounded-2xl px-3 py-2.5" data-testid="nav-health-check">
                      <Stethoscope className="w-4 h-4" />
                      <span>Health Check</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === `/projects/${projectId}/go-live`}>
                    <Link href={`/projects/${projectId}/go-live`} className="rounded-2xl px-3 py-2.5" data-testid="nav-go-live">
                      <Rocket className="w-4 h-4" />
                      <span>Go-Live Readiness</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border/80 px-4 py-3">
        {(() => {
          // eslint-disable-next-line react-hooks/rules-of-hooks
          const { data: me } = useQuery<any>({ queryKey: ["/auth/me"], queryFn: () => fetch("/auth/me").then(r => r.json()), retry: false, staleTime: 5 * 60 * 1000 });
          return (
            <div className="space-y-3">
              {me?.name && (
                <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
                  {me.picture && <img src={me.picture} alt="" className="h-9 w-9 rounded-2xl object-cover" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-sidebar-foreground truncate">{me.name}</p>
                    <p className="text-[11px] text-sidebar-foreground/50 truncate">{me.email}</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                {me?.role === "admin" && (
                  <Link href="/admin">
                    <Button variant="ghost" size="sm" className="h-9 w-9 rounded-2xl p-0 text-sidebar-foreground/50 hover:bg-white/10 hover:text-sidebar-foreground" title="Admin">
                      <Shield className="w-3.5 h-3.5" />
                    </Button>
                  </Link>
                )}
                <Link href="/about">
                  <Button variant="ghost" size="sm" className="h-9 w-9 rounded-2xl p-0 text-sidebar-foreground/50 hover:bg-white/10 hover:text-sidebar-foreground" title="About">
                    <Info className="w-3.5 h-3.5" />
                  </Button>
                </Link>
                <Button variant="ghost" size="sm" onClick={toggleTheme} className="h-9 w-9 rounded-2xl p-0 text-sidebar-foreground/50 hover:bg-white/10 hover:text-sidebar-foreground" data-testid="button-theme-toggle" title={theme === "dark" ? "Light mode" : "Dark mode"}>
                  {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                </Button>
                {me?.id && (
                  <Button variant="ghost" size="sm" className="h-9 w-9 rounded-2xl p-0 text-sidebar-foreground/50 hover:bg-white/10 hover:text-sidebar-foreground" title="Log out"
                    onClick={() => { fetch("/auth/logout", { method: "POST" }).then(() => window.location.href = "/"); }}>
                    <LogOut className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>
          );
        })()}
      </SidebarFooter>
    </Sidebar>
  );
}
