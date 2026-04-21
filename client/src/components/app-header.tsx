import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { LogOut, Sparkles } from "lucide-react";

const routeLabels: Record<string, { eyebrow: string; title: string; description: string }> = {
  "/": { eyebrow: "Workspace", title: "Command Center", description: "See the current advisory book, key client programs, and active delivery momentum." },
  "/portfolio": { eyebrow: "Portfolio", title: "Delivery Portfolio", description: "Track cross-engagement performance, workload, and executive reporting." },
  "/templates": { eyebrow: "Assets", title: "Template Library", description: "Browse curated requirements and reusable delivery content." },
  "/knowledge-base": { eyebrow: "Knowledge", title: "Knowledge Base", description: "Reference methods, prior learnings, and reusable advisory guidance." },
  "/vendor-monitoring": { eyebrow: "Market", title: "Vendor Intelligence", description: "Monitor vendors, market shifts, and external signals that affect delivery." },
  "/about": { eyebrow: "System", title: "About Caliber", description: "Product context, platform details, and operating information." },
  "/admin": { eyebrow: "Admin", title: "Operations Console", description: "Manage access, configuration, and platform administration." },
};

export function AppHeader() {
  const [location] = useLocation();
  const { data: user } = useQuery({
    queryKey: ["/auth/me"],
    queryFn: () => fetch("/auth/me").then(r => r.json()),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const routeMeta = routeLabels[location] ?? (location.startsWith("/projects/")
    ? { eyebrow: "Project", title: "Engagement Workspace", description: "Work inside the active engagement across requirements, evaluation, and oversight." }
    : location.startsWith("/clients/")
      ? { eyebrow: "Client", title: "Client Profile", description: "Review the client context, profile data, and program background." }
      : { eyebrow: "Workspace", title: "Caliber", description: "Navigate the platform and manage advisory delivery work." });

  return (
    <header className="mb-3 flex min-h-[88px] items-center gap-3 rounded-[28px] border border-white/50 bg-white/60 px-4 py-3 shadow-xs backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/45 shrink-0">
      <SidebarTrigger
        className="h-10 w-10 rounded-2xl bg-white/70 text-foreground shadow-xs hover:bg-white dark:bg-slate-900/70 dark:hover:bg-slate-900"
        data-testid="button-sidebar-toggle"
      />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          {routeMeta.eyebrow}
        </p>
        <div className="flex items-center gap-2">
          <h1 className="truncate text-xl font-semibold text-foreground">{routeMeta.title}</h1>
          <span className="hidden items-center gap-1 rounded-full border border-amber-200/70 bg-amber-50/90 px-2 py-0.5 text-[11px] font-medium text-amber-900 sm:inline-flex dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
            <Sparkles className="h-3 w-3" />
            Live workspace
          </span>
        </div>
        <p className="hidden max-w-2xl truncate text-sm text-muted-foreground lg:block">
          {routeMeta.description}
        </p>
      </div>
      {user && (
        <div className="flex items-center gap-3 rounded-2xl border border-white/40 bg-white/70 px-3 py-2 shadow-xs dark:border-white/10 dark:bg-slate-900/70">
          {user.picture && (
            <img src={user.picture} alt="" className="h-9 w-9 rounded-2xl object-cover ring-2 ring-white/70 dark:ring-slate-800" referrerPolicy="no-referrer" />
          )}
          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">Signed in</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 rounded-2xl p-0 text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
            onClick={() => {
              fetch("/auth/logout", { method: "POST" }).then(() => window.location.reload());
            }}
            title="Sign out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
    </header>
  );
}
