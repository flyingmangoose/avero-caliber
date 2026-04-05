import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Project } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Plus,
  FileText,
  BarChart3,
  Layers,
  AlertTriangle,
  Trash2,
  FolderOpen,
  ArrowRight,
  Sparkles,
  Loader2,
  Save,
  ArrowLeft,
  Building2,
  Info,
  Upload,
  CheckCircle2,
  X,
  Calendar,
  DollarSign,
  Target,
  ClipboardList,
} from "lucide-react";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

interface ProjectWithStats extends Project {
  stats: {
    totalRequirements: number;
    criticalCount: number;
    desiredCount: number;
    moduleCoverage: number;
    responseStats: Record<string, number>;
  };
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  requirements_review: "Requirements Review",
  stakeholder_workshop: "Stakeholder Workshop",
  vendor_evaluation: "Vendor Evaluation",
  final_report: "Final Report",
  complete: "Complete",
  active: "Active",
  finalized: "Finalized",
};

const ENTITY_TYPES = [
  { value: "city", label: "City" },
  { value: "county", label: "County" },
  { value: "utility", label: "Utility District" },
  { value: "transit", label: "Transit Authority" },
  { value: "port", label: "Port Authority" },
  { value: "state_agency", label: "State Agency" },
  { value: "special_district", label: "Special District" },
];

function statusBadge(status: string) {
  const map: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800/30 dark:text-gray-400 dark:border-gray-700/30",
    requirements_review: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700/30",
    stakeholder_workshop: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-[#d4a853] dark:border-amber-700/30",
    vendor_evaluation: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-700/30",
    final_report: "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-700/30",
    complete: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700/30",
    active: "bg-primary/10 text-primary dark:bg-accent/20 dark:text-accent",
    finalized: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  };
  const label = STATUS_LABELS[status] || status;
  return (
    <Badge variant="outline" className={`text-[10px] font-semibold uppercase tracking-wide ${map[status] || "bg-muted text-muted-foreground"}`} data-testid={`badge-status-${status}`}>
      {label}
    </Badge>
  );
}

