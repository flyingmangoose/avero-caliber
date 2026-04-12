import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2,
  Trash2,
  Upload,
  FileText,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  RefreshCw,
  Sparkles,
  AlertTriangle,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProjectDocument {
  id: number;
  projectId: number;
  fileName: string;
  fileSize: number | null;
  mimeType: string | null;
  documentType: string;
  source: string;
  rawText: string | null;
  aiAnalysis: string | null;
  analysisStatus: string;
  extractedItems: string | null;
  appliedAt: string | null;
  period: string | null;
  createdAt: string;
}

interface AnalysisResult {
  summary: string;
  overallHealth: string;
  raids: any[];
  budgetItems: any[];
  scheduleItems: any[];
  findings: any[];
  metrics: any;
}

interface ApplyResult {
  applied: {
    raids: any[];
    budgetItems: any[];
    scheduleItems: any[];
    findings: any[];
  };
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DOC_TYPES: { value: string; label: string; color: string }[] = [
  { value: "status_report",   label: "Status Report",    color: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" },
  { value: "raid_log",        label: "RAID Log",         color: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" },
  { value: "risk_register",   label: "Risk Register",    color: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300" },
  { value: "test_results",    label: "Test Results",     color: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300" },
  { value: "budget_report",   label: "Budget Report",    color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
  { value: "schedule_update", label: "Schedule Update",  color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300" },
  { value: "change_request",  label: "Change Request",   color: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300" },
  { value: "meeting_minutes", label: "Meeting Minutes",  color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  { value: "sow_contract",    label: "SOW/Contract",     color: "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300" },
  { value: "other",           label: "Other",            color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
];

const STATUS_COLORS: Record<string, string> = {
  pending:    "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  processing: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  completed:  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  failed:     "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
};

const HEALTH_COLORS: Record<string, string> = {
  critical:    "bg-red-200 text-red-900 dark:bg-red-950/60 dark:text-red-300",
  high:        "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  medium:      "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  low:         "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  satisfactory:"bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  good:        "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  healthy:     "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  at_risk:     "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
};

function docTypeInfo(value: string) {
  return DOC_TYPES.find(d => d.value === value) ?? { label: value, color: "bg-slate-100 text-slate-600" };
}

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
}

// ─── DocumentRow: expandable card for each document ──────────────────────────

function DocumentRow({
  doc,
  projectId,
  onDelete,
  onApplied,
}: {
  doc: ProjectDocument;
  projectId: number;
  onDelete: (id: number) => void;
  onApplied: () => void;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);

  const analysis: AnalysisResult | null = (() => {
    try { return doc.aiAnalysis ? JSON.parse(doc.aiAnalysis) : null; } catch { return null; }
  })();

  const reanalyzeMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/projects/${projectId}/documents/${doc.id}/analyze`).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "documents"] });
      toast({ title: "Re-analysis started" });
    },
    onError: (e: any) => toast({ title: "Re-analyze failed", description: e.message, variant: "destructive" }),
  });

  const applyMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/projects/${projectId}/documents/${doc.id}/apply`).then(r => r.json()),
    onSuccess: (data: ApplyResult) => {
      setApplyResult(data);
      onApplied();
      const { raids = [], budgetItems = [], scheduleItems = [], findings = [] } = data.applied ?? {};
      toast({
        title: "Applied to Health Check",
        description: `${raids.length} RAID items, ${budgetItems.length} budget items, ${scheduleItems.length} milestones, ${findings.length} findings added.`,
      });
    },
    onError: (e: any) => toast({ title: "Apply failed", description: e.message, variant: "destructive" }),
  });

  const typeInfo = docTypeInfo(doc.documentType);

  // Count extracted items from analysis
  const raidCount     = analysis?.raids?.length ?? 0;
  const budgetCount   = analysis?.budgetItems?.length ?? 0;
  const schedCount    = analysis?.scheduleItems?.length ?? 0;
  const findingCount  = analysis?.findings?.length ?? 0;
  const hasItems      = raidCount + budgetCount + schedCount + findingCount > 0;

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      {/* Row header */}
      <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 items-center px-4 py-3 bg-card hover:bg-muted/30 transition-colors">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{doc.fileName}</p>
            {doc.period && <p className="text-sm text-muted-foreground">{doc.period}</p>}
          </div>
        </div>

        <Badge className={`text-xs shrink-0 ${typeInfo.color}`}>{typeInfo.label}</Badge>

        <Badge className={`text-xs shrink-0 capitalize ${STATUS_COLORS[doc.analysisStatus] ?? ""}`}>
          {doc.analysisStatus === "processing" && <Loader2 className="w-2.5 h-2.5 mr-1 animate-spin inline" />}
          {doc.analysisStatus}
        </Badge>

        <span className="text-xs text-muted-foreground shrink-0">{formatDate(doc.createdAt)}</span>

        <div className="flex items-center gap-1 shrink-0">
          {doc.analysisStatus === "completed" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => setExpanded(v => !v)}
              data-testid={`expand-doc-${doc.id}`}
              title="View details"
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </Button>
          )}
          {(doc.analysisStatus === "completed" || doc.analysisStatus === "failed") && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => reanalyzeMutation.mutate()}
              disabled={reanalyzeMutation.isPending}
              data-testid={`reanalyze-doc-${doc.id}`}
              title="Re-analyze"
            >
              {reanalyzeMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-destructive hover:text-destructive"
            onClick={() => onDelete(doc.id)}
            data-testid={`delete-doc-${doc.id}`}
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Expanded analysis panel */}
      {expanded && doc.analysisStatus === "completed" && analysis && (
        <div className="border-t border-border/50 bg-muted/20 px-4 py-4 space-y-4">
          {/* Summary + health */}
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">AI Summary</p>
              <p className="text-sm leading-relaxed">{analysis.summary || "No summary available."}</p>
            </div>
            {analysis.overallHealth && (
              <Badge className={`text-xs capitalize shrink-0 ${HEALTH_COLORS[analysis.overallHealth.toLowerCase()] ?? "bg-slate-100 text-slate-600"}`}>
                {analysis.overallHealth.replace(/_/g, " ")}
              </Badge>
            )}
          </div>

          {/* Extracted item counts */}
          {hasItems && (
            <div className="flex flex-wrap gap-2">
              {raidCount > 0    && <span className="text-xs bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded px-2 py-0.5">{raidCount} RAID item{raidCount !== 1 ? "s" : ""}</span>}
              {budgetCount > 0  && <span className="text-xs bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded px-2 py-0.5">{budgetCount} budget item{budgetCount !== 1 ? "s" : ""}</span>}
              {schedCount > 0   && <span className="text-xs bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded px-2 py-0.5">{schedCount} milestone{schedCount !== 1 ? "s" : ""}</span>}
              {findingCount > 0 && <span className="text-xs bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded px-2 py-0.5">{findingCount} finding{findingCount !== 1 ? "s" : ""}</span>}
            </div>
          )}

          {/* Detailed sections */}
          <ExtractedDetails analysis={analysis} />

          {/* Applied status indicator */}
          {(applyResult || doc.appliedAt) && (
            <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded p-2">
              <Check className="w-3.5 h-3.5 shrink-0" />
              {applyResult
                ? <>Applied: {applyResult.applied.raids ?? 0} RAID, {applyResult.applied.budgetItems ?? 0} budget, {applyResult.applied.scheduleItems ?? 0} schedule, {applyResult.applied.findings ?? 0} findings</>
                : <>Applied on {formatDate(doc.appliedAt!)}</>
              }
            </div>
          )}

          {/* Auto-applied notice or manual apply fallback */}
          {hasItems && !doc.appliedAt && !applyResult && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 rounded p-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              Auto-applying items and synthesizing assessment...
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ExtractedDetails: categorized view of extracted data ────────────────────

function ExtractedDetails({ analysis }: { analysis: AnalysisResult }) {
  const [showRaid, setShowRaid] = useState(false);
  const [showBudget, setShowBudget] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showFindings, setShowFindings] = useState(false);

  return (
    <div className="space-y-2">
      {/* RAID items */}
      {analysis.raids?.length > 0 && (
        <Collapsible
          label={`RAID Items (${analysis.raids.length})`}
          open={showRaid}
          onToggle={() => setShowRaid(v => !v)}
          testId="collapsible-raids"
        >
          <div className="space-y-1">
            {analysis.raids.map((r: any, i: number) => (
              <div key={i} className="text-sm flex gap-2 items-start py-1 border-b border-border/30 last:border-0">
                <Badge variant="outline" className="text-xs capitalize shrink-0 mt-0.5">{r.type ?? "risk"}</Badge>
                <div>
                  <p className="font-medium">{r.title ?? r.description ?? "—"}</p>
                  {r.description && r.title && <p className="text-muted-foreground">{r.description}</p>}
                </div>
                {r.severity && <Badge className={`text-xs ml-auto shrink-0 capitalize ${HEALTH_COLORS[r.severity] ?? ""}`}>{r.severity}</Badge>}
              </div>
            ))}
          </div>
        </Collapsible>
      )}

      {/* Budget items */}
      {analysis.budgetItems?.length > 0 && (
        <Collapsible
          label={`Budget Items (${analysis.budgetItems.length})`}
          open={showBudget}
          onToggle={() => setShowBudget(v => !v)}
          testId="collapsible-budget"
        >
          <div className="space-y-1">
            {analysis.budgetItems.map((b: any, i: number) => (
              <div key={i} className="text-sm flex gap-2 items-center py-1 border-b border-border/30 last:border-0">
                <p className="flex-1">{b.description ?? b.category ?? "—"}</p>
                {b.amount != null && (
                  <span className="font-mono text-emerald-600 dark:text-emerald-400 shrink-0">
                    ${Number(b.amount).toLocaleString()}
                  </span>
                )}
              </div>
            ))}
          </div>
        </Collapsible>
      )}

      {/* Schedule items */}
      {analysis.scheduleItems?.length > 0 && (
        <Collapsible
          label={`Milestones (${analysis.scheduleItems.length})`}
          open={showSchedule}
          onToggle={() => setShowSchedule(v => !v)}
          testId="collapsible-schedule"
        >
          <div className="space-y-1">
            {analysis.scheduleItems.map((s: any, i: number) => (
              <div key={i} className="text-sm flex gap-2 items-center py-1 border-b border-border/30 last:border-0">
                <p className="flex-1">{s.milestone ?? s.name ?? "—"}</p>
                {s.currentDate && <span className="text-muted-foreground shrink-0">{s.currentDate}</span>}
                {s.status && (
                  <Badge variant="outline" className={`text-xs capitalize shrink-0 ${s.status === "delayed" ? "border-red-500 text-red-500" : s.status === "at_risk" ? "border-amber-500 text-amber-500" : s.status === "completed" ? "border-emerald-500 text-emerald-500" : ""}`}>
                    {s.status.replace(/_/g, " ")}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </Collapsible>
      )}

      {/* Findings */}
      {analysis.findings?.length > 0 && (
        <Collapsible
          label={`Findings (${analysis.findings.length})`}
          open={showFindings}
          onToggle={() => setShowFindings(v => !v)}
          testId="collapsible-findings"
        >
          <div className="space-y-1">
            {analysis.findings.map((f: any, i: number) => (
              <div key={i} className="text-sm py-1 border-b border-border/30 last:border-0">
                <p>{typeof f === "string" ? f : (f.description ?? f.text ?? JSON.stringify(f))}</p>
              </div>
            ))}
          </div>
        </Collapsible>
      )}
    </div>
  );
}

// ─── Collapsible helper ───────────────────────────────────────────────────────

function Collapsible({
  label,
  open,
  onToggle,
  children,
  testId,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <div className="border border-border/40 rounded">
      <button
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-left hover:bg-muted/30 transition-colors"
        onClick={onToggle}
        data-testid={testId}
      >
        {label}
        {open ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

// ─── Main DocumentsTab component ─────────────────────────────────────────────

interface QueuedFile {
  id: string;
  file: File;
  documentType: string;
  period: string;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
}

function guessDocType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.includes("raid") || lower.includes("risk register")) return "raid_log";
  if (lower.includes("risk")) return "risk_register";
  if (lower.includes("budget") || lower.includes("financial")) return "budget_report";
  if (lower.includes("schedule") || lower.includes("timeline") || lower.includes("milestone")) return "schedule_update";
  if (lower.includes("test") || lower.includes("uat") || lower.includes("sit")) return "test_results";
  if (lower.includes("change request") || lower.includes("cr")) return "change_request";
  if (lower.includes("meeting") || lower.includes("minutes")) return "meeting_minutes";
  if (lower.includes("sow") || lower.includes("contract")) return "sow_contract";
  if (lower.includes("status") || lower.includes("report")) return "status_report";
  return "status_report";
}

export function DocumentsTab({ projectId, onApplyComplete }: { projectId: number; onApplyComplete?: () => void }) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Form state ──────────────────────────────────────────────────────────────
  const [dragOver, setDragOver]         = useState(false);
  const [fileQueue, setFileQueue]       = useState<QueuedFile[]>([]);
  const [pastedContent, setPastedContent] = useState("");
  const [documentType, setDocumentType] = useState("status_report");
  const [period, setPeriod]             = useState("");
  const [showPasteArea, setShowPasteArea] = useState(false);
  const [isUploading, setIsUploading]   = useState(false);

  // ── Queries ─────────────────────────────────────────────────────────────────
  const { data: documents = [], isLoading } = useQuery<ProjectDocument[]>({
    queryKey: ["/api/projects", projectId, "documents"],
    queryFn: () => apiRequest("GET", `/api/projects/${projectId}/documents`).then(r => r.json()),
    enabled: !!projectId,
    refetchInterval: (query) => {
      // Poll while any document is processing
      const docs = query.state.data as ProjectDocument[] | undefined;
      if (docs?.some(d => d.analysisStatus === "processing")) return 3000;
      return false;
    },
  });

  // ── Upload all queued files ──────────────────────────────────────────────────

  const uploadAll = useCallback(async () => {
    if (fileQueue.length === 0 && !pastedContent.trim()) return;
    setIsUploading(true);

    // Upload pasted content if present
    if (pastedContent.trim() && fileQueue.length === 0) {
      try {
        const createRes = await apiRequest("POST", `/api/projects/${projectId}/documents`, {
          fileName: "Pasted Document",
          documentType,
          rawText: pastedContent,
          period: period || null,
        });
        const created = await createRes.json();
        await apiRequest("POST", `/api/projects/${projectId}/documents/${created.id}/analyze`);
        toast({ title: "Document uploaded", description: "AI analysis started." });
      } catch (e: any) {
        toast({ title: "Upload failed", description: e.message, variant: "destructive" });
      }
    }

    // Upload each queued file
    let successCount = 0;
    for (const qf of fileQueue) {
      setFileQueue(prev => prev.map(f => f.id === qf.id ? { ...f, status: "uploading" as const } : f));
      try {
        const fd = new FormData();
        fd.append("file", qf.file);
        fd.append("documentType", qf.documentType);
        if (qf.period) fd.append("period", qf.period);
        const uploadRes = await fetch(`/api/projects/${projectId}/documents/upload`, {
          method: "POST",
          body: fd,
          credentials: "same-origin",
        });
        if (!uploadRes.ok) {
          const err = await uploadRes.json().catch(() => ({ error: "Upload failed" }));
          throw new Error(err.error || "Upload failed");
        }
        const created = await uploadRes.json();
        // Fire off analysis (don't await — let it process in background)
        apiRequest("POST", `/api/projects/${projectId}/documents/${created.id}/analyze`).catch(() => {});
        setFileQueue(prev => prev.map(f => f.id === qf.id ? { ...f, status: "done" as const } : f));
        successCount++;
      } catch (e: any) {
        setFileQueue(prev => prev.map(f => f.id === qf.id ? { ...f, status: "error" as const, error: e.message } : f));
      }
    }

    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "documents"] });
    if (successCount > 0) {
      toast({ title: `${successCount} document${successCount > 1 ? "s" : ""} uploaded`, description: "AI analysis started. Results will appear shortly." });
    }
    // Clear queue after a moment so user can see status
    setTimeout(() => {
      setFileQueue([]);
      setPastedContent("");
      setPeriod("");
      setShowPasteArea(false);
      setIsUploading(false);
    }, 1500);
  }, [fileQueue, pastedContent, documentType, period, projectId, toast]);

  const deleteDocument = useMutation({
    mutationFn: (docId: number) => apiRequest("DELETE", `/api/projects/${projectId}/documents/${docId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "documents"] });
      toast({ title: "Document deleted" });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  // ── File handling (multi-file) ────────────────────────────────────────────────

  const addFiles = useCallback((files: FileList | File[]) => {
    const newFiles: QueuedFile[] = Array.from(files).map(file => ({
      id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      documentType: guessDocType(file.name),
      period: "",
      status: "queued" as const,
    }));
    setFileQueue(prev => [...prev, ...newFiles]);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) addFiles(e.target.files);
    e.target.value = ""; // Reset so same files can be selected again
  }, [addFiles]);

  const removeFromQueue = useCallback((id: string) => {
    setFileQueue(prev => prev.filter(f => f.id !== id));
  }, []);

  const updateQueueItem = useCallback((id: string, updates: Partial<QueuedFile>) => {
    setFileQueue(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  }, []);

  // ALL hooks are declared above — safe to have conditional rendering below

  return (
    <div className="space-y-6">

      {/* ── Upload Area ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="w-4 h-4 text-accent" />
            Upload Document
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Drag-and-drop zone */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              dragOver
                ? "border-accent bg-accent/5"
                : "border-border/60 hover:border-accent/50 hover:bg-muted/30"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            data-testid="drop-zone"
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              accept=".txt,.csv,.md,.json,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
              onChange={handleFileInput}
              data-testid="file-input"
            />
            <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground font-medium">
              Drop files here or click to browse
            </p>
            <p className="text-sm text-muted-foreground/60 mt-1">
              Select multiple files — PDF, Word, Excel, PowerPoint, CSV, text
            </p>
          </div>

          {/* File queue */}
          {fileQueue.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{fileQueue.length} file{fileQueue.length > 1 ? "s" : ""} ready to upload</p>
              {fileQueue.map(qf => (
                <div key={qf.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-card">
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium truncate flex-1 min-w-0">{qf.file.name}</span>
                  <Select value={qf.documentType} onValueChange={(v) => updateQueueItem(qf.id, { documentType: v })}>
                    <SelectTrigger className="h-7 text-xs w-[140px] shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOC_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {qf.status === "uploading" && <Loader2 className="w-3.5 h-3.5 animate-spin text-accent shrink-0" />}
                  {qf.status === "done" && <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                  {qf.status === "error" && <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" title={qf.error} />}
                  {qf.status === "queued" && (
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0" onClick={() => removeFromQueue(qf.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Toggle paste area */}
          <div>
            <button
              className="text-xs text-accent hover:underline flex items-center gap-1"
              onClick={() => setShowPasteArea(v => !v)}
              data-testid="toggle-paste"
              type="button"
            >
              {showPasteArea ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {showPasteArea ? "Hide" : "Or paste content directly"} (for Fireflies, email, or PDF text)
            </button>

            {showPasteArea && (
              <>
                <div className="grid grid-cols-2 gap-3 mt-2 mb-2">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Document Type</label>
                    <Select value={documentType} onValueChange={setDocumentType}>
                      <SelectTrigger className="h-8 text-xs" data-testid="select-doc-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DOC_TYPES.map(t => (
                          <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Report Period (optional)</label>
                    <Input
                      className="h-8 text-xs"
                      placeholder="e.g. Week ending 3/28/2026"
                      value={period}
                      onChange={e => setPeriod(e.target.value)}
                      data-testid="input-period"
                    />
                  </div>
                </div>
                <Textarea
                  className="text-xs font-mono"
                  rows={8}
                  placeholder="Paste document text here — copied from PDF, Fireflies transcript, email body, etc."
                  value={pastedContent}
                  onChange={e => setPastedContent(e.target.value)}
                  data-testid="textarea-content"
                />
              </>
            )}
          </div>

          {/* Upload & Analyze button */}
          <div className="flex items-center justify-between pt-1">
            <p className="text-sm text-muted-foreground">
              AI will extract data, apply to health check, and update the assessment automatically.
            </p>
            <Button
              size="sm"
              className="bg-accent hover:bg-accent/90 text-accent-foreground text-xs gap-1.5 shrink-0"
              onClick={uploadAll}
              disabled={isUploading || (fileQueue.length === 0 && !pastedContent.trim())}
              data-testid="button-upload-analyze"
            >
              {isUploading
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <Sparkles className="w-3 h-3" />}
              {isUploading ? "Uploading…" : fileQueue.length > 1 ? `Upload & Analyze ${fileQueue.length} Files` : "Upload & Analyze"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Document Library ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4 text-accent" />
            Document Library
            {documents.length > 0 && (
              <Badge variant="outline" className="text-xs ml-1">{documents.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading documents…
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-10">
              <FileText className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
              <p className="text-sm text-muted-foreground/60 mt-1">
                Upload status reports, RAID logs, test results, and more to extract structured data.
              </p>
            </div>
          ) : (
            <div className="space-y-2" data-testid="document-list">
              {/* Table header */}
              <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-4 py-1.5">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">File</span>
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Type</span>
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Status</span>
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Date</span>
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Actions</span>
              </div>

              {documents.map(doc => (
                <DocumentRow
                  key={doc.id}
                  doc={doc}
                  projectId={projectId}
                  onDelete={(id) => deleteDocument.mutate(id)}
                  onApplied={() => {
                    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "raid"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "budget"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "schedule"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "hc-assessments"] });
                    onApplyComplete?.();
                  }}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
