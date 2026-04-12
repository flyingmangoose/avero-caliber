import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Shield,
  ShieldCheck,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Pencil,
  Upload,
  Calendar,
  AlertTriangle,
  CircleAlert,
  Info,
  Eye,
  FileCheck,
  FileText,
  MessageSquare,
  Monitor,
  CheckCircle,
  CheckCircle2,
  BarChart,
  File,
  Loader2,
  X,
  Plug,
  RefreshCw,
  Check,
  ExternalLink,
  Sparkles,
  Target,
  Bell,
  Rocket,
  ArrowRight,
} from "lucide-react";
import { ChatPanel } from "@/components/chat-panel";

// ==================== TYPES ====================

interface ComplianceSummary {
  contracts: any[];
  overallCompliance: number;
  deliverableStats: Record<string, number>;
  openDeviations: Record<string, number>;
  upcomingCheckpoints: any[];
  recentActivity: any[];
}

// ==================== STATUS / CATEGORY BADGES ====================

const DELIVERABLE_STATUS_COLORS: Record<string, string> = {
  accepted: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  delivered: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  in_progress: "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400",
  at_risk: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  non_compliant: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  not_started: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  waived: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

const CATEGORY_COLORS: Record<string, string> = {
  milestone: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400",
  deliverable: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  sla: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  requirement: "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-400",
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  high: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  standard: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  low: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

const CHECKPOINT_STATUS_COLORS: Record<string, string> = {
  upcoming: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  in_progress: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  passed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  passed_with_conditions: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  failed: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  deferred: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

const PHASE_COLORS: Record<string, string> = {
  planning: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  design: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  build: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400",
  testing: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  deployment: "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-400",
  post_go_live: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  major: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  minor: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  observation: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

const DEVIATION_STATUS_COLORS: Record<string, string> = {
  open: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  under_review: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  accepted: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  remediation_planned: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  resolved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  escalated: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400",
};

const DEVIATION_CATEGORY_COLORS: Record<string, string> = {
  scope: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400",
  timeline: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  quality: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  staffing: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  cost: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  sla: "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-400",
  functionality: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400",
};

const EVIDENCE_TYPE_COLORS: Record<string, string> = {
  document: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  meeting_notes: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400",
  demo: "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-400",
  test_result: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  status_report: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  other: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

const ASSESSMENT_RESULT_COLORS: Record<string, string> = {
  supports_compliance: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  partial: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  insufficient: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  contradicts: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
};

const ASSESSMENT_DIMENSIONS = [
  { key: "schedule_discipline", label: "Schedule Discipline" },
  { key: "deliverable_completeness", label: "Deliverable Completeness" },
  { key: "requirements_traceability", label: "Requirements Traceability" },
  { key: "design_architecture", label: "Design & Architecture" },
  { key: "data_migration", label: "Data Strategy & Migration" },
  { key: "defect_management", label: "Defect & Issue Management" },
  { key: "testing_coverage", label: "Testing Coverage" },
] as const;

const DIMENSION_RATING_COLORS: Record<string, string> = {
  satisfactory: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  needs_attention: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  at_risk: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400",
  unsatisfactory: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
};

const GO_LIVE_CRITERIA = [
  { category: "Testing", items: [{ key: "sit_completion", label: "SIT Completion", weight: 10 }, { key: "e2e_testing", label: "E2E Testing", weight: 12 }, { key: "uat_completion", label: "UAT Completion", weight: 12 }, { key: "payroll_compare", label: "Payroll Compare", weight: 8 }] },
  { category: "Defects", items: [{ key: "critical_high_resolution", label: "Critical/High Resolution", weight: 15 }, { key: "burndown_trend", label: "Burn-down Trend", weight: 5 }] },
  { category: "Data", items: [{ key: "migration_quality", label: "Migration Quality", weight: 10 }, { key: "reconciliation", label: "Reconciliation", weight: 5 }] },
  { category: "Cutover", items: [{ key: "plan_completeness", label: "Plan Completeness", weight: 8 }, { key: "rollback_plan", label: "Rollback Plan", weight: 3 }] },
  { category: "Readiness", items: [{ key: "training", label: "Training", weight: 5 }, { key: "support_model", label: "Support Model", weight: 4 }, { key: "hypercare_plan", label: "Hypercare Plan", weight: 3 }] },
];

const READINESS_COLORS: Record<string, string> = {
  ready: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  ready_with_conditions: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  not_ready: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  critical_hold: "bg-red-200 text-red-900 dark:bg-red-950/60 dark:text-red-300",
};

function EvidenceTypeIcon({ type }: { type: string }) {
  switch (type) {
    case "document": return <FileText className="w-4 h-4 text-blue-500" />;
    case "meeting_notes": return <MessageSquare className="w-4 h-4 text-purple-500" />;
    case "demo": return <Monitor className="w-4 h-4 text-teal-500" />;
    case "test_result": return <CheckCircle className="w-4 h-4 text-emerald-500" />;
    case "status_report": return <BarChart className="w-4 h-4 text-amber-500" />;
    default: return <File className="w-4 h-4 text-gray-400" />;
  }
}

function formatLabel(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
}

function SeverityIcon({ severity }: { severity: string }) {
  switch (severity) {
    case "critical": return <CircleAlert className="w-4 h-4 text-red-500" />;
    case "major": return <AlertTriangle className="w-4 h-4 text-amber-500" />;
    case "minor": return <Info className="w-4 h-4 text-blue-500" />;
    default: return <Eye className="w-4 h-4 text-gray-400" />;
  }
}

// ==================== COMPLIANCE RING ====================

function ComplianceRing({ value }: { value: number }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const color = value >= 80 ? "#22c55e" : value >= 60 ? "#d4a853" : "#ef4444";

  return (
    <svg width="88" height="88" viewBox="0 0 88 88">
      <circle cx="44" cy="44" r={radius} fill="none" stroke="hsl(var(--border))" strokeWidth="6" />
      <circle
        cx="44" cy="44" r={radius} fill="none"
        stroke={color} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={offset}
        transform="rotate(-90 44 44)"
      />
      <text x="44" y="44" textAnchor="middle" dominantBaseline="central" className="fill-foreground text-lg font-bold">
        {value}%
      </text>
    </svg>
  );
}

// ==================== KPI CARDS ====================

function KpiCards({ summary }: { summary: ComplianceSummary | undefined }) {
  if (!summary) return null;

  const { overallCompliance, deliverableStats, openDeviations, upcomingCheckpoints } = summary;
  const totalDev = deliverableStats.total || 0;
  const nextCp = upcomingCheckpoints[0];
  const totalOpenDev = (openDeviations.critical || 0) + (openDeviations.major || 0) + (openDeviations.minor || 0) + (openDeviations.observation || 0);

  return (
    <div className="grid grid-cols-4 gap-4">
      {/* Compliance % */}
      <Card data-testid="kpi-compliance">
        <CardContent className="pt-4 pb-4 flex items-center gap-4">
          {totalDev > 0 ? <ComplianceRing value={overallCompliance} /> : (
            <div className="w-[88px] h-[88px] flex items-center justify-center">
              <span className="text-2xl font-bold text-muted-foreground">N/A</span>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase">Overall Compliance</p>
            <p className="text-sm text-foreground mt-0.5">{totalDev > 0 ? `${overallCompliance}% complete` : "No deliverables yet"}</p>
          </div>
        </CardContent>
      </Card>

      {/* Deliverables */}
      <Card data-testid="kpi-deliverables">
        <CardContent className="pt-4 pb-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase">Deliverables</p>
          <p className="text-lg font-bold mt-1">{deliverableStats.accepted || 0} <span className="text-sm font-normal text-muted-foreground">of {totalDev} accepted</span></p>
          {totalDev > 0 && (
            <div className="flex h-2 rounded-full overflow-hidden mt-2 bg-gray-100 dark:bg-gray-800">
              {(["accepted", "delivered", "in_progress", "at_risk", "non_compliant", "not_started"] as const).map(status => {
                const count = deliverableStats[status] || 0;
                if (count === 0) return null;
                const pct = (count / totalDev) * 100;
                const colors: Record<string, string> = { accepted: "#22c55e", delivered: "#3b82f6", in_progress: "#0ea5e9", at_risk: "#d4a853", non_compliant: "#ef4444", not_started: "#9ca3af" };
                return <div key={status} style={{ width: `${pct}%`, backgroundColor: colors[status] }} />;
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Open Deviations */}
      <Card data-testid="kpi-deviations">
        <CardContent className="pt-4 pb-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase">Open Deviations</p>
          <p className="text-lg font-bold mt-1">{totalOpenDev}</p>
          <div className="flex gap-2 mt-2">
            {openDeviations.critical ? <span className="flex items-center gap-1 text-xs"><span className="w-2 h-2 rounded-full bg-red-500" />{openDeviations.critical} critical</span> : null}
            {openDeviations.major ? <span className="flex items-center gap-1 text-xs"><span className="w-2 h-2 rounded-full bg-amber-500" />{openDeviations.major} major</span> : null}
            {openDeviations.minor ? <span className="flex items-center gap-1 text-xs"><span className="w-2 h-2 rounded-full bg-blue-500" />{openDeviations.minor} minor</span> : null}
          </div>
        </CardContent>
      </Card>

      {/* Next Checkpoint */}
      <Card data-testid="kpi-checkpoint">
        <CardContent className="pt-4 pb-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase">Next Checkpoint</p>
          {nextCp ? (
            <>
              <p className="text-base font-semibold mt-1">{nextCp.name}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><Calendar className="w-3 h-3" />{nextCp.scheduledDate || "No date set"}</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground mt-1">None scheduled</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ==================== PULSE REPORT CARD ====================

function PulseReportCard({ contractId }: { contractId: number }) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);

  const { data: reports } = useQuery<any[]>({
    queryKey: ["/api/contracts", contractId, "pulse-reports"],
    queryFn: () => apiRequest("GET", `/api/contracts/${contractId}/pulse-reports`).then(r => r.json()),
    enabled: !!contractId,
  });

  const generateMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/contracts/${contractId}/pulse-report/generate`).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "pulse-reports"] });
      toast({ title: "Pulse report generated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const latest = reports?.[0];
  const postureColors: Record<string, string> = { green: "bg-emerald-500", yellow: "bg-amber-500", red: "bg-red-500" };
  const postureText: Record<string, string> = { green: "text-emerald-700 dark:text-emerald-400", yellow: "text-amber-700 dark:text-amber-400", red: "text-red-700 dark:text-red-400" };
  const trendArrow: Record<string, string> = { improving: "↑", stable: "→", declining: "↓" };

  return (
    <Card className="mb-4" data-testid="pulse-report-card">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Latest Pulse</h4>
          <Button size="sm" className="gap-1.5 bg-accent hover:bg-accent/90 text-accent-foreground text-xs h-7" disabled={generateMutation.isPending}
            onClick={() => generateMutation.mutate()} data-testid="button-generate-pulse">
            {generateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            {latest ? "Generate New" : "Generate First Report"}
          </Button>
        </div>
        {latest ? (
          <div className="flex items-start gap-4">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center text-white text-lg font-bold ${postureColors[latest.overallPosture] || "bg-gray-500"}`}>
                {latest.overallPosture?.toUpperCase()?.[0]}
              </div>
              <span className={`text-xs font-medium ${postureText[latest.overallPosture] || ""}`}>
                {trendArrow[latest.postureTrend] || "→"} {formatLabel(latest.postureTrend || "stable")}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-xs text-muted-foreground">Week ending {latest.weekEnding}</span>
              <p className="text-sm mt-1 text-foreground/80 whitespace-pre-wrap">
                {expanded ? latest.narrative : (latest.narrative?.slice(0, 200) + (latest.narrative?.length > 200 ? "..." : ""))}
              </p>
              {latest.narrative?.length > 200 && (
                <button className="text-xs text-accent mt-1 hover:underline" onClick={() => setExpanded(!expanded)}>
                  {expanded ? "Show less" : "Read more"}
                </button>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No pulse reports yet. Generate your first report to see compliance posture.</p>
        )}
      </CardContent>
    </Card>
  );
}

// ==================== ESCALATION BANNER ====================

function EscalationBanner({ projectId }: { projectId: number }) {
  const { toast } = useToast();
  const { data: escalations } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "escalation-status"],
    queryFn: () => apiRequest("GET", `/api/projects/${projectId}/escalation-status`).then(r => r.json()),
    enabled: !!projectId,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/deviations/${id}/acknowledge`).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "escalation-status"] });
      toast({ title: "Escalation acknowledged" });
    },
  });

  const overdue = useMemo(() => {
    if (!escalations) return [];
    const now = new Date();
    return escalations.filter((e: any) => e.escalationDue && new Date(e.escalationDue) < now && e.escalationStatus === "pending");
  }, [escalations]);

  if (overdue.length === 0) return null;

  const mostCritical = overdue.sort((a: any, b: any) => {
    const order: Record<string, number> = { critical: 0, major: 1, minor: 2, observation: 3 };
    return (order[a.severity] ?? 9) - (order[b.severity] ?? 9);
  })[0];

  return (
    <div className="mb-4 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-4 py-3" data-testid="escalation-banner">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-red-500" />
          <span className="text-base font-semibold text-red-700 dark:text-red-400">
            {overdue.length} overdue escalation{overdue.length > 1 ? "s" : ""}
          </span>
          <span className="text-xs text-red-600/80 dark:text-red-400/80">— {mostCritical.title} ({mostCritical.severity})</span>
        </div>
        <div className="flex gap-1">
          {overdue.slice(0, 3).map((e: any) => (
            <Button key={e.id} size="sm" variant="outline" className="h-6 text-xs border-red-300 text-red-700 hover:bg-red-100 dark:border-red-800 dark:text-red-400"
              onClick={() => acknowledgeMutation.mutate(e.id)} data-testid={`ack-escalation-${e.id}`}>
              Ack: {e.title.slice(0, 20)}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ==================== TAB 1: CONTRACT BASELINE ====================

function ContractBaselineTab({ projectId, contracts, vendors }: { projectId: number; contracts: any[]; vendors: any[] }) {
  const { toast } = useToast();
  const [contractDialogOpen, setContractDialogOpen] = useState(false);
  const [deliverableDialogOpen, setDeliverableDialogOpen] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [editingContract, setEditingContract] = useState<any>(null);

  // Form state
  const [contractForm, setContractForm] = useState({ contractName: "", vendorId: "", contractDate: "", totalValue: "", startDate: "", endDate: "", notes: "" });
  const [deliverableForm, setDeliverableForm] = useState({ category: "deliverable", name: "", description: "", dueDate: "", priority: "standard", contractReference: "", notes: "" });

  const contract = contracts[0]; // Primary contract

  // Fetch contract details
  const { data: contractDetails } = useQuery<any>({
    queryKey: ["/api/contracts", contract?.id],
    queryFn: () => apiRequest("GET", `/api/contracts/${contract.id}`).then(r => r.json()),
    enabled: !!contract,
  });

  const createContractMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/projects/${projectId}/contracts`, data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "compliance-summary"] });
      setContractDialogOpen(false);
      setContractForm({ contractName: "", vendorId: "", contractDate: "", totalValue: "", startDate: "", endDate: "", notes: "" });
      toast({ title: "Contract created" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteContractMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/contracts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "compliance-summary"] });
      toast({ title: "Contract deleted" });
    },
  });

  const createDeliverableMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/contracts/${contract.id}/deliverables`, data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contract.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "compliance-summary"] });
      setDeliverableDialogOpen(false);
      setDeliverableForm({ category: "deliverable", name: "", description: "", dueDate: "", priority: "standard", contractReference: "", notes: "" });
      toast({ title: "Deliverable created" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateDeliverableMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/deliverables/${id}`, data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contract?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "compliance-summary"] });
    },
  });

  const deleteDeliverableMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/deliverables/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contract?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "compliance-summary"] });
      toast({ title: "Deliverable deleted" });
    },
  });

  const deliverables = contractDetails?.deliverables || [];
  const filteredDeliverables = deliverables.filter((d: any) => {
    if (statusFilter !== "all" && d.status !== statusFilter) return false;
    if (categoryFilter !== "all" && d.category !== categoryFilter) return false;
    return true;
  });

  const toggleRow = (id: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Empty state
  if (!contract) {
    return (
      <div className="flex flex-col items-center py-12 gap-4">
        <Shield className="w-12 h-12 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No contracts added yet</p>
        <Button className="bg-accent hover:bg-accent/90 text-accent-foreground gap-2" onClick={() => setContractDialogOpen(true)} data-testid="button-add-contract-empty">
          <Plus className="w-4 h-4" /> Add Contract
        </Button>
        <Button variant="outline" className="gap-2" data-testid="button-seed-ivv" onClick={() => {
          apiRequest("POST", `/api/projects/${projectId}/seed-ivv-data`).then(() => {
            queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
            toast({ title: "Sample IV&V data loaded" });
          }).catch((err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }));
        }}>
          <Sparkles className="w-4 h-4" /> Load Sample IV&V Data
        </Button>
        <ContractDialog
          open={contractDialogOpen}
          onOpenChange={setContractDialogOpen}
          form={contractForm}
          setForm={setContractForm}
          onSubmit={() => createContractMutation.mutate(contractForm.vendorId ? { ...contractForm, vendorId: parseInt(contractForm.vendorId) } : { ...contractForm, vendorId: null })}
          isPending={createContractMutation.isPending}
          vendors={vendors}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Pulse Report */}
      <PulseReportCard contractId={contract.id} />

      {/* Contract Summary */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold">{contract.contractName}</h3>
              <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                {contract.totalValue && <span>Value: {contract.totalValue}</span>}
                {contract.startDate && <span>Start: {contract.startDate}</span>}
                {contract.endDate && <span>End: {contract.endDate}</span>}
              </div>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteContractMutation.mutate(contract.id)} data-testid="button-delete-contract">
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters + Add */}
      <div className="flex items-center gap-2">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[140px] h-8 text-xs" data-testid="filter-category">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {["milestone", "deliverable", "sla", "requirement"].map(c => (
              <SelectItem key={c} value={c}>{formatLabel(c)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px] h-8 text-xs" data-testid="filter-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {["not_started", "in_progress", "delivered", "accepted", "at_risk", "non_compliant", "waived"].map(s => (
              <SelectItem key={s} value={s}>{formatLabel(s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button size="sm" className="gap-1.5 bg-accent hover:bg-accent/90 text-accent-foreground text-xs" onClick={() => setDeliverableDialogOpen(true)} data-testid="button-add-deliverable">
          <Plus className="w-3.5 h-3.5" /> Add Deliverable
        </Button>
      </div>

      {/* Deliverables Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-16">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDeliverables.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">No deliverables found</TableCell></TableRow>
            ) : filteredDeliverables.map((d: any) => (
              <Collapsible key={d.id} open={expandedRows.has(d.id)} onOpenChange={() => toggleRow(d.id)} asChild>
                <>
                  <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => toggleRow(d.id)} data-testid={`deliverable-row-${d.id}`}>
                    <TableCell>
                      <CollapsibleTrigger asChild>
                        <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${expandedRows.has(d.id) ? "rotate-90" : ""}`} />
                      </CollapsibleTrigger>
                    </TableCell>
                    <TableCell className="font-medium text-sm">{d.name}</TableCell>
                    <TableCell><Badge className={`text-xs ${CATEGORY_COLORS[d.category] || ""}`}>{formatLabel(d.category)}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{d.dueDate || "—"}</TableCell>
                    <TableCell><Badge className={`text-xs ${PRIORITY_COLORS[d.priority] || ""}`}>{formatLabel(d.priority)}</Badge></TableCell>
                    <TableCell>
                      <Select value={d.status} onValueChange={(val) => { updateDeliverableMutation.mutate({ id: d.id, data: { status: val, completedDate: val === "accepted" ? new Date().toISOString().split("T")[0] : d.completedDate } }); }}>
                        <SelectTrigger className="h-6 w-[130px] text-xs px-2" data-testid={`status-select-${d.id}`}>
                          <Badge className={`text-xs ${DELIVERABLE_STATUS_COLORS[d.status] || ""}`}>{formatLabel(d.status)}</Badge>
                        </SelectTrigger>
                        <SelectContent>
                          {["not_started", "in_progress", "delivered", "accepted", "at_risk", "non_compliant", "waived"].map(s => (
                            <SelectItem key={s} value={s}>{formatLabel(s)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); deleteDeliverableMutation.mutate(d.id); }} data-testid={`delete-deliverable-${d.id}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  <CollapsibleContent asChild>
                    <TableRow>
                      <TableCell colSpan={7} className="bg-muted/30 px-8 py-3">
                        <div className="space-y-2 text-sm">
                          {d.description && <div><span className="font-semibold text-muted-foreground">Description:</span> <span className="text-foreground">{d.description}</span></div>}
                          {d.contractReference && <div><span className="font-semibold text-muted-foreground">Contract Ref:</span> <span className="text-foreground">{d.contractReference}</span></div>}
                          {d.notes && <div><span className="font-semibold text-muted-foreground">Notes:</span> <span className="text-foreground">{d.notes}</span></div>}
                          <DeliverableEvidence deliverableId={d.id} projectId={projectId} />
                        </div>
                      </TableCell>
                    </TableRow>
                  </CollapsibleContent>
                </>
              </Collapsible>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Deliverable Dialog */}
      <Dialog open={deliverableDialogOpen} onOpenChange={setDeliverableDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Deliverable</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Name *" value={deliverableForm.name} onChange={e => setDeliverableForm(p => ({ ...p, name: e.target.value }))} data-testid="input-deliverable-name" />
            <Select value={deliverableForm.category} onValueChange={v => setDeliverableForm(p => ({ ...p, category: v }))}>
              <SelectTrigger data-testid="select-deliverable-category"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["milestone", "deliverable", "sla", "requirement"].map(c => <SelectItem key={c} value={c}>{formatLabel(c)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Textarea placeholder="Description" value={deliverableForm.description} onChange={e => setDeliverableForm(p => ({ ...p, description: e.target.value }))} data-testid="input-deliverable-description" />
            <div className="grid grid-cols-2 gap-3">
              <Input type="date" value={deliverableForm.dueDate} onChange={e => setDeliverableForm(p => ({ ...p, dueDate: e.target.value }))} data-testid="input-deliverable-due-date" />
              <Select value={deliverableForm.priority} onValueChange={v => setDeliverableForm(p => ({ ...p, priority: v }))}>
                <SelectTrigger data-testid="select-deliverable-priority"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["critical", "high", "standard", "low"].map(p => <SelectItem key={p} value={p}>{formatLabel(p)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Input placeholder="Contract Reference (section/page)" value={deliverableForm.contractReference} onChange={e => setDeliverableForm(p => ({ ...p, contractReference: e.target.value }))} data-testid="input-deliverable-ref" />
            <Textarea placeholder="Notes" value={deliverableForm.notes} onChange={e => setDeliverableForm(p => ({ ...p, notes: e.target.value }))} data-testid="input-deliverable-notes" />
            <Button className="w-full bg-accent hover:bg-accent/90 text-accent-foreground" disabled={!deliverableForm.name || createDeliverableMutation.isPending} onClick={() => createDeliverableMutation.mutate(deliverableForm)} data-testid="button-save-deliverable">
              {createDeliverableMutation.isPending ? "Creating..." : "Add Deliverable"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Contract Dialog */}
      <ContractDialog
        open={contractDialogOpen}
        onOpenChange={setContractDialogOpen}
        form={contractForm}
        setForm={setContractForm}
        onSubmit={() => createContractMutation.mutate(contractForm.vendorId ? { ...contractForm, vendorId: parseInt(contractForm.vendorId) } : { ...contractForm, vendorId: null })}
        isPending={createContractMutation.isPending}
        vendors={vendors}
      />
    </div>
  );
}

// ==================== DELIVERABLE EVIDENCE ====================

function DeliverableEvidence({ deliverableId, projectId }: { deliverableId: number; projectId: number }) {
  const { toast } = useToast();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [form, setForm] = useState({ type: "document", title: "", description: "" });

  const { data: evidence } = useQuery<any[]>({
    queryKey: ["/api/deliverables", deliverableId, "evidence"],
    queryFn: () => apiRequest("GET", `/api/deliverables/${deliverableId}/evidence`).then(r => r.json()),
  });

  const uploadMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/deliverables/${deliverableId}/evidence`, data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deliverables", deliverableId, "evidence"] });
      setUploadOpen(false);
      setForm({ type: "document", title: "", description: "" });
      toast({ title: "Evidence added" });
    },
  });

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-1">
        <span className="font-semibold text-muted-foreground text-xs uppercase">Evidence ({evidence?.length || 0})</span>
        <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => setUploadOpen(!uploadOpen)} data-testid={`upload-evidence-${deliverableId}`}>
          <Upload className="w-3 h-3" /> Add
        </Button>
      </div>
      {evidence && evidence.length > 0 && (
        <div className="space-y-1">
          {evidence.map((e: any) => (
            <div key={e.id} className="flex items-center gap-2 text-sm">
              <Badge className={`text-xs ${EVIDENCE_TYPE_COLORS[e.type] || ""}`}>{formatLabel(e.type)}</Badge>
              <span>{e.title}</span>
              {e.assessmentResult && <Badge variant="outline" className="text-xs">{formatLabel(e.assessmentResult)}</Badge>}
            </div>
          ))}
        </div>
      )}
      {uploadOpen && (
        <div className="mt-2 p-2 border rounded-md space-y-2 bg-background">
          <Input placeholder="Title *" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} className="h-7 text-xs" data-testid={`evidence-title-${deliverableId}`} />
          <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v }))}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["document", "meeting_notes", "demo", "test_result", "status_report", "other"].map(t => <SelectItem key={t} value={t}>{formatLabel(t)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input placeholder="Description" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="h-7 text-xs" />
          <Button size="sm" className="h-7 text-xs bg-accent hover:bg-accent/90 text-accent-foreground" disabled={!form.title} onClick={() => uploadMutation.mutate(form)} data-testid={`save-evidence-${deliverableId}`}>Save</Button>
        </div>
      )}
    </div>
  );
}

// ==================== CONTRACT DIALOG ====================

function ContractDialog({ open, onOpenChange, form, setForm, onSubmit, isPending, vendors }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  form: any; setForm: (fn: any) => void;
  onSubmit: () => void; isPending: boolean; vendors: any[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Contract</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Contract Name *" value={form.contractName} onChange={e => setForm((p: any) => ({ ...p, contractName: e.target.value }))} data-testid="input-contract-name" />
          <Select value={form.vendorId} onValueChange={v => setForm((p: any) => ({ ...p, vendorId: v }))}>
            <SelectTrigger data-testid="select-contract-vendor"><SelectValue placeholder="Select Vendor" /></SelectTrigger>
            <SelectContent>
              {vendors.map((v: any) => <SelectItem key={v.id} value={v.id.toString()}>{v.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-muted-foreground">Contract Date</label><Input type="date" value={form.contractDate} onChange={e => setForm((p: any) => ({ ...p, contractDate: e.target.value }))} data-testid="input-contract-date" /></div>
            <div><label className="text-xs text-muted-foreground">Total Value</label><Input placeholder="$0" value={form.totalValue} onChange={e => setForm((p: any) => ({ ...p, totalValue: e.target.value }))} data-testid="input-contract-value" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-muted-foreground">Start Date</label><Input type="date" value={form.startDate} onChange={e => setForm((p: any) => ({ ...p, startDate: e.target.value }))} data-testid="input-contract-start" /></div>
            <div><label className="text-xs text-muted-foreground">End Date</label><Input type="date" value={form.endDate} onChange={e => setForm((p: any) => ({ ...p, endDate: e.target.value }))} data-testid="input-contract-end" /></div>
          </div>
          <Textarea placeholder="Notes" value={form.notes} onChange={e => setForm((p: any) => ({ ...p, notes: e.target.value }))} data-testid="input-contract-notes" />
          <Button className="w-full bg-accent hover:bg-accent/90 text-accent-foreground" disabled={!form.contractName || isPending} onClick={onSubmit} data-testid="button-save-contract">
            {isPending ? "Creating..." : "Add Contract"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ==================== CHECKPOINT ASSESSMENT DIMENSIONS (per-checkpoint fetch) ====================

function CheckpointAssessmentDimensions({ checkpointId }: { checkpointId: number }) {
  const { data: assessment } = useQuery<any[]>({
    queryKey: ["/api/checkpoints", checkpointId, "assessment"],
    queryFn: () => apiRequest("GET", `/api/checkpoints/${checkpointId}/assessment`).then(r => r.json()),
  });

  if (!assessment || assessment.length === 0) return null;

  const ratings = assessment.map((a: any) => a.rating);
  const overall = ratings.some((r: string) => r === "at_risk" || r === "unsatisfactory") ? "Not Ready"
    : ratings.some((r: string) => r === "needs_attention") ? "Passed with Conditions" : "Passed";
  const overallColor = overall === "Passed" ? "bg-emerald-100 text-emerald-700" : overall === "Passed with Conditions" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";

  return (
    <div className="mt-2 pt-2 border-t">
      <div className="flex items-center gap-2 mb-2">
        <span className="font-semibold text-muted-foreground">Structured Assessment:</span>
        <Badge className={`text-xs ${overallColor}`}>{overall}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {assessment.map((a: any) => {
          const dimLabel = ASSESSMENT_DIMENSIONS.find(d => d.key === a.dimension)?.label || a.dimension;
          return (
            <div key={a.dimension} className="flex items-center gap-1.5 px-2 py-1 rounded border border-border/50 bg-muted/20">
              <Badge className={`text-xs shrink-0 ${DIMENSION_RATING_COLORS[a.rating] || ""}`}>{formatLabel(a.rating)}</Badge>
              <span className="text-xs truncate">{dimLabel}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==================== TAB 2: IV&V ASSESSMENTS ====================

function CheckpointsTab({ contractId, projectId }: { contractId: number | null; projectId: number }) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const toggleExpanded = (id: number) => setExpandedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const [form, setForm] = useState({ name: "", phase: "planning", scheduledDate: "", status: "upcoming", overallAssessment: "", recommendations: "" as string, findings: "" as string });
  const [assessmentForm, setAssessmentForm] = useState<Record<string, { rating: string; observation: string; recommendation: string }>>(
    Object.fromEntries(ASSESSMENT_DIMENSIONS.map(d => [d.key, { rating: "", observation: "", recommendation: "" }]))
  );

  // Fetch assessment for editing checkpoint
  const { data: editingAssessment } = useQuery<any[]>({
    queryKey: ["/api/checkpoints", editingId, "assessment"],
    queryFn: () => apiRequest("GET", `/api/checkpoints/${editingId}/assessment`).then(r => r.json()),
    enabled: !!editingId,
  });

  // Load existing assessment into form when editing
  useEffect(() => {
    if (editingAssessment && editingAssessment.length > 0) {
      const loaded: Record<string, { rating: string; observation: string; recommendation: string }> = {};
      for (const d of ASSESSMENT_DIMENSIONS) {
        const existing = editingAssessment.find((a: any) => a.dimension === d.key);
        loaded[d.key] = { rating: existing?.rating || "", observation: existing?.observation || "", recommendation: existing?.recommendation || "" };
      }
      setAssessmentForm(loaded);
    }
  }, [editingAssessment]);

  const saveAssessmentMutation = useMutation({
    mutationFn: ({ checkpointId, dimensions }: { checkpointId: number; dimensions: any[] }) =>
      apiRequest("POST", `/api/checkpoints/${checkpointId}/assessment`, { dimensions }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checkpoints"] });
      toast({ title: "Assessment saved" });
    },
  });

  const [autoAssessing, setAutoAssessing] = useState<number | null>(null);
  const autoAssessCheckpoint = async (checkpointId: number) => {
    setAutoAssessing(checkpointId);
    try {
      const res = await apiRequest("POST", `/api/checkpoints/${checkpointId}/auto-assess`);
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/checkpoints"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      // Load the AI results into the form if editing this checkpoint
      if (editingId === checkpointId && data.dimensions) {
        const newForm: any = {};
        for (const d of data.dimensions) {
          newForm[d.dimension] = { rating: d.rating, observation: d.observation, recommendation: d.recommendation };
        }
        setAssessmentForm(newForm);
        setForm((prev: any) => ({ ...prev, overallAssessment: data.overallAssessment || prev.overallAssessment, recommendations: data.recommendations || prev.recommendations, findings: data.findings || prev.findings }));
      }
      toast({ title: "AI assessment complete" });
    } catch (e: any) {
      toast({ title: "Auto-assess failed", description: e.message, variant: "destructive" });
    }
    setAutoAssessing(null);
  };

  const PRESETS = [
    "Requirements Validation", "Design Review", "Configuration Review", "Data Migration Review",
    "Integration Testing Review", "UAT Readiness", "Go-Live Readiness", "Post Go-Live Assessment",
  ];

  const { data: checkpoints } = useQuery<any[]>({
    queryKey: ["/api/contracts", contractId, "checkpoints"],
    queryFn: () => apiRequest("GET", `/api/contracts/${contractId}/checkpoints`).then(r => r.json()),
    enabled: !!contractId,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/contracts/${contractId}/checkpoints`, data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "checkpoints"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "compliance-summary"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: "Checkpoint created" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/checkpoints/${id}`, data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "checkpoints"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "compliance-summary"] });
      setDialogOpen(false);
      setEditingId(null);
      resetForm();
      toast({ title: "Checkpoint updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/checkpoints/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "checkpoints"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "compliance-summary"] });
      toast({ title: "Checkpoint deleted" });
    },
  });

  function resetForm() {
    setForm({ name: "", phase: "planning", scheduledDate: "", status: "upcoming", overallAssessment: "", recommendations: "", findings: "" });
    setAssessmentForm(Object.fromEntries(ASSESSMENT_DIMENSIONS.map(d => [d.key, { rating: "", observation: "", recommendation: "" }])));
  }

  function openEdit(cp: any) {
    setEditingId(cp.id);
    setForm({
      name: cp.name,
      phase: cp.phase,
      scheduledDate: cp.scheduledDate || "",
      status: cp.status,
      overallAssessment: cp.overallAssessment || "",
      recommendations: cp.recommendations ? (typeof cp.recommendations === "string" ? cp.recommendations : JSON.stringify(cp.recommendations)) : "",
      findings: cp.findings ? (typeof cp.findings === "string" ? cp.findings : JSON.stringify(cp.findings)) : "",
    });
    setDialogOpen(true);
  }

  if (!contractId) {
    return <div className="text-center py-8 text-sm text-muted-foreground">Add a contract first to create checkpoints.</div>;
  }

  const CHECKPOINT_DOT_COLORS: Record<string, string> = {
    upcoming: "bg-gray-300 dark:bg-gray-600",
    in_progress: "bg-blue-500",
    passed: "bg-emerald-500",
    passed_with_conditions: "bg-amber-500",
    failed: "bg-red-500",
    deferred: "bg-slate-400",
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5 bg-accent hover:bg-accent/90 text-accent-foreground text-xs" onClick={() => { resetForm(); setEditingId(null); setDialogOpen(true); }} data-testid="button-add-checkpoint">
          <Plus className="w-3.5 h-3.5" /> Add Checkpoint
        </Button>
      </div>

      {/* Timeline */}
      <div className="space-y-0">
        {(!checkpoints || checkpoints.length === 0) ? (
          <div className="text-center py-8 text-sm text-muted-foreground">No checkpoints yet</div>
        ) : checkpoints.map((cp: any, idx: number) => (
          <div key={cp.id} className="flex gap-4" data-testid={`checkpoint-${cp.id}`}>
            {/* Timeline line + dot */}
            <div className="flex flex-col items-center w-6 shrink-0">
              <div className={`w-3 h-3 rounded-full mt-4 ${CHECKPOINT_DOT_COLORS[cp.status] || "bg-gray-300"}`} />
              {idx < checkpoints.length - 1 && <div className="w-0.5 flex-1 bg-border/60" />}
            </div>
            {/* Card */}
            <Card className="flex-1 mb-3">
              <CardContent className="pt-3 pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold">{cp.name}</span>
                    <Badge className={`text-xs ${PHASE_COLORS[cp.phase] || ""}`}>{formatLabel(cp.phase)}</Badge>
                    <Badge className={`text-xs ${CHECKPOINT_STATUS_COLORS[cp.status] || ""}`}>{formatLabel(cp.status)}</Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    {cp.scheduledDate && <span className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" />{cp.scheduledDate}</span>}
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => autoAssessCheckpoint(cp.id)} disabled={autoAssessing === cp.id} data-testid={`auto-assess-${cp.id}`}>
                      {autoAssessing === cp.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      {autoAssessing === cp.id ? "Assessing..." : "Auto-Assess"}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(cp)} data-testid={`edit-checkpoint-${cp.id}`}><Pencil className="w-3 h-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteMutation.mutate(cp.id)} data-testid={`delete-checkpoint-${cp.id}`}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </div>
                <Collapsible open={expandedIds.has(cp.id)} onOpenChange={() => toggleExpanded(cp.id)}>
                  <CollapsibleTrigger asChild>
                    <button className="text-xs text-accent mt-1 flex items-center gap-1 hover:underline" data-testid={`expand-checkpoint-${cp.id}`}>
                      <ChevronRight className={`w-3 h-3 transition-transform ${expandedIds.has(cp.id) ? "rotate-90" : ""}`} />
                      Details
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 space-y-2 text-sm">
                    {cp.overallAssessment && <div><span className="font-semibold text-muted-foreground">Assessment:</span> <span className="text-foreground">{cp.overallAssessment}</span></div>}
                    {cp.recommendations && (
                      <div>
                        <span className="font-semibold text-muted-foreground">Recommendations:</span>
                        <ul className="mt-0.5 list-disc pl-4">
                          {(safeParseJsonArray(cp.recommendations)).map((r: string, i: number) => <li key={i}>{r}</li>)}
                        </ul>
                      </div>
                    )}
                    {cp.findings && (
                      <div>
                        <span className="font-semibold text-muted-foreground">Findings:</span>
                        <ul className="mt-0.5 space-y-1">
                          {(safeParseJsonArray(cp.findings)).map((f: any, i: number) => (
                            <li key={i} className="flex items-start gap-1.5">
                              {typeof f === "object" ? (
                                <>
                                  <Badge className={`text-xs mt-0.5 ${SEVERITY_COLORS[f.severity] || ""}`}>{f.severity}</Badge>
                                  <span>{f.description}{f.resolution ? ` — ${f.resolution}` : ""}</span>
                                </>
                              ) : <span>{String(f)}</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {/* Structured Assessment Dimensions */}
                    {expandedIds.has(cp.id) && <CheckpointAssessmentDimensions checkpointId={cp.id} />}
                  </CollapsibleContent>
                </Collapsible>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>

      {/* Checkpoint Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? "Edit Checkpoint" : "Add Checkpoint"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {!editingId && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {PRESETS.map(p => (
                  <button key={p} className="text-xs px-2 py-1 rounded border border-border/60 hover:bg-muted/50" onClick={() => setForm(prev => ({ ...prev, name: p }))} data-testid={`preset-${p.toLowerCase().replace(/\s/g, "-")}`}>{p}</button>
                ))}
              </div>
            )}
            <Input placeholder="Name *" value={form.name} onChange={e => setForm((p: any) => ({ ...p, name: e.target.value }))} data-testid="input-checkpoint-name" />
            <div className="grid grid-cols-2 gap-3">
              <Select value={form.phase} onValueChange={v => setForm((p: any) => ({ ...p, phase: v }))}>
                <SelectTrigger data-testid="select-checkpoint-phase"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["planning", "design", "build", "testing", "deployment", "post_go_live"].map(ph => <SelectItem key={ph} value={ph}>{formatLabel(ph)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={form.status} onValueChange={v => setForm((p: any) => ({ ...p, status: v }))}>
                <SelectTrigger data-testid="select-checkpoint-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["upcoming", "in_progress", "passed", "passed_with_conditions", "failed", "deferred"].map(s => <SelectItem key={s} value={s}>{formatLabel(s)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Input type="date" value={form.scheduledDate} onChange={e => setForm((p: any) => ({ ...p, scheduledDate: e.target.value }))} data-testid="input-checkpoint-date" />
            <Textarea placeholder="Overall Assessment" value={form.overallAssessment} onChange={e => setForm((p: any) => ({ ...p, overallAssessment: e.target.value }))} data-testid="input-checkpoint-assessment" />
            <Textarea placeholder='Recommendations (one per line)' value={form.recommendations} onChange={e => setForm((p: any) => ({ ...p, recommendations: e.target.value }))} className="text-xs" data-testid="input-checkpoint-recommendations" />
            <Textarea placeholder='Findings (JSON array or one per line)' value={form.findings} onChange={e => setForm((p: any) => ({ ...p, findings: e.target.value }))} className="text-xs" data-testid="input-checkpoint-findings" />

            {/* Structured Assessment Dimensions */}
            {editingId && (
              <div className="border-t pt-3 mt-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Structured Assessment (7 Dimensions)</h4>
                <div className="space-y-3">
                  {ASSESSMENT_DIMENSIONS.map(dim => (
                    <div key={dim.key} className="border rounded-md p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">{dim.label}</span>
                        <Select value={assessmentForm[dim.key]?.rating || ""} onValueChange={v => setAssessmentForm(prev => ({ ...prev, [dim.key]: { ...prev[dim.key], rating: v } }))}>
                          <SelectTrigger className="w-40 h-7 text-xs" data-testid={`rating-${dim.key}`}><SelectValue placeholder="Rating" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="satisfactory"><span className="text-emerald-600">Satisfactory</span></SelectItem>
                            <SelectItem value="needs_attention"><span className="text-amber-600">Needs Attention</span></SelectItem>
                            <SelectItem value="at_risk"><span className="text-orange-600">At Risk</span></SelectItem>
                            <SelectItem value="unsatisfactory"><span className="text-red-600">Unsatisfactory</span></SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Textarea placeholder="Observation" className="text-xs min-h-[28px] h-7" value={assessmentForm[dim.key]?.observation || ""}
                        onChange={e => setAssessmentForm(prev => ({ ...prev, [dim.key]: { ...prev[dim.key], observation: e.target.value } }))} />
                      <Textarea placeholder="Recommendation" className="text-xs min-h-[28px] h-7" value={assessmentForm[dim.key]?.recommendation || ""}
                        onChange={e => setAssessmentForm(prev => ({ ...prev, [dim.key]: { ...prev[dim.key], recommendation: e.target.value } }))} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button className="w-full bg-accent hover:bg-accent/90 text-accent-foreground" disabled={!form.name || !form.phase}
              onClick={() => {
                const payload: any = {
                  name: form.name, phase: form.phase, scheduledDate: form.scheduledDate || null, status: form.status,
                  overallAssessment: form.overallAssessment || null,
                  recommendations: form.recommendations ? tryJsonOrLines(form.recommendations) : null,
                  findings: form.findings ? tryJsonOrLines(form.findings) : null,
                };
                if (editingId) {
                  updateMutation.mutate({ id: editingId, data: payload });
                  // Save assessment dimensions if any rated
                  const dims = ASSESSMENT_DIMENSIONS.map(d => ({
                    dimension: d.key,
                    rating: assessmentForm[d.key]?.rating || "satisfactory",
                    observation: assessmentForm[d.key]?.observation || null,
                    evidence: null,
                    recommendation: assessmentForm[d.key]?.recommendation || null,
                  })).filter(d => assessmentForm[d.dimension]?.rating);
                  if (dims.length > 0) {
                    saveAssessmentMutation.mutate({ checkpointId: editingId, dimensions: dims });
                  }
                } else {
                  createMutation.mutate(payload);
                }
              }}
              data-testid="button-save-checkpoint"
            >
              {editingId ? "Update" : "Add Checkpoint"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function safeParseJsonArray(val: string | null): any[] {
  if (!val) return [];
  try { const parsed = JSON.parse(val); return Array.isArray(parsed) ? parsed : [parsed]; }
  catch { return val.split("\n").filter(Boolean); }
}

function tryJsonOrLines(val: string): string {
  try { JSON.parse(val); return val; }
  catch { return JSON.stringify(val.split("\n").filter(Boolean)); }
}

// ==================== TAB 3: DEVIATIONS ====================

function DeviationsTab({ contractId, projectId }: { contractId: number | null; projectId: number }) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDeviation, setEditingDeviation] = useState<any>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [severityFilter, setSeverityFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const defaultForm = { severity: "major", category: "scope", title: "", description: "", contractReference: "", actualDelivery: "", impact: "", status: "open", resolution: "" };
  const [form, setForm] = useState(defaultForm);

  const { data: allDeviations } = useQuery<any[]>({
    queryKey: ["/api/contracts", contractId, "deviations"],
    queryFn: () => apiRequest("GET", `/api/contracts/${contractId}/deviations`).then(r => r.json()),
    enabled: !!contractId,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/contracts/${contractId}/deviations`, data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "deviations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "compliance-summary"] });
      setDialogOpen(false);
      setForm(defaultForm);
      toast({ title: "Deviation logged" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/deviations/${id}`, data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "deviations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "compliance-summary"] });
      setDialogOpen(false);
      setEditingDeviation(null);
      setForm(defaultForm);
      toast({ title: "Deviation updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/deviations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "deviations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "compliance-summary"] });
      toast({ title: "Deviation deleted" });
    },
  });

  function openCreate() {
    setEditingDeviation(null);
    setForm(defaultForm);
    setDialogOpen(true);
  }

  function openEdit(d: any) {
    setEditingDeviation(d);
    setForm({
      severity: d.severity,
      category: d.category,
      title: d.title,
      description: d.description || "",
      contractReference: d.contractReference || "",
      actualDelivery: d.actualDelivery || "",
      impact: d.impact || "",
      status: d.status,
      resolution: d.resolution || "",
    });
    setDialogOpen(true);
  }

  if (!contractId) {
    return <div className="text-center py-8 text-sm text-muted-foreground">Add a contract first to log deviations.</div>;
  }

  const deviations = (allDeviations || []).filter((d: any) => {
    if (severityFilter !== "all" && d.severity !== severityFilter) return false;
    if (categoryFilter !== "all" && d.category !== categoryFilter) return false;
    if (statusFilter !== "all" && d.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-[130px] h-8 text-xs" data-testid="filter-deviation-severity"><SelectValue placeholder="Severity" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severities</SelectItem>
            {["critical", "major", "minor", "observation"].map(s => <SelectItem key={s} value={s}>{formatLabel(s)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[140px] h-8 text-xs" data-testid="filter-deviation-category"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {["scope", "timeline", "quality", "staffing", "cost", "sla", "functionality"].map(c => <SelectItem key={c} value={c}>{formatLabel(c)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px] h-8 text-xs" data-testid="filter-deviation-status"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {["open", "under_review", "accepted", "remediation_planned", "resolved", "escalated"].map(s => <SelectItem key={s} value={s}>{formatLabel(s)}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button size="sm" className="gap-1.5 bg-accent hover:bg-accent/90 text-accent-foreground text-xs" onClick={openCreate} data-testid="button-log-deviation">
          <Plus className="w-3.5 h-3.5" /> Log Deviation
        </Button>
      </div>

      {allDeviations && allDeviations.length === 0 ? (
        <div className="flex flex-col items-center py-12 gap-3">
          <ShieldCheck className="w-12 h-12 text-muted-foreground/30" />
          <p className="text-base font-medium text-muted-foreground">No deviations logged</p>
          <p className="text-sm text-muted-foreground">This is a good sign</p>
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Severity</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deviations.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">No deviations match current filters</TableCell></TableRow>
              ) : deviations.map((d: any) => (
                <Collapsible key={d.id} open={expandedId === d.id} onOpenChange={(open) => setExpandedId(open ? d.id : null)} asChild>
                  <>
                    <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => setExpandedId(expandedId === d.id ? null : d.id)} data-testid={`deviation-row-${d.id}`}>
                      <TableCell>
                        <CollapsibleTrigger asChild>
                          <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${expandedId === d.id ? "rotate-90" : ""}`} />
                        </CollapsibleTrigger>
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1.5">
                          <SeverityIcon severity={d.severity} />
                          <Badge className={`text-xs ${SEVERITY_COLORS[d.severity] || ""}`}>{formatLabel(d.severity)}</Badge>
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${DEVIATION_CATEGORY_COLORS[d.category] || ""}`}>{formatLabel(d.category)}</Badge>
                      </TableCell>
                      <TableCell className="font-medium text-sm">{d.title}</TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${DEVIATION_STATUS_COLORS[d.status] || ""}`}>{formatLabel(d.status)}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{d.createdAt?.split("T")[0] || "—"}</TableCell>
                      <TableCell>
                        <div className="flex gap-0.5">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEdit(d); }} data-testid={`edit-deviation-${d.id}`}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(d.id); }} data-testid={`delete-deviation-${d.id}`}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    <CollapsibleContent asChild>
                      <TableRow>
                        <TableCell colSpan={7} className="bg-muted/30 px-8 py-3">
                          <div className="space-y-2 text-sm">
                            <div><span className="font-semibold text-muted-foreground">Description:</span> <span className="text-foreground">{d.description}</span></div>
                            {d.contractReference && <div><span className="font-semibold text-muted-foreground">Contract Reference:</span> <span className="text-foreground">{d.contractReference}</span></div>}
                            {d.actualDelivery && <div><span className="font-semibold text-muted-foreground">Actual Delivery:</span> <span className="text-foreground">{d.actualDelivery}</span></div>}
                            {d.impact && <div><span className="font-semibold text-red-500">Impact:</span> <span className="text-foreground">{d.impact}</span></div>}
                            {d.resolution && <div><span className="font-semibold text-emerald-600">Resolution:</span> <span className="text-foreground">{d.resolution}</span></div>}
                          </div>
                        </TableCell>
                      </TableRow>
                    </CollapsibleContent>
                  </>
                </Collapsible>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Deviation Dialog (Create / Edit) */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditingDeviation(null); setForm(defaultForm); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingDeviation ? "Edit Deviation" : "Log Deviation"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Select value={form.severity} onValueChange={v => setForm(p => ({ ...p, severity: v }))}>
                <SelectTrigger data-testid="select-deviation-severity"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["critical", "major", "minor", "observation"].map(s => <SelectItem key={s} value={s}>{formatLabel(s)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
                <SelectTrigger data-testid="select-deviation-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["scope", "timeline", "quality", "staffing", "cost", "sla", "functionality"].map(c => <SelectItem key={c} value={c}>{formatLabel(c)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Input placeholder="Title *" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} data-testid="input-deviation-title" />
            <Textarea placeholder="Description *" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} data-testid="input-deviation-description" />
            <Textarea placeholder="Contract Reference (what was promised)" value={form.contractReference} onChange={e => setForm(p => ({ ...p, contractReference: e.target.value }))} data-testid="input-deviation-contract-ref" />
            <Textarea placeholder="Actual Delivery (what was delivered)" value={form.actualDelivery} onChange={e => setForm(p => ({ ...p, actualDelivery: e.target.value }))} data-testid="input-deviation-actual" />
            <Textarea placeholder="Impact (business impact)" value={form.impact} onChange={e => setForm(p => ({ ...p, impact: e.target.value }))} data-testid="input-deviation-impact" />
            {editingDeviation && (
              <>
                <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                  <SelectTrigger data-testid="select-deviation-edit-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["open", "under_review", "accepted", "remediation_planned", "resolved", "escalated"].map(s => <SelectItem key={s} value={s}>{formatLabel(s)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Textarea placeholder="Resolution" value={form.resolution} onChange={e => setForm(p => ({ ...p, resolution: e.target.value }))} data-testid="input-deviation-resolution" />
              </>
            )}
            <Button
              className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
              disabled={!form.title || !form.description || createMutation.isPending || updateMutation.isPending}
              onClick={() => {
                if (editingDeviation) {
                  updateMutation.mutate({ id: editingDeviation.id, data: form });
                } else {
                  createMutation.mutate(form);
                }
              }}
              data-testid="button-save-deviation"
            >
              {editingDeviation
                ? (updateMutation.isPending ? "Updating..." : "Update Deviation")
                : (createMutation.isPending ? "Logging..." : "Log Deviation")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== TAB 4: EVIDENCE LOG ====================

function EvidenceLogTab({ contractId, projectId }: { contractId: number | null; projectId: number }) {
  const { toast } = useToast();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [assessmentFilter, setAssessmentFilter] = useState("all");
  const [evidenceForm, setEvidenceForm] = useState({
    deliverableId: "",
    type: "document",
    title: "",
    description: "",
    assessmentResult: "",
    assessorNotes: "",
  });
  const [file, setFile] = useState<File | null>(null);

  const { data: contractDetails } = useQuery<any>({
    queryKey: ["/api/contracts", contractId],
    queryFn: () => apiRequest("GET", `/api/contracts/${contractId}`).then(r => r.json()),
    enabled: !!contractId,
  });

  const deliverables: any[] = contractDetails?.deliverables || [];

  // Fetch evidence for all deliverables
  const evidenceQueries = deliverables.map((d: any) => ({
    queryKey: ["/api/deliverables", d.id, "evidence"],
    queryFn: () => apiRequest("GET", `/api/deliverables/${d.id}/evidence`).then(r => r.json()),
    enabled: !!d.id,
  }));

  // Use individual queries for each deliverable
  const evidenceResults = deliverables.map((d: any) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useQuery<any[]>({
      queryKey: ["/api/deliverables", d.id, "evidence"],
      queryFn: () => apiRequest("GET", `/api/deliverables/${d.id}/evidence`).then(r => r.json()),
    })
  );

  // Fetch project documents (uploaded via Health Check or directly)
  const { data: projectDocs } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "documents"],
    queryFn: () => apiRequest("GET", `/api/projects/${projectId}/documents`).then(r => r.json()),
    enabled: !!projectId,
  });

  // Build deliverable lookup
  const deliverableMap = useMemo(() => {
    const map: Record<number, string> = {};
    deliverables.forEach((d: any) => { map[d.id] = d.name; });
    return map;
  }, [deliverables]);

  // Map document types to evidence types
  const docTypeToEvidenceType = (dt: string) => {
    const map: Record<string, string> = {
      status_report: "status_report", sow_contract: "document", budget_report: "document",
      schedule_update: "document", test_results: "test_result", change_request: "document",
      meeting_minutes: "meeting_notes", interview_notes: "meeting_notes", raid_log: "document",
      risk_register: "document", other: "other",
    };
    return map[dt] || "document";
  };

  // Aggregate all evidence + project documents into a flat chronological list
  const allEvidence = useMemo(() => {
    const items: any[] = [];
    evidenceResults.forEach((result, idx) => {
      if (result.data) {
        result.data.forEach((e: any) => {
          items.push({ ...e, deliverableName: deliverables[idx]?.name || "Unknown", source: "evidence" });
        });
      }
    });
    // Include project documents as evidence items
    if (projectDocs) {
      for (const doc of projectDocs) {
        items.push({
          id: `doc-${doc.id}`,
          type: docTypeToEvidenceType(doc.documentType),
          title: doc.fileName,
          description: doc.aiAnalysis ? `AI-analyzed ${formatLabel(doc.documentType)}` : formatLabel(doc.documentType),
          fileName: doc.fileName,
          createdAt: doc.createdAt,
          deliverableName: "Project Document",
          assessmentResult: doc.analysisStatus === "completed" ? "supports_compliance" : null,
          assessorNotes: doc.analysisStatus === "completed" ? "Auto-analyzed from uploaded document" : null,
          source: "project_document",
          documentType: doc.documentType,
          analysisStatus: doc.analysisStatus,
        });
      }
    }
    items.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    return items;
  }, [evidenceResults, deliverables, projectDocs]);

  const filteredEvidence = allEvidence.filter((e: any) => {
    if (typeFilter !== "all" && e.type !== typeFilter) return false;
    if (assessmentFilter !== "all" && e.assessmentResult !== assessmentFilter) return false;
    return true;
  });

  const uploadMutation = useMutation({
    mutationFn: async (data: { deliverableId: string; type: string; title: string; description: string; assessmentResult: string; assessorNotes: string; file: File | null }) => {
      const formData = new FormData();
      formData.append("title", data.title);
      formData.append("type", data.type);
      if (data.description) formData.append("description", data.description);
      if (data.assessmentResult) formData.append("assessmentResult", data.assessmentResult);
      if (data.assessorNotes) formData.append("assessorNotes", data.assessorNotes);
      if (data.file) formData.append("file", data.file);

      const res = await fetch(`/api/deliverables/${data.deliverableId}/evidence`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: () => {
      deliverables.forEach((d: any) => {
        queryClient.invalidateQueries({ queryKey: ["/api/deliverables", d.id, "evidence"] });
      });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "compliance-summary"] });
      setUploadOpen(false);
      setEvidenceForm({ deliverableId: "", type: "document", title: "", description: "", assessmentResult: "", assessorNotes: "" });
      setFile(null);
      toast({ title: "Evidence uploaded" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/evidence/${id}`),
    onSuccess: () => {
      deliverables.forEach((d: any) => {
        queryClient.invalidateQueries({ queryKey: ["/api/deliverables", d.id, "evidence"] });
      });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "compliance-summary"] });
      toast({ title: "Evidence deleted" });
    },
  });

  if (!contractId) {
    return <div className="text-center py-8 text-sm text-muted-foreground">Add a contract first to manage evidence.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[150px] h-8 text-xs" data-testid="filter-evidence-type"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {["document", "meeting_notes", "demo", "test_result", "status_report", "other"].map(t => <SelectItem key={t} value={t}>{formatLabel(t)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={assessmentFilter} onValueChange={setAssessmentFilter}>
          <SelectTrigger className="w-[180px] h-8 text-xs" data-testid="filter-evidence-assessment"><SelectValue placeholder="Assessment" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Assessments</SelectItem>
            {["supports_compliance", "partial", "insufficient", "contradicts"].map(a => <SelectItem key={a} value={a}>{formatLabel(a)}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button size="sm" className="gap-1.5 bg-accent hover:bg-accent/90 text-accent-foreground text-xs" onClick={() => setUploadOpen(true)} data-testid="button-upload-evidence">
          <Upload className="w-3.5 h-3.5" /> Upload Evidence
        </Button>
      </div>

      {allEvidence.length === 0 ? (
        <div className="flex flex-col items-center py-12 gap-3">
          <FileCheck className="w-12 h-12 text-muted-foreground/30" />
          <p className="text-base font-medium text-muted-foreground">No evidence collected yet</p>
        </div>
      ) : filteredEvidence.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">No evidence matches current filters</div>
      ) : (
        <div className="space-y-2">
          {filteredEvidence.map((e: any) => (
            <Card key={e.id} className={`p-3 ${e.source === "project_document" ? "border-l-2 border-l-blue-400" : ""}`} data-testid={`evidence-card-${e.id}`}>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0">
                  <EvidenceTypeIcon type={e.type} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{e.title}</span>
                    <Badge className={`text-xs ${EVIDENCE_TYPE_COLORS[e.type] || ""}`}>{formatLabel(e.type)}</Badge>
                    {e.source === "project_document" && (
                      <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">Uploaded Doc</Badge>
                    )}
                    {e.assessmentResult && (
                      <Badge className={`text-xs ${ASSESSMENT_RESULT_COLORS[e.assessmentResult] || ""}`}>{formatLabel(e.assessmentResult)}</Badge>
                    )}
                    {e.analysisStatus && (
                      <Badge variant="outline" className={`text-xs ${e.analysisStatus === "completed" ? "text-green-600 border-green-300" : e.analysisStatus === "failed" ? "text-red-600 border-red-300" : "text-amber-600 border-amber-300"}`}>
                        {e.analysisStatus === "completed" ? "Analyzed" : formatLabel(e.analysisStatus)}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <span>{e.deliverableName}</span>
                    <span>·</span>
                    <span>{e.createdAt?.split("T")[0] || "—"}</span>
                    {e.fileName && e.source !== "project_document" && <><span>·</span><span>File: {e.fileName}</span></>}
                    {e.documentType && <><span>·</span><span>{formatLabel(e.documentType)}</span></>}
                  </div>
                  {e.description && <p className="text-sm text-muted-foreground mt-1">{e.description}</p>}
                  {e.assessorNotes && <p className="text-sm text-foreground mt-1"><span className="font-semibold text-muted-foreground">Assessor notes:</span> {e.assessorNotes}</p>}
                </div>
                {e.source !== "project_document" && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => deleteMutation.mutate(e.id)} data-testid={`delete-evidence-${e.id}`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Upload Evidence Dialog */}
      <Dialog open={uploadOpen} onOpenChange={(open) => { setUploadOpen(open); if (!open) { setEvidenceForm({ deliverableId: "", type: "document", title: "", description: "", assessmentResult: "", assessorNotes: "" }); setFile(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upload Evidence</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Select value={evidenceForm.deliverableId} onValueChange={v => setEvidenceForm(p => ({ ...p, deliverableId: v }))}>
              <SelectTrigger data-testid="select-evidence-deliverable"><SelectValue placeholder="Select Deliverable *" /></SelectTrigger>
              <SelectContent>
                {deliverables.map((d: any) => <SelectItem key={d.id} value={d.id.toString()}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={evidenceForm.type} onValueChange={v => setEvidenceForm(p => ({ ...p, type: v }))}>
              <SelectTrigger data-testid="select-evidence-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["document", "meeting_notes", "demo", "test_result", "status_report", "other"].map(t => <SelectItem key={t} value={t}>{formatLabel(t)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input placeholder="Title *" value={evidenceForm.title} onChange={e => setEvidenceForm(p => ({ ...p, title: e.target.value }))} data-testid="input-evidence-title" />
            <Textarea placeholder="Description" value={evidenceForm.description} onChange={e => setEvidenceForm(p => ({ ...p, description: e.target.value }))} data-testid="input-evidence-description" />
            <div>
              <label className="text-xs text-muted-foreground block mb-1">File (optional)</label>
              <Input
                type="file"
                onChange={e => setFile(e.target.files?.[0] || null)}
                className="text-xs"
                data-testid="input-evidence-file"
              />
            </div>
            <Select value={evidenceForm.assessmentResult} onValueChange={v => setEvidenceForm(p => ({ ...p, assessmentResult: v }))}>
              <SelectTrigger data-testid="select-evidence-assessment"><SelectValue placeholder="Assessment Result (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Assessment</SelectItem>
                {["supports_compliance", "partial", "insufficient", "contradicts"].map(a => <SelectItem key={a} value={a}>{formatLabel(a)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Textarea placeholder="Assessor Notes" value={evidenceForm.assessorNotes} onChange={e => setEvidenceForm(p => ({ ...p, assessorNotes: e.target.value }))} data-testid="input-evidence-assessor-notes" />
            <Button
              className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
              disabled={!evidenceForm.deliverableId || !evidenceForm.title || uploadMutation.isPending}
              onClick={() => uploadMutation.mutate({ ...evidenceForm, file })}
              data-testid="button-save-evidence"
            >
              {uploadMutation.isPending ? "Uploading..." : "Upload Evidence"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== TAB 5: INTEGRATIONS ====================

const PLATFORM_COLORS: Record<string, { bg: string; border: string; label: string }> = {
  jira: { bg: "bg-[#0052CC]", border: "border-[#0052CC]", label: "JIRA" },
  smartsheet: { bg: "bg-[#0073EA]", border: "border-[#0073EA]", label: "SMARTSHEET" },
  azure_devops: { bg: "bg-[#0078D4]", border: "border-[#0078D4]", label: "AZURE DEVOPS" },
};

const PLATFORM_DESCRIPTIONS: Record<string, string> = {
  jira: "Track epics, stories, and bugs from Jira",
  smartsheet: "Sync tasks and milestones from Smartsheet",
  azure_devops: "Pull work items and boards from Azure DevOps",
};

const CONNECTION_STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  paused: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  error: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  disconnected: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

const STATUS_DOT_COLORS: Record<string, string> = {
  active: "bg-emerald-500",
  paused: "bg-amber-500",
  error: "bg-red-500",
  disconnected: "bg-gray-400",
};

function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function IntegrationsTab({ projectId, contractId }: { projectId: number; contractId: number | null }) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogStep, setDialogStep] = useState(1);
  const [selectedPlatform, setSelectedPlatform] = useState<string>("");
  const [testResult, setTestResult] = useState<{ valid: boolean; message: string; projectName?: string } | null>(null);
  const [createdConnectionId, setCreatedConnectionId] = useState<number | null>(null);
  const [syncingIds, setSyncingIds] = useState<Set<number>>(new Set());
  const [previewItems, setPreviewItems] = useState<any[] | null>(null);
  const [previewTotal, setPreviewTotal] = useState(0);

  const [form, setForm] = useState({
    name: "",
    baseUrl: "",
    email: "",
    token: "",
    projectKey: "",
    sheetId: "",
    orgUrl: "",
    pat: "",
    project: "",
  });

  const { data: connections, isLoading } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "integrations"],
    queryFn: () => apiRequest("GET", `/api/projects/${projectId}/integrations`).then(r => r.json()),
    enabled: !!projectId,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/projects/${projectId}/integrations`, data).then(r => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "integrations"] });
      setCreatedConnectionId(data.id);
      setTestResult({ valid: true, message: "Connected successfully", projectName: data.projectName });
      setDialogStep(3);
    },
    onError: (err: any) => {
      setTestResult({ valid: false, message: err.message || "Connection failed" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/integrations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "integrations"] });
      toast({ title: "Integration removed" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/integrations/${id}`, data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "integrations"] });
    },
  });

  function buildConfig(): string {
    if (selectedPlatform === "jira") {
      return JSON.stringify({ baseUrl: form.baseUrl, email: form.email, token: form.token, projectKey: form.projectKey });
    }
    if (selectedPlatform === "smartsheet") {
      return JSON.stringify({ token: form.token, sheetId: form.sheetId });
    }
    if (selectedPlatform === "azure_devops") {
      return JSON.stringify({ orgUrl: form.orgUrl, pat: form.pat, project: form.project });
    }
    return "{}";
  }

  function resetDialog() {
    setDialogStep(1);
    setSelectedPlatform("");
    setTestResult(null);
    setCreatedConnectionId(null);
    setPreviewItems(null);
    setPreviewTotal(0);
    setForm({ name: "", baseUrl: "", email: "", token: "", projectKey: "", sheetId: "", orgUrl: "", pat: "", project: "" });
  }

  function openDialogForPlatform(platform: string) {
    resetDialog();
    setSelectedPlatform(platform);
    setDialogStep(2);
    setDialogOpen(true);
  }

  async function handleSync(connectionId: number) {
    setSyncingIds(prev => new Set(prev).add(connectionId));
    try {
      const res = await apiRequest("POST", `/api/integrations/${connectionId}/sync`).then(r => r.json());
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "integrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "compliance-summary"] });
      toast({ title: `Synced ${res.itemsSynced} items: ${res.itemsCreated} new, ${res.itemsUpdated} updated` });
    } catch (err: any) {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    } finally {
      setSyncingIds(prev => { const n = new Set(prev); n.delete(connectionId); return n; });
    }
  }

  async function handleTestAndCreate() {
    createMutation.mutate({
      platform: selectedPlatform,
      name: form.name || `${PLATFORM_COLORS[selectedPlatform]?.label || selectedPlatform} Integration`,
      config: buildConfig(),
      contractId: contractId,
    });
  }

  async function loadPreview(connectionId: number) {
    try {
      const res = await apiRequest("GET", `/api/integrations/${connectionId}/preview`).then(r => r.json());
      setPreviewItems(res.items || []);
      setPreviewTotal(res.total || 0);
    } catch {
      setPreviewItems([]);
    }
  }

  function isFormValid(): boolean {
    if (selectedPlatform === "jira") return !!(form.baseUrl && form.email && form.token && form.projectKey);
    if (selectedPlatform === "smartsheet") return !!(form.token && form.sheetId);
    if (selectedPlatform === "azure_devops") return !!(form.orgUrl && form.pat && form.project);
    return false;
  }

  if (isLoading) {
    return <div className="space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-24" />)}</div>;
  }

  const hasConnections = connections && connections.length > 0;

  return (
    <div className="space-y-3">
      {/* Header with Add button */}
      {hasConnections && (
        <div className="flex justify-end">
          <Button size="sm" className="gap-1.5 bg-accent hover:bg-accent/90 text-accent-foreground text-xs" onClick={() => { resetDialog(); setDialogOpen(true); }} data-testid="button-add-integration">
            <Plus className="w-3.5 h-3.5" /> Add Integration
          </Button>
        </div>
      )}

      {/* Connection Cards */}
      {hasConnections ? (
        <div className="space-y-3">
          {connections!.map((conn: any) => (
            <Card key={conn.id} data-testid={`integration-card-${conn.id}`}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge className={`text-xs text-white font-bold tracking-wider ${PLATFORM_COLORS[conn.platform]?.bg || "bg-gray-500"}`} data-testid={`platform-badge-${conn.id}`}>
                      {PLATFORM_COLORS[conn.platform]?.label || conn.platform.toUpperCase()}
                    </Badge>
                    <span className="text-base font-semibold">{conn.name}</span>
                    <span className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${STATUS_DOT_COLORS[conn.status] || "bg-gray-400"} ${conn.status === "active" ? "animate-pulse" : ""}`} />
                      <Badge className={`text-xs ${CONNECTION_STATUS_COLORS[conn.status] || ""}`}>{formatLabel(conn.status)}</Badge>
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => handleSync(conn.id)}
                      disabled={syncingIds.has(conn.id)}
                      data-testid={`sync-button-${conn.id}`}
                    >
                      {syncingIds.has(conn.id) ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      Sync Now
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteMutation.mutate(conn.id)} data-testid={`delete-integration-${conn.id}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                  <span>Last synced: {relativeTime(conn.lastSyncAt)}</span>
                  <span>·</span>
                  <span>{conn.syncItemCount || 0} items</span>
                  {conn.lastSyncStatus && (
                    <>
                      <span>·</span>
                      <span className={conn.lastSyncStatus === "success" ? "text-emerald-600" : conn.lastSyncStatus === "failed" ? "text-red-500" : "text-amber-500"}>
                        {formatLabel(conn.lastSyncStatus)}
                      </span>
                    </>
                  )}
                </div>
                {conn.lastSyncMessage && (
                  <p className="text-sm text-muted-foreground mt-1">{conn.lastSyncMessage}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        /* Empty State */
        <div className="flex flex-col items-center py-12 gap-4">
          <Plug className="w-12 h-12 text-muted-foreground/30" />
          <p className="text-base font-medium text-muted-foreground">No integrations connected</p>
          <p className="text-sm text-muted-foreground text-center max-w-md">Connect your vendor's project management tool to automatically track deliverables.</p>
          <div className="grid grid-cols-3 gap-3 mt-2 w-full max-w-xl">
            {(["jira", "smartsheet", "azure_devops"] as const).map(platform => (
              <Card
                key={platform}
                className={`cursor-pointer hover:bg-muted/50 border-l-4 ${PLATFORM_COLORS[platform].border}`}
                onClick={() => openDialogForPlatform(platform)}
                data-testid={`connect-${platform}`}
              >
                <CardContent className="pt-4 pb-4">
                  <Badge className={`text-xs text-white font-bold tracking-wider mb-2 ${PLATFORM_COLORS[platform].bg}`}>
                    {PLATFORM_COLORS[platform].label}
                  </Badge>
                  <p className="text-sm text-muted-foreground mt-2">{PLATFORM_DESCRIPTIONS[platform]}</p>
                  <Button size="sm" className="mt-3 gap-1.5 bg-accent hover:bg-accent/90 text-accent-foreground text-xs w-full" data-testid={`button-connect-${platform}`}>
                    <Plus className="w-3 h-3" /> Connect
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Add Integration Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetDialog(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {dialogStep === 1 && "Select Platform"}
              {dialogStep === 2 && `Connect ${PLATFORM_COLORS[selectedPlatform]?.label || ""}`}
              {dialogStep === 3 && "Preview"}
              {dialogStep === 4 && "Connected!"}
            </DialogTitle>
          </DialogHeader>

          {/* Step 1: Select Platform */}
          {dialogStep === 1 && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                {(["jira", "smartsheet", "azure_devops"] as const).map(platform => (
                  <Card
                    key={platform}
                    className={`cursor-pointer hover:bg-muted/50 transition-all ${selectedPlatform === platform ? `ring-2 ${PLATFORM_COLORS[platform].border.replace("border", "ring")}` : ""}`}
                    onClick={() => setSelectedPlatform(platform)}
                    data-testid={`select-platform-${platform}`}
                  >
                    <CardContent className="pt-4 pb-4 text-center">
                      <Badge className={`text-xs text-white font-bold tracking-wider ${PLATFORM_COLORS[platform].bg}`}>
                        {PLATFORM_COLORS[platform].label}
                      </Badge>
                      <p className="text-sm text-muted-foreground mt-2">{PLATFORM_DESCRIPTIONS[platform]}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Button
                className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
                disabled={!selectedPlatform}
                onClick={() => setDialogStep(2)}
                data-testid="button-next-step1"
              >
                Next
              </Button>
            </div>
          )}

          {/* Step 2: Credentials */}
          {dialogStep === 2 && (
            <div className="space-y-3">
              <Input
                placeholder="Connection Name"
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                data-testid="input-integration-name"
              />

              {selectedPlatform === "jira" && (
                <>
                  <Input placeholder="Base URL (e.g. https://yourcompany.atlassian.net)" value={form.baseUrl} onChange={e => setForm(p => ({ ...p, baseUrl: e.target.value }))} data-testid="input-jira-base-url" />
                  <Input placeholder="Email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} data-testid="input-jira-email" />
                  <Input type="password" placeholder="API Token" value={form.token} onChange={e => setForm(p => ({ ...p, token: e.target.value }))} data-testid="input-jira-token" />
                  <Input placeholder="Project Key (e.g. PROJ)" value={form.projectKey} onChange={e => setForm(p => ({ ...p, projectKey: e.target.value }))} data-testid="input-jira-project-key" />
                </>
              )}

              {selectedPlatform === "smartsheet" && (
                <>
                  <Input type="password" placeholder="API Access Token" value={form.token} onChange={e => setForm(p => ({ ...p, token: e.target.value }))} data-testid="input-smartsheet-token" />
                  <Input placeholder="Sheet ID" value={form.sheetId} onChange={e => setForm(p => ({ ...p, sheetId: e.target.value }))} data-testid="input-smartsheet-sheet-id" />
                </>
              )}

              {selectedPlatform === "azure_devops" && (
                <>
                  <Input placeholder="Organization URL (e.g. https://dev.azure.com/yourorg)" value={form.orgUrl} onChange={e => setForm(p => ({ ...p, orgUrl: e.target.value }))} data-testid="input-azure-org-url" />
                  <Input type="password" placeholder="Personal Access Token" value={form.pat} onChange={e => setForm(p => ({ ...p, pat: e.target.value }))} data-testid="input-azure-pat" />
                  <Input placeholder="Project Name" value={form.project} onChange={e => setForm(p => ({ ...p, project: e.target.value }))} data-testid="input-azure-project" />
                </>
              )}

              {/* Test result feedback */}
              {testResult && (
                <div className={`flex items-center gap-2 p-2 rounded text-sm ${testResult.valid ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400" : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400"}`} data-testid="test-result">
                  {testResult.valid ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                  <span>{testResult.message}{testResult.projectName ? ` — ${testResult.projectName}` : ""}</span>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { setTestResult(null); setDialogStep(1); }} data-testid="button-back-step2">
                  Back
                </Button>
                <Button
                  className="flex-1 bg-accent hover:bg-accent/90 text-accent-foreground"
                  disabled={!isFormValid() || createMutation.isPending}
                  onClick={handleTestAndCreate}
                  data-testid="button-test-connect"
                >
                  {createMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin mr-1.5" /> Testing...</> : "Test & Connect"}
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Preview */}
          {dialogStep === 3 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400" data-testid="connection-success">
                <Check className="w-5 h-5" />
                <div>
                  <p className="text-base font-medium">Connection successful!</p>
                  {testResult?.projectName && <p className="text-xs">{previewTotal > 0 ? `${previewTotal} items found in ` : ""}{testResult.projectName}</p>}
                </div>
              </div>

              {/* Auto-load preview */}
              {previewItems === null && createdConnectionId && (
                <Button variant="outline" size="sm" className="text-xs" onClick={() => loadPreview(createdConnectionId)} data-testid="button-load-preview">
                  Load Preview
                </Button>
              )}

              {previewItems && previewItems.length > 0 && (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  <p className="text-xs font-semibold text-muted-foreground">Preview (first {Math.min(previewItems.length, 5)} items):</p>
                  {previewItems.slice(0, 5).map((item: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/30">
                      <span className="font-medium truncate flex-1">{item.title}</span>
                      <Badge variant="outline" className="text-xs">{item.status}</Badge>
                    </div>
                  ))}
                </div>
              )}

              <Button
                className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
                onClick={() => setDialogStep(4)}
                data-testid="button-next-step3"
              >
                Next
              </Button>
            </div>
          )}

          {/* Step 4: Done */}
          {dialogStep === 4 && (
            <div className="space-y-4 text-center py-4">
              <div className="flex justify-center">
                <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center">
                  <Check className="w-6 h-6 text-emerald-600" />
                </div>
              </div>
              <div>
                <p className="text-base font-medium">Integration connected!</p>
                <p className="text-sm text-muted-foreground mt-1">Click "Sync Now" to pull items into your compliance tracker.</p>
              </div>
              <Button
                className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
                onClick={() => {
                  setDialogOpen(false);
                  resetDialog();
                  if (createdConnectionId) handleSync(createdConnectionId);
                }}
                data-testid="button-done-sync"
              >
                <RefreshCw className="w-4 h-4 mr-1.5" /> Start First Sync
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => { setDialogOpen(false); resetDialog(); }}
                data-testid="button-done-close"
              >
                Done
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== MAIN PAGE ====================

// ==================== TAB 6: GO-LIVE READINESS ====================

function GoLiveReadinessTab({ contractId }: { contractId: number | null }) {
  const { toast } = useToast();
  const [scores, setScores] = useState<Record<string, { score: number; notes: string }>>({});
  const [assessorNotes, setAssessorNotes] = useState("");

  const { data: scorecard } = useQuery<any>({
    queryKey: ["/api/contracts", contractId, "go-live-scorecard"],
    queryFn: () => apiRequest("GET", `/api/contracts/${contractId}/go-live-scorecard`).then(r => r.json()),
    enabled: !!contractId,
  });

  // Load existing scorecard data
  useEffect(() => {
    if (scorecard?.criteria) {
      try {
        const parsed = typeof scorecard.criteria === "string" ? JSON.parse(scorecard.criteria) : scorecard.criteria;
        const loaded: Record<string, { score: number; notes: string }> = {};
        for (const c of parsed) loaded[c.key] = { score: c.score ?? 0, notes: c.notes ?? "" };
        setScores(loaded);
        setAssessorNotes(scorecard.assessorNotes || "");
      } catch {}
    }
  }, [scorecard]);

  const saveMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/contracts/${contractId}/go-live-scorecard`, data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "go-live-scorecard"] });
      toast({ title: "Scorecard saved" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (!contractId) {
    return <div className="text-center py-8 text-sm text-muted-foreground">Add a contract first to create a go-live scorecard.</div>;
  }

  function handleSave() {
    const criteria = GO_LIVE_CRITERIA.flatMap(cat => cat.items.map(item => ({
      key: item.key, label: item.label, category: cat.category, weight: item.weight,
      score: scores[item.key]?.score ?? 0, notes: scores[item.key]?.notes ?? "",
    })));
    saveMutation.mutate({ criteria, assessorNotes, assessedAt: new Date().toISOString() });
  }

  // Calculate overall for display
  const allItems = GO_LIVE_CRITERIA.flatMap(cat => cat.items);
  const totalWeight = allItems.reduce((s, i) => s + i.weight, 0);
  const weightedSum = allItems.reduce((s, i) => s + i.weight * (scores[i.key]?.score ?? 0), 0);
  const overallScore = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 10 * 10) / 10 : 0;
  const readiness = overallScore >= 85 ? "ready" : overallScore >= 70 ? "ready_with_conditions" : overallScore >= 50 ? "not_ready" : "critical_hold";
  const readinessLabels: Record<string, string> = { ready: "Ready", ready_with_conditions: "Ready with Conditions", not_ready: "Not Ready", critical_hold: "Critical Hold" };

  // Radar data by category
  const radarData = GO_LIVE_CRITERIA.map(cat => {
    const catWeight = cat.items.reduce((s, i) => s + i.weight, 0);
    const catWeightedSum = cat.items.reduce((s, i) => s + i.weight * (scores[i.key]?.score ?? 0), 0);
    return { category: cat.category, score: catWeight > 0 ? Math.round((catWeightedSum / catWeight) * 10) / 10 : 0, fullMark: 10 };
  });

  // Gauge SVG
  const gaugeRadius = 50;
  const gaugeCirc = Math.PI * gaugeRadius; // half circle
  const gaugeOffset = gaugeCirc - (overallScore / 100) * gaugeCirc;
  const gaugeColor = overallScore >= 85 ? "#22c55e" : overallScore >= 70 ? "#d4a853" : overallScore >= 50 ? "#ef4444" : "#991b1b";

  if (!scorecard && !Object.keys(scores).length) {
    // Empty state
    return (
      <div className="flex flex-col items-center py-12 gap-4">
        <Target className="w-12 h-12 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No go-live scorecard yet</p>
        <Button className="bg-accent hover:bg-accent/90 text-accent-foreground gap-2"
          onClick={() => {
            const init: Record<string, { score: number; notes: string }> = {};
            allItems.forEach(i => { init[i.key] = { score: 0, notes: "" }; });
            setScores(init);
          }} data-testid="button-create-scorecard">
          <Plus className="w-4 h-4" /> Create Scorecard
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Score Overview */}
      <div className="flex items-center gap-6">
        <svg width="120" height="70" viewBox="0 0 120 70">
          <path d="M 10 65 A 50 50 0 0 1 110 65" fill="none" stroke="hsl(var(--border))" strokeWidth="8" strokeLinecap="round" />
          <path d="M 10 65 A 50 50 0 0 1 110 65" fill="none" stroke={gaugeColor} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={`${gaugeCirc}`} strokeDashoffset={`${gaugeOffset}`} />
          <text x="60" y="55" textAnchor="middle" className="fill-foreground text-lg font-bold">{overallScore}%</text>
        </svg>
        <div>
          <Badge className={`text-xs ${READINESS_COLORS[readiness] || ""}`} data-testid="readiness-badge">{readinessLabels[readiness]}</Badge>
          <p className="text-xs text-muted-foreground mt-1">Overall Go-Live Readiness Score</p>
        </div>
        <div className="ml-auto">
          <Button size="sm" className="bg-accent hover:bg-accent/90 text-accent-foreground text-xs gap-1.5" onClick={handleSave} disabled={saveMutation.isPending} data-testid="button-save-scorecard">
            {saveMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Criteria Table */}
        <div className="col-span-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Criteria</TableHead>
                <TableHead className="text-xs w-16 text-center">Weight</TableHead>
                <TableHead className="text-xs w-32">Score (0-10)</TableHead>
                <TableHead className="text-xs">Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {GO_LIVE_CRITERIA.map(cat => (
                <>
                  <TableRow key={cat.category} className="bg-muted/30">
                    <TableCell colSpan={4} className="text-xs font-semibold py-1.5">{cat.category}</TableCell>
                  </TableRow>
                  {cat.items.map(item => (
                    <TableRow key={item.key}>
                      <TableCell className="text-sm py-1.5">{item.label}</TableCell>
                      <TableCell className="text-xs text-center py-1.5">{item.weight}</TableCell>
                      <TableCell className="py-1.5">
                        <input type="range" min="0" max="10" step="1" className="w-20 h-1.5 accent-amber-500"
                          value={scores[item.key]?.score ?? 0}
                          onChange={e => setScores(prev => ({ ...prev, [item.key]: { ...prev[item.key], score: parseInt(e.target.value), notes: prev[item.key]?.notes ?? "" } }))}
                          data-testid={`score-${item.key}`}
                        />
                        <span className="text-xs ml-1 font-mono">{scores[item.key]?.score ?? 0}</span>
                      </TableCell>
                      <TableCell className="py-1.5">
                        <Input className="h-6 text-xs" placeholder="Notes" value={scores[item.key]?.notes ?? ""}
                          onChange={e => setScores(prev => ({ ...prev, [item.key]: { ...prev[item.key], score: prev[item.key]?.score ?? 0, notes: e.target.value } }))}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </>
              ))}
            </TableBody>
          </Table>
          <Textarea placeholder="Assessor notes" className="mt-3 text-xs" value={assessorNotes} onChange={e => setAssessorNotes(e.target.value)} data-testid="assessor-notes" />
        </div>

        {/* Radar Chart */}
        <Card>
          <CardContent className="pt-4">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Category Radar</h4>
            <ResponsiveContainer width="100%" height={250}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis dataKey="category" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <PolarRadiusAxis angle={90} domain={[0, 10]} tick={{ fontSize: 9 }} />
                <Radar dataKey="score" stroke="#d4a853" fill="#d4a853" fillOpacity={0.3} />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function CompliancePage() {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id || "0");

  const { data: project } = useQuery<any>({
    queryKey: ["/api/projects", projectId],
    queryFn: () => apiRequest("GET", `/api/projects/${projectId}`).then(r => r.json()),
    enabled: !!projectId,
  });

  const { data: summary, isLoading } = useQuery<ComplianceSummary>({
    queryKey: ["/api/projects", projectId, "compliance-summary"],
    queryFn: () => apiRequest("GET", `/api/projects/${projectId}/compliance-summary`).then(r => r.json()),
    enabled: !!projectId,
  });

  const { data: vendors } = useQuery<any[]>({
    queryKey: ["/api/vendors"],
    queryFn: () => apiRequest("GET", "/api/vendors").then(r => r.json()),
  });

  const contracts = summary?.contracts || [];
  const primaryContractId = contracts[0]?.id || null;

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border/50 bg-card/50 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <Link href={`/projects/${projectId}`}>
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground hover:text-foreground -ml-2">
              <ChevronLeft className="w-4 h-4" />
              {project?.name || "Project"}
            </Button>
          </Link>
          <span className="text-muted-foreground/40">/</span>
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Shield className="w-5 h-5 text-accent" />
            Contract Compliance
          </h1>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-5">
          {/* Escalation Banner */}
          <EscalationBanner projectId={projectId} />

          {/* KPI Cards */}
          <KpiCards summary={summary} />

          {/* Tabs */}
          <Tabs defaultValue="baseline" className="w-full">
            <TabsList className="w-full justify-start" data-testid="compliance-tabs">
              <TabsTrigger value="baseline" data-testid="tab-baseline">Contract Baseline</TabsTrigger>
              <TabsTrigger value="checkpoints" data-testid="tab-checkpoints">IV&V Assessments</TabsTrigger>
              <TabsTrigger value="deviations" data-testid="tab-deviations">Deviations</TabsTrigger>
              <TabsTrigger value="evidence" data-testid="tab-evidence">Evidence Log</TabsTrigger>
              <TabsTrigger value="integrations" data-testid="tab-integrations">Integrations</TabsTrigger>
              <TabsTrigger value="golive" data-testid="tab-golive">Go-Live</TabsTrigger>
            </TabsList>

            <TabsContent value="baseline" className="mt-4">
              <ContractBaselineTab projectId={projectId} contracts={contracts} vendors={vendors || []} />
            </TabsContent>

            <TabsContent value="checkpoints" className="mt-4">
              <CheckpointsTab contractId={primaryContractId} projectId={projectId} />
            </TabsContent>

            <TabsContent value="deviations" className="mt-4">
              <DeviationsTab contractId={primaryContractId} projectId={projectId} />
            </TabsContent>

            <TabsContent value="evidence" className="mt-4">
              <EvidenceLogTab contractId={primaryContractId} projectId={projectId} />
            </TabsContent>

            <TabsContent value="integrations" className="mt-4">
              <IntegrationsTab projectId={projectId} contractId={primaryContractId} />
            </TabsContent>

            <TabsContent value="golive" className="mt-4">
              <div className="flex flex-col items-center py-12 gap-4 text-center">
                <Rocket className="w-10 h-10 text-muted-foreground/30" />
                <div>
                  <p className="text-base font-medium">Go-Live Readiness has moved</p>
                  <p className="text-sm text-muted-foreground mt-1">The Go-Live Readiness assessment now has its own page with AI-powered auto-scoring.</p>
                </div>
                <Link href={`/projects/${projectId}/go-live`}>
                  <Button className="gap-2 text-xs">
                    <Rocket className="w-3.5 h-3.5" />Open Go-Live Readiness<ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </Link>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>

    </div>
  );
}
