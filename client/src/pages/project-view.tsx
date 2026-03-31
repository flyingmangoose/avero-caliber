import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Project, Requirement } from "@shared/schema";
import { CATEGORIES, MODULE_PREFIXES } from "@shared/templates";
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
  AlertTriangle,
  Layers,
  X,
  Info,
} from "lucide-react";

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

function CriticalityBadge({ value }: { value: string }) {
  const isCritical = value === "Critical";
  return (
    <Badge
      variant="outline"
      className={`text-[10px] font-semibold px-1.5 py-0 ${
        isCritical
          ? "bg-primary/10 text-primary border-primary/20 dark:bg-accent/15 dark:text-accent dark:border-accent/25"
          : "bg-muted text-muted-foreground border-muted"
      }`}
    >
      {value}
    </Badge>
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
    mutationFn: async (functionalArea: string) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/requirements/bulk`, { functionalArea });
      return res.json();
    },
    onSuccess: (data: Requirement[]) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "requirements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setShowTemplateDialog(false);
      toast({ title: "Templates loaded", description: `Added ${data.length} requirements.` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

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
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="text-[10px] font-semibold uppercase">{project.status}</Badge>
            <span className="text-[10px] text-muted-foreground">{project.stats.totalRequirements} reqs</span>
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2">
            <button
              onClick={() => setSelectedArea(null)}
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
                    onClick={() => setSelectedArea(area)}
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
        {/* Toolbar */}
        <div className="flex items-center gap-2 p-3 border-b shrink-0 bg-background">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search requirements..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs"
              data-testid="input-search-requirements"
            />
          </div>
          <Select value={critFilter} onValueChange={setCritFilter}>
            <SelectTrigger className="w-32 h-8 text-xs" data-testid="select-criticality-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Criticality</SelectItem>
              <SelectItem value="Critical">Critical</SelectItem>
              <SelectItem value="Desired">Desired</SelectItem>
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

        {/* Stats bar */}
        <div className="flex items-center gap-5 px-4 py-2 border-b bg-muted/20 text-xs">
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
              onClick={() => setSelectedArea(null)}
              className="flex items-center gap-1 text-primary dark:text-accent hover:underline ml-auto"
            >
              <X className="w-3 h-3" />
              Clear filter: {selectedArea}
            </button>
          )}
        </div>

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
                  <TableRow key={req.id} className="group" data-testid={`row-requirement-${req.id}`}>
                    <TableCell className="font-mono text-xs font-semibold text-primary dark:text-accent py-2">{req.reqNumber}</TableCell>
                    {!selectedArea && (
                      <TableCell className="text-xs py-2">
                        <button
                          onClick={() => setSelectedArea(req.functionalArea)}
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

      {/* Load Template Dialog */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Load Template Requirements</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-1">
            Select a module to load pre-built government ERP requirements based on Avero's methodology.
          </p>
          <ScrollArea className="max-h-[55vh] pr-2">
            <div className="space-y-4 pt-1">
              {Object.entries(CATEGORIES).map(([category, areas]) => (
                <div key={category}>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{category}</h3>
                  <div className="grid grid-cols-2 gap-1.5">
                    {areas.map((area) => {
                      const prefix = MODULE_PREFIXES[area];
                      const existingCount = allRequirements.filter(r => r.functionalArea === area).length;
                      return (
                        <button
                          key={area}
                          onClick={() => bulkAddMutation.mutate(area)}
                          disabled={bulkAddMutation.isPending}
                          className="flex items-center justify-between p-2.5 rounded border bg-card hover:bg-muted/50 transition-colors text-left group"
                          data-testid={`button-template-${prefix}`}
                        >
                          <div>
                            <span className="text-xs font-medium">{area}</span>
                            <span className="text-[10px] text-muted-foreground ml-1.5 font-mono">({prefix})</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {existingCount > 0 && (
                              <span className="text-[10px] text-muted-foreground">{existingCount} existing</span>
                            )}
                            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
