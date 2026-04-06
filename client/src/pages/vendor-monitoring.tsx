import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Radar,
  Activity,
  AlertTriangle,
  Bell,
  Check,
  ChevronDown,
  ExternalLink,
  Eye,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Radio,
  BookOpen,
  Shield,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MonitoringStats {
  totalSources: number;
  activeSources: number;
  totalChanges: number;
  unreviewedChanges: number;
  activeAlerts: number;
  lastScanAt: string | null;
}

interface MonitoringSource {
  id: number;
  vendorPlatform: string;
  name: string;
  url: string;
  sourceType: string;
  checkFrequency: string;
  isActive: number;
  lastCheckedAt: string | null;
  lastContentHash: string | null;
}

interface VendorChange {
  id: number;
  vendorPlatform: string;
  changeType: string;
  severity: string;
  title: string;
  summary: string | null;
  details: string | null;
  affectedModules: string | null; // JSON string from DB
  rawExcerpt: string | null;
  sourceUrl: string | null;
  isReviewed: number;
  isApplied: number;
  createdAt: string;
}

interface MonitoringAlert {
  id: number;
  changeId: number;
  alertType: string;
  priority: string;
  title: string;
  message: string;
  affectedProjects: string | null;
  isDismissed: number;
  createdAt: string;
}

function parseJsonArray(val: any): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return []; }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORM_COLORS: Record<string, string> = {
  workday: "#F68D2E",
  oracle_cloud: "#C74634",
  oracle_eam: "#C74634",
  tyler: "#1B365D",
  maximo: "#0530AD",
  nv5: "#2D8C3C",
};

const PLATFORM_LABELS: Record<string, string> = {
  workday: "Workday",
  oracle_cloud: "Oracle Cloud",
  oracle_eam: "Oracle EAM",
  tyler: "Tyler",
  maximo: "Maximo",
  nv5: "NV5",
};

const VENDOR_PLATFORMS = [
  { value: "__all__", label: "All Platforms" },
  { value: "workday", label: "Workday" },
  { value: "oracle_cloud", label: "Oracle Cloud" },
  { value: "oracle_eam", label: "Oracle EAM" },
  { value: "tyler", label: "Tyler" },
  { value: "maximo", label: "Maximo" },
  { value: "nv5", label: "NV5" },
];

const CHANGE_TYPES = [
  { value: "__all__", label: "All Types" },
  { value: "new_feature", label: "New Feature" },
  { value: "deprecation", label: "Deprecation" },
  { value: "pricing_change", label: "Pricing Change" },
  { value: "acquisition", label: "Acquisition" },
  { value: "partnership", label: "Partnership" },
  { value: "certification", label: "Certification" },
  { value: "bug_fix", label: "Bug Fix" },
  { value: "roadmap_update", label: "Roadmap Update" },
];

const SOURCE_TYPES = [
  { value: "release_notes", label: "Release Notes" },
  { value: "press_release", label: "Press Release" },
  { value: "product_page", label: "Product Page" },
  { value: "changelog", label: "Changelog" },
  { value: "blog", label: "Blog" },
  { value: "documentation", label: "Documentation" },
];

