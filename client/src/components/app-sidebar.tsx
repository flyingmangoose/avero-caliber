import { LayoutDashboard, FolderOpen, BookTemplate, Sun, Moon } from "lucide-react";
import { Link, useLocation } from "wouter";
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
  { title: "Template Library", url: "/templates", icon: BookTemplate },
];

function AveroLogo() {
  return (
    <svg viewBox="0 0 32 32" fill="none" className="w-8 h-8 shrink-0" aria-label="Avero Advisors logo">
      <rect x="2" y="6" width="28" height="20" rx="3" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M10 22L16 10L22 22" stroke="hsl(40,60%,58%)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <line x1="12" y1="18" x2="20" y2="18" stroke="hsl(40,60%,58%)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function AppSidebar() {
  const [location] = useLocation();
  const { theme, toggleTheme } = useTheme();

  return (
    <Sidebar data-testid="sidebar-nav">
      <SidebarHeader className="px-4 py-4">
        <Link href="/" className="flex items-center gap-2.5 no-underline">
          <AveroLogo />
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">Avero Advisors</span>
            <span className="text-[11px] text-sidebar-foreground/60 font-medium">ERP Requirements Agent</span>
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
