import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Project, Requirement } from "@shared/schema";
import { ChatPanel } from "@/components/chat-panel";
import { MODULE_PREFIXES } from "@shared/templates";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ChevronLeft,
  Plus,
  Search,
  Download,
  BookTemplate,
  Pencil,
  Trash2,
  ChevronRight,
  FileText,
  Upload,
  BarChart3,
  AlertTriangle,
  Layers,
  X,
  Info,
  Check,
  CheckSquare,
  Square,
  Users,
  Link as LinkIcon,
  CircleCheck,
  Circle,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

interface ProjectWithStats extends Project {
  stats: {
    totalRequirements: number;
    criticalCount: number;
    desiredCount: number;
    moduleCoverage: number;
    responseStats: Record<string, number>;
  };
}

const VENDOR_RESPONSE_COLORS: Record<string, string> = {
  S: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  F: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  C: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  T: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  N: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const VENDOR_RESPONSE_LABELS: Record<string, string> = {
  S: "Standard",
  F: "Future",
  C: "Customization",
  T: "Third Party",
  N: "No",
};

function VendorResponseBadge({ code }: { code: string | null }) {
  if (!code) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <Tooltip>
      <TooltipTrigger>
        <Badge variant="outline" className={`text-[10px] font-bold px-1.5 py-0 ${VENDOR_RESPONSE_COLORS[code] || ""}`}>
          {code}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top">
        <span className="text-xs">{VENDOR_RESPONSE_LABELS[code] || code}</span>
      </TooltipContent>
    </Tooltip>
  );
}

const CRITICALITY_STYLES: Record<string, string> = {
  "Critical": "bg-primary/10 text-primary border-primary/20 dark:bg-accent/15 dark:text-accent dark:border-accent/25",
  "Desired": "bg-muted text-muted-foreground border-muted",
  "Not Required": "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800/30 dark:text-slate-500 dark:border-slate-700/30",
  "Not Applicable": "bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800/20 dark:text-slate-500 dark:border-slate-700/20",
};

function CriticalityBadge({ value }: { value: string }) {
  return (
    <Badge
      variant="outline"
      className={`text-[10px] font-semibold px-1.5 py-0 ${CRITICALITY_STYLES[value] || CRITICALITY_STYLES["Desired"]}`}
    >
      {value === "Not Required" ? "Not Req" : value === "Not Applicable" ? "N/A" : value}
    </Badge>
  );
}

// ==================== STATUS STEPPER ====================
interface StatusStage {
  key: string;
  label: string;
  completed: boolean;
  active: boolean;
  checklist: Array<{ label: string; done: boolean }>;
  allDone: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "text-muted-foreground",
  requirements_review: "text-blue-500",
  stakeholder_workshop: "text-accent",
  vendor_evaluation: "text-purple-500",
  final_report: "text-teal-500",
  complete: "text-green-500",
};

