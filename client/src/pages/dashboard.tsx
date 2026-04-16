import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Building2,
  Users,
  Globe,
  Loader2,
  FolderOpen,
  Briefcase,
  MapPin,
  DollarSign,
  BarChart3,
  Search,
  CircleCheck,
  Circle,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ProjectSummary {
  id: number;
  name: string;
  status: string;
  engagementModules: string; // JSON string
}

interface ClientWithProjects {
  id: number;
  name: string;
  domain: string | null;
  entityType: string | null;
  state: string | null;
  population: number | null;
  employeeCount: number | null;
  annualBudget: string | null;
  projects: ProjectSummary[];
  projectCount: number;
}

// ── Mini Status Stepper for project rows ──────────────────────────────────────

function MiniProgress({ projectId }: { projectId: number }) {
  const { toast } = useToast();
  const { data, refetch } = useQuery<{ stages: { key: string; label: string; completed: boolean; manualComplete: boolean; active: boolean; checklist: { label: string; done: boolean }[] }[] }>({
    queryKey: ["/api/projects", projectId, "status-info"],
    queryFn: () => apiRequest("GET", `/api/projects/${projectId}/status-info`).then(r => r.json()),
  });

  const toggleStage = async (key: string, complete: boolean) => {
    try {
      await apiRequest("PATCH", `/api/projects/${projectId}/stage-status`, { stage: key, complete });
      refetch();
    } catch (e: any) {
      toast({ title: "Failed to update", description: e.message, variant: "destructive" });
    }
  };

  if (!data?.stages) return null;
  return (
    <div className="flex items-center gap-2">
      {data.stages.map((s) => (
        <Badge
          key={s.key}
          variant="outline"
          className={`text-[10px] h-4 px-1.5 gap-1 font-normal cursor-pointer select-none transition-colors ${s.completed ? "border-green-400 text-green-600 bg-green-50 dark:bg-green-950/30 dark:text-green-400" : s.active ? "border-accent/50 text-accent" : "text-muted-foreground/50"}`}
          onClick={() => toggleStage(s.key, !s.completed)}
          title={`Click to mark ${s.completed ? "incomplete" : "complete"}`}
        >
          {s.completed ? <CircleCheck className="w-2.5 h-2.5" /> : s.active ? <Circle className="w-2.5 h-2.5 fill-accent/30" /> : <Circle className="w-2.5 h-2.5" />}
          {s.label}
        </Badge>
      ))}
    </div>
  );
}

// ── Constants ──────────────────────────────────────────────────────────────────

const ENTITY_TYPE_LABELS: Record<string, string> = {
  city: "City",
  county: "County",
  utility: "Utility",
  transit: "Transit",
  port: "Port",
  state_agency: "State Agency",
  special_district: "Special District",
};

// Left border color per entity type
const ENTITY_BORDER_COLOR: Record<string, string> = {
  city: "#3b82f6",
  county: "#22c55e",
  utility: "#14b8a6",
  transit: "#a855f7",
  port: "#f97316",
  state_agency: "#ef4444",
  special_district: "#6366f1",
};

// Entity type badge bg
const ENTITY_BADGE_CLASS: Record<string, string> = {
  city: "bg-blue-100 text-blue-700 border-blue-200",
  county: "bg-green-100 text-green-700 border-green-200",
  utility: "bg-teal-100 text-teal-700 border-teal-200",
  transit: "bg-purple-100 text-purple-700 border-purple-200",
  port: "bg-orange-100 text-orange-700 border-orange-200",
  state_agency: "bg-red-100 text-red-700 border-red-200",
  special_district: "bg-indigo-100 text-indigo-700 border-indigo-200",
};

const MODULE_BADGE_CLASS: Record<string, string> = {
  selection: "bg-blue-100 text-blue-700 border-blue-200",
  ivv: "bg-amber-100 text-amber-700 border-amber-200",
  health_check: "bg-rose-100 text-rose-700 border-rose-200",
};

const MODULE_LABELS: Record<string, string> = {
  selection: "Selection",
  ivv: "IV&V",
  health_check: "Health Check",
};

// ── Helper components ──────────────────────────────────────────────────────────