export default function Dashboard() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: projects, isLoading } = useQuery<ProjectWithStats[]>({
    queryKey: ["/api/projects"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/projects/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Project deleted" });
    },
  });

  const totalReqs = projects?.reduce((s, p) => s + p.stats.totalRequirements, 0) ?? 0;
  const totalCritical = projects?.reduce((s, p) => s + p.stats.criticalCount, 0) ?? 0;
  const totalModules = projects?.reduce((s, p) => s + p.stats.moduleCoverage, 0) ?? 0;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6" data-testid="page-dashboard">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage ERP requirements across client engagements</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); }}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-project" className="gap-1.5">
              <Plus className="w-4 h-4" />New Project
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
            <CreateProjectFlow onClose={() => setDialogOpen(false)} onCreated={(id) => {
              setDialogOpen(false);
              queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
              setLocation(`/projects/${id}/discovery`);
            }} />
          </DialogContent>
        </Dialog>
      </div>

      {/* Aggregate Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 dark:bg-accent/15">
              <FileText className="w-5 h-5 text-primary dark:text-accent" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalReqs}</p>
              <p className="text-xs text-muted-foreground">Total Requirements</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-50 dark:bg-red-900/15">
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalReqs > 0 ? Math.round((totalCritical / totalReqs) * 100) : 0}%</p>
              <p className="text-xs text-muted-foreground">Critical Requirements</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/15">
              <Layers className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalModules}</p>
              <p className="text-xs text-muted-foreground">Modules Covered</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Portfolio Link */}
      {projects && projects.length >= 2 && (
        <Link href="/portfolio" className="inline-flex items-center gap-1.5 text-xs font-medium text-primary dark:text-accent hover:underline no-underline" data-testid="link-portfolio-insights">
          View Portfolio Insights
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      )}

      {/* Project List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
        </div>
      ) : projects && projects.length > 0 ? (
        <div className="space-y-3">
          {projects.map((project) => (
            <Card key={project.id} className="hover:shadow-md transition-shadow" data-testid={`card-project-${project.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <Link href={`/projects/${project.id}`} className="flex-1 min-w-0 no-underline group">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold truncate group-hover:text-primary dark:group-hover:text-accent transition-colors">
                        {project.name}
                      </h3>
                      {statusBadge(project.status)}
                      {(project as any).engagementMode === "self_service" ? (
                        <Badge className="text-[9px] px-1.5 py-0 bg-[#d4a853]/20 text-[#d4a853] border-[#d4a853]/30" data-testid={`badge-mode-${project.id}`}>Self-Service</Badge>
                      ) : (
                        <Badge className="text-[9px] px-1.5 py-0 bg-muted text-muted-foreground" data-testid={`badge-mode-${project.id}`}>Consulting</Badge>
                      )}
                    </div>
                    {project.description && (
                      <p className="text-xs text-muted-foreground truncate mb-3">{project.description}</p>
                    )}
                    <div className="flex items-center gap-5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><FileText className="w-3.5 h-3.5" />{project.stats.totalRequirements} requirements</span>
                      <span className="flex items-center gap-1"><BarChart3 className="w-3.5 h-3.5" />{project.stats.criticalCount} critical</span>
                      <span className="flex items-center gap-1"><Layers className="w-3.5 h-3.5" />{project.stats.moduleCoverage} modules</span>
                    </div>
                  </Link>
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive shrink-0 ml-2"
                    onClick={() => { if (confirm("Delete this project and all its requirements?")) deleteMutation.mutate(project.id); }}
                    data-testid={`button-delete-project-${project.id}`}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-12 text-center">
            <FolderOpen className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
            <h3 className="text-sm font-semibold mb-1">No projects yet</h3>
            <p className="text-xs text-muted-foreground mb-4">Create your first project to start defining ERP requirements.</p>
            <Button onClick={() => setDialogOpen(true)} variant="outline" size="sm" className="gap-1.5">
              <Plus className="w-3.5 h-3.5" />Create Project
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ==================== Multi-Step Create Project Flow ==================== */

function CreateProjectFlow({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const { toast } = useToast();
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1 fields
  const [entityName, setEntityName] = useState("");
  const [entityType, setEntityType] = useState("city");
  const [state, setState] = useState("");
  const [engagementMode, setEngagementMode] = useState("consulting");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  // Step 2 fields — populated by research/extract or manual
  const [profile, setProfile] = useState<any>(null);
  const [docData, setDocData] = useState<any>(null);
  const [population, setPopulation] = useState("");
  const [employeeCount, setEmployeeCount] = useState("");
  const [annualBudget, setAnnualBudget] = useState("");
  const [departments, setDepartments] = useState<{ name: string; headcount: string }[]>([]);
  const [systems, setSystems] = useState<{ name: string; module: string; vendor: string; yearsInUse: string }[]>([]);
  const [modules, setModules] = useState<Record<string, boolean>>({ selection: true, ivv: false, health_check: false });
  const [description, setDescription] = useState("");

  // Helper: apply extracted/researched data to form, merging with user input (user input wins)
  const applyData = (d: any, isDocument: boolean) => {
    if (!entityName && d.entityName) setEntityName(d.entityName);
    if (!state && d.state) setState(d.state);
    if (d.entityType) setEntityType(d.entityType);
    if (!population && d.population) setPopulation(d.population.toString());
    if (!employeeCount && d.employeeCount) setEmployeeCount(d.employeeCount.toString());
    if (!annualBudget && d.annualBudget) setAnnualBudget(d.annualBudget);
    if (d.departments?.length && departments.length === 0) {
      setDepartments(d.departments.map((dep: any) => ({ name: dep.name, headcount: dep.headcount?.toString() || "" })));
    }
    if (d.currentSystems?.length && systems.length === 0) {
      setSystems(d.currentSystems.map((s: any) => ({ name: s.name || "", module: s.module || "", vendor: s.vendor || "", yearsInUse: s.yearsInUse?.toString() || "" })));
    }
    if (!description) {
      setDescription(isDocument && d.projectDescription ? d.projectDescription : d.keyFacts || "");
    }
    setProfile((prev: any) => ({
      ...prev,
      keyFacts: d.keyFacts || prev?.keyFacts || null,
      challenges: d.challenges || prev?.challenges || null,
    }));
    if (isDocument) setDocData(d);
  };

  const extractMutation = useMutation({
    mutationFn: async () => {
      if (!uploadedFile) throw new Error("No file selected");
      const formData = new FormData();
      formData.append("file", uploadedFile);
      const res = await fetch(`${API_BASE}/api/extract-document`, { method: "POST", body: formData });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Extraction failed"); }
      return res.json();
    },
    onSuccess: async (result: any) => {
      const d = result.data;
      applyData(d, true);
      // Also call research for gaps
      const eName = d.entityName || entityName;
      const eType = d.entityType || entityType;
      const eState = d.state || state;
      if (eName) {
        try {
          const res = await apiRequest("POST", "/api/research-entity", { entityName: eName, entityType: eType, state: eState || undefined });
          const r = await res.json();
          if (r.data) applyData(r.data, false);
        } catch {} // research is supplemental, don't fail
      }
      setStep(2);
    },
    onError: (e: any) => toast({ title: "Extraction failed", description: e.message, variant: "destructive" }),
  });

  const researchMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/research-entity", { entityName, entityType, state: state || undefined }).then(r => r.json()),
    onSuccess: (result: any) => {
      applyData(result.data, false);
      setStep(2);
    },
    onError: (e: any) => toast({ title: "Research failed", description: e.message, variant: "destructive" }),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const mods = Object.entries(modules).filter(([, v]) => v).map(([k]) => k);
      const projRes = await apiRequest("POST", "/api/projects", {
        name: entityName || "New Project",
        description,
        status: "draft",
        engagementModules: JSON.stringify(mods),
        engagementMode,
      });
      const project = await projRes.json();
      await apiRequest("POST", `/api/projects/${project.id}/org-profile`, {
        entityType, entityName, state,
        population: population ? parseInt(population) : null,
        employeeCount: employeeCount ? parseInt(employeeCount) : null,
        annualBudget,
        painSummary: profile?.challenges || docData?.challenges || "",
        currentSystems: JSON.stringify(systems),
        departments: JSON.stringify(departments),
      });
      return project;
    },
    onSuccess: (project: any) => {
      toast({ title: "Project created", description: `${entityName} is ready for discovery.` });
      onCreated(project.id);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const skipToManual = () => { setProfile(null); setDocData(null); setDepartments([]); setSystems([]); setStep(2); };

  const addDept = () => setDepartments(p => [...p, { name: "", headcount: "" }]);
  const removeDept = (i: number) => setDepartments(p => p.filter((_, idx) => idx !== i));
  const updateDept = (i: number, field: string, value: string) =>
    setDepartments(p => p.map((d, idx) => idx === i ? { ...d, [field]: value } : d));
  const addSystem = () => setSystems(p => [...p, { name: "", module: "", vendor: "", yearsInUse: "" }]);
  const removeSystem = (i: number) => setSystems(p => p.filter((_, idx) => idx !== i));
  const updateSystem = (i: number, field: string, value: string) =>
    setSystems(p => p.map((s, idx) => idx === i ? { ...s, [field]: value } : s));

  const isExtracting = extractMutation.isPending;
  const isResearching = researchMutation.isPending;
  const isBusy = isExtracting || isResearching;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setUploadedFile(f);
  };

  const handleProceed = () => {
    if (uploadedFile) extractMutation.mutate();
    else if (entityName.trim()) researchMutation.mutate();
  };

  if (step === 1) {
    return (
      <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[#d4a853]" />New Engagement
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-4 pt-2 pb-2">
            {/* Document upload zone */}
            <div>
              <label className="text-sm font-medium mb-1.5 block flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-muted-foreground" />Upload Project Documents
              </label>
              <label className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-5 cursor-pointer transition-colors hover:border-[#d4a853]/50 hover:bg-[#d4a853]/5"
                data-testid="dropzone-upload">
                <input type="file" className="hidden" accept=".pdf,.docx" onChange={handleFileChange} data-testid="input-file-upload" />
                <Upload className="w-8 h-8 text-muted-foreground/40 mb-2" />
                <p className="text-xs font-medium text-muted-foreground">Drop RFP, SOW, or project docs here or click to browse</p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">PDF, DOCX supported. Max 50MB.</p>
              </label>
              {uploadedFile && (
                <div className="flex items-center gap-2 mt-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-md">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="text-xs text-emerald-700 dark:text-emerald-400 flex-1 truncate">{uploadedFile.name}</span>
                  <span className="text-[10px] text-emerald-600/60">{(uploadedFile.size / 1024).toFixed(0)} KB</span>
                  <button className="text-muted-foreground hover:text-red-500 p-0.5" onClick={() => setUploadedFile(null)} data-testid="btn-remove-file">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 border-t border-border/50" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">or enter details manually</span>
              <div className="flex-1 border-t border-border/50" />
            </div>

            {/* Manual fields */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Client / Entity Name</label>
              <Input placeholder="e.g., City of Portland, Multnomah County" value={entityName} className="text-base h-11"
                onChange={e => setEntityName(e.target.value)} data-testid="input-entity-name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Entity Type</label>
                <Select value={entityType} onValueChange={setEntityType}>
                  <SelectTrigger className="h-9" data-testid="select-entity-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ENTITY_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">State</label>
                <Input placeholder="e.g., Oregon" value={state} onChange={e => setState(e.target.value)} data-testid="input-state" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Engagement Mode</label>
              <div className="flex gap-4">
                {([
                  { value: "consulting", label: "Consulting", desc: "Consultant-led process" },
                  { value: "self_service", label: "Self-Service", desc: "Client uses AI directly" },
                ] as const).map(mode => (
                  <label key={mode.value} className="flex items-start gap-2 cursor-pointer flex-1 border rounded-lg p-3 transition-colors hover:bg-muted/50"
                    style={engagementMode === mode.value ? { borderColor: "#d4a853", backgroundColor: "rgba(212,168,83,0.05)" } : {}}>
                    <input type="radio" name="engagementMode" className="mt-0.5 accent-[#d4a853]"
                      checked={engagementMode === mode.value} onChange={() => setEngagementMode(mode.value)}
                      data-testid={`mode-${mode.value}`} />
                    <div>
                      <span className="text-sm font-medium">{mode.label}</span>
                      <p className="text-[10px] text-muted-foreground">{mode.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>
        <div className="pt-3 border-t border-border/50 shrink-0 space-y-2">
          <Button className="w-full bg-[#d4a853] hover:bg-[#c49843] text-white gap-2 h-10"
            disabled={(!entityName.trim() && !uploadedFile) || isBusy}
            onClick={handleProceed} data-testid="btn-research">
            {isBusy ? (
              <><Loader2 className="w-4 h-4 animate-spin" />{isExtracting ? `Extracting from ${uploadedFile?.name}...` : `Researching ${entityName}...`}</>
            ) : uploadedFile ? (
              <><FileText className="w-4 h-4" />Extract & Continue</>
            ) : (
              <><Sparkles className="w-4 h-4" />Research & Continue</>
            )}
          </Button>
          <button className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors text-center py-1"
            onClick={skipToManual} data-testid="btn-skip-research">
            Skip research, create manually
          </button>
        </div>
      </>
    );
  }

  // Document-specific context
  const timeline = docData?.timeline;
  const budgetInfo = docData?.budget;
  const scope = docData?.projectScope;
  const keyReqs = docData?.keyRequirements;
  const evalCriteria = docData?.evaluationCriteria;
  const hasDocContext = scope?.length || timeline || budgetInfo || keyReqs?.length || evalCriteria?.length;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <button onClick={() => setStep(1)} className="text-muted-foreground hover:text-foreground" data-testid="btn-back-step1">
            <ArrowLeft className="w-4 h-4" />
          </button>
          Confirm Profile — {entityName}
        </DialogTitle>
      </DialogHeader>
      <ScrollArea className="flex-1 -mx-6 px-6">
        <div className="space-y-5 pb-4">
          {/* Document context cards */}
          {hasDocContext && (
            <div className="grid grid-cols-2 gap-2">
              {scope?.length > 0 && (
                <div className="border rounded-lg p-3 bg-purple-50/50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800" data-testid="card-scope">
                  <p className="text-[10px] font-semibold text-purple-600 dark:text-purple-400 flex items-center gap-1 mb-1.5"><Target className="w-3 h-3" />Project Scope</p>
                  <div className="flex flex-wrap gap-1">
                    {scope.map((s: string, i: number) => <Badge key={i} variant="outline" className="text-[9px] border-purple-300 dark:border-purple-700">{s}</Badge>)}
                  </div>
                </div>
              )}
              {timeline && Object.values(timeline).some(Boolean) && (
                <div className="border rounded-lg p-3 bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800" data-testid="card-timeline">
                  <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1 mb-1.5"><Calendar className="w-3 h-3" />Timeline</p>
                  <div className="space-y-0.5 text-[10px]">
                    {timeline.rfpIssueDate && <p><span className="text-muted-foreground">RFP Issued:</span> {timeline.rfpIssueDate}</p>}
                    {timeline.proposalDueDate && <p><span className="text-muted-foreground">Proposals Due:</span> {timeline.proposalDueDate}</p>}
                    {timeline.expectedStartDate && <p><span className="text-muted-foreground">Expected Start:</span> {timeline.expectedStartDate}</p>}
                    {timeline.expectedGoLive && <p><span className="text-muted-foreground">Go-Live:</span> {timeline.expectedGoLive}</p>}
                    {timeline.contractTerm && <p><span className="text-muted-foreground">Term:</span> {timeline.contractTerm}</p>}
                  </div>
                </div>
              )}
              {budgetInfo && Object.values(budgetInfo).some(Boolean) && (
                <div className="border rounded-lg p-3 bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800" data-testid="card-budget">
                  <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mb-1.5"><DollarSign className="w-3 h-3" />Budget</p>
                  <div className="space-y-0.5 text-[10px]">
                    {budgetInfo.estimatedTotal && <p><span className="text-muted-foreground">Total:</span> {budgetInfo.estimatedTotal}</p>}
                    {budgetInfo.implementationBudget && <p><span className="text-muted-foreground">Implementation:</span> {budgetInfo.implementationBudget}</p>}
                    {budgetInfo.annualOperating && <p><span className="text-muted-foreground">Annual Operating:</span> {budgetInfo.annualOperating}</p>}
                  </div>
                </div>
              )}
              {evalCriteria?.length > 0 && (
                <div className="border rounded-lg p-3 bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800" data-testid="card-eval-criteria">
                  <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1 mb-1.5"><BarChart3 className="w-3 h-3" />Evaluation Criteria</p>
                  <div className="space-y-0.5 text-[10px]">
                    {evalCriteria.map((c: any, i: number) => (
                      <div key={i} className="flex justify-between">
                        <span>{c.criterion}</span>
                        {c.weight && <span className="text-muted-foreground">{c.weight}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Key requirements from document */}
          {keyReqs?.length > 0 && (
            <div className="border rounded-lg p-3 bg-gray-50/50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-800" data-testid="card-key-requirements">
              <p className="text-[10px] font-semibold text-foreground flex items-center gap-1 mb-1.5"><ClipboardList className="w-3 h-3 text-[#d4a853]" />Key Requirements from Document ({keyReqs.length})</p>
              <div className="space-y-1 max-h-[120px] overflow-y-auto">
                {keyReqs.map((r: string, i: number) => (
                  <p key={i} className="text-[10px] text-foreground pl-3 border-l-2 border-[#d4a853]/40">{r}</p>
                ))}
              </div>
            </div>
          )}

          {/* AI context cards */}
          {(profile?.keyFacts || profile?.challenges) && (
            <div className="grid grid-cols-2 gap-2">
              {profile.keyFacts && (
                <div className="border rounded-lg p-3 bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                  <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1 mb-1"><Info className="w-3 h-3" />Key Facts</p>
                  <p className="text-xs text-foreground">{profile.keyFacts}</p>
                </div>
              )}
              {profile.challenges && (
                <div className="border rounded-lg p-3 bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                  <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1 mb-1"><AlertTriangle className="w-3 h-3" />Common Challenges</p>
                  <p className="text-xs text-foreground">{profile.challenges}</p>
                </div>
              )}
            </div>
          )}

          {/* Basic info */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Entity Name</label>
              <Input className="h-8 text-xs" value={entityName} onChange={e => setEntityName(e.target.value)} data-testid="input-entity-name-2" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Entity Type</label>
              <Select value={entityType} onValueChange={setEntityType}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-entity-type-2"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPES.map(t => <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">State</label>
              <Input className="h-8 text-xs" value={state} onChange={e => setState(e.target.value)} data-testid="input-state-2" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Population</label>
              <Input className="h-8 text-xs" type="number" value={population} onChange={e => setPopulation(e.target.value)} data-testid="input-population" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Employee Count</label>
              <Input className="h-8 text-xs" type="number" value={employeeCount} onChange={e => setEmployeeCount(e.target.value)} data-testid="input-employees" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Annual Budget</label>
              <Input className="h-8 text-xs" placeholder="e.g., $150M" value={annualBudget} onChange={e => setAnnualBudget(e.target.value)} data-testid="input-budget" />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Project Description</label>
            <Textarea className="text-xs min-h-[50px]" placeholder="Brief scope..." value={description} onChange={e => setDescription(e.target.value)} data-testid="input-description" />
          </div>

          {/* Departments */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold">Departments</label>
              <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1" onClick={addDept} data-testid="btn-add-dept">
                <Plus className="w-2.5 h-2.5" />Add
              </Button>
            </div>
            <div className="space-y-1.5">
              {departments.map((d, i) => (
                <div key={i} className="grid grid-cols-[1fr_80px_24px] gap-1.5 items-center">
                  <Input className="h-7 text-xs" placeholder="Department" value={d.name} onChange={e => updateDept(i, "name", e.target.value)} data-testid={`dept-name-${i}`} />
                  <Input className="h-7 text-xs" placeholder="HC" type="number" value={d.headcount} onChange={e => updateDept(i, "headcount", e.target.value)} data-testid={`dept-hc-${i}`} />
                  <button className="text-muted-foreground hover:text-red-500 p-0.5" onClick={() => removeDept(i)} data-testid={`dept-remove-${i}`}><Trash2 className="w-3 h-3" /></button>
                </div>
              ))}
              {departments.length === 0 && <p className="text-[10px] text-muted-foreground">No departments. Click Add to start.</p>}
            </div>
          </div>

          {/* Systems */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold">Current Systems</label>
              <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1" onClick={addSystem} data-testid="btn-add-system">
                <Plus className="w-2.5 h-2.5" />Add
              </Button>
            </div>
            <div className="space-y-1.5">
              {systems.map((s, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_1fr_60px_24px] gap-1.5 items-center">
                  <Input className="h-7 text-xs" placeholder="System" value={s.name} onChange={e => updateSystem(i, "name", e.target.value)} data-testid={`sys-name-${i}`} />
                  <Input className="h-7 text-xs" placeholder="Module" value={s.module} onChange={e => updateSystem(i, "module", e.target.value)} data-testid={`sys-module-${i}`} />
                  <Input className="h-7 text-xs" placeholder="Vendor" value={s.vendor} onChange={e => updateSystem(i, "vendor", e.target.value)} data-testid={`sys-vendor-${i}`} />
                  <Input className="h-7 text-xs" placeholder="Yrs" value={s.yearsInUse} onChange={e => updateSystem(i, "yearsInUse", e.target.value)} data-testid={`sys-years-${i}`} />
                  <button className="text-muted-foreground hover:text-red-500 p-0.5" onClick={() => removeSystem(i)} data-testid={`sys-remove-${i}`}><Trash2 className="w-3 h-3" /></button>
                </div>
              ))}
              {systems.length === 0 && <p className="text-[10px] text-muted-foreground">No systems known. Click Add to start.</p>}
            </div>
          </div>

          {/* Engagement Modules */}
          <div>
            <label className="text-xs font-semibold mb-2 block">Engagement Modules</label>
            <div className="flex gap-3">
              {([
                { key: "selection", label: "Selection", desc: "Requirements & vendor eval" },
                { key: "ivv", label: "IV&V Oversight", desc: "Compliance & checkpoints" },
                { key: "health_check", label: "Health Check", desc: "RAID, budget, schedule" },
              ] as const).map(mod => (
                <label key={mod.key} className="flex items-start gap-2 cursor-pointer border rounded-lg p-2.5 flex-1 transition-colors hover:bg-muted/50"
                  style={modules[mod.key] ? { borderColor: "#d4a853", backgroundColor: "rgba(212,168,83,0.05)" } : {}}>
                  <input type="checkbox" className="mt-0.5 accent-[#d4a853]" checked={modules[mod.key]}
                    onChange={e => setModules(prev => ({ ...prev, [mod.key]: e.target.checked }))} data-testid={`module-${mod.key}`} />
                  <div>
                    <span className="text-xs font-medium">{mod.label}</span>
                    <p className="text-[9px] text-muted-foreground">{mod.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>
      <div className="pt-3 border-t border-border/50 shrink-0">
        <Button className="w-full bg-[#d4a853] hover:bg-[#c49843] text-white gap-2 h-10"
          disabled={!entityName.trim() || createMutation.isPending}
          onClick={() => createMutation.mutate()} data-testid="button-submit-project">
          {createMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Creating project...</> : <><Save className="w-4 h-4" />Create Project</>}
        </Button>
      </div>
    </>
  );
}
