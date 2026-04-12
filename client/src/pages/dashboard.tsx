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
      setExpandedClients((prev) => new Set([...prev, client.id]));
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
    <div className="p-4 sm:p-8 max-w-5xl mx-auto space-y-6 sm:space-y-8" data-testid="page-dashboard">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Clients & Projects
          </h1>
          <p className="text-base text-muted-foreground mt-1">
            Manage your client engagements
          </p>
        </div>
        <Button
          onClick={openNewClient}
          className="gap-2 bg-accent hover:bg-accent/90 text-accent-foreground shadow-sm"
          data-testid="button-new-client"
        >
          <Plus className="w-4 h-4" />
          New Client
        </Button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="px-5 py-4 rounded-lg bg-muted/50">
          <p className="text-sm text-muted-foreground mb-1">Clients</p>
          <p className="text-2xl font-semibold tracking-tight">{isLoading ? "—" : totalClients}</p>
        </div>
        <div className="px-5 py-4 rounded-lg bg-muted/50">
          <p className="text-sm text-muted-foreground mb-1">Active Projects</p>
          <p className="text-2xl font-semibold tracking-tight">{isLoading ? "—" : activeProjects}</p>
        </div>
        <div className="px-5 py-4 rounded-lg bg-muted/50">
          <p className="text-sm text-muted-foreground mb-1">Total Projects</p>
          <p className="text-2xl font-semibold tracking-tight">{isLoading ? "—" : totalProjects}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9 h-10 text-sm" placeholder="Search clients or projects..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
      </div>

      {/* Client Cards */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : clients && clients.length > 0 ? (
        <div className="space-y-3">
          {clients.filter((client) => {
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase();
            return client.name.toLowerCase().includes(q) ||
              client.state?.toLowerCase().includes(q) ||
              client.entityType?.toLowerCase().includes(q) ||
              client.projects.some(p => p.name.toLowerCase().includes(q));
          }).map((client) => {
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
                  className="overflow-hidden transition-shadow hover:shadow-md"
                  style={{ borderLeft: `4px solid ${borderColor}` }}
                  data-testid={`card-client-${client.id}`}
                >
                  <CardContent className="p-0">
                    {/* Collapsed header — always visible */}
                    <CollapsibleTrigger asChild>
                      <button
                        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors"
                        data-testid={`toggle-client-${client.id}`}
                      >
                        {/* Chevron */}
                        <span className="shrink-0 text-muted-foreground">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </span>

                        {/* Client name + badges */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-base text-foreground truncate">
                              {client.name}
                            </span>
                            <EntityTypeBadge type={client.entityType} />
                            {client.state && (
                              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                                <MapPin className="w-3 h-3" />
                                {client.state}
                              </span>
                            )}
                          </div>
                          {/* Metadata row */}
                          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
                            {client.population != null && (
                              <span className="flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                Pop. {formatNumber(client.population)}
                              </span>
                            )}
                            {client.employeeCount != null && (
                              <span className="flex items-center gap-1">
                                <Briefcase className="w-3 h-3" />
                                {formatNumber(client.employeeCount)} employees
                              </span>
                            )}
                            {client.annualBudget && (
                              <span className="flex items-center gap-1">
                                <DollarSign className="w-3 h-3" />
                                {client.annualBudget}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Project count pill */}
                        <span className="shrink-0 text-xs text-muted-foreground font-medium bg-muted px-2 py-0.5 rounded-full">
                          {client.projectCount} project{client.projectCount !== 1 ? "s" : ""}
                        </span>
                      </button>
                    </CollapsibleTrigger>

                    {/* Expanded content */}
                    <CollapsibleContent>
                      <div className="px-4 pb-4 pt-1 border-t border-border/50 space-y-3">
                        {/* Expanded header: domain link + action buttons */}
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-3 flex-wrap text-sm text-muted-foreground">
                            {client.domain && (
                              <a
                                href={`https://${client.domain}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 hover:text-accent transition-colors"
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
                                className="h-7 text-xs"
                                data-testid={`button-view-profile-${client.id}`}
                              >
                                View Profile
                              </Button>
                            </Link>
                            <Button
                              size="sm"
                              className="h-7 text-xs bg-accent hover:bg-accent/90 text-accent-foreground gap-1"
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
                              className="h-7 text-xs text-muted-foreground hover:text-destructive"
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
                          <div className="space-y-1.5">
                            {client.projects.map((project) => (
                              <div
                                key={project.id}
                                className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/40 hover:bg-muted/70 transition-colors group"
                                data-testid={`row-project-${project.id}`}
                              >
                                <Link
                                  href={`/projects/${project.id}`}
                                  className="flex-1 min-w-0 flex items-center gap-2 no-underline"
                                  data-testid={`link-project-${project.id}`}
                                >
                                  <span className="text-base font-medium truncate text-foreground group-hover:text-accent transition-colors">
                                    {project.name}
                                  </span>
                                  <StatusBadge status={project.status} />
                                  <ModuleBadges modulesJson={project.engagementModules} />
                                </Link>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
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
                          <div className="text-center py-4 text-sm text-muted-foreground">
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
        <div className="max-w-lg mx-auto py-12 text-center space-y-8">
          <div>
            <div className="w-14 h-14 rounded-2xl bg-foreground mx-auto mb-4 flex items-center justify-center">
              <svg viewBox="0 0 20 20" fill="none" className="w-8 h-8">
                <path d="M6 16L10 4L14 16" stroke="hsl(var(--background))" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                <line x1="7.5" y1="12" x2="12.5" y2="12" stroke="hsl(var(--background))" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold">Welcome to Caliber</h2>
            <p className="text-base text-muted-foreground mt-1">Get started in three steps</p>
          </div>

          <div className="space-y-3 text-left">
            <div className="flex items-start gap-4 p-4 rounded-lg border bg-card">
              <span className="w-6 h-6 rounded-full bg-foreground text-background flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</span>
              <div className="flex-1">
                <p className="text-sm font-medium">Create a client</p>
                <p className="text-sm text-muted-foreground mt-0.5">Add your government entity with their website domain for automatic enrichment.</p>
              </div>
            </div>
            <div className="flex items-start gap-4 p-4 rounded-lg border bg-card">
              <span className="w-6 h-6 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</span>
              <div className="flex-1">
                <p className="text-sm font-medium">Create a project</p>
                <p className="text-sm text-muted-foreground mt-0.5">Choose engagement modules — Selection, IV&V, Health Check — based on your scope.</p>
              </div>
            </div>
            <div className="flex items-start gap-4 p-4 rounded-lg border bg-card">
              <span className="w-6 h-6 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">3</span>
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
                    className="flex items-start gap-2.5 cursor-pointer border rounded-lg p-2.5 hover:bg-muted/50 transition-colors"
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