function StatusStepper({ projectId }: { projectId: number }) {
  const { toast } = useToast();

  const { data: statusInfo, refetch } = useQuery<{ currentStatus: string; stages: StatusStage[] }>({
    queryKey: ["/api/projects", projectId, "status-info"],
    queryFn: () => apiRequest("GET", `/api/projects/${projectId}/status-info`).then(r => r.json()),
  });

  const advanceMutation = useMutation({
    mutationFn: (status: string) => apiRequest("PATCH", `/api/projects/${projectId}/status`, { status }).then(r => r.json()),
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Status updated" });
    },
    onError: (err: any) => toast({ title: "Failed to update status", description: err.message, variant: "destructive" }),
  });

  if (!statusInfo) return null;

  const { stages, currentStatus } = statusInfo;
  const currentIndex = stages.findIndex(s => s.active);
  const currentStage = stages[currentIndex];
  const nextStage = currentIndex < stages.length - 1 ? stages[currentIndex + 1] : null;
  const prevStage = currentIndex > 0 ? stages[currentIndex - 1] : null;

  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b bg-muted/20 shrink-0 overflow-x-auto" data-testid="status-stepper">
      {stages.map((stage, i) => (
        <div key={stage.key} className="flex items-center">
          {i > 0 && <div className={`w-4 h-px mx-0.5 ${i <= currentIndex ? "bg-accent" : "bg-border"}`} />}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors whitespace-nowrap ${
                  stage.active
                    ? "bg-accent/15 text-accent border border-accent/30"
                    : stage.completed
                    ? "text-green-600 dark:text-green-400"
                    : "text-muted-foreground"
                }`}
                data-testid={`status-step-${stage.key}`}
              >
                {stage.completed ? (
                  <CircleCheck className="w-3 h-3 text-green-500" />
                ) : stage.active ? (
                  <Circle className={`w-3 h-3 ${STATUS_COLORS[stage.key] || ""}`} />
                ) : (
                  <Circle className="w-3 h-3 text-muted-foreground/40" />
                )}
                <span className="hidden sm:inline">{stage.label}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[200px]">
              <p className="text-xs font-semibold mb-1">{stage.label}</p>
              {stage.checklist.map((c, ci) => (
                <div key={ci} className="flex items-center gap-1 text-[10px]">
                  {c.done ? <Check className="w-2.5 h-2.5 text-green-500" /> : <Circle className="w-2.5 h-2.5 text-muted-foreground/50" />}
                  <span className={c.done ? "" : "text-muted-foreground"}>{c.label}</span>
                </div>
              ))}
            </TooltipContent>
          </Tooltip>
        </div>
      ))}

      <div className="ml-auto flex items-center gap-1 shrink-0">
        {prevStage && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] px-2 text-muted-foreground"
            onClick={() => advanceMutation.mutate(prevStage.key)}
            disabled={advanceMutation.isPending}
            data-testid="button-status-back"
          >
            Back
          </Button>
        )}
        {nextStage && (
          <Button
            size="sm"
            className="h-6 text-[10px] px-2 bg-accent hover:bg-accent/90 text-accent-foreground"
            disabled={!currentStage?.allDone || advanceMutation.isPending}
            onClick={() => advanceMutation.mutate(nextStage.key)}
            data-testid="button-advance-status"
          >
            Advance to {nextStage.label}
          </Button>
        )}
      </div>
    </div>
  );
}

export default function ProjectView() {
  const params = useParams<{ id: string }>();
  const projectId = parseInt(params.id || "0");
  const { toast } = useToast();

  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [critFilter, setCritFilter] = useState<string>("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [editingReq, setEditingReq] = useState<Requirement | null>(null);
  const [deleteReqId, setDeleteReqId] = useState<number | null>(null);
  const [showLegend, setShowLegend] = useState(false);
  const [selectedTemplates, setSelectedTemplates] = useState<Set<string>>(new Set());

  // Bulk selection state
  const [selectedReqIds, setSelectedReqIds] = useState<Set<number>>(new Set());
  const [lastClickedId, setLastClickedId] = useState<number | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  // Workshop dialog state
  const [showWorkshopDialog, setShowWorkshopDialog] = useState(false);
  const [wsStakeholderName, setWsStakeholderName] = useState("");
  const [wsStakeholderEmail, setWsStakeholderEmail] = useState("");
  const [wsSelectedModules, setWsSelectedModules] = useState<Set<string>>(new Set());
  const [wsExpiresAt, setWsExpiresAt] = useState("");
  const [wsAllModules, setWsAllModules] = useState(false);

  // Team management
  const [showTeamDialog, setShowTeamDialog] = useState(false);
  const [addMemberEmail, setAddMemberEmail] = useState("");
  const [addMemberRole, setAddMemberRole] = useState("editor");

  // Import dialog state
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importStep, setImportStep] = useState<1 | 2 | 3>(1);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importRows, setImportRows] = useState<Record<string, string>[]>([]);
  const [importSheetNames, setImportSheetNames] = useState<string[]>([]);
  const [importSelectedSheet, setImportSelectedSheet] = useState<string>("");
  const [importMapping, setImportMapping] = useState<Record<string, string>>({
    reqNumber: "", category: "", functionalArea: "", subCategory: "", description: "", criticality: "",
  });
  const [importUploading, setImportUploading] = useState(false);
  const [importConfirming, setImportConfirming] = useState(false);

  // Form state for add/edit
  const [formSubCategory, setFormSubCategory] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCriticality, setFormCriticality] = useState("Critical");
  const [formVendorResponse, setFormVendorResponse] = useState<string>("");
  const [formComments, setFormComments] = useState("");

  const { data: project, isLoading: projectLoading } = useQuery<ProjectWithStats>({
    queryKey: ["/api/projects", projectId],
  });

  const { data: allRequirements = [], isLoading: reqsLoading } = useQuery<Requirement[]>({
    queryKey: ["/api/projects", projectId, "requirements"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/projects/${projectId}/requirements`);
      return res.json();
    },
  });

  // Workshop links query
  const { data: workshopLinks = [], refetch: refetchWorkshopLinks } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "workshop-links"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/projects/${projectId}/workshop-links`);
      return res.json();
    },
    enabled: showWorkshopDialog,
  });

  // Template summary (lightweight — no requirement descriptions)
  interface TemplateSummary {
    categories: Record<string, string[]>;
    prefixes: Record<string, string>;
    summary: Record<string, Record<string, number>>; // category → module → count
    totalCount: number;
  }
  const { data: templateSummary } = useQuery<TemplateSummary>({
    queryKey: ["/api/templates/summary"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/templates/summary");
      return res.json();
    },
    staleTime: Infinity, // templates don't change during a session
  });

  const CATEGORIES = templateSummary?.categories || {};
  const templateCountByModule: Record<string, number> = useMemo(() => {
    if (!templateSummary) return {};
    const counts: Record<string, number> = {};
    for (const modCounts of Object.values(templateSummary.summary)) {
      for (const [mod, count] of Object.entries(modCounts)) {
        counts[mod] = count;
      }
    }
    return counts;
  }, [templateSummary]);

  const totalTemplateCount = templateSummary?.totalCount || 0;

  const createWorkshopLinkMutation = useMutation({
    mutationFn: async (data: { stakeholderName: string; stakeholderEmail: string; modules: string[] }) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/workshop-links`, data);
      return res.json();
    },
    onSuccess: () => {
      refetchWorkshopLinks();
      setWsStakeholderName("");
      setWsStakeholderEmail("");
      setWsSelectedModules(new Set());
      setWsAllModules(false);
      toast({ title: "Workshop link created" });
    },
    onError: () => toast({ title: "Failed to create workshop link", variant: "destructive" }),
  });

  // Team management queries
  const { data: teamMembers = [], refetch: refetchMembers } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "members"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/projects/${projectId}/members`);
      return res.json();
    },
    enabled: !!projectId,
  });

  const { data: allUsers = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/users");
      return res.json();
    },
    enabled: showTeamDialog,
  });

  const addMemberMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: number; role: string }) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/members`, { userId, role });
      return res.json();
    },
    onSuccess: () => {
      refetchMembers();
      setAddMemberEmail("");
      toast({ title: "Member added" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const updateMemberRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: number; role: string }) => {
      const res = await apiRequest("PATCH", `/api/projects/${projectId}/members/${userId}`, { role });
      return res.json();
    },
    onSuccess: () => { refetchMembers(); toast({ title: "Role updated" }); },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: number) => {
      await apiRequest("DELETE", `/api/projects/${projectId}/members/${userId}`);
    },
    onSuccess: () => { refetchMembers(); toast({ title: "Member removed" }); },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const deactivateWorkshopLinkMutation = useMutation({
    mutationFn: async (linkId: number) => {
      const res = await apiRequest("DELETE", `/api/workshop-links/${linkId}`);
      return res.json();
    },
    onSuccess: () => {
      refetchWorkshopLinks();
      toast({ title: "Workshop link deactivated" });
    },
  });

  // Import: upload & preview
  const handleImportUpload = useCallback(async () => {
    if (!importFile) return;
    setImportUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      if (importSelectedSheet) formData.append("sheetName", importSelectedSheet);
      const res = await fetch(`/api/projects/${projectId}/import/preview`, { method: "POST", body: formData });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Upload failed"); }
      const data = await res.json();
      setImportHeaders(data.headers);
      setImportRows(data.rows);
      setImportSheetNames(data.sheetNames || []);
      // Auto-detect column mapping
      const autoMapping: Record<string, string> = { reqNumber: "", category: "", functionalArea: "", subCategory: "", description: "", criticality: "" };
      for (const h of data.headers) {
        const lower = h.toLowerCase();
        if ((lower.includes("req") || lower.includes("number") || lower.includes("id")) && !autoMapping.reqNumber) autoMapping.reqNumber = h;
        else if ((lower.includes("module") || lower.includes("category")) && !autoMapping.category) autoMapping.category = h;
        else if ((lower.includes("functional") || lower.includes("area")) && !autoMapping.functionalArea) autoMapping.functionalArea = h;
        else if ((lower.includes("sub") && lower.includes("cat")) && !autoMapping.subCategory) autoMapping.subCategory = h;
        else if ((lower.includes("description") || lower.includes("desc") || lower.includes("requirement")) && !autoMapping.description) autoMapping.description = h;
        else if ((lower.includes("critical") || lower.includes("priority")) && !autoMapping.criticality) autoMapping.criticality = h;
      }
      setImportMapping(autoMapping);
      setImportStep(2);
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setImportUploading(false);
    }
  }, [importFile, importSelectedSheet, projectId, toast]);

  // Import: confirm
  const handleImportConfirm = useCallback(async () => {
    setImportConfirming(true);
    try {
      const res = await apiRequest("POST", `/api/projects/${projectId}/import/confirm`, {
        mapping: importMapping,
        rows: importRows,
      });
      const data = await res.json();
      toast({ title: `Imported ${data.imported} requirements` });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "requirements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      setShowImportDialog(false);
      setImportStep(1);
      setImportFile(null);
      setImportRows([]);
      setImportHeaders([]);
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setImportConfirming(false);
    }
  }, [importMapping, importRows, projectId, toast]);

  // Reset import dialog state
  const resetImportDialog = useCallback(() => {
    setImportStep(1);
    setImportFile(null);
    setImportHeaders([]);
    setImportRows([]);
    setImportSheetNames([]);
    setImportSelectedSheet("");
    setImportMapping({ reqNumber: "", category: "", functionalArea: "", subCategory: "", description: "", criticality: "" });
  }, []);

  // Build module tree from actual data
  const moduleTree = useMemo(() => {
    const tree: Record<string, Record<string, number>> = {};
    for (const req of allRequirements) {
      if (!tree[req.category]) tree[req.category] = {};
      if (!tree[req.category][req.functionalArea]) tree[req.category][req.functionalArea] = 0;
      tree[req.category][req.functionalArea]++;
    }
    return tree;
  }, [allRequirements]);

  // Filtered requirements
  const filteredRequirements = useMemo(() => {
    let reqs = allRequirements;
    if (selectedArea) {
      reqs = reqs.filter(r => r.functionalArea === selectedArea);
    }
    if (critFilter !== "all") {
      reqs = reqs.filter(r => r.criticality === critFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      reqs = reqs.filter(r =>
        r.description.toLowerCase().includes(q) ||
        r.reqNumber.toLowerCase().includes(q) ||
        r.subCategory.toLowerCase().includes(q)
      );
    }
    return reqs;
  }, [allRequirements, selectedArea, critFilter, searchQuery]);

  // Selection helpers
  const clearSelection = useCallback(() => {
    setSelectedReqIds(new Set());
    setLastClickedId(null);
  }, []);

  const selectAllVisible = useCallback(() => {
    setSelectedReqIds(new Set(filteredRequirements.map(r => r.id)));
  }, [filteredRequirements]);

  const toggleReqSelection = useCallback((id: number, shiftKey: boolean) => {
    if (shiftKey && lastClickedId !== null) {
      // Range select
      const ids = filteredRequirements.map(r => r.id);
      const lastIdx = ids.indexOf(lastClickedId);
      const curIdx = ids.indexOf(id);
      if (lastIdx !== -1 && curIdx !== -1) {
        const [start, end] = lastIdx < curIdx ? [lastIdx, curIdx] : [curIdx, lastIdx];
        const rangeIds = ids.slice(start, end + 1);
        setSelectedReqIds(prev => {
          const next = new Set(prev);
          rangeIds.forEach(rid => next.add(rid));
          return next;
        });
        return;
      }
    }
    // Single toggle
    setSelectedReqIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setLastClickedId(id);
  }, [filteredRequirements, lastClickedId]);

  // Clear selection when filters change
  const handleSetSelectedArea = useCallback((area: string | null) => {
    setSelectedArea(area);
    clearSelection();
  }, [clearSelection]);

  const handleSetCritFilter = useCallback((value: string) => {
    setCritFilter(value);
    clearSelection();
  }, [clearSelection]);

  const handleSetSearchQuery = useCallback((value: string) => {
    setSearchQuery(value);
    clearSelection();
  }, [clearSelection]);

  // Get next req number for selected area
  const getNextReqNumber = (area: string) => {
    const prefix = MODULE_PREFIXES[area] || "XX";
    const areaReqs = allRequirements.filter(r => r.functionalArea === area);
    let maxNum = 0;
    for (const r of areaReqs) {
      const match = r.reqNumber.match(/[A-Z]{2}(\d+)/);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
    }
    return `${prefix}${String(maxNum + 1).padStart(2, "0")}`;
  };

  // Find category for a functional area
  const getCategoryForArea = (area: string): string => {
    for (const [cat, areas] of Object.entries(CATEGORIES)) {
      if (areas.includes(area)) return cat;
    }
    return "Cross-System";
  };

  const createReqMutation = useMutation({
    mutationFn: async () => {
      const area = selectedArea!;
      const res = await apiRequest("POST", `/api/projects/${projectId}/requirements`, {
        reqNumber: getNextReqNumber(area),
        category: getCategoryForArea(area),
        functionalArea: area,
        subCategory: formSubCategory,
        description: formDescription,
        criticality: formCriticality,
        vendorResponse: formVendorResponse || null,
        comments: formComments,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "requirements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setShowAddDialog(false);
      resetForm();
      toast({ title: "Requirement added" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateReqMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/requirements/${editingReq!.id}`, {
        subCategory: formSubCategory,
        description: formDescription,
        criticality: formCriticality,
        vendorResponse: formVendorResponse || null,
        comments: formComments,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "requirements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setEditingReq(null);
      resetForm();
      toast({ title: "Requirement updated" });
    },
  });

  const deleteReqMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/requirements/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "requirements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setDeleteReqId(null);
      toast({ title: "Requirement deleted" });
    },
  });

  const bulkAddMutation = useMutation({
    mutationFn: async (areas: string[]) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/requirements/bulk`, { functionalAreas: areas });
      return res.json();
    },
    onSuccess: (data: Requirement[]) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "requirements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setShowTemplateDialog(false);
      setSelectedTemplates(new Set());
      toast({ title: "Templates loaded", description: `Added ${data.length} requirements across ${selectedTemplates.size} modules.` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: async (data: { ids: number[]; updates: { criticality?: string; comments?: string } }) => {
      const res = await apiRequest("PATCH", `/api/projects/${projectId}/requirements/bulk-update`, data);
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "requirements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      clearSelection();
      toast({ title: "Updated", description: `${result.updated} requirements updated.` });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await apiRequest("DELETE", `/api/projects/${projectId}/requirements/bulk-delete`, { ids });
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "requirements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      clearSelection();
      toast({ title: "Deleted", description: `${result.deleted} requirements removed.` });
    },
  });

  const bulkUpdateCriticality = (value: string) => {
    bulkUpdateMutation.mutate({
      ids: Array.from(selectedReqIds),
      updates: { criticality: value },
    });
  };

  const resetForm = () => {
    setFormSubCategory("");
    setFormDescription("");
    setFormCriticality("Critical");
    setFormVendorResponse("");
    setFormComments("");
  };

  const openEditDialog = (req: Requirement) => {
    setEditingReq(req);
    setFormSubCategory(req.subCategory);
    setFormDescription(req.description);
    setFormCriticality(req.criticality);
    setFormVendorResponse(req.vendorResponse || "");
    setFormComments(req.comments);
  };

  const handleExport = async () => {
    try {
      const res = await apiRequest("GET", `/api/projects/${projectId}/export`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${project?.name || "project"}_requirements.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Export complete" });
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    }
  };

  if (projectLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Project not found.</p>
        <Link href="/">
          <Button variant="link" className="pl-0 mt-2">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full" data-testid="page-project-view">
      {/* Module sidebar */}
      <div className="w-64 shrink-0 border-r bg-card/50 flex flex-col">
        <div className="p-3 border-b">
          <Link href="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors no-underline mb-2">
            <ChevronLeft className="w-3 h-3" />
            All Projects
          </Link>
          <h2 className="text-sm font-semibold truncate" data-testid="text-project-name">{project.name}</h2>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant="outline" className="text-[10px] font-semibold uppercase">{project.status}</Badge>
            <span className="text-[10px] text-muted-foreground">{project.stats.totalRequirements} reqs</span>
          </div>
          {project.engagementModules && (() => {
            try {
              const mods: string[] = JSON.parse(project.engagementModules);
              const labels: Record<string, string> = { selection: "Selection", ivv: "IV&V", health_check: "Health Check" };
              return mods.length > 0 ? (
                <div className="flex gap-1 mt-1.5 flex-wrap">
                  {mods.map(m => <Badge key={m} className="text-[9px] bg-muted text-muted-foreground">{labels[m] || m}</Badge>)}
                </div>
              ) : null;
            } catch { return null; }
          })()}
          <Button variant="ghost" size="sm" className="h-7 text-[11px] gap-1.5 mt-2 w-full justify-start text-muted-foreground" onClick={() => setShowTeamDialog(true)}>
            <Users className="w-3.5 h-3.5" />Team
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2">
            <button
              onClick={() => handleSetSelectedArea(null)}
              className={`w-full text-left px-2.5 py-1.5 rounded text-xs font-medium transition-colors mb-1 ${
                !selectedArea ? "bg-primary text-primary-foreground dark:bg-accent dark:text-accent-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
              data-testid="button-all-modules"
            >
              All Modules ({allRequirements.length})
            </button>
            {Object.entries(moduleTree).map(([cat, areas]) => (
              <div key={cat} className="mb-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2.5 py-1">{cat}</p>
                {Object.entries(areas).map(([area, count]) => (
                  <button
                    key={area}
                    onClick={() => handleSetSelectedArea(area)}
                    className={`w-full text-left px-2.5 py-1.5 rounded text-xs transition-colors flex items-center justify-between ${
                      selectedArea === area
                        ? "bg-primary text-primary-foreground dark:bg-accent dark:text-accent-foreground"
                        : "text-foreground/80 hover:bg-muted"
                    }`}
                    data-testid={`button-module-${area.replace(/\s/g, '-').toLowerCase()}`}
                  >
                    <span className="truncate">{area}</span>
                    <span className={`text-[10px] font-mono ${selectedArea === area ? "opacity-80" : "text-muted-foreground"}`}>{count}</span>
                  </button>
                ))}
              </div>
            ))}
            {Object.keys(moduleTree).length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6 px-2">
                No modules yet. Load templates or add requirements to get started.
              </p>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Status Stepper */}
        <StatusStepper projectId={projectId} />
        {/* Toolbar */}
        <div className="flex items-center gap-2 p-3 border-b shrink-0 bg-background">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search requirements..."
              value={searchQuery}
              onChange={(e) => handleSetSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs"
              data-testid="input-search-requirements"
            />
          </div>
          <Select value={critFilter} onValueChange={handleSetCritFilter}>
            <SelectTrigger className="w-32 h-8 text-xs" data-testid="select-criticality-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Criticality</SelectItem>
              <SelectItem value="Critical">Critical</SelectItem>
              <SelectItem value="Desired">Desired</SelectItem>
              <SelectItem value="Not Required">Not Required</SelectItem>
              <SelectItem value="Not Applicable">Not Applicable</SelectItem>
            </SelectContent>
          </Select>

          <div className="ml-auto flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => setShowLegend(!showLegend)} data-testid="button-legend">
                  <Info className="w-3.5 h-3.5" />
                  Legend
                </Button>
              </TooltipTrigger>
              <TooltipContent>Vendor Response Codes</TooltipContent>
            </Tooltip>

            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1"
              onClick={() => setShowTemplateDialog(true)}
              data-testid="button-load-template"
            >
              <BookTemplate className="w-3.5 h-3.5" />
              Load Template
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1"
              onClick={() => { resetImportDialog(); setShowImportDialog(true); }}
              data-testid="button-import-requirements"
            >
              <Upload className="w-3.5 h-3.5" />
              Import
            </Button>

            {selectedArea && (
              <Button
                size="sm"
                className="h-8 text-xs gap-1"
                onClick={() => { resetForm(); setShowAddDialog(true); }}
                data-testid="button-add-requirement"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Requirement
              </Button>
            )}

            <Link href={`/projects/${projectId}/evaluation`}>
              <Button
                size="sm"
                className="h-8 text-xs gap-1 bg-accent hover:bg-accent/90 text-accent-foreground"
                data-testid="button-evaluate-vendors"
              >
                <BarChart3 className="w-3.5 h-3.5" />
                Evaluate Vendors
              </Button>
            </Link>

            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1"
              onClick={() => setShowWorkshopDialog(true)}
              data-testid="button-workshop"
            >
              <Users className="w-3.5 h-3.5" />
              Workshop
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1"
              onClick={handleExport}
              data-testid="button-export"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </Button>
          </div>
        </div>

        {/* Vendor Response Legend */}
        {showLegend && (
          <div className="flex items-center gap-4 px-4 py-2 border-b bg-muted/30 text-xs">
            <span className="font-semibold text-muted-foreground">Vendor Codes:</span>
            {Object.entries(VENDOR_RESPONSE_LABELS).map(([code, label]) => (
              <span key={code} className="flex items-center gap-1">
                <Badge variant="outline" className={`text-[10px] font-bold px-1.5 py-0 ${VENDOR_RESPONSE_COLORS[code]}`}>{code}</Badge>
                <span className="text-muted-foreground">{label}</span>
              </span>
            ))}
            <button onClick={() => setShowLegend(false)} className="ml-auto text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Stats bar — shown when nothing is selected */}
        {selectedReqIds.size === 0 && (
          <div className="flex items-center gap-5 px-4 py-2 border-b bg-muted/20 text-xs shrink-0">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <FileText className="w-3.5 h-3.5" />
              {filteredRequirements.length} requirements
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <AlertTriangle className="w-3.5 h-3.5" />
              {filteredRequirements.filter(r => r.criticality === "Critical").length} critical
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Layers className="w-3.5 h-3.5" />
              {new Set(filteredRequirements.map(r => r.functionalArea)).size} modules
            </span>
            {selectedArea && (
              <button
                onClick={() => handleSetSelectedArea(null)}
                className="flex items-center gap-1 text-primary dark:text-accent hover:underline ml-auto"
              >
                <X className="w-3 h-3" />
                Clear filter: {selectedArea}
              </button>
            )}
          </div>
        )}

        {/* Bulk action toolbar — shown when rows are selected */}
        {selectedReqIds.size > 0 && (
          <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-primary/5 dark:bg-accent/5 text-xs shrink-0">
            <span className="font-semibold text-foreground">
              {selectedReqIds.size} selected
            </span>
            <div className="h-4 w-px bg-border" />

            {/* Set Criticality buttons */}
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
              onClick={() => bulkUpdateCriticality("Critical")}
              disabled={bulkUpdateMutation.isPending}
              data-testid="bulk-set-critical"
            >
              Set Critical
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
              onClick={() => bulkUpdateCriticality("Desired")}
              disabled={bulkUpdateMutation.isPending}
              data-testid="bulk-set-desired"
            >
              Set Desired
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
              onClick={() => bulkUpdateCriticality("Not Required")}
              disabled={bulkUpdateMutation.isPending}
              data-testid="bulk-set-not-required"
            >
              Not Required
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
              onClick={() => bulkUpdateCriticality("Not Applicable")}
              disabled={bulkUpdateMutation.isPending}
              data-testid="bulk-set-not-applicable"
            >
              N/A
            </Button>

            <div className="h-4 w-px bg-border" />

            {/* Bulk delete */}
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
              onClick={() => setBulkDeleteConfirm(true)}
              disabled={bulkDeleteMutation.isPending}
              data-testid="bulk-delete"
            >
              <Trash2 className="w-3 h-3" />
              Delete
            </Button>

            <button
              onClick={clearSelection}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground"
              data-testid="bulk-clear-selection"
            >
              Clear selection
            </button>
          </div>
        )}

        {/* Requirements Table */}
        <div className="flex-1 overflow-auto">
          {reqsLoading ? (
            <div className="p-4 space-y-2">
              {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : filteredRequirements.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-10 text-center">
                    <Checkbox
                      checked={filteredRequirements.length > 0 && filteredRequirements.every(r => selectedReqIds.has(r.id))}
                      onCheckedChange={(checked) => checked ? selectAllVisible() : clearSelection()}
                      data-testid="checkbox-select-all"
                    />
                  </TableHead>
                  <TableHead className="w-[72px] text-[11px] font-semibold">Req #</TableHead>
                  {!selectedArea && <TableHead className="text-[11px] font-semibold w-[140px]">Module</TableHead>}
                  <TableHead className="text-[11px] font-semibold w-[120px]">Sub Category</TableHead>
                  <TableHead className="text-[11px] font-semibold">Description</TableHead>
                  <TableHead className="w-[80px] text-[11px] font-semibold text-center">Criticality</TableHead>
                  <TableHead className="w-[56px] text-[11px] font-semibold text-center">Resp</TableHead>
                  <TableHead className="w-[64px] text-[11px] font-semibold text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequirements.map((req) => (
                  <TableRow
                    key={req.id}
                    className={`group ${selectedReqIds.has(req.id) ? "bg-primary/5 dark:bg-accent/5" : ""}`}
                    data-testid={`row-requirement-${req.id}`}
                  >
                    <TableCell className="text-center py-2">
                      <Checkbox
                        checked={selectedReqIds.has(req.id)}
                        onCheckedChange={() => {/* handled by onClick */}}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleReqSelection(req.id, e.shiftKey);
                        }}
                        data-testid={`checkbox-req-${req.id}`}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs font-semibold text-primary dark:text-accent py-2">{req.reqNumber}</TableCell>
                    {!selectedArea && (
                      <TableCell className="text-xs py-2">
                        <button
                          onClick={() => handleSetSelectedArea(req.functionalArea)}
                          className="text-left hover:text-primary dark:hover:text-accent transition-colors"
                        >
                          {req.functionalArea}
                        </button>
                      </TableCell>
                    )}
                    <TableCell className="text-xs text-muted-foreground py-2">{req.subCategory}</TableCell>
                    <TableCell className="text-xs py-2 max-w-md">
                      <p className="line-clamp-2">{req.description}</p>
                      {req.comments && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 italic line-clamp-1">{req.comments}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-center py-2"><CriticalityBadge value={req.criticality} /></TableCell>
                    <TableCell className="text-center py-2"><VendorResponseBadge code={req.vendorResponse} /></TableCell>
                    <TableCell className="py-2">
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity justify-center">
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => openEditDialog(req)} data-testid={`button-edit-req-${req.id}`}>
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => setDeleteReqId(req.id)} data-testid={`button-delete-req-${req.id}`}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileText className="w-12 h-12 text-muted-foreground/30 mb-3" />
              <h3 className="text-sm font-semibold mb-1">No requirements found</h3>
              <p className="text-xs text-muted-foreground max-w-sm mb-4">
                {selectedArea
                  ? `No requirements in ${selectedArea} yet. Load a template or add requirements manually.`
                  : "Start by loading a module template or adding requirements manually."}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-1" onClick={() => setShowTemplateDialog(true)}>
                  <BookTemplate className="w-3.5 h-3.5" />
                  Load Template
                </Button>
                {selectedArea && (
                  <Button size="sm" className="gap-1" onClick={() => { resetForm(); setShowAddDialog(true); }}>
                    <Plus className="w-3.5 h-3.5" />
                    Add Requirement
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Requirement Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Requirement — {selectedArea}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div>
              <label className="text-xs font-medium mb-1 block">Sub Category</label>
              <Input value={formSubCategory} onChange={(e) => setFormSubCategory(e.target.value)} placeholder="e.g., Invoice Processing" className="text-sm" data-testid="input-sub-category" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Description</label>
              <Textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="The system has the ability to..." rows={3} className="text-sm" data-testid="input-description" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium mb-1 block">Criticality</label>
                <Select value={formCriticality} onValueChange={setFormCriticality}>
                  <SelectTrigger className="text-sm" data-testid="select-criticality"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Critical">Critical</SelectItem>
                    <SelectItem value="Desired">Desired</SelectItem>
                    <SelectItem value="Not Required">Not Required</SelectItem>
                    <SelectItem value="Not Applicable">Not Applicable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Vendor Response</label>
                <Select value={formVendorResponse} onValueChange={setFormVendorResponse}>
                  <SelectTrigger className="text-sm" data-testid="select-vendor-response"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="S">S — Standard</SelectItem>
                    <SelectItem value="F">F — Future</SelectItem>
                    <SelectItem value="C">C — Customization</SelectItem>
                    <SelectItem value="T">T — Third Party</SelectItem>
                    <SelectItem value="N">N — No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Comments</label>
              <Input value={formComments} onChange={(e) => setFormComments(e.target.value)} placeholder="Optional notes..." className="text-sm" data-testid="input-comments" />
            </div>
            <Button
              onClick={() => createReqMutation.mutate()}
              disabled={!formDescription.trim() || createReqMutation.isPending}
              className="w-full"
              data-testid="button-submit-requirement"
            >
              {createReqMutation.isPending ? "Adding..." : "Add Requirement"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Requirement Dialog */}
      <Dialog open={!!editingReq} onOpenChange={() => setEditingReq(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit {editingReq?.reqNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div>
              <label className="text-xs font-medium mb-1 block">Sub Category</label>
              <Input value={formSubCategory} onChange={(e) => setFormSubCategory(e.target.value)} className="text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Description</label>
              <Textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} rows={3} className="text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium mb-1 block">Criticality</label>
                <Select value={formCriticality} onValueChange={setFormCriticality}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Critical">Critical</SelectItem>
                    <SelectItem value="Desired">Desired</SelectItem>
                    <SelectItem value="Not Required">Not Required</SelectItem>
                    <SelectItem value="Not Applicable">Not Applicable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Vendor Response</label>
                <Select value={formVendorResponse} onValueChange={setFormVendorResponse}>
                  <SelectTrigger className="text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="S">S — Standard</SelectItem>
                    <SelectItem value="F">F — Future</SelectItem>
                    <SelectItem value="C">C — Customization</SelectItem>
                    <SelectItem value="T">T — Third Party</SelectItem>
                    <SelectItem value="N">N — No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Comments</label>
              <Input value={formComments} onChange={(e) => setFormComments(e.target.value)} className="text-sm" />
            </div>
            <Button
              onClick={() => updateReqMutation.mutate()}
              disabled={!formDescription.trim() || updateReqMutation.isPending}
              className="w-full"
              data-testid="button-update-requirement"
            >
              {updateReqMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteReqId !== null} onOpenChange={() => setDeleteReqId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Requirement</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The requirement will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteReqId && deleteReqMutation.mutate(deleteReqId)}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={bulkDeleteConfirm} onOpenChange={setBulkDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedReqIds.size} Requirements</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {selectedReqIds.size} requirements. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                bulkDeleteMutation.mutate(Array.from(selectedReqIds));
                setBulkDeleteConfirm(false);
              }}
              data-testid="button-confirm-bulk-delete"
            >
              Delete {selectedReqIds.size} Requirements
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Load Template Dialog */}
      <Dialog open={showTemplateDialog} onOpenChange={(open) => { setShowTemplateDialog(open); if (!open) setSelectedTemplates(new Set()); }}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Load Template Requirements</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-between -mt-1">
            <p className="text-xs text-muted-foreground">
              Select modules to load pre-built ERP requirements.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const allAreas = Object.values(CATEGORIES).flat().filter(area => {
                    const existing = allRequirements.filter(r => r.functionalArea === area).length;
                    return existing === 0;
                  });
                  setSelectedTemplates(new Set(allAreas));
                }}
                className="text-[11px] text-primary dark:text-accent hover:underline font-medium"
                data-testid="button-select-all-templates"
              >
                Select All New
              </button>
              {selectedTemplates.size > 0 && (
                <button
                  onClick={() => setSelectedTemplates(new Set())}
                  className="text-[11px] text-muted-foreground hover:underline"
                  data-testid="button-clear-templates"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          <ScrollArea className="max-h-[50vh] pr-2">
            <div className="space-y-4 pt-1">
              {Object.entries(CATEGORIES).map(([category, areas]) => {
                const catAreas = areas.filter(a => {
                  // Only show areas that have templates
                  return (templateCountByModule[a] || 0) > 0;
                });
                if (catAreas.length === 0) return null;
                const allSelected = catAreas.every(a => selectedTemplates.has(a));
                const someSelected = catAreas.some(a => selectedTemplates.has(a));
                return (
                  <div key={category}>
                    <button
                      className="flex items-center gap-1.5 mb-1.5 group"
                      onClick={() => {
                        const next = new Set(selectedTemplates);
                        if (allSelected) {
                          catAreas.forEach(a => next.delete(a));
                        } else {
                          catAreas.forEach(a => next.add(a));
                        }
                        setSelectedTemplates(next);
                      }}
                    >
                      <div className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center transition-colors ${
                        allSelected ? "bg-primary border-primary dark:bg-accent dark:border-accent" : someSelected ? "border-primary/50 dark:border-accent/50" : "border-muted-foreground/30"
                      }`}>
                        {allSelected && <Check className="w-2.5 h-2.5 text-primary-foreground dark:text-accent-foreground" />}
                        {someSelected && !allSelected && <div className="w-1.5 h-0.5 rounded bg-primary dark:bg-accent" />}
                      </div>
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider group-hover:text-foreground transition-colors">{category}</span>
                    </button>
                    <div className="grid grid-cols-2 gap-1.5">
                      {catAreas.map((area) => {
                        const prefix = MODULE_PREFIXES[area];
                        const existingCount = allRequirements.filter(r => r.functionalArea === area).length;
                        const templateCount = templateCountByModule[area] || 0;
                        const isSelected = selectedTemplates.has(area);
                        return (
                          <button
                            key={area}
                            onClick={() => {
                              const next = new Set(selectedTemplates);
                              if (isSelected) next.delete(area); else next.add(area);
                              setSelectedTemplates(next);
                            }}
                            disabled={bulkAddMutation.isPending}
                            className={`flex items-center gap-2.5 p-2.5 rounded border transition-colors text-left ${
                              isSelected
                                ? "border-primary/40 bg-primary/5 dark:border-accent/40 dark:bg-accent/5"
                                : "bg-card hover:bg-muted/50 border-border/50"
                            }`}
                            data-testid={`button-template-${prefix}`}
                          >
                            <div className={`w-4 h-4 rounded-sm border flex items-center justify-center shrink-0 transition-colors ${
                              isSelected ? "bg-primary border-primary dark:bg-accent dark:border-accent" : "border-muted-foreground/30"
                            }`}>
                              {isSelected && <Check className="w-3 h-3 text-primary-foreground dark:text-accent-foreground" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1">
                                <span className="text-xs font-medium truncate">{area}</span>
                                <span className="text-[10px] text-muted-foreground font-mono shrink-0">({prefix})</span>
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] text-muted-foreground">{templateCount} reqs</span>
                                {existingCount > 0 && (
                                  <span className="text-[10px] text-amber-600 dark:text-amber-400">{existingCount} already loaded</span>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
          {/* Action bar */}
          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-xs text-muted-foreground">
              {selectedTemplates.size > 0
                ? `${selectedTemplates.size} module${selectedTemplates.size > 1 ? "s" : ""} selected — ${Array.from(selectedTemplates).reduce((sum, m) => sum + (templateCountByModule[m] || 0), 0)} requirements`
                : "No modules selected"}
            </span>
            <Button
              onClick={() => bulkAddMutation.mutate(Array.from(selectedTemplates))}
              disabled={selectedTemplates.size === 0 || bulkAddMutation.isPending}
              className="gap-1.5"
              data-testid="button-load-selected-templates"
            >
              {bulkAddMutation.isPending ? "Loading..." : `Load ${selectedTemplates.size} Module${selectedTemplates.size !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ==================== TEAM MANAGEMENT DIALOG ==================== */}
      <Dialog open={showTeamDialog} onOpenChange={setShowTeamDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Users className="w-4 h-4" />
              Project Team
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Add member */}
            <div className="flex gap-2">
              <Select value={addMemberEmail} onValueChange={setAddMemberEmail}>
                <SelectTrigger className="flex-1 h-8 text-xs">
                  <SelectValue placeholder="Select a user to add..." />
                </SelectTrigger>
                <SelectContent>
                  {allUsers
                    .filter((u: any) => !teamMembers.some((m: any) => m.userId === u.id))
                    .map((u: any) => (
                      <SelectItem key={u.id} value={String(u.id)} className="text-xs">
                        <div className="flex items-center gap-2">
                          {u.picture && <img src={u.picture} alt="" className="w-4 h-4 rounded-full" referrerPolicy="no-referrer" />}
                          {u.name} <span className="text-muted-foreground">({u.email})</span>
                        </div>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Select value={addMemberRole} onValueChange={setAddMemberRole}>
                <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="editor" className="text-xs">Editor</SelectItem>
                  <SelectItem value="viewer" className="text-xs">Viewer</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="h-8 text-xs gap-1"
                disabled={!addMemberEmail || addMemberMutation.isPending}
                onClick={() => addMemberMutation.mutate({ userId: parseInt(addMemberEmail), role: addMemberRole })}
              >
                <Plus className="w-3 h-3" />Add
              </Button>
            </div>

            {/* Members list */}
            {teamMembers.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No team members yet. Add users above to control access.</p>
            ) : (
              <div className="space-y-1.5">
                {teamMembers.map((member: any) => (
                  <div key={member.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
                    {member.userPicture ? (
                      <img src={member.userPicture} alt="" className="w-7 h-7 rounded-full" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                        {member.userName?.[0]?.toUpperCase() || "?"}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{member.userName || "Unknown"}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{member.userEmail}</p>
                    </div>
                    {member.role === "owner" ? (
                      <Badge variant="outline" className="text-[10px] shrink-0">Owner</Badge>
                    ) : (
                      <Select value={member.role} onValueChange={(role) => updateMemberRoleMutation.mutate({ userId: member.userId, role })}>
                        <SelectTrigger className="w-20 h-7 text-[10px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="editor" className="text-xs">Editor</SelectItem>
                          <SelectItem value="viewer" className="text-xs">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    {member.role !== "owner" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeMemberMutation.mutate(member.userId)}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <p className="text-[10px] text-muted-foreground">
              Owners have full control. Editors can modify data. Viewers have read-only access.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* ==================== WORKSHOP DIALOG ==================== */}
      <Dialog open={showWorkshopDialog} onOpenChange={setShowWorkshopDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Stakeholder Workshop
            </DialogTitle>
          </DialogHeader>

          {/* Create new link form */}
          <div className="space-y-3 border rounded-lg p-4 bg-muted/20">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Create Workshop Link</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium mb-1 block">Stakeholder Name *</label>
                <input
                  data-testid="input-workshop-stakeholder-name"
                  type="text"
                  placeholder="e.g., Finance Department"
                  value={wsStakeholderName}
                  onChange={e => setWsStakeholderName(e.target.value)}
                  className="w-full h-8 px-3 text-xs rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Stakeholder Email (optional)</label>
                <input
                  data-testid="input-workshop-stakeholder-email"
                  type="email"
                  placeholder="stakeholder@company.com"
                  value={wsStakeholderEmail}
                  onChange={e => setWsStakeholderEmail(e.target.value)}
                  className="w-full h-8 px-3 text-xs rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium mb-1 block">Link Expires (optional)</label>
              <input
                type="date"
                value={wsExpiresAt}
                onChange={e => setWsExpiresAt(e.target.value)}
                className="w-full h-8 px-3 text-xs rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                min={new Date().toISOString().split('T')[0]}
              />
            </div>

            {/* Module selector */}
            <div>
              <label className="text-xs font-medium mb-1.5 block">Module Scope</label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  data-testid="checkbox-workshop-all-modules"
                  onClick={() => {
                    setWsAllModules(!wsAllModules);
                    if (!wsAllModules) setWsSelectedModules(new Set());
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs transition-colors ${
                    wsAllModules
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  <Layers className="w-3 h-3" />
                  All Modules
                </button>
                {Object.values(moduleTree).flatMap(areas => Object.keys(areas)).map(area => (
                  <button
                    key={area}
                    data-testid={`checkbox-workshop-module-${area.replace(/\s/g, '-').toLowerCase()}`}
                    onClick={() => {
                      if (wsAllModules) return;
                      const next = new Set(wsSelectedModules);
                      if (next.has(area)) next.delete(area); else next.add(area);
                      setWsSelectedModules(next);
                    }}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs transition-colors ${
                      wsAllModules
                        ? "border-border text-muted-foreground opacity-40 cursor-not-allowed"
                        : wsSelectedModules.has(area)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    {area}
                  </button>
                ))}
              </div>
              {!wsAllModules && wsSelectedModules.size === 0 && (
                <p className="text-[11px] text-muted-foreground mt-1">No modules selected — link will show all modules.</p>
              )}
            </div>

            <Button
              data-testid="button-create-workshop-link"
              size="sm"
              disabled={!wsStakeholderName.trim() || createWorkshopLinkMutation.isPending}
              onClick={() => createWorkshopLinkMutation.mutate({
                stakeholderName: wsStakeholderName.trim(),
                stakeholderEmail: wsStakeholderEmail.trim(),
                expiresAt: wsExpiresAt || undefined,
                modules: wsAllModules ? [] : Array.from(wsSelectedModules),
              })}
              className="gap-1.5"
            >
              <LinkIcon className="w-3.5 h-3.5" />
              {createWorkshopLinkMutation.isPending ? "Creating…" : "Create Link"}
            </Button>
          </div>

          {/* Existing links */}
          {workshopLinks.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Existing Links</p>
              {workshopLinks.map((link: any) => {
                // Build URL from current location, stripping any existing hash
                const baseUrl = window.location.href.split('#')[0];
                const workshopUrl = `${baseUrl}#/workshop/${link.token}`;
                const modules: string[] = JSON.parse(link.modules || "[]");
                const isActive = link.isActive === 1;
                return (
                  <div
                    key={link.id}
                    data-testid={`workshop-link-${link.id}`}
                    className={`border rounded-lg p-3 space-y-2 ${
                      isActive ? "bg-card" : "bg-muted/30 opacity-60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-semibold" data-testid={`text-link-stakeholder-${link.id}`}>{link.stakeholderName}</span>
                          {!isActive && <Badge variant="outline" className="text-[10px] px-1">Deactivated</Badge>}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {modules.length > 0 ? modules.join(", ") : "All modules"}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          Created {new Date(link.createdAt).toLocaleDateString()}
                          {link.expiresAt && (
                            <span className={`ml-2 ${new Date(link.expiresAt) < new Date() ? "text-red-500" : ""}`}>
                              · {new Date(link.expiresAt) < new Date() ? "Expired" : `Expires ${new Date(link.expiresAt).toLocaleDateString()}`}
                            </span>
                          )}
                          {link.feedbackSummary && (
                            <span className="ml-2">
                              · {link.feedbackSummary.reviewed} reviewed
                              {link.feedbackSummary.flagged > 0 && `, ${link.feedbackSummary.flagged} flagged`}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">

                        {isActive && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[11px] gap-1 text-destructive hover:text-destructive"
                            data-testid={`button-deactivate-link-${link.id}`}
                            onClick={() => deactivateWorkshopLinkMutation.mutate(link.id)}
                          >
                            <X className="w-3 h-3" />
                            Deactivate
                          </Button>
                        )}
                      </div>
                    </div>
                    {isActive && (
                      <Input
                        readOnly
                        value={workshopUrl}
                        className="text-[11px] font-mono h-8 bg-muted/50 cursor-text"
                        data-testid={`text-link-url-${link.id}`}
                        onClick={(e) => (e.target as HTMLInputElement).select()}
                        onFocus={(e) => (e.target as HTMLInputElement).select()}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {workshopLinks.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No workshop links yet. Create one above.</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Import Requirements Dialog */}
      <Dialog open={showImportDialog} onOpenChange={(open) => { if (!open) { setShowImportDialog(false); } }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="dialog-import-requirements">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Import Requirements — Step {importStep} of 3
            </DialogTitle>
          </DialogHeader>

          {/* Step 1: Upload */}
          {importStep === 1 && (
            <div className="space-y-4">
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => {
                  e.preventDefault(); e.stopPropagation();
                  const file = e.dataTransfer.files[0];
                  if (file) setImportFile(file);
                }}
                onClick={() => document.getElementById("import-file-input")?.click()}
                data-testid="import-dropzone"
              >
                <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-medium">Drag & drop a file here, or click to browse</p>
                <p className="text-xs text-muted-foreground mt-1">Supports .xlsx, .xls, .csv</p>
              </div>
              <input
                id="import-file-input"
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) setImportFile(f); }}
                data-testid="import-file-input"
              />
              {importFile && (
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                  <FileText className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">{importFile.name}</span>
                  <span className="text-xs text-muted-foreground">({(importFile.size / 1024).toFixed(1)} KB)</span>
                  <Button variant="ghost" size="sm" className="ml-auto h-6 px-2" onClick={() => setImportFile(null)}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              )}
              <div className="flex justify-end">
                <Button
                  disabled={!importFile || importUploading}
                  onClick={handleImportUpload}
                  data-testid="button-upload-preview"
                >
                  {importUploading ? "Parsing..." : "Upload & Preview"}
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Column Mapping */}
          {importStep === 2 && (
            <div className="space-y-4">
              {importSheetNames.length > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Sheet:</span>
                  <Select value={importSelectedSheet || importSheetNames[0]} onValueChange={(v) => setImportSelectedSheet(v)}>
                    <SelectTrigger className="w-48 h-8 text-xs" data-testid="import-sheet-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {importSheetNames.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="text-sm font-medium">Map columns to fields:</div>
              <div className="grid grid-cols-2 gap-3">
                {(["reqNumber", "category", "functionalArea", "subCategory", "description", "criticality"] as const).map((field) => {
                  const required = ["reqNumber", "category", "description"].includes(field);
                  const labels: Record<string, string> = {
                    reqNumber: "Req Number", category: "Category / Module", functionalArea: "Functional Area",
                    subCategory: "Sub-Category", description: "Description", criticality: "Criticality",
                  };
                  return (
                    <div key={field} className="space-y-1">
                      <label className="text-xs font-medium">
                        {labels[field]} {required && <span className="text-red-500">*</span>}
                      </label>
                      <Select value={importMapping[field] || "__none__"} onValueChange={(v) => setImportMapping(prev => ({ ...prev, [field]: v === "__none__" ? "" : v }))}>
                        <SelectTrigger className={`h-8 text-xs ${required && !importMapping[field] ? "border-red-300 dark:border-red-800" : ""}`} data-testid={`import-mapping-${field}`}>
                          <SelectValue placeholder="Select column..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— Not mapped —</SelectItem>
                          {importHeaders.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>

              {/* Preview table */}
              <div className="text-sm font-medium">Preview (first 5 rows):</div>
              <div className="border rounded-lg overflow-auto max-h-48">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {importHeaders.map((h) => <TableHead key={h} className="text-[10px] px-2 py-1 whitespace-nowrap">{h}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importRows.slice(0, 5).map((row, i) => (
                      <TableRow key={i}>
                        {importHeaders.map((h) => (
                          <TableCell key={h} className="text-[10px] px-2 py-1 max-w-[150px] truncate">{String(row[h] || "")}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setImportStep(1)} data-testid="button-import-back">Back</Button>
                <Button
                  disabled={!importMapping.reqNumber || !importMapping.category || !importMapping.description}
                  onClick={() => setImportStep(3)}
                  data-testid="button-import-next"
                >
                  Next
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Confirm */}
          {importStep === 3 && (
            <div className="space-y-4">
              <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                <p className="text-sm font-medium">{importRows.length} requirements will be imported into "{project?.name}"</p>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>Mapping:</p>
                  <ul className="list-disc pl-4">
                    {Object.entries(importMapping).filter(([_, v]) => v).map(([k, v]) => (
                      <li key={k}>{k} ← "{v}"</li>
                    ))}
                  </ul>
                </div>
                {(() => {
                  const cats = [...new Set(importRows.map(r => String(r[importMapping.category] || "")).filter(Boolean))];
                  return cats.length > 0 ? (
                    <div className="text-xs">
                      <span className="font-medium">Detected modules:</span>{" "}
                      {cats.slice(0, 8).map(c => <Badge key={c} variant="outline" className="text-[10px] mr-1">{c}</Badge>)}
                      {cats.length > 8 && <span className="text-muted-foreground">+{cats.length - 8} more</span>}
                    </div>
                  ) : null;
                })()}
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setImportStep(2)} data-testid="button-confirm-back">Back</Button>
                <Button
                  disabled={importConfirming}
                  onClick={handleImportConfirm}
                  data-testid="button-import-confirm"
                >
                  {importConfirming ? "Importing..." : `Import ${importRows.length} Requirements`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <ChatPanel projectId={projectId} projectName={project?.name || "Project"} />
    </div>
  );
}