const FREQUENCIES = [
  { value: "hourly", label: "Hourly" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
];

// ─── Badge helpers ────────────────────────────────────────────────────────────

function severityClass(severity: string): string {
  switch (severity) {
    case "critical": return "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400";
    case "high":     return "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400";
    case "medium":   return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400";
    case "low":      return "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400";
    default:         return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
  }
}

function changeTypeClass(type: string): string {
  switch (type) {
    case "new_feature":     return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400";
    case "deprecation":     return "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400";
    case "pricing_change":  return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400";
    case "acquisition":     return "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400";
    case "partnership":     return "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400";
    case "certification":   return "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400";
    case "bug_fix":         return "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400";
    case "roadmap_update":  return "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400";
    default:                return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
  }
}

function sourceTypeClass(type: string): string {
  switch (type) {
    case "release_notes": return "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400";
    case "press_release": return "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400";
    case "product_page":  return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400";
    case "changelog":     return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400";
    case "blog":          return "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400";
    case "documentation": return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
    default:              return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
  }
}

function priorityClass(priority: string): string {
  switch (priority) {
    case "urgent": return "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400";
    case "high":   return "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400";
    case "medium": return "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400";
    case "low":    return "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400";
    default:       return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
  }
}

function formatLabel(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatRelative(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ─── PlatformBadge ─────────────────────────────────────────────────────────

function PlatformBadge({ platform }: { platform: string }) {
  const color = PLATFORM_COLORS[platform] || "#6b7280";
  const label = PLATFORM_LABELS[platform] || formatLabel(platform);
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-white"
      style={{ backgroundColor: color }}
    >
      {label}
    </span>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  accent,
  loading,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  accent?: string;
  loading?: boolean;
}) {
  return (
    <Card className="border-[#1a2744]/20 dark:border-white/10">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground font-medium">{label}</span>
          <span className={`text-muted-foreground/60 ${accent || ""}`}>{icon}</span>
        </div>
        {loading ? (
          <Skeleton className="h-7 w-16" />
        ) : (
          <p className={`text-xl font-bold ${accent || "text-foreground"}`}>{value}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── ChangeCard ───────────────────────────────────────────────────────────────

function ChangeCard({
  change,
  onReview,
  onApply,
  reviewingId,
  applyingId,
}: {
  change: VendorChange;
  onReview: (id: number) => void;
  onApply: (id: number) => void;
  reviewingId: number | null;
  applyingId: number | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Card
      className={`border-[#1a2744]/20 dark:border-white/10 transition-colors ${
        Boolean(change.isReviewed) ? "opacity-70" : ""
      }`}
      data-testid={`change-card-${change.id}`}
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                <PlatformBadge platform={change.vendorPlatform} />
                <Badge className={`text-xs ${severityClass(change.severity)}`} variant="outline">
                  {formatLabel(change.severity)}
                </Badge>
                <Badge className={`text-xs ${changeTypeClass(change.changeType)}`} variant="outline">
                  {formatLabel(change.changeType)}
                </Badge>
                {Boolean(change.isReviewed) && (
                  <Badge className="text-xs bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" variant="outline">
                    <Check className="w-3 h-3 mr-1" />
                    Reviewed
                  </Badge>
                )}
              </div>
              <p className="text-sm font-semibold text-foreground leading-snug">{change.title}</p>
              {change.summary && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{change.summary}</p>
              )}
              <div className="flex items-center gap-3 mt-1.5">
                <span className="text-xs text-muted-foreground/70">{formatRelative(change.createdAt)}</span>
                {change.sourceUrl && (
                  <a
                    href={change.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-xs text-[#d4a853] hover:underline"
                    data-testid={`change-source-${change.id}`}
                  >
                    Source <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {!Boolean(change.isReviewed) && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs hover:text-emerald-600"
                  onClick={() => onReview(change.id)}
                  disabled={reviewingId === change.id}
                  data-testid={`review-btn-${change.id}`}
                >
                  {reviewingId === change.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Check className="w-3 h-3" />
                  )}
                </Button>
              )}
              {!Boolean(change.isApplied) && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs hover:text-[#d4a853]"
                  onClick={() => onApply(change.id)}
                  disabled={applyingId === change.id}
                  data-testid={`apply-btn-${change.id}`}
                >
                  {applyingId === change.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <BookOpen className="w-3 h-3" />
                  )}
                </Button>
              )}
              <CollapsibleTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  data-testid={`expand-change-${change.id}`}
                >
                  <ChevronDown
                    className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`}
                  />
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>
        </div>
        <CollapsibleContent>
          <div className="px-4 pb-4 pt-0 border-t border-[#1a2744]/10 dark:border-white/10 mt-2 space-y-3">
            {change.details && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Analysis
                </p>
                <p className="text-xs text-foreground/80 leading-relaxed">{change.details}</p>
              </div>
            )}
            {parseJsonArray(change.affectedModules).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Affected Modules
                </p>
                <div className="flex flex-wrap gap-1">
                  {parseJsonArray(change.affectedModules).map((m) => (
                    <Badge key={m} variant="secondary" className="text-xs">
                      {m}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {change.rawExcerpt && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Raw Excerpt
                </p>
                <pre className="text-xs bg-muted/50 rounded p-2 whitespace-pre-wrap break-words font-mono leading-relaxed max-h-32 overflow-y-auto">
                  {change.rawExcerpt}
                </pre>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

// ─── AlertCard ────────────────────────────────────────────────────────────────

function AlertCard({
  alert,
  onDismiss,
  dismissingId,
}: {
  alert: MonitoringAlert;
  onDismiss: (id: number) => void;
  dismissingId: number | null;
}) {
  return (
    <Card
      className="border-[#1a2744]/20 dark:border-white/10"
      data-testid={`alert-card-${alert.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              <Badge className={`text-xs ${priorityClass(alert.priority)}`} variant="outline">
                {formatLabel(alert.priority)}
              </Badge>
            </div>
            <p className="text-sm font-semibold text-foreground">{alert.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{alert.message}</p>
            <p className="text-xs text-muted-foreground/60 mt-1">{formatRelative(alert.createdAt)}</p>
          </div>
          {!Boolean(alert.isDismissed) && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 shrink-0 text-xs hover:text-destructive"
              onClick={() => onDismiss(alert.id)}
              disabled={dismissingId === alert.id}
              data-testid={`dismiss-alert-${alert.id}`}
            >
              {dismissingId === alert.id ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Check className="w-3 h-3" />
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── AddSourceDialog ──────────────────────────────────────────────────────────

function AddSourceDialog({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    vendorPlatform: "",
    name: "",
    url: "",
    sourceType: "",
    checkFrequency: "daily",
  });
  const { toast } = useToast();

  const addMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await apiRequest("POST", "/api/monitoring/sources", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Source added" });
      setOpen(false);
      setForm({ vendorPlatform: "", name: "", url: "", sourceType: "", checkFrequency: "daily" });
      onAdded();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add source", description: err.message, variant: "destructive" });
    },
  });

  const isValid = form.vendorPlatform && form.name && form.url && form.sourceType;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-[#d4a853] hover:bg-[#c49540] text-[#1a2744]" data-testid="add-source-btn">
          <Plus className="w-3.5 h-3.5 mr-1" />
          Add Source
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Add Monitoring Source</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="add-platform" className="text-xs">Vendor Platform</Label>
            <Select
              value={form.vendorPlatform}
              onValueChange={(v) => setForm((f) => ({ ...f, vendorPlatform: v }))}
            >
              <SelectTrigger id="add-platform" data-testid="add-platform-select">
                <SelectValue placeholder="Select platform" />
              </SelectTrigger>
              <SelectContent>
                {VENDOR_PLATFORMS.filter((p) => p.value !== "__all__").map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-name" className="text-xs">Name</Label>
            <Input
              id="add-name"
              placeholder="e.g. Workday Release Notes"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              data-testid="add-name-input"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-url" className="text-xs">URL</Label>
            <Input
              id="add-url"
              placeholder="https://..."
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              data-testid="add-url-input"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-type" className="text-xs">Source Type</Label>
            <Select
              value={form.sourceType}
              onValueChange={(v) => setForm((f) => ({ ...f, sourceType: v }))}
            >
              <SelectTrigger id="add-type" data-testid="add-type-select">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-freq" className="text-xs">Check Frequency</Label>
            <Select
              value={form.checkFrequency}
              onValueChange={(v) => setForm((f) => ({ ...f, checkFrequency: v }))}
            >
              <SelectTrigger id="add-freq" data-testid="add-freq-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FREQUENCIES.map((f) => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-[#d4a853] hover:bg-[#c49540] text-[#1a2744]"
              disabled={!isValid || addMutation.isPending}
              onClick={() => addMutation.mutate(form)}
              data-testid="add-source-submit"
            >
              {addMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
              ) : null}
              Add Source
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function VendorMonitoring() {
  const { toast } = useToast();

  // Filter state
  const [changeFilter, setChangeFilter] = useState({
    vendorPlatform: "__all__",
    changeType: "__all__",
    isReviewed: "__all__" as "__all__" | "0" | "1",
  });

  // Mutation tracking state
  const [scanningSourceId, setScanningSourceId] = useState<number | null>(null);
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [applyingId, setApplyingId] = useState<number | null>(null);
  const [dismissingId, setDismissingId] = useState<number | null>(null);
  const [dismissedOpen, setDismissedOpen] = useState(false);

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: stats, isLoading: statsLoading } = useQuery<MonitoringStats>({
    queryKey: ["/api/monitoring/stats"],
    refetchInterval: 30000,
  });

  const { data: sources = [], isLoading: sourcesLoading } = useQuery<MonitoringSource[]>({
    queryKey: ["/api/monitoring/sources"],
  });

  const changeQueryParams = new URLSearchParams();
  if (changeFilter.vendorPlatform !== "__all__") changeQueryParams.set("vendorPlatform", changeFilter.vendorPlatform);
  if (changeFilter.changeType !== "__all__") changeQueryParams.set("changeType", changeFilter.changeType);
  if (changeFilter.isReviewed !== "__all__") changeQueryParams.set("isReviewed", changeFilter.isReviewed);
  const changeQueryString = changeQueryParams.toString();

  const { data: changes = [], isLoading: changesLoading } = useQuery<VendorChange[]>({
    queryKey: [`/api/monitoring/changes?${changeQueryString}`],
  });

  const { data: recentChanges = [], isLoading: recentChangesLoading } = useQuery<VendorChange[]>({
    queryKey: ["/api/monitoring/changes?"],
  });

  const { data: alerts = [], isLoading: alertsLoading } = useQuery<MonitoringAlert[]>({
    queryKey: ["/api/monitoring/alerts?isDismissed=0"],
  });

  const { data: dismissedAlerts = [] } = useQuery<MonitoringAlert[]>({
    queryKey: ["/api/monitoring/alerts?isDismissed=1"],
  });

  // ── Mutations ─────────────────────────────────────────────────────────────

  const seedSourcesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/monitoring/seed-sources");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Default sources seeded successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/monitoring/sources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/monitoring/stats"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to seed sources", description: err.message, variant: "destructive" });
    },
  });

  const scanAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/monitoring/scan-all");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Scan triggered for all active sources" });
      queryClient.invalidateQueries({ queryKey: ["/api/monitoring/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/monitoring/changes?"] });
      queryClient.invalidateQueries({ queryKey: ["/api/monitoring/alerts?isDismissed=0"] });
    },
    onError: (err: Error) => {
      toast({ title: "Scan failed", description: err.message, variant: "destructive" });
    },
  });

  const scanSourceMutation = useMutation({
    mutationFn: async (sourceId: number) => {
      setScanningSourceId(sourceId);
      const res = await apiRequest("POST", `/api/monitoring/scan/${sourceId}`);
      return res.json();
    },
    onSuccess: (_data, sourceId) => {
      toast({ title: "Source scan triggered" });
      setScanningSourceId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/monitoring/sources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/monitoring/stats"] });
    },
    onError: (err: Error) => {
      setScanningSourceId(null);
      toast({ title: "Scan failed", description: err.message, variant: "destructive" });
    },
  });

  const toggleSourceMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: number }) => {
      const res = await apiRequest("PATCH", `/api/monitoring/sources/${id}`, { isActive });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/monitoring/sources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/monitoring/stats"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to toggle source", description: err.message, variant: "destructive" });
    },
  });

  const deleteSourceMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/monitoring/sources/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Source removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/monitoring/sources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/monitoring/stats"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete source", description: err.message, variant: "destructive" });
    },
  });

  const reviewChangeMutation = useMutation({
    mutationFn: async (id: number) => {
      setReviewingId(id);
      const res = await apiRequest("PATCH", `/api/monitoring/changes/${id}`, { isReviewed: 1 });
      return res.json();
    },
    onSuccess: () => {
      setReviewingId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/monitoring/changes?"] });
      queryClient.invalidateQueries({ queryKey: [`/api/monitoring/changes?${changeQueryString}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/monitoring/stats"] });
    },
    onError: (err: Error) => {
      setReviewingId(null);
      toast({ title: "Failed to mark reviewed", description: err.message, variant: "destructive" });
    },
  });

  const applyChangeMutation = useMutation({
    mutationFn: async (id: number) => {
      setApplyingId(id);
      const res = await apiRequest("PATCH", `/api/monitoring/changes/${id}`, { isApplied: 1 });
      return res.json();
    },
    onSuccess: () => {
      setApplyingId(null);
      toast({ title: "Applied to knowledge base" });
      queryClient.invalidateQueries({ queryKey: ["/api/monitoring/changes?"] });
      queryClient.invalidateQueries({ queryKey: [`/api/monitoring/changes?${changeQueryString}`] });
    },
    onError: (err: Error) => {
      setApplyingId(null);
      toast({ title: "Failed to apply change", description: err.message, variant: "destructive" });
    },
  });

  const dismissAlertMutation = useMutation({
    mutationFn: async (id: number) => {
      setDismissingId(id);
      const res = await apiRequest("PATCH", `/api/monitoring/alerts/${id}`, { isDismissed: 1 });
      return res.json();
    },
    onSuccess: () => {
      setDismissingId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/monitoring/alerts?isDismissed=0"] });
      queryClient.invalidateQueries({ queryKey: ["/api/monitoring/alerts?isDismissed=1"] });
      queryClient.invalidateQueries({ queryKey: ["/api/monitoring/stats"] });
    },
    onError: (err: Error) => {
      setDismissingId(null);
      toast({ title: "Failed to dismiss alert", description: err.message, variant: "destructive" });
    },
  });

  // ── Grouped sources ───────────────────────────────────────────────────────

  const sourcesByPlatform = sources.reduce<Record<string, MonitoringSource[]>>((acc, src) => {
    const key = src.vendorPlatform;
    if (!acc[key]) acc[key] = [];
    acc[key].push(src);
    return acc;
  }, {});

  // ── Render ────────────────────────────────────────────────────────────────

  const activeAlerts = alerts.filter((a) => !Boolean(a.isDismissed));
  const highPriorityAlerts = activeAlerts.filter(
    (a) => a.priority === "urgent" || a.priority === "high"
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" data-testid="vendor-monitoring-page">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#1a2744] flex items-center justify-center shrink-0">
            <Radar className="w-5 h-5 text-[#d4a853]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Vendor Intelligence Monitor</h1>
            <p className="text-xs text-muted-foreground">
              Track vendor platform changes, releases, and alerts across your ERP ecosystem
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {stats?.lastScanAt && (
            <span className="text-xs text-muted-foreground hidden sm:block">
              Last scan: {formatRelative(stats.lastScanAt)}
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => scanAllMutation.mutate()}
            disabled={scanAllMutation.isPending}
            data-testid="scan-all-btn"
          >
            {scanAllMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            )}
            Scan All
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="bg-muted/50 border border-[#1a2744]/10 dark:border-white/10">
          <TabsTrigger value="overview" className="text-xs" data-testid="tab-overview">
            <Activity className="w-3.5 h-3.5 mr-1.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="sources" className="text-xs" data-testid="tab-sources">
            <Radio className="w-3.5 h-3.5 mr-1.5" />
            Sources
          </TabsTrigger>
          <TabsTrigger value="changes" className="text-xs" data-testid="tab-changes">
            <Eye className="w-3.5 h-3.5 mr-1.5" />
            Change Log
          </TabsTrigger>
          <TabsTrigger value="alerts" className="text-xs" data-testid="tab-alerts">
            <Bell className="w-3.5 h-3.5 mr-1.5" />
            Alerts
            {activeAlerts.length > 0 && (
              <span className="ml-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {activeAlerts.length > 9 ? "9+" : activeAlerts.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Tab: Overview ─────────────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-6">
          {/* Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard
              label="Total Sources"
              value={stats?.totalSources ?? 0}
              icon={<Radio className="w-4 h-4" />}
              loading={statsLoading}
            />
            <StatCard
              label="Active Sources"
              value={stats?.activeSources ?? 0}
              icon={<Activity className="w-4 h-4" />}
              accent="text-emerald-500"
              loading={statsLoading}
            />
            <StatCard
              label="Changes Detected"
              value={stats?.totalChanges ?? 0}
              icon={<Eye className="w-4 h-4" />}
              loading={statsLoading}
            />
            <StatCard
              label="Needs Review"
              value={stats?.unreviewedChanges ?? 0}
              icon={<AlertTriangle className="w-4 h-4" />}
              accent={stats?.unreviewedChanges ? "text-amber-500" : undefined}
              loading={statsLoading}
            />
            <StatCard
              label="Active Alerts"
              value={stats?.activeAlerts ?? 0}
              icon={<Bell className="w-4 h-4" />}
              accent={stats?.activeAlerts ? "text-red-500" : undefined}
              loading={statsLoading}
            />
          </div>

          {/* High-priority alert banners */}
          {!alertsLoading && highPriorityAlerts.length > 0 && (
            <div className="space-y-2" data-testid="alert-banner-section">
              {highPriorityAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-start gap-3 p-3 rounded-lg border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20"
                  data-testid={`alert-banner-${alert.id}`}
                >
                  <Shield className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Badge className={`text-xs ${priorityClass(alert.priority)}`} variant="outline">
                        {formatLabel(alert.priority)}
                      </Badge>
                    </div>
                    <p className="text-sm font-semibold text-red-700 dark:text-red-400">{alert.title}</p>
                    <p className="text-xs text-red-600/80 dark:text-red-400/70 mt-0.5">{alert.message}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs text-red-500 hover:text-red-700 shrink-0"
                    onClick={() => dismissAlertMutation.mutate(alert.id)}
                    disabled={dismissingId === alert.id}
                    data-testid={`banner-dismiss-${alert.id}`}
                  >
                    {dismissingId === alert.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Check className="w-3 h-3" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Recent changes feed */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-[#d4a853]" />
                Recent Changes
              </h2>
              <span className="text-xs text-muted-foreground">
                {recentChanges.length} change{recentChanges.length !== 1 ? "s" : ""}
              </span>
            </div>

            {recentChangesLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 rounded-lg" />
                ))}
              </div>
            ) : recentChanges.length === 0 ? (
              <Card className="border-dashed border-[#1a2744]/20 dark:border-white/10">
                <CardContent className="py-12 text-center">
                  <Radar className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No changes detected yet</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Add monitoring sources and run a scan to detect changes
                  </p>
                </CardContent>
              </Card>
            ) : (
              <ScrollArea className="max-h-[480px]">
                <div className="space-y-2 pr-2">
                  {recentChanges.slice(0, 20).map((change) => (
                    <ChangeCard
                      key={change.id}
                      change={change}
                      onReview={(id) => reviewChangeMutation.mutate(id)}
                      onApply={(id) => applyChangeMutation.mutate(id)}
                      reviewingId={reviewingId}
                      applyingId={applyingId}
                    />
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </TabsContent>

        {/* ── Tab: Sources ──────────────────────────────────────────────────── */}
        <TabsContent value="sources" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {sources.length} source{sources.length !== 1 ? "s" : ""} configured
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => seedSourcesMutation.mutate()}
                disabled={seedSourcesMutation.isPending}
                data-testid="seed-sources-btn"
              >
                {seedSourcesMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                ) : (
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                )}
                Seed Default Sources
              </Button>
              <AddSourceDialog
                onAdded={() => {
                  queryClient.invalidateQueries({ queryKey: ["/api/monitoring/sources"] });
                  queryClient.invalidateQueries({ queryKey: ["/api/monitoring/stats"] });
                }}
              />
            </div>
          </div>

          {sourcesLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : sources.length === 0 ? (
            <Card className="border-dashed border-[#1a2744]/20 dark:border-white/10">
              <CardContent className="py-12 text-center">
                <Radio className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No sources configured</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Seed default sources or add your own to get started
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {Object.entries(sourcesByPlatform).map(([platform, platformSources]) => (
                <div key={platform} data-testid={`source-group-${platform}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <PlatformBadge platform={platform} />
                    <span className="text-xs text-muted-foreground">
                      {platformSources.length} source{platformSources.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <Card className="border-[#1a2744]/20 dark:border-white/10 overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableHead className="text-xs w-[220px]">Name</TableHead>
                          <TableHead className="text-xs">URL</TableHead>
                          <TableHead className="text-xs w-[120px]">Type</TableHead>
                          <TableHead className="text-xs w-[90px]">Frequency</TableHead>
                          <TableHead className="text-xs w-[90px]">Status</TableHead>
                          <TableHead className="text-xs w-[100px]">Last Checked</TableHead>
                          <TableHead className="text-xs w-[100px] text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {platformSources.map((src) => (
                          <TableRow key={src.id} data-testid={`source-row-${src.id}`}>
                            <TableCell className="text-xs font-medium py-2.5">{src.name}</TableCell>
                            <TableCell className="text-xs py-2.5">
                              <a
                                href={src.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#d4a853] hover:underline inline-flex items-center gap-0.5 max-w-[200px] truncate"
                                title={src.url}
                              >
                                <span className="truncate">{src.url}</span>
                                <ExternalLink className="w-3 h-3 shrink-0" />
                              </a>
                            </TableCell>
                            <TableCell className="py-2.5">
                              <Badge
                                className={`text-xs ${sourceTypeClass(src.sourceType)}`}
                                variant="outline"
                              >
                                {formatLabel(src.sourceType)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs py-2.5 text-muted-foreground capitalize">
                              {src.checkFrequency}
                            </TableCell>
                            <TableCell className="py-2.5">
                              <Badge
                                className={`text-xs ${
                                  Boolean(src.isActive)
                                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                                    : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                                }`}
                                variant="outline"
                              >
                                {Boolean(src.isActive) ? "Active" : "Paused"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs py-2.5 text-muted-foreground">
                              {formatRelative(src.lastCheckedAt)}
                            </TableCell>
                            <TableCell className="py-2.5">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 hover:text-[#d4a853]"
                                  onClick={() => scanSourceMutation.mutate(src.id)}
                                  disabled={scanningSourceId === src.id}
                                  title="Scan now"
                                  data-testid={`scan-source-${src.id}`}
                                >
                                  {scanningSourceId === src.id ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Play className="w-3 h-3" />
                                  )}
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6"
                                  onClick={() =>
                                    toggleSourceMutation.mutate({
                                      id: src.id,
                                      isActive: src.isActive ? 0 : 1,
                                    })
                                  }
                                  title={Boolean(src.isActive) ? "Pause" : "Activate"}
                                  data-testid={`toggle-source-${src.id}`}
                                >
                                  {Boolean(src.isActive) ? (
                                    <Pause className="w-3 h-3" />
                                  ) : (
                                    <Play className="w-3 h-3" />
                                  )}
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 hover:text-destructive"
                                  onClick={() => deleteSourceMutation.mutate(src.id)}
                                  title="Delete"
                                  data-testid={`delete-source-${src.id}`}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Tab: Change Log ───────────────────────────────────────────────── */}
        <TabsContent value="changes" className="space-y-4">
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2" data-testid="change-filters">
            <Select
              value={changeFilter.vendorPlatform}
              onValueChange={(v) =>
                setChangeFilter((f) => ({ ...f, vendorPlatform: v }))
              }
            >
              <SelectTrigger className="h-8 text-xs w-[160px]" data-testid="filter-platform">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VENDOR_PLATFORMS.map((p) => (
                  <SelectItem key={p.value} value={p.value} className="text-xs">
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={changeFilter.changeType}
              onValueChange={(v) =>
                setChangeFilter((f) => ({ ...f, changeType: v }))
              }
            >
              <SelectTrigger className="h-8 text-xs w-[160px]" data-testid="filter-change-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHANGE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value} className="text-xs">
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div
              className="flex rounded-md border border-input overflow-hidden h-8"
              data-testid="filter-review-status"
            >
              {(
                [
                  { val: "__all__" as const, label: "All" },
                  { val: "0" as const, label: "Unreviewed" },
                  { val: "1" as const, label: "Reviewed" },
                ] as const
              ).map(({ val, label }) => (
                <button
                  key={val}
                  className={`px-3 text-xs font-medium transition-colors ${
                    changeFilter.isReviewed === val
                      ? "bg-[#1a2744] text-white dark:bg-[#d4a853] dark:text-[#1a2744]"
                      : "text-muted-foreground hover:bg-muted/50"
                  }`}
                  onClick={() => setChangeFilter((f) => ({ ...f, isReviewed: val }))}
                  data-testid={`filter-review-${val}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <span className="text-xs text-muted-foreground ml-auto">
              {changes.length} result{changes.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Change cards */}
          {changesLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-24 rounded-lg" />
              ))}
            </div>
          ) : changes.length === 0 ? (
            <Card className="border-dashed border-[#1a2744]/20 dark:border-white/10">
              <CardContent className="py-12 text-center">
                <Eye className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No changes match your filters</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Try adjusting the filters above
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {changes.map((change) => (
                <ChangeCard
                  key={change.id}
                  change={change}
                  onReview={(id) => reviewChangeMutation.mutate(id)}
                  onApply={(id) => applyChangeMutation.mutate(id)}
                  reviewingId={reviewingId}
                  applyingId={applyingId}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Tab: Alerts ───────────────────────────────────────────────────── */}
        <TabsContent value="alerts" className="space-y-6">
          {/* Active alerts */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Bell className="w-4 h-4 text-[#d4a853]" />
                Active Alerts
              </h2>
              <span className="text-xs text-muted-foreground">
                {activeAlerts.length} active
              </span>
            </div>

            {alertsLoading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-20 rounded-lg" />
                ))}
              </div>
            ) : activeAlerts.length === 0 ? (
              <Card className="border-dashed border-[#1a2744]/20 dark:border-white/10">
                <CardContent className="py-10 text-center">
                  <Bell className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No active alerts</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    You're all caught up
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {activeAlerts.map((alert) => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    onDismiss={(id) => dismissAlertMutation.mutate(id)}
                    dismissingId={dismissingId}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Dismissed alerts (collapsible) */}
          <Collapsible open={dismissedOpen} onOpenChange={setDismissedOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground w-full justify-between border border-[#1a2744]/10 dark:border-white/10 rounded-lg px-4 h-9"
                data-testid="dismissed-collapsible-trigger"
              >
                <span className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  Dismissed Alerts ({dismissedAlerts.length})
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${dismissedOpen ? "rotate-180" : ""}`}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-2 mt-2">
                {dismissedAlerts.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No dismissed alerts
                  </p>
                ) : (
                  dismissedAlerts.map((alert) => (
                    <AlertCard
                      key={alert.id}
                      alert={alert}
                      onDismiss={() => {}}
                      dismissingId={null}
                    />
                  ))
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </TabsContent>
      </Tabs>
    </div>
  );
}