function EntityTypeBadge({ type }: { type: string | null }) {
  if (!type) return null;
  const label = ENTITY_TYPE_LABELS[type] ?? type;
  const cls = ENTITY_BADGE_CLASS[type] ?? "bg-gray-100 text-gray-700 border-gray-200";
  return (
    <Badge variant="outline" className={`text-xs font-semibold uppercase tracking-wide ${cls}`}>
      {label}
    </Badge>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "active"
      ? "bg-green-100 text-green-700 border-green-200"
      : "bg-gray-100 text-gray-600 border-gray-200";
  return (
    <Badge variant="outline" className={`text-xs font-semibold uppercase tracking-wide ${cls}`}>
      {status === "active" ? "Active" : status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

function ModuleBadges({ modulesJson }: { modulesJson: string }) {
  let mods: string[] = [];
  try {
    mods = JSON.parse(modulesJson ?? "[]");
  } catch {
    mods = [];
  }
  return (
    <span className="flex flex-wrap gap-1">
      {mods.map((m) => (
        <Badge
          key={m}
          variant="outline"
          className={`text-xs font-semibold uppercase tracking-wide ${MODULE_BADGE_CLASS[m] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}
        >
          {MODULE_LABELS[m] ?? m}
        </Badge>
      ))}
    </span>
  );
}

function formatNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString();
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  // Dialog state
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectClientId, setNewProjectClientId] = useState<number | null>(null);
  const [newProjectClientName, setNewProjectClientName] = useState("");

  // New client form
  const [clientName, setClientName] = useState("");
  const [clientDomain, setClientDomain] = useState("");

  // New project form
  const [projectName, setProjectName] = useState("");
  const [projectModules, setProjectModules] = useState<Record<string, boolean>>({
    selection: true,
    ivv: false,
    health_check: false,
  });

  // Expanded client set
  const [expandedClients, setExpandedClients] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  // ── Data fetching ──

  const { data: clients, isLoading } = useQuery<ClientWithProjects[]>({
    queryKey: ["/api/clients"],
  });

  // ── Mutations ──

  const createClientMutation = useMutation({
    mutationFn: async ({ enrich }: { enrich: boolean }) => {
      const res = await apiRequest("POST", "/api/clients", {
        name: clientName.trim(),
        domain: clientDomain.trim() || undefined,
      });
      const client = await res.json();
      if (enrich && clientDomain.trim()) {
        await apiRequest("POST", `/api/clients/${client.id}/enrich`, { domain: clientDomain.trim() });
      }
      return client;
    },
    onSuccess: (client) => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      toast({ title: "Client created", description: client.name });
      setNewClientOpen(false);
      setClientName("");
      setClientDomain("");
      // Auto-expand new client
      setExpandedClients((prev) => {
        const next = new Set(prev);
        next.add(client.id);
        return next;
      });
    },
    onError: (e: any) =>
      toast({ title: "Error creating client", description: e.message, variant: "destructive" }),
  });

  const deleteClientMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/clients/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      toast({ title: "Client deleted" });
    },
    onError: (e: any) =>
      toast({ title: "Error deleting client", description: e.message, variant: "destructive" }),
  });

  const createProjectMutation = useMutation({
    mutationFn: async () => {
      const mods = Object.entries(projectModules)
        .filter(([, v]) => v)
        .map(([k]) => k);
      const res = await apiRequest("POST", "/api/projects", {
        name: projectName.trim(),
        clientId: newProjectClientId,
        engagementModules: JSON.stringify(mods),
        status: "draft",
      });
      return res.json();
    },
    onSuccess: (project: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      toast({ title: "Project created", description: project.name });
      setNewProjectOpen(false);
      setProjectName("");
      setProjectModules({ selection: true, ivv: false, health_check: false });
      navigate(`/projects/${project.id}`);
    },
    onError: (e: any) =>
      toast({ title: "Error creating project", description: e.message, variant: "destructive" }),
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/projects/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      toast({ title: "Project deleted" });
    },
    onError: (e: any) =>
      toast({ title: "Error deleting project", description: e.message, variant: "destructive" }),
  });

  // ── Derived stats ──

  const totalClients = clients?.length ?? 0;
  const activeProjects =
    clients?.reduce(
      (sum, c) => sum + c.projects.filter((p) => p.status === "active").length,
      0
    ) ?? 0;
  const totalProjects = clients?.reduce((sum, c) => sum + c.projectCount, 0) ?? 0;
  const filteredClients = clients?.filter((client) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return client.name.toLowerCase().includes(q) ||
      client.state?.toLowerCase().includes(q) ||
      client.entityType?.toLowerCase().includes(q) ||
      client.projects.some(p => p.name.toLowerCase().includes(q));
  }) ?? [];

  // ── Helpers ──

  const toggleExpand = (id: number) => {
    setExpandedClients((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openNewProject = (clientId: number, clientName: string) => {
    setNewProjectClientId(clientId);
    setNewProjectClientName(clientName);
    setProjectName("");
    setProjectModules({ selection: true, ivv: false, health_check: false });
    setNewProjectOpen(true);
  };

  const openNewClient = () => {
    setClientName("");
    setClientDomain("");
    setNewClientOpen(true);
  };

  // ── Render ──

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8" data-testid="page-dashboard">
      <section className="hero-surface relative overflow-hidden rounded-[32px] px-6 py-7 text-white sm:px-8 sm:py-8">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute -right-12 top-0 h-40 w-40 rounded-full bg-white/20 blur-3xl" />
          <div className="absolute bottom-0 left-8 h-24 w-24 rounded-full bg-amber-200/30 blur-2xl" />
        </div>
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/70">
              Client Operations
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
              Modern program oversight,
              <span className="display-serif ml-2 text-amber-100">without the clutter.</span>
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-white/76 sm:text-base">
              Manage client engagements, launch new work quickly, and keep project health visible across selection, IV&V, and health check programs.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              onClick={openNewClient}
              className="min-w-[170px] gap-2 bg-white text-slate-950 hover:bg-white/90"
              data-testid="button-new-client"
            >
              <Plus className="w-4 h-4" />
              New Client
            </Button>
            <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white/75 backdrop-blur">
              Active delivery book across public-sector advisory work.
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(300px,1fr)]">
        <div className="glass-panel rounded-[28px] p-5 sm:p-6">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Portfolio Snapshot</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground">Clients and projects at a glance</h2>
              </div>
              <p className="text-sm text-muted-foreground">Use search to jump straight to a client, project, or entity type.</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[24px] border border-white/55 bg-white/80 p-4 shadow-xs dark:border-white/10 dark:bg-white/5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Clients</p>
                <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-foreground">{isLoading ? "—" : totalClients}</p>
                <p className="mt-1 text-sm text-muted-foreground">Organizations under active advisory support.</p>
              </div>
              <div className="rounded-[24px] border border-white/55 bg-white/80 p-4 shadow-xs dark:border-white/10 dark:bg-white/5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Active Projects</p>
                <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-foreground">{isLoading ? "—" : activeProjects}</p>
                <p className="mt-1 text-sm text-muted-foreground">Live engagements moving through delivery stages.</p>
              </div>
              <div className="rounded-[24px] border border-white/55 bg-white/80 p-4 shadow-xs dark:border-white/10 dark:bg-white/5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Total Projects</p>
                <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-foreground">{isLoading ? "—" : totalProjects}</p>
                <p className="mt-1 text-sm text-muted-foreground">Selection, IV&V, and health check workspaces.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="glass-panel rounded-[28px] p-5 sm:p-6">
          <div className="flex h-full flex-col gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Search</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground">Find work instantly</h2>
            </div>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-12 pl-11" placeholder="Search clients, projects, entities..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
            <div className="rounded-[24px] border border-dashed border-border/70 bg-background/40 p-4 text-sm text-muted-foreground">
              {searchQuery.trim()
                ? `${filteredClients.length} matching client${filteredClients.length === 1 ? "" : "s"}`
                : "Tip: search by client name, state, project title, or entity type."}
            </div>
          </div>
        </div>
      </section>

      {/* Client Cards */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36 w-full rounded-[28px]" />
          ))}
        </div>
      ) : clients && clients.length > 0 ? (
        <div className="space-y-4">
          {filteredClients.map((client) => {
            const isExpanded = expandedClients.has(client.id);
            const borderColor =
              ENTITY_BORDER_COLOR[client.entityType ?? ""] ?? "#1a2744";

            return (
              <Collapsible
                key={client.id}
                open={isExpanded}
                onOpenChange={() => toggleExpand(client.id)}
              >
                <Card
                  className="overflow-hidden rounded-[30px] border-white/50 bg-white/72 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-slate-950/40"
                  style={{
                    borderLeft: `4px solid ${borderColor}`,
                    boxShadow: `0 24px 60px -42px ${borderColor}`,
                  }}
                  data-testid={`card-client-${client.id}`}
                >
                  <CardContent className="p-0">
                    {/* Collapsed header — always visible */}
                    <CollapsibleTrigger asChild>
                      <button
                        className="w-full bg-gradient-to-r from-white/90 via-white/75 to-transparent px-5 py-5 text-left transition-colors hover:bg-white/75 dark:from-slate-950/40 dark:via-slate-950/20"
                        data-testid={`toggle-client-${client.id}`}
                      >
                        <div className="flex items-start gap-4">
                          <div
                            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] text-sm font-semibold text-white shadow-lg"
                            style={{ backgroundColor: borderColor }}
                          >
                            {getInitials(client.name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-lg font-semibold tracking-[-0.03em] text-foreground">
                                {client.name}
                              </span>
                              <EntityTypeBadge type={client.entityType} />
                              {client.state && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-background/70 px-2.5 py-1 text-xs text-muted-foreground">
                                  <MapPin className="w-3 h-3" />
                                  {client.state}
                                </span>
                              )}
                          </div>
                            <div className="mt-3 flex flex-wrap items-center gap-2.5 text-sm text-muted-foreground">
                              {client.population != null && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/50 px-3 py-1.5">
                                  <Users className="w-3.5 h-3.5" />
                                  Pop. {formatNumber(client.population)}
                                </span>
                              )}
                              {client.employeeCount != null && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/50 px-3 py-1.5">
                                  <Briefcase className="w-3.5 h-3.5" />
                                  {formatNumber(client.employeeCount)} employees
                                </span>
                              )}
                              {client.annualBudget && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/50 px-3 py-1.5">
                                  <DollarSign className="w-3.5 h-3.5" />
                                  {client.annualBudget}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="ml-auto flex shrink-0 items-center gap-3 pl-4">
                            <span className="hidden rounded-full bg-foreground/[0.04] px-3 py-1.5 text-xs font-medium text-muted-foreground sm:inline-flex">
                              {client.projectCount} project{client.projectCount !== 1 ? "s" : ""}
                            </span>
                            <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/60 bg-background/70 text-muted-foreground">
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </span>
                          </div>
                        </div>
                      </button>
                    </CollapsibleTrigger>

                    {/* Expanded content */}
                    <CollapsibleContent>
                      <div className="space-y-4 border-t border-border/50 bg-background/35 px-5 pb-5 pt-4 dark:bg-slate-950/20">
                        {/* Expanded header: domain link + action buttons */}
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-3 flex-wrap text-sm text-muted-foreground">
                            {client.domain && (
                              <a
                                href={`https://${client.domain}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 rounded-full border border-border/60 bg-background/70 px-3 py-1.5 hover:text-accent transition-colors"
                                data-testid={`link-domain-${client.id}`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Globe className="w-3.5 h-3.5" />
                                {client.domain}
                              </a>
                            )}
                            {client.population != null && (
                              <span>Pop. {formatNumber(client.population)}</span>
                            )}
                            {client.employeeCount != null && (
                              <span>{formatNumber(client.employeeCount)} employees</span>
                            )}
                            {client.annualBudget && <span>{client.annualBudget}</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/clients/${client.id}/profile`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-9 rounded-2xl px-4 text-xs"
                                data-testid={`button-view-profile-${client.id}`}
                              >
                                View Profile
                              </Button>
                            </Link>
                            <Button
                              size="sm"
                              className="h-9 rounded-2xl bg-accent text-xs text-accent-foreground hover:bg-accent/90 gap-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                openNewProject(client.id, client.name);
                              }}
                              data-testid={`button-add-project-${client.id}`}
                            >
                              <Plus className="w-3 h-3" />
                              Add Project
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-9 w-9 rounded-2xl p-0 text-muted-foreground hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (
                                  confirm(
                                    `Delete client "${client.name}" and all its projects?`
                                  )
                                ) {
                                  deleteClientMutation.mutate(client.id);
                                }
                              }}
                              data-testid={`button-delete-client-${client.id}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>

                        {/* Project list */}
                        {client.projects.length > 0 ? (
                          <div className="space-y-2">
                            {client.projects.map((project) => (
                              <div
                                key={project.id}
                                className="group flex items-center gap-3 rounded-[24px] border border-white/55 bg-white/80 px-4 py-3 shadow-xs transition-all hover:-translate-y-0.5 hover:bg-white dark:border-white/10 dark:bg-white/5"
                                data-testid={`row-project-${project.id}`}
                              >
                                <Link
                                  href={`/projects/${project.id}`}
                                  className="flex min-w-0 flex-1 items-center gap-3 no-underline"
                                  data-testid={`link-project-${project.id}`}
                                >
                                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary dark:bg-white/10 dark:text-white">
                                    <FolderOpen className="h-4 w-4" />
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <span className="block truncate text-base font-medium text-foreground transition-colors group-hover:text-accent">
                                      {project.name}
                                    </span>
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                      <MiniProgress projectId={project.id} />
                                      <ModuleBadges modulesJson={project.engagementModules} />
                                    </div>
                                  </div>
                                </Link>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-9 w-9 rounded-2xl p-0 opacity-0 text-muted-foreground transition-opacity hover:text-destructive group-hover:opacity-100"
                                  onClick={() => {
                                    if (
                                      confirm(
                                        `Delete project "${project.name}"?`
                                      )
                                    ) {
                                      deleteProjectMutation.mutate(project.id);
                                    }
                                  }}
                                  data-testid={`button-delete-project-${project.id}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-[24px] border border-dashed border-border/70 bg-background/45 py-8 text-center text-sm text-muted-foreground">
                            No projects yet.{" "}
                            <button
                              className="underline text-accent hover:text-accent/80"
                              onClick={() => openNewProject(client.id, client.name)}
                              data-testid={`button-first-project-${client.id}`}
                            >
                              Add the first project
                            </button>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </CardContent>
                </Card>
              </Collapsible>
            );
          })}
        </div>
      ) : (
        /* Onboarding empty state */
        <div className="glass-panel mx-auto max-w-2xl rounded-[32px] px-8 py-12 text-center space-y-8">
          <div>
            <div className="hero-surface mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[22px]">
              <svg viewBox="0 0 20 20" fill="none" className="w-8 h-8">
                <path d="M6 16L10 4L14 16" stroke="hsl(var(--background))" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                <line x1="7.5" y1="12" x2="12.5" y2="12" stroke="hsl(var(--background))" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>
            <h2 className="text-3xl font-semibold tracking-[-0.04em]">Welcome to Caliber</h2>
            <p className="text-base text-muted-foreground mt-2">Stand up your first advisory workspace in three steps.</p>
          </div>

          <div className="space-y-3 text-left">
            <div className="flex items-start gap-4 rounded-[24px] border bg-card/80 p-5">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">1</span>
              <div className="flex-1">
                <p className="text-sm font-medium">Create a client</p>
                <p className="text-sm text-muted-foreground mt-0.5">Add your government entity with their website domain for automatic enrichment.</p>
              </div>
            </div>
            <div className="flex items-start gap-4 rounded-[24px] border bg-card/80 p-5">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">2</span>
              <div className="flex-1">
                <p className="text-sm font-medium">Create a project</p>
                <p className="text-sm text-muted-foreground mt-0.5">Choose engagement modules — Selection, IV&V, Health Check — based on your scope.</p>
              </div>
            </div>
            <div className="flex items-start gap-4 rounded-[24px] border bg-card/80 p-5">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">3</span>
              <div className="flex-1">
                <p className="text-sm font-medium">Load requirements or upload documents</p>
                <p className="text-sm text-muted-foreground mt-0.5">Import requirements for vendor evaluation, or upload status reports for health check analysis.</p>
              </div>
            </div>
          </div>

          <Button
            onClick={openNewClient}
            className="gap-2"
            data-testid="button-empty-new-client"
          >
            <Plus className="w-4 h-4" />
            Create Your First Client
          </Button>
        </div>
      )}

      {/* ── New Client Dialog ── */}
      <Dialog open={newClientOpen} onOpenChange={setNewClientOpen}>
        <DialogContent className="max-w-md" data-testid="dialog-new-client">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-accent" />
              New Client
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="client-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="client-name"
                placeholder="e.g., City of Springfield"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                data-testid="input-client-name"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client-domain">
                Domain{" "}
                <span className="text-xs text-muted-foreground font-normal">
                  (optional, e.g. springfield-or.gov)
                </span>
              </Label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                <Input
                  id="client-domain"
                  placeholder="springfield-or.gov"
                  value={clientDomain}
                  onChange={(e) => setClientDomain(e.target.value)}
                  className="pl-9"
                  data-testid="input-client-domain"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              {clientDomain.trim() && (
                <Button
                  className="flex-1 bg-accent hover:bg-accent/90 text-accent-foreground gap-2"
                  disabled={!clientName.trim() || createClientMutation.isPending}
                  onClick={() => createClientMutation.mutate({ enrich: true })}
                  data-testid="button-create-enrich"
                >
                  {createClientMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Globe className="w-4 h-4" />
                  )}
                  Create &amp; Enrich
                </Button>
              )}
              <Button
                variant={clientDomain.trim() ? "outline" : "default"}
                className={
                  clientDomain.trim()
                    ? "flex-1"
                    : "flex-1 bg-accent hover:bg-accent/90 text-accent-foreground"
                }
                disabled={!clientName.trim() || createClientMutation.isPending}
                onClick={() => createClientMutation.mutate({ enrich: false })}
                data-testid="button-create-client"
              >
                {createClientMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── New Project Dialog ── */}
      <Dialog open={newProjectOpen} onOpenChange={setNewProjectOpen}>
        <DialogContent className="max-w-md" data-testid="dialog-new-project">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-accent" />
              New Project
              {newProjectClientName && (
                <span className="text-sm font-normal text-muted-foreground">
                  — {newProjectClientName}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="project-name">
                Project Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="project-name"
                placeholder="e.g., ERP Selection 2025"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                data-testid="input-project-name"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Engagement Modules</Label>
              <div className="space-y-2">
                {(
                  [
                    {
                      key: "selection",
                      label: "Selection",
                      desc: "Requirements & vendor evaluation",
                    },
                    {
                      key: "ivv",
                      label: "IV&V",
                      desc: "Independent verification & validation",
                    },
                    {
                      key: "health_check",
                      label: "Health Check",
                      desc: "RAID log, budget & schedule review",
                    },
                  ] as const
                ).map((mod) => (
                  <label
                    key={mod.key}
                    className="flex cursor-pointer items-start gap-2.5 rounded-[20px] border p-3 hover:bg-muted/50 transition-colors"
                    style={
                      projectModules[mod.key]
                        ? {
                            borderColor: "#d4a853",
                            backgroundColor: "rgba(212,168,83,0.05)",
                          }
                        : {}
                    }
                    data-testid={`label-module-${mod.key}`}
                  >
                    <Checkbox
                      id={`mod-${mod.key}`}
                      checked={projectModules[mod.key]}
                      onCheckedChange={(checked) =>
                        setProjectModules((prev) => ({
                          ...prev,
                          [mod.key]: !!checked,
                        }))
                      }
                      className="mt-0.5"
                      data-testid={`checkbox-module-${mod.key}`}
                    />
                    <div>
                      <span className="text-sm font-medium">{mod.label}</span>
                      <p className="text-sm text-muted-foreground">{mod.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <Button
              className="w-full bg-accent hover:bg-accent/90 text-accent-foreground gap-2"
              disabled={!projectName.trim() || createProjectMutation.isPending}
              onClick={() => createProjectMutation.mutate()}
              data-testid="button-submit-project"
            >
              {createProjectMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Create Project
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
