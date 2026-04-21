import { useState, useMemo, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChevronLeft,
  BarChart3,
  AlertTriangle,
  CheckCircle2,
  Zap,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Building2,
  Star,
  TrendingUp,
  DollarSign,
  MapPin,
  Download,
  FileText,
  SlidersHorizontal,
  Loader2,
  Filter,
  ChevronsUpDown,
  Plus,
  Trash2,
  Pencil,
  ListChecks,
  Sparkles,
  Brain,
  Upload,
  ChevronUp,
} from "lucide-react";
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
import { ChatPanel } from "@/components/chat-panel";
import { defaultModuleWeights } from "@shared/vendors";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";

// ==================== TYPES ====================

interface VendorCosts {
  implementationTotal: number;
  ongoingAnnual: number;
  sevenYearTotal: number;
  platform: string;
  eam: string;
  hcm: string;
  pms: string;
}

interface VendorInfo {
  id: number;
  name: string;
  shortName: string;
  description: string;
  market: string;
  color: string;
  strengths: string[];
  weaknesses: string[];
  moduleRatings: Record<string, number>;
  platformType?: "erp" | "eam" | "pms";
  coveredModules?: string[];
  costs?: VendorCosts;
}

interface ModuleScore {
  functionalArea: string;
  category: string;
  weight: number;
  score: number;
  requirementCount: number;
  criticalGapCount: number;
}

interface VendorEvaluationResult {
  vendorId: number;
  vendorName: string;
  vendorShortName: string;
  color: string;
  overallScore: number;
  moduleScores: Record<string, ModuleScore>;
}

interface GapItem {
  requirementId: number;
  reqNumber: string;
  functionalArea: string;
  category: string;
  subCategory: string;
  description: string;
  criticality: string;
  scores: Record<number, string>;
}

interface EvaluationData {
  hasScores: boolean;
  vendors: VendorInfo[];
  settings: {
    moduleWeights: Record<string, number>;
    selectedVendors: number[];
  };
  evaluation: {
    vendors: VendorEvaluationResult[];
    gaps: GapItem[];
    moduleWeights: Record<string, number>;
    selectedVendorIds: number[];
  } | null;
}

// ==================== SCORE HELPERS ====================

const SCORE_COLORS: Record<string, string> = {
  S: "#22c55e",
  F: "#84cc16",
  C: "#eab308",
  T: "#f97316",
  N: "#ef4444",
};

const SCORE_LABELS: Record<string, string> = {
  S: "Standard",
  F: "Future",
  C: "Custom",
  T: "Third Party",
  N: "Not Supported",
};

function getScoreColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 60) return "#d4a853";
  return "#ef4444";
}

function getScoreBg(score: number): string {
  if (score >= 80) return "bg-green-500/15 text-green-400 border border-green-500/20";
  if (score >= 60) return "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20";
  return "bg-red-500/15 text-red-400 border border-red-500/20";
}

function ScoreBadge({ score }: { score: string }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded text-xs font-bold px-1.5 py-0.5 min-w-[22px]"
      style={{ backgroundColor: `${SCORE_COLORS[score]}22`, color: SCORE_COLORS[score], border: `1px solid ${SCORE_COLORS[score]}44` }}
      title={SCORE_LABELS[score] || score}
    >
      {score || "—"}
    </span>
  );
}

// ==================== COST COMPARISON CARD ====================

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function CostBarChart({ data, dataKey, label }: { data: { name: string; value: number; color: string; isLowest: boolean }[]; dataKey: string; label: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 text-center">{label}</p>
      <div className="h-[200px]" data-testid={`chart-cost-${dataKey}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v: number) => formatCurrency(v)} width={60} />
            <RechartsTooltip
              content={({ active, payload }) => {
                if (active && payload && payload[0]) {
                  const d = payload[0].payload;
                  return (
                    <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg">
                      <p className="text-sm font-semibold text-foreground">{d.name}</p>
                      <p className="text-sm font-bold text-accent">{formatCurrency(d.value)}</p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={48} label={{ position: "top", fontSize: 10, fill: "hsl(var(--muted-foreground))", formatter: (v: number) => formatCurrency(v) }}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} fillOpacity={0.85} stroke={entry.isLowest ? "#d4a853" : "transparent"} strokeWidth={entry.isLowest ? 2 : 0} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function CostComparisonCard({ vendors, totalRequirements }: { vendors: VendorInfo[]; totalRequirements?: number }) {
  const vendorsWithCosts = vendors.filter(v => v.costs);
  if (vendorsWithCosts.length === 0) return null;

  const sorted = vendorsWithCosts.slice().sort((a, b) => a.costs!.sevenYearTotal - b.costs!.sevenYearTotal);
  const minImpl = Math.min(...vendorsWithCosts.map(v => v.costs!.implementationTotal));
  const minAnnual = Math.min(...vendorsWithCosts.map(v => v.costs!.ongoingAnnual));
  const minTco = Math.min(...vendorsWithCosts.map(v => v.costs!.sevenYearTotal));

  const implData = sorted.map(v => ({ name: v.shortName, value: v.costs!.implementationTotal, color: v.color, isLowest: v.costs!.implementationTotal === minImpl }));
  const annualData = sorted.map(v => ({ name: v.shortName, value: v.costs!.ongoingAnnual, color: v.color, isLowest: v.costs!.ongoingAnnual === minAnnual }));
  const tcoData = sorted.map(v => ({ name: v.shortName, value: v.costs!.sevenYearTotal, color: v.color, isLowest: v.costs!.sevenYearTotal === minTco }));

  const tcoBreakdownData = sorted.map(v => ({
    name: v.shortName,
    implementation: v.costs!.implementationTotal,
    year1Ongoing: v.costs!.ongoingAnnual,
    year2to7Ongoing: v.costs!.ongoingAnnual * 6,
    color: v.color,
  }));

  return (
    <Card className="border-white/40" data-testid="card-cost-comparison">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-accent" />
          Cost Comparison
          <span className="text-xs text-muted-foreground font-normal ml-1">From vendor proposals</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Three comparison charts */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <CostBarChart data={implData} dataKey="implementation" label="Implementation Cost" />
          <CostBarChart data={annualData} dataKey="annual" label="Annual Ongoing" />
          <CostBarChart data={tcoData} dataKey="tco" label="7-Year TCO" />
        </div>

        {/* Enhanced cost table */}
        <div className="overflow-x-auto rounded-[24px] border border-white/35 bg-background/70">
          <table className="w-full text-sm" data-testid="table-cost-comparison">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left py-2 pr-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Vendor</th>
                <th className="text-left py-2 pr-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Platform</th>
                <th className="text-right py-2 pr-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Implementation</th>
                <th className="text-right py-2 pr-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Annual</th>
                <th className="text-right py-2 pr-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">7-Year TCO</th>
                <th className="text-right py-2 pr-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">vs. Lowest</th>
                <th className="text-right py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">vs. Lowest %</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(v => {
                const tcoDiff = v.costs!.sevenYearTotal - minTco;
                const tcoPct = minTco > 0 ? ((tcoDiff / minTco) * 100) : 0;
                return (
                  <tr key={v.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors" data-testid={`cost-row-${v.shortName}`}>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: v.color }} />
                        <span className="font-medium text-foreground text-sm">{v.name}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="text-sm text-muted-foreground">{v.costs!.platform}</span>
                    </td>
                    <td className="py-3 pr-2 text-right">
                      <span className={`text-sm font-semibold ${v.costs!.implementationTotal === minImpl ? "text-accent" : "text-foreground"}`} data-testid={`impl-cost-${v.shortName}`}>
                        {v.costs!.implementationTotal === minImpl && <span className="mr-1 text-xs">★</span>}
                        {formatCurrency(v.costs!.implementationTotal)}
                      </span>
                    </td>
                    <td className="py-3 pr-2 text-right">
                      <span className={`text-sm font-semibold ${v.costs!.ongoingAnnual === minAnnual ? "text-accent" : "text-foreground"}`} data-testid={`annual-cost-${v.shortName}`}>
                        {v.costs!.ongoingAnnual === minAnnual && <span className="mr-1 text-xs">★</span>}
                        {formatCurrency(v.costs!.ongoingAnnual)}
                      </span>
                    </td>
                    <td className="py-3 pr-2 text-right">
                      <span className={`text-sm font-semibold ${v.costs!.sevenYearTotal === minTco ? "text-accent" : "text-foreground"}`} data-testid={`tco-cost-${v.shortName}`}>
                        {v.costs!.sevenYearTotal === minTco && <span className="mr-1 text-xs">★</span>}
                        {formatCurrency(v.costs!.sevenYearTotal)}
                      </span>
                    </td>
                    <td className="py-3 pr-2 text-right">
                      <span className={`text-sm ${tcoDiff === 0 ? "text-accent font-semibold" : "text-muted-foreground"}`}>
                        {tcoDiff === 0 ? "—" : `+${formatCurrency(tcoDiff)}`}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <span className={`text-sm ${tcoDiff === 0 ? "text-accent font-semibold" : "text-muted-foreground"}`}>
                        {tcoDiff === 0 ? "Lowest" : `+${tcoPct.toFixed(1)}%`}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* TCO Breakdown stacked bar */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">TCO Breakdown</p>
          <div className="h-[180px]" data-testid="chart-tco-breakdown">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tcoBreakdownData} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v: number) => formatCurrency(v)} width={60} />
                <RechartsTooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length > 0) {
                      return (
                        <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg">
                          <p className="text-sm font-semibold text-foreground mb-1">{label}</p>
                          {payload.map((p: any) => (
                            <p key={p.dataKey} className="text-sm" style={{ color: p.color }}>{p.name}: {formatCurrency(p.value)}</p>
                          ))}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="implementation" name="Implementation" stackId="a" fill="#1a2744" radius={[0, 0, 0, 0]} />
                <Bar dataKey="year1Ongoing" name="Year 1 Ongoing" stackId="a" fill="#d4a853" />
                <Bar dataKey="year2to7Ongoing" name="Year 2-7 Ongoing" stackId="a" fill="#6b7280" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Cost per requirement KPI */}
        {totalRequirements && totalRequirements > 0 && (
          <div className="workspace-subsection flex items-center gap-6 p-3" data-testid="kpi-cost-per-requirement">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cost per Requirement (7-Year TCO)</span>
            <div className="flex items-center gap-4 ml-auto">
              {sorted.map(v => (
                <div key={v.id} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: v.color }} />
                  <span className="text-xs font-medium text-foreground">{v.shortName}:</span>
                  <span className={`text-xs font-semibold ${v.costs!.sevenYearTotal === minTco ? "text-accent" : "text-foreground"}`}>
                    {formatCurrency(Math.round(v.costs!.sevenYearTotal / totalRequirements))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-sm text-muted-foreground">★ Lowest in category. Gold border = lowest cost. Implementation = one-time cost. Annual Ongoing = year 2+ software/support. 7-Year TCO = total cost of ownership over 7 years.</p>
      </CardContent>
    </Card>
  );
}

// ==================== VENDOR CARD ====================

function VendorCard({
  vendor,
  isSelected,
  onToggle,
}: {
  vendor: VendorInfo;
  isSelected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      data-testid={`vendor-card-${vendor.shortName}`}
      onClick={onToggle}
      className={`relative flex min-w-[180px] max-w-[220px] flex-shrink-0 flex-col items-start gap-2 rounded-[24px] border-2 p-4 text-left transition-all ${
        isSelected
          ? "border-accent bg-accent/8 shadow-[0_24px_48px_-32px_rgba(15,23,42,0.55)]"
          : "border-white/35 bg-background/70 hover:border-border hover:bg-card"
      }`}
    >
      {isSelected && (
        <CheckCircle2 className="absolute top-2 right-2 w-4 h-4 text-accent" />
      )}
      <div
        className="flex h-10 w-10 items-center justify-center rounded-2xl text-xs font-bold text-white shrink-0"
        style={{ backgroundColor: vendor.color }}
      >
        {vendor.shortName.slice(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0 w-full">
        <div className="flex items-center gap-1.5 pr-5">
          <p className="text-base font-semibold text-foreground leading-tight truncate">{vendor.name}</p>
          {vendor.platformType && (
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] ${
              vendor.platformType === "erp" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
              : vendor.platformType === "eam" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
              : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
            }`}>
              {vendor.platformType}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2 leading-tight">{vendor.market}</p>
      </div>
    </button>
  );
}

// ==================== WEIGHT CATEGORIES & PRESETS ====================

const CATEGORIES_ORDER = [
  "Finance",
  "Human Resources",
  "Enterprise Asset Management",
  "Operations",
  "Cross-System",
];

const MODULE_CATEGORIES: Record<string, string[]> = {
  "Finance": ["Core Accounting", "Budgeting", "Accounts Payable", "Fixed Assets", "Cash, Investment & Debt", "Capital Budgeting", "Grant Management", "Project Grants", "Billing"],
  "Human Resources": ["HR General", "Payroll", "Timekeeping", "Talent Acquisition"],
  "Enterprise Asset Management": ["Asset Management", "Asset Data", "Asset Performance & Lifecycle", "Maintenance", "Environmental Health & Safety", "Inventory & Warehouse"],
  "Operations": ["Contracts & Procurement", "Property Management", "Utility Billing", "Tax Collection", "Case Management"],
  "Cross-System": ["General Scheduling", "Operations & Administrative Scheduling", "Public Safety Scheduling"],
};

function buildEqualWeights(): Record<string, number> {
  return Object.fromEntries(Object.keys(defaultModuleWeights).map(k => [k, 5]));
}

function buildBaseWeights(value: number): Record<string, number> {
  return Object.fromEntries(Object.keys(defaultModuleWeights).map(k => [k, value]));
}

const WEIGHT_PRESETS: Record<string, { label: string; description: string; weights: Record<string, number> }> = {
  equal: {
    label: "Equal Weight",
    description: "All modules weighted equally",
    weights: buildEqualWeights(),
  },
  financeHeavy: {
    label: "Finance Heavy",
    description: "Emphasizes financial modules",
    weights: { ...buildBaseWeights(4), "Core Accounting": 10, "Budgeting": 10, "Accounts Payable": 9, "Fixed Assets": 8, "Cash, Investment & Debt": 8, "Capital Budgeting": 8, "Grant Management": 8 },
  },
  hrHeavy: {
    label: "HR Heavy",
    description: "Emphasizes human resources",
    weights: { ...buildBaseWeights(4), "HR General": 10, "Payroll": 10, "Talent Acquisition": 9, "Timekeeping": 9 },
  },
  assetFocused: {
    label: "Asset Focused",
    description: "Emphasizes asset management",
    weights: { ...buildBaseWeights(4), "Asset Management": 10, "Maintenance": 10, "Asset Data": 9, "Asset Performance & Lifecycle": 9, "Environmental Health & Safety": 8, "Inventory & Warehouse": 8 },
  },
  default: {
    label: "Avero Default",
    description: "Balanced weights based on typical government ERP needs",
    weights: { ...defaultModuleWeights },
  },
};

// ==================== SCORING WEIGHTS CARD ====================

function ScoringWeightsCard({
  weights,
  activeModules,
  onWeightChange,
  onApplyPreset,
  isSaving,
}: {
  weights: Record<string, number>;
  activeModules: Set<string>;
  onWeightChange: (module: string, value: number) => void;
  onApplyPreset: (presetKey: string) => void;
  isSaving: boolean;
}) {
  // Only consider active modules
  const activeWeights = useMemo(() => {
    const result: Record<string, number> = {};
    for (const m of activeModules) {
      result[m] = weights[m] ?? 5;
    }
    return result;
  }, [weights, activeModules]);

  const totalWeight = useMemo(() => {
    return Object.values(activeWeights).reduce((sum, w) => sum + w, 0);
  }, [activeWeights]);

  const getEffectivePercent = (module: string): string => {
    const w = activeWeights[module] ?? 0;
    if (totalWeight === 0 || w === 0) return "0.0%";
    return `${((w / totalWeight) * 100).toFixed(1)}%`;
  };

  const getCategoryPercent = (modules: string[]): string => {
    const active = modules.filter(m => activeModules.has(m));
    if (totalWeight === 0 || active.length === 0) return "0%";
    const catWeight = active.reduce((sum, m) => sum + (activeWeights[m] ?? 0), 0);
    return `${((catWeight / totalWeight) * 100).toFixed(0)}%`;
  };

  // Organize modules by category, only showing active ones
  const categorizedModules = useMemo(() => {
    const result: { category: string; modules: string[] }[] = [];
    for (const cat of CATEGORIES_ORDER) {
      const catModules = (MODULE_CATEGORIES[cat] || []).filter(m => activeModules.has(m));
      if (catModules.length > 0) {
        result.push({ category: cat, modules: catModules.sort() });
      }
    }
    // Catch any active modules not in the defined categories
    const allCategorized = new Set(Object.values(MODULE_CATEGORIES).flat());
    const uncategorized = [...activeModules].filter(m => !allCategorized.has(m)).sort();
    if (uncategorized.length > 0) {
      result.push({ category: "Other", modules: uncategorized });
    }
    return result;
  }, [activeModules]);

  return (
    <Card className="border-white/40" data-testid="card-scoring-weights">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-accent" />
              Scoring Weights
              {isSaving && (
                <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground ml-2">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Saving...
                </span>
              )}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Adjust module importance to reflect client priorities. Weights are normalized to percentages.
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs shrink-0"
                data-testid="button-weight-presets"
              >
                Presets
                <ChevronDown className="w-3 h-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-[400px] overflow-y-auto" style={{ maxHeight: '400px' }}>
              {Object.entries(WEIGHT_PRESETS).map(([key, preset]) => {
                // Check if this preset is relevant to the current project's modules
                const presetEmphasis = Object.entries(preset.weights).filter(([_, w]) => w >= 8).map(([m]) => m);
                const hasRelevantModules = key === 'equal' || key === 'default' || presetEmphasis.some(m => activeModules.has(m));
                return (
                  <DropdownMenuItem
                    key={key}
                    onClick={() => onApplyPreset(key)}
                    data-testid={`preset-${key}`}
                    className={!hasRelevantModules ? 'opacity-50' : ''}
                  >
                    <div>
                      <div className="text-sm font-medium">{preset.label}</div>
                      <div className="text-sm text-muted-foreground">{preset.description}</div>
                      {!hasRelevantModules && (
                        <div className="text-sm text-muted-foreground/60 mt-0.5">No matching modules in this project</div>
                      )}
                    </div>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="workspace-toolbar flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Weighting Model</p>
            <p className="mt-1 text-sm text-muted-foreground">Use presets or tune the sliders to show what matters most in the final fit score.</p>
          </div>
          <Badge variant="secondary" className="text-xs">{activeModules.size} active modules</Badge>
        </div>
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 lg:grid-cols-2">
          {categorizedModules.map(({ category, modules }) => (
            <div key={category} className="rounded-[24px] border border-white/35 bg-background/65 p-4">
              <div className="mb-3 flex items-center justify-between border-b border-border/40 pb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{category}</span>
                <Badge variant="outline" className="text-xs px-1.5 py-0 font-semibold text-accent border-accent/30">
                  {getCategoryPercent(modules)}
                </Badge>
              </div>
              <div className="space-y-2.5">
                {modules.map(module => (
                  <div key={module} className="flex items-center gap-3 rounded-2xl border border-white/20 bg-white/40 px-3 py-2 dark:bg-slate-950/25" data-testid={`weight-row-${module.replace(/\s+/g, '-').toLowerCase()}`}>
                    <span className="text-sm text-foreground/80 w-[140px] shrink-0 truncate" title={module}>{module}</span>
                    <Slider
                      value={[weights[module] ?? 5]}
                      min={0}
                      max={10}
                      step={1}
                      onValueChange={([val]) => onWeightChange(module, val)}
                      className="flex-1 min-w-[80px]"
                      data-testid={`slider-weight-${module.replace(/\s+/g, '-').toLowerCase()}`}
                    />
                    <span className="text-xs font-semibold text-accent w-7 text-right shrink-0">{weights[module] ?? 5}</span>
                    <span className="text-xs text-muted-foreground w-10 text-right shrink-0">{getEffectivePercent(module)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ==================== MODULE SCORE TABLE ====================

function ModuleScoresTab({
  evaluation,
  selectedVendors,
  weights,
}: {
  evaluation: EvaluationData["evaluation"];
  selectedVendors: VendorInfo[];
  weights: Record<string, number>;
}) {
  if (!evaluation) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <BarChart3 className="w-10 h-10 mb-3 opacity-30" />
        <p className="text-sm">Generate scores to see module breakdown</p>
      </div>
    );
  }

  // Get all modules from evaluation results
  const allModules = new Set<string>();
  for (const v of evaluation.vendors) {
    for (const module of Object.keys(v.moduleScores)) {
      allModules.add(module);
    }
  }

  // Group modules by category
  const modulesByCategory: Record<string, string[]> = {};
  for (const module of allModules) {
    const vendorWithModule = evaluation.vendors.find(v => v.moduleScores[module]);
    const cat = vendorWithModule?.moduleScores[module]?.category || "Other";
    if (!modulesByCategory[cat]) modulesByCategory[cat] = [];
    modulesByCategory[cat].push(module);
  }

  const filteredVendors = evaluation.vendors.filter(v =>
    selectedVendors.some(sv => sv.id === v.vendorId)
  );

  return (
    <ScrollArea className="h-[calc(100vh-380px)] min-h-[300px]">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[200px] text-xs text-muted-foreground">Module</TableHead>
            <TableHead className="w-16 text-xs text-muted-foreground text-center">Weight</TableHead>
            {filteredVendors.map(v => (
              <TableHead key={v.vendorId} className="text-xs text-center min-w-[90px]">
                <span
                  className="inline-block px-2 py-0.5 rounded text-xs font-semibold text-white"
                  style={{ backgroundColor: v.color }}
                >
                  {v.vendorShortName.slice(0, 8)}
                </span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {CATEGORIES_ORDER.map(cat => {
            const catModules = (modulesByCategory[cat] || []).sort();
            if (catModules.length === 0) return null;
            return [
              <TableRow key={`cat-${cat}`} className="hover:bg-transparent">
                <TableCell
                  colSpan={2 + filteredVendors.length}
                  className="py-1.5 px-3"
                >
                  <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">{cat}</span>
                </TableCell>
              </TableRow>,
              ...catModules.map(module => (
                <TableRow key={module} className="hover:bg-muted/30">
                  <TableCell className="py-2 text-sm font-medium text-foreground/90">{module}</TableCell>
                  <TableCell className="py-2 text-center">
                    <span className="text-xs font-semibold text-accent">{weights[module] ?? 5}</span>
                  </TableCell>
                  {filteredVendors.map(v => {
                    const ms = v.moduleScores[module];
                    const score = ms?.score ?? 0;
                    return (
                      <TableCell key={v.vendorId} className="py-2 text-center">
                        <span
                          className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${getScoreBg(score)}`}
                          data-testid={`score-${module.replace(/\s+/g, '-').toLowerCase()}-${v.vendorShortName}`}
                        >
                          {score > 0 ? `${score}%` : "—"}
                        </span>
                      </TableCell>
                    );
                  })}
                </TableRow>
              )),
            ];
          })}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}

// ==================== GAP ANALYSIS TAB ====================

const GAP_TYPE_COLORS: Record<string, string> = { N: "#ef4444", F: "#f59e0b", C: "#3b82f6", T: "#22c55e", S: "#22c55e" };
const GAP_TYPE_LABELS: Record<string, string> = { N: "Not Supported", F: "Future", C: "Custom", T: "Third Party" };

function GapAnalysisTab({
  evaluation,
  selectedVendors,
}: {
  evaluation: EvaluationData["evaluation"];
  selectedVendors: VendorInfo[];
}) {
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [moduleFilter, setModuleFilter] = useState<Set<string>>(new Set());
  const [critFilter, setCritFilter] = useState<string>("all");
  const [gapTypeFilter, setGapTypeFilter] = useState<string>("all");
  const [vendorFilter, setVendorFilter] = useState<Set<number>>(new Set());

  if (!evaluation) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <AlertTriangle className="w-10 h-10 mb-3 opacity-30" />
        <p className="text-sm">Generate scores to see gap analysis</p>
      </div>
    );
  }

  const evalVendors = evaluation.vendors.filter(v =>
    selectedVendors.some(sv => sv.id === v.vendorId)
  );
  const filteredVendors = vendorFilter.size > 0
    ? evalVendors.filter(v => vendorFilter.has(v.vendorId))
    : evalVendors;

  // All unique modules in gaps
  const allModules = [...new Set(evaluation.gaps.map(g => g.functionalArea))].sort();

  // Apply filters
  const filteredGaps = evaluation.gaps.filter(gap => {
    if (moduleFilter.size > 0 && !moduleFilter.has(gap.functionalArea)) return false;
    if (critFilter === "critical" && gap.criticality !== "Critical") return false;
    if (critFilter === "desired" && gap.criticality !== "Desired") return false;
    if (gapTypeFilter !== "all") {
      // Check if any visible vendor has this gap type
      const hasType = filteredVendors.some(v => gap.scores[v.vendorId] === gapTypeFilter);
      if (!hasType) return false;
    }
    return true;
  });

  // KPI stats
  const totalGaps = filteredGaps.length;
  const criticalGaps = filteredGaps.filter(g => g.criticality === "Critical").length;
  const gapTypeCounts: Record<string, number> = { N: 0, F: 0, C: 0, T: 0 };
  for (const gap of filteredGaps) {
    for (const v of filteredVendors) {
      const s = gap.scores[v.vendorId];
      if (s && s !== "S" && gapTypeCounts[s] !== undefined) gapTypeCounts[s]++;
    }
  }
  const moduleCounts: Record<string, number> = {};
  for (const gap of filteredGaps) {
    moduleCounts[gap.functionalArea] = (moduleCounts[gap.functionalArea] || 0) + 1;
  }
  const mostAffectedModule = Object.entries(moduleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";

  // Gap comparison chart data — gaps per vendor by type
  const gapChartData = filteredVendors.map(v => {
    const counts: Record<string, number> = { N: 0, F: 0, C: 0, T: 0 };
    for (const gap of filteredGaps) {
      const s = gap.scores[v.vendorId];
      if (s && s !== "S" && counts[s] !== undefined) counts[s]++;
    }
    return { name: v.vendorShortName, ...counts, color: v.color };
  });

  // Group gaps by module
  const gapsByModule: Record<string, typeof filteredGaps> = {};
  for (const gap of filteredGaps) {
    if (!gapsByModule[gap.functionalArea]) gapsByModule[gap.functionalArea] = [];
    gapsByModule[gap.functionalArea].push(gap);
  }

  // CSV export
  const handleExportCsv = () => {
    const headers = ["Req #", "Module", "Sub-Category", "Description", "Criticality", ...filteredVendors.map(v => v.vendorName)];
    const rows = filteredGaps.map(gap => [
      gap.reqNumber,
      gap.functionalArea,
      gap.subCategory,
      `"${gap.description.replace(/"/g, '""')}"`,
      gap.criticality,
      ...filteredVendors.map(v => gap.scores[v.vendorId] || "—"),
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "gap_analysis.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const allExpanded = Object.keys(gapsByModule).length > 0 && Object.keys(gapsByModule).every(m => expandedModules.has(m));
  const toggleAll = () => {
    if (allExpanded) {
      setExpandedModules(new Set());
    } else {
      setExpandedModules(new Set(Object.keys(gapsByModule)));
    }
  };

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="workspace-toolbar flex flex-wrap items-center gap-2" data-testid="gap-filter-bar">
        <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        {/* Module filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" data-testid="filter-module">
              Modules {moduleFilter.size > 0 && <Badge variant="secondary" className="text-xs px-1 py-0 ml-0.5">{moduleFilter.size}</Badge>}
              <ChevronDown className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-[300px] overflow-y-auto">
            <DropdownMenuItem onClick={() => setModuleFilter(new Set())} data-testid="filter-module-all">
              <span className={moduleFilter.size === 0 ? "font-semibold" : ""}>All Modules</span>
            </DropdownMenuItem>
            {allModules.map(m => (
              <DropdownMenuItem key={m} onClick={() => {
                setModuleFilter(prev => {
                  const next = new Set(prev);
                  if (next.has(m)) next.delete(m); else next.add(m);
                  return next;
                });
              }} data-testid={`filter-module-${m.replace(/\s+/g, '-').toLowerCase()}`}>
                <span className={moduleFilter.has(m) ? "font-semibold text-accent" : ""}>{moduleFilter.has(m) ? "✓ " : ""}{m}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Criticality filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" data-testid="filter-criticality">
              {critFilter === "all" ? "All Priority" : critFilter === "critical" ? "Critical Only" : "Desired Only"}
              <ChevronDown className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setCritFilter("all")} data-testid="filter-crit-all">All</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setCritFilter("critical")} data-testid="filter-crit-critical">Critical Only</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setCritFilter("desired")} data-testid="filter-crit-desired">Desired Only</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Gap type filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" data-testid="filter-gap-type">
              {gapTypeFilter === "all" ? "All Types" : GAP_TYPE_LABELS[gapTypeFilter] || gapTypeFilter}
              <ChevronDown className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setGapTypeFilter("all")} data-testid="filter-type-all">All Types</DropdownMenuItem>
            {Object.entries(GAP_TYPE_LABELS).map(([code, label]) => (
              <DropdownMenuItem key={code} onClick={() => setGapTypeFilter(code)} data-testid={`filter-type-${code}`}>
                <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: GAP_TYPE_COLORS[code] }} />{label} ({code})
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Vendor filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" data-testid="filter-vendor">
              Vendors {vendorFilter.size > 0 && <Badge variant="secondary" className="text-xs px-1 py-0 ml-0.5">{vendorFilter.size}</Badge>}
              <ChevronDown className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setVendorFilter(new Set())} data-testid="filter-vendor-all">All Vendors</DropdownMenuItem>
            {evalVendors.map(v => (
              <DropdownMenuItem key={v.vendorId} onClick={() => {
                setVendorFilter(prev => {
                  const next = new Set(prev);
                  if (next.has(v.vendorId)) next.delete(v.vendorId); else next.add(v.vendorId);
                  return next;
                });
              }} data-testid={`filter-vendor-${v.vendorShortName}`}>
                <div className="w-2 h-2 rounded-full mr-2 shrink-0" style={{ backgroundColor: v.color }} />
                <span className={vendorFilter.has(v.vendorId) ? "font-semibold text-accent" : ""}>{vendorFilter.has(v.vendorId) ? "✓ " : ""}{v.vendorName}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={toggleAll} data-testid="toggle-expand-all">
            <ChevronsUpDown className="w-3 h-3" />
            {allExpanded ? "Collapse All" : "Expand All"}
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={handleExportCsv} data-testid="button-export-csv">
            <Download className="w-3 h-3" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* KPI summary cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="gap-kpi-row">
        <div className="rounded-[24px] border border-white/35 bg-background/70 p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Gaps</p>
          <p className="text-xl font-bold text-foreground" data-testid="kpi-total-gaps">{totalGaps}</p>
        </div>
        <div className="rounded-[24px] border border-red-500/20 bg-red-500/5 p-4">
          <p className="text-xs font-semibold text-red-400 uppercase tracking-wider">Critical Gaps</p>
          <p className="text-xl font-bold text-red-400" data-testid="kpi-critical-gaps">{criticalGaps}</p>
        </div>
        <div className="rounded-[24px] border border-white/35 bg-background/70 p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">By Type</p>
          <div className="flex items-center gap-2 mt-1" data-testid="kpi-gap-types">
            {Object.entries(gapTypeCounts).map(([code, count]) => (
              <Badge key={code} variant="outline" className="text-xs px-1.5 py-0" style={{ color: GAP_TYPE_COLORS[code], borderColor: `${GAP_TYPE_COLORS[code]}44` }}>
                {code}: {count}
              </Badge>
            ))}
          </div>
        </div>
        <div className="rounded-[24px] border border-white/35 bg-background/70 p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Most Affected</p>
          <p className="text-base font-semibold text-foreground mt-1 truncate" data-testid="kpi-most-affected" title={mostAffectedModule}>{mostAffectedModule}</p>
        </div>
      </div>

      {/* Gap comparison chart */}
      {gapChartData.length > 0 && (
        <div className="workspace-subsection p-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Gap Distribution by Vendor</p>
          <div className="h-[160px]" data-testid="chart-gap-comparison">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={gapChartData} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }} width={70} />
                <RechartsTooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length > 0) {
                      return (
                        <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg">
                          <p className="text-sm font-semibold text-foreground mb-1">{label}</p>
                          {payload.map((p: any) => (
                            <p key={p.dataKey} className="text-sm" style={{ color: p.color }}>{p.name}: {p.value}</p>
                          ))}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="N" name="Not Supported" stackId="a" fill="#ef4444" />
                <Bar dataKey="C" name="Custom" stackId="a" fill="#3b82f6" />
                <Bar dataKey="T" name="Third Party" stackId="a" fill="#22c55e" />
                <Bar dataKey="F" name="Future" stackId="a" fill="#f59e0b" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Gap table grouped by module */}
      {Object.keys(gapsByModule).length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <CheckCircle2 className="w-10 h-10 mb-3 text-green-500 opacity-60" />
          <p className="text-sm font-medium">No gaps match current filters</p>
        </div>
      ) : (
        <ScrollArea className="h-[calc(100vh-680px)] min-h-[250px]">
          <div className="space-y-2">
            {Object.entries(gapsByModule).sort(([a], [b]) => {
              const critA = gapsByModule[a].filter(g => g.criticality === "Critical").length;
              const critB = gapsByModule[b].filter(g => g.criticality === "Critical").length;
              return critB - critA;
            }).map(([module, gaps]) => {
              const isExpanded = expandedModules.has(module);
              const critCount = gaps.filter(g => g.criticality === "Critical").length;
              return (
                <div key={module} className="overflow-hidden rounded-[24px] border border-white/35 bg-background/70">
                  <button
                    className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/30"
                    onClick={() => {
                      setExpandedModules(prev => {
                        const next = new Set(prev);
                        if (next.has(module)) next.delete(module); else next.add(module);
                        return next;
                      });
                    }}
                    data-testid={`gap-module-${module.replace(/\s+/g, '-').toLowerCase()}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-base font-semibold text-foreground">{module}</span>
                      {critCount > 0 && (
                        <Badge variant="destructive" className="text-xs px-1.5 py-0">{critCount} critical</Badge>
                      )}
                      <Badge variant="outline" className="text-xs px-1.5 py-0 text-muted-foreground">{gaps.length} total</Badge>
                    </div>
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border/50">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent bg-muted/20">
                            <TableHead className="w-16 text-xs">Req #</TableHead>
                            <TableHead className="text-xs">Requirement</TableHead>
                            <TableHead className="w-20 text-xs text-center">Priority</TableHead>
                            {filteredVendors.map(v => (
                              <TableHead key={v.vendorId} className="w-16 text-xs text-center">{v.vendorShortName.slice(0, 7)}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {gaps.slice().sort((a, b) => {
                            if (a.criticality === "Critical" && b.criticality !== "Critical") return -1;
                            if (b.criticality === "Critical" && a.criticality !== "Critical") return 1;
                            return 0;
                          }).map(gap => (
                            <TableRow
                              key={gap.requirementId}
                              className={`hover:bg-muted/20 ${gap.criticality === "Critical" ? "bg-red-500/3" : ""}`}
                              data-testid={`gap-row-${gap.reqNumber}`}
                            >
                              <TableCell className="py-2 text-sm font-mono text-muted-foreground">{gap.reqNumber}</TableCell>
                              <TableCell className="py-2">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div>
                                      <p className="text-sm text-foreground/90 leading-relaxed line-clamp-2">{gap.description}</p>
                                      <p className="text-sm text-muted-foreground mt-0.5">{gap.subCategory}</p>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-md">
                                    <p className="text-sm">{gap.description}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TableCell>
                              <TableCell className="py-2 text-center">
                                <Badge
                                  variant={gap.criticality === "Critical" ? "destructive" : "outline"}
                                  className="text-xs px-1.5 py-0"
                                >
                                  {gap.criticality}
                                </Badge>
                              </TableCell>
                              {filteredVendors.map(v => (
                                <TableCell key={v.vendorId} className="py-2 text-center">
                                  <ScoreBadge score={gap.scores[v.vendorId] || "N"} />
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

// ==================== CUSTOM CRITERIA TAB ====================

interface CriterionWithScores {
  id: number;
  projectId: number;
  name: string;
  description: string;
  weight: number;
  createdAt: string;
  scores: Array<{ id: number; criteriaId: number; vendorId: number; score: number; notes: string }>;
}

const CRITERIA_TEMPLATES = [
  "Implementation Risk",
  "Vendor Financial Stability",
  "User Interface / Ease of Use",
  "Integration Capabilities",
  "Upgrade Path / Roadmap",
  "Customer Support Quality",
  "Local Government Experience",
];

function CustomCriteriaTab({ projectId, selectedVendors }: { projectId: number; selectedVendors: VendorInfo[] }) {
  const { toast } = useToast();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formWeight, setFormWeight] = useState(5);

  // Fetch criteria
  const { data: criteria = [], refetch } = useQuery<CriterionWithScores[]>({
    queryKey: ["/api/projects", projectId, "custom-criteria"],
    queryFn: () => apiRequest("GET", `/api/projects/${projectId}/custom-criteria`).then(r => r.json()),
  });

  // Create criterion
  const createMutation = useMutation({
    mutationFn: (data: { name: string; description: string; weight: number }) =>
      apiRequest("POST", `/api/projects/${projectId}/custom-criteria`, data).then(r => r.json()),
    onSuccess: () => { refetch(); resetForm(); toast({ title: "Criterion added" }); },
    onError: () => toast({ title: "Failed to add criterion", variant: "destructive" }),
  });

  // Update criterion
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<{ name: string; description: string; weight: number }> }) =>
      apiRequest("PATCH", `/api/custom-criteria/${id}`, data).then(r => r.json()),
    onSuccess: () => { refetch(); setEditingId(null); toast({ title: "Criterion updated" }); },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  // Delete criterion
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/custom-criteria/${id}`).then(r => r.json()),
    onSuccess: () => { refetch(); toast({ title: "Criterion deleted" }); },
  });

  // Upsert scores
  const scoreMutation = useMutation({
    mutationFn: ({ criteriaId, scores }: { criteriaId: number; scores: Array<{ vendorId: number; score: number; notes: string }> }) =>
      apiRequest("PUT", `/api/custom-criteria/${criteriaId}/scores`, { scores }).then(r => r.json()),
    onSuccess: () => refetch(),
  });

  const resetForm = () => { setFormName(""); setFormDescription(""); setFormWeight(5); setShowAddForm(false); };

  const getScoreColor = (s: number) => {
    if (s >= 8) return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800";
    if (s >= 5) return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800";
    return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800";
  };

  // Determine which templates haven't been added yet
  const existingNames = new Set(criteria.map(c => c.name));
  const availableTemplates = CRITERIA_TEMPLATES.filter(t => !existingNames.has(t));

  return (
    <div className="space-y-6" data-testid="custom-criteria-tab">
      {/* Criteria Management */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold">Custom Criteria</h3>
          <div className="flex gap-2">
            {availableTemplates.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" data-testid="button-add-template-criteria">
                    <ListChecks className="w-3 h-3" />
                    Add from Template
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {availableTemplates.map((t) => (
                    <DropdownMenuItem key={t} onClick={() => createMutation.mutate({ name: t, description: "", weight: 5 })}>
                      {t}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => { resetForm(); setShowAddForm(true); }}
              data-testid="button-add-criterion"
            >
              <Plus className="w-3 h-3" />
              Add Criterion
            </Button>
          </div>
        </div>

        {/* Add/Edit Form */}
        {showAddForm && (
          <Card className="mb-3">
            <CardContent className="pt-4 space-y-3">
              <Input
                placeholder="Criterion name (e.g., Ease of Use)"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="h-8 text-sm"
                data-testid="input-criterion-name"
              />
              <Textarea
                placeholder="Description (optional)"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                className="text-sm min-h-[60px]"
                data-testid="input-criterion-description"
              />
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium w-20">Weight: {formWeight}</span>
                <Slider
                  value={[formWeight]}
                  onValueChange={([v]) => setFormWeight(v)}
                  min={1} max={10} step={1}
                  className="flex-1"
                  data-testid="slider-criterion-weight"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={resetForm}>Cancel</Button>
                <Button size="sm" disabled={!formName.trim()} onClick={() => createMutation.mutate({ name: formName, description: formDescription, weight: formWeight })} data-testid="button-save-criterion">
                  Add
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Criteria Cards */}
        <div className="space-y-2">
          {criteria.map((c) => (
            <Card key={c.id} className="bg-card/50">
              <CardContent className="py-3 px-4">
                {editingId === c.id ? (
                  <div className="space-y-2">
                    <Input
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="h-7 text-sm"
                    />
                    <Textarea
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                      className="text-sm min-h-[50px]"
                    />
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium w-20">Weight: {formWeight}</span>
                      <Slider value={[formWeight]} onValueChange={([v]) => setFormWeight(v)} min={1} max={10} step={1} className="flex-1" />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => setEditingId(null)}>Cancel</Button>
                      <Button size="sm" className="h-6 text-xs" onClick={() => updateMutation.mutate({ id: c.id, data: { name: formName, description: formDescription, weight: formWeight } })}>Save</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-medium">{c.name}</span>
                        <Badge variant="outline" className="text-xs">Weight: {c.weight}/10</Badge>
                      </div>
                      {c.description && <p className="text-sm text-muted-foreground mt-0.5">{c.description}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setFormName(c.name); setFormDescription(c.description); setFormWeight(c.weight); setEditingId(c.id); }} data-testid={`button-edit-criterion-${c.id}`}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(c.id)} data-testid={`button-delete-criterion-${c.id}`}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {criteria.length === 0 && !showAddForm && (
            <div className="text-center py-6 text-sm text-muted-foreground">
              No custom criteria yet. Add criteria to evaluate vendors on additional dimensions.
            </div>
          )}
        </div>
      </div>

      {/* Scoring Matrix */}
      {criteria.length > 0 && selectedVendors.length > 0 && (
        <div>
          <h3 className="text-base font-semibold mb-3">Scoring Matrix</h3>
          <div className="border rounded-lg overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs w-48">Criterion</TableHead>
                  <TableHead className="text-xs w-16 text-center">Wt</TableHead>
                  {selectedVendors.map((v) => (
                    <TableHead key={v.id} className="text-xs text-center min-w-[100px]">
                      <div className="flex items-center justify-center gap-1">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: v.color }} />
                        {v.shortName}
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {criteria.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-sm font-medium">{c.name}</TableCell>
                    <TableCell className="text-sm text-center text-muted-foreground">{c.weight}</TableCell>
                    {selectedVendors.map((v) => {
                      const existingScore = c.scores.find(s => s.vendorId === v.id);
                      const scoreVal = existingScore?.score ?? 0;
                      return (
                        <TableCell key={v.id} className="text-center p-1">
                          <select
                            className={`w-14 h-7 text-xs text-center rounded border font-bold cursor-pointer ${scoreVal > 0 ? getScoreColor(scoreVal) : "bg-muted/30 text-muted-foreground"}`}
                            value={scoreVal}
                            onChange={(e) => {
                              const newScore = parseInt(e.target.value);
                              const allScores = selectedVendors.map(sv => {
                                const existing = c.scores.find(s => s.vendorId === sv.id);
                                if (sv.id === v.id) return { vendorId: sv.id, score: newScore, notes: existing?.notes || "" };
                                return { vendorId: sv.id, score: existing?.score ?? 0, notes: existing?.notes || "" };
                              });
                              scoreMutation.mutate({ criteriaId: c.id, scores: allScores });
                            }}
                            data-testid={`score-${c.id}-${v.id}`}
                          >
                            <option value={0}>—</option>
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Impact Summary */}
      {criteria.length > 0 && selectedVendors.length > 0 && (
        <div>
          <h3 className="text-base font-semibold mb-3">Custom Criteria Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {selectedVendors.map((v) => {
              let totalWeightedScore = 0;
              let totalWeight = 0;
              for (const c of criteria) {
                const s = c.scores.find(s => s.vendorId === v.id);
                if (s && s.score > 0) {
                  totalWeightedScore += s.score * c.weight;
                  totalWeight += c.weight;
                }
              }
              const avgScore = totalWeight > 0 ? (totalWeightedScore / totalWeight) : 0;
              const pct = Math.round(avgScore * 10); // 1-10 → 10-100%
              return (
                <Card key={v.id} className="bg-card/50">
                  <CardContent className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: v.color }} />
                      <span className="text-xs font-medium">{v.shortName}</span>
                    </div>
                    <div className="text-2xl font-bold" style={{ color: pct >= 80 ? "#22c55e" : pct >= 50 ? "#d4a853" : "#ef4444" }}>
                      {avgScore > 0 ? avgScore.toFixed(1) : "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {totalWeight > 0 ? `${pct}% weighted avg` : "No scores"}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== VENDOR INTELLIGENCE DIMENSION ====================

function VendorIntelligenceDimension({ dim, label, score, scoreColor }: { dim: any; label: string; score: number; scoreColor: string }) {
  const [expanded, setExpanded] = useState(false);
  const evidence = dim.evidence ? (typeof dim.evidence === "string" ? JSON.parse(dim.evidence) : dim.evidence) : [];
  const concerns = dim.concerns ? (typeof dim.concerns === "string" ? JSON.parse(dim.concerns) : dim.concerns) : [];

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <CollapsibleTrigger asChild>
        <button className="w-full text-left p-2 rounded-md hover:bg-muted/50 transition-colors" data-testid={`intelligence-dim-${dim.dimension}`}>
          <div className="flex items-center justify-between gap-1">
            <span className="text-sm font-medium truncate">{label}</span>
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${scoreColor}`}>{score}/10</span>
          </div>
          {dim.summary && <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5">{dim.summary}</p>}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-2 pb-2 space-y-1.5">
          {dim.summary && <p className="text-sm text-muted-foreground">{dim.summary}</p>}
          {evidence.length > 0 && (
            <div>
              <span className="text-xs font-semibold text-muted-foreground uppercase">Evidence</span>
              <ul className="mt-0.5 space-y-0.5">
                {evidence.map((e: string, i: number) => (
                  <li key={i} className="text-sm text-muted-foreground pl-2 border-l-2 border-accent/30">{e}</li>
                ))}
              </ul>
            </div>
          )}
          {concerns.length > 0 && (
            <div>
              <span className="text-xs font-semibold text-red-500 uppercase">Concerns</span>
              <ul className="mt-0.5 space-y-0.5">
                {concerns.map((c: string, i: number) => (
                  <li key={i} className="text-sm text-red-500/80 pl-2 border-l-2 border-red-500/30">{c}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ==================== PROPOSAL RESULT CARD ====================

function ProposalResultCard({ dimLabel, score, scoreColor, summary, evidence, concerns }: {
  dimLabel: string; score: number; scoreColor: string; summary: string;
  evidence: string[]; concerns: string[];
}) {
  const [showEvidence, setShowEvidence] = useState(false);
  const [showConcerns, setShowConcerns] = useState(false);

  return (
    <div className="border border-border/40 rounded-lg p-3 space-y-2" data-testid={`proposal-dim-${dimLabel.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{dimLabel}</span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${scoreColor}`}>{score}/10</span>
      </div>
      {summary && <p className="text-sm text-muted-foreground leading-relaxed">{summary}</p>}
      {evidence.length > 0 && (
        <Collapsible open={showEvidence} onOpenChange={setShowEvidence}>
          <CollapsibleTrigger asChild>
            <button className="text-xs font-medium text-accent hover:underline flex items-center gap-1" data-testid={`proposal-evidence-toggle-${dimLabel.toLowerCase().replace(/\s+/g, "-")}`}>
              <ChevronRight className={`w-3 h-3 transition-transform ${showEvidence ? "rotate-90" : ""}`} />
              Evidence ({evidence.length})
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-1 space-y-1">
              {evidence.map((e, i) => (
                <li key={i} className="text-sm text-muted-foreground pl-2 border-l-2 border-accent/30 italic">{e}</li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
      {concerns.length > 0 && (
        <Collapsible open={showConcerns} onOpenChange={setShowConcerns}>
          <CollapsibleTrigger asChild>
            <button className="text-xs font-medium text-red-500 hover:underline flex items-center gap-1" data-testid={`proposal-concerns-toggle-${dimLabel.toLowerCase().replace(/\s+/g, "-")}`}>
              <ChevronRight className={`w-3 h-3 transition-transform ${showConcerns ? "rotate-90" : ""}`} />
              Concerns ({concerns.length})
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-1 space-y-1">
              {concerns.map((c, i) => (
                <li key={i} className="text-sm text-red-500/80 pl-2 border-l-2 border-red-500/30">{c}</li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

// ==================== MAIN PAGE ====================

export default function VendorEvaluation() {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id || "0");
  const { toast } = useToast();

  const [selectedVendorIds, setSelectedVendorIds] = useState<number[]>([]);
  const [moduleWeights, setModuleWeights] = useState<Record<string, number>>({});
  const [initialized, setInitialized] = useState(false);

  // Fetch evaluation data
  const { data, isLoading } = useQuery<EvaluationData>({
    queryKey: ["/api/projects", projectId, "evaluation"],
    queryFn: () => apiRequest("GET", `/api/projects/${projectId}/evaluation`).then(r => r.json()),
    enabled: !!projectId,
  });

  // Fetch project info
  const { data: project } = useQuery({
    queryKey: ["/api/projects", projectId],
    queryFn: () => apiRequest("GET", `/api/projects/${projectId}`).then(r => r.json()),
    enabled: !!projectId,
  });

  // Initialize local state from server data
  if (data && !initialized) {
    setSelectedVendorIds(data.settings.selectedVendors);
    setModuleWeights(data.settings.moduleWeights);
    setInitialized(true);
  }

  // Generate scores mutation
  const generateScoresMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/projects/${projectId}/evaluation/generate-scores`, {}).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "evaluation"] });
      toast({ title: "Scores generated", description: "Vendor scores have been auto-generated from vendor profiles." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to generate scores", variant: "destructive" });
    },
  });

  // Load sample RFP data mutation
  const loadSampleRfpMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/projects/${projectId}/load-sample-rfp`, {}).then(r => r.json()),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "evaluation"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      toast({
        title: "Sample RFP data loaded",
        description: `Loaded ${result.requirementsCreated} requirements and ${result.scoresCreated} vendor scores from sample RFP data.`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to load sample RFP data", variant: "destructive" });
    },
  });

  // Save settings mutation
  const saveSettingsMutation = useMutation({
    mutationFn: (settings: { moduleWeights: Record<string, number>; selectedVendors: number[] }) =>
      apiRequest("POST", `/api/projects/${projectId}/evaluation/settings`, settings).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "evaluation"] });
    },
  });

  // Debounced weight save — 800ms delay
  const weightSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedSaveWeights = useCallback((newWeights: Record<string, number>) => {
    if (weightSaveTimeoutRef.current) {
      clearTimeout(weightSaveTimeoutRef.current);
    }
    weightSaveTimeoutRef.current = setTimeout(() => {
      if (data?.hasScores) {
        saveSettingsMutation.mutate({ moduleWeights: newWeights, selectedVendors: selectedVendorIds });
      }
      weightSaveTimeoutRef.current = null;
    }, 800);
  }, [selectedVendorIds, data]);

  const handleVendorToggle = useCallback((vendorId: number) => {
    const newIds = selectedVendorIds.includes(vendorId)
      ? selectedVendorIds.filter(id => id !== vendorId)
      : [...selectedVendorIds, vendorId];
    setSelectedVendorIds(newIds);
    if (data?.hasScores) {
      saveSettingsMutation.mutate({ moduleWeights, selectedVendors: newIds });
    }
  }, [selectedVendorIds, moduleWeights, data]);

  const handleWeightChange = useCallback((module: string, value: number) => {
    const newWeights = { ...moduleWeights, [module]: value };
    setModuleWeights(newWeights);
    debouncedSaveWeights(newWeights);
  }, [moduleWeights, debouncedSaveWeights]);

  const handleApplyPreset = useCallback((presetKey: string) => {
    const preset = WEIGHT_PRESETS[presetKey];
    if (!preset) return;
    // Apply preset weights, keeping only keys for modules that exist in current weights
    const newWeights: Record<string, number> = {};
    for (const key of Object.keys(moduleWeights)) {
      newWeights[key] = preset.weights[key] ?? moduleWeights[key] ?? 5;
    }
    setModuleWeights(newWeights);
    debouncedSaveWeights(newWeights);
  }, [moduleWeights, debouncedSaveWeights]);

  // Compute active modules from evaluation data
  const activeModules = useMemo(() => {
    const modules = new Set<string>();
    if (data?.evaluation) {
      for (const v of data.evaluation.vendors) {
        for (const module of Object.keys(v.moduleScores)) {
          modules.add(module);
        }
      }
    }
    return modules;
  }, [data?.evaluation]);

  const handleDownloadReport = useCallback(async (format: "pdf" | "docx") => {
    const endpoint = format === "docx"
      ? `/api/projects/${projectId}/evaluation/report-docx`
      : `/api/projects/${projectId}/evaluation/report`;
    const ext = format === "docx" ? "docx" : "pdf";
    const label = format === "docx" ? "Word" : "PDF";

    try {
      const response = await apiRequest("GET", endpoint);
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        toast({
          title: "Report generation failed",
          description: (err as any).error || `Unable to generate ${label} report.`,
          variant: "destructive",
        });
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeName = (project?.name || "vendor_evaluation").replace(/[^a-z0-9]/gi, "_").toLowerCase();
      a.href = url;
      a.download = `${safeName}_vendor_evaluation.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Report downloaded", description: `${label} report has been saved to your downloads folder.` });
    } catch (err: any) {
      toast({
        title: "Download failed",
        description: err.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    }
  }, [projectId, project]);

  const handleDownloadComparisonReport = useCallback(async (format: "pdf" | "docx") => {
    const endpoint = format === "docx"
      ? `/api/projects/${projectId}/comparison-report/docx`
      : `/api/projects/${projectId}/comparison-report/pdf`;
    const ext = format === "docx" ? "docx" : "pdf";
    const label = format === "docx" ? "Word" : "PDF";

    try {
      const response = await apiRequest("GET", endpoint);
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        toast({
          title: "Report generation failed",
          description: (err as any).error || `Unable to generate ${label} comparison report.`,
          variant: "destructive",
        });
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeName = (project?.name || "vendor_comparison").replace(/[^a-z0-9]/gi, "_").toLowerCase();
      a.href = url;
      a.download = `${safeName}_vendor_comparison.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Comparison report downloaded", description: `${label} report has been saved to your downloads folder.` });
    } catch (err: any) {
      toast({
        title: "Download failed",
        description: err.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    }
  }, [projectId, project]);

  // Compute visible evaluation based on selected vendors
  const evaluation = data?.evaluation || null;

  const filteredEvaluation = useMemo(() => {
    if (!evaluation) return null;
    return {
      ...evaluation,
      vendors: evaluation.vendors.filter(v => selectedVendorIds.includes(v.vendorId)),
    };
  }, [evaluation, selectedVendorIds]);

  // Chart data
  const chartData = useMemo(() => {
    if (!filteredEvaluation) return [];
    return filteredEvaluation.vendors.map(v => ({
      name: v.vendorShortName.charAt(0).toUpperCase() + v.vendorShortName.slice(1),
      fullName: v.vendorName,
      score: v.overallScore,
      color: v.color,
    }));
  }, [filteredEvaluation]);

  // ==================== PROPOSAL ANALYSIS STATE ====================
  const [proposalDialogOpen, setProposalDialogOpen] = useState(false);
  const [proposalStep, setProposalStep] = useState<1 | 2 | 3>(1);
  const [proposalVendorId, setProposalVendorId] = useState<string>("");
  const [proposalFile, setProposalFile] = useState<File | null>(null);
  const [proposalResult, setProposalResult] = useState<any>(null);
  const [analysisStatusText, setAnalysisStatusText] = useState("Reading proposal...");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ==================== VENDOR INTELLIGENCE ====================
  const { data: vendorIntelligenceData } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "vendor-intelligence"],
    queryFn: () => apiRequest("GET", `/api/projects/${projectId}/vendor-intelligence`).then(r => r.json()),
    enabled: !!projectId,
  });

  const intelligenceByVendor = useMemo(() => {
    if (!vendorIntelligenceData?.length) return {};
    const grouped: Record<number, any[]> = {};
    for (const item of vendorIntelligenceData) {
      if (!grouped[item.vendorId]) grouped[item.vendorId] = [];
      grouped[item.vendorId].push(item);
    }
    return grouped;
  }, [vendorIntelligenceData]);

  const ANALYSIS_STATUSES = [
    "Reading proposal...",
    "Extracting company profile...",
    "Analyzing implementation approach...",
    "Evaluating support model...",
    "Assessing risk factors...",
    "Finalizing analysis...",
  ];

  const handleAnalyzeProposal = useCallback(async () => {
    if (!proposalFile || !proposalVendorId) return;
    setProposalStep(2);
    let statusIdx = 0;
    const statusInterval = setInterval(() => {
      statusIdx = (statusIdx + 1) % ANALYSIS_STATUSES.length;
      setAnalysisStatusText(ANALYSIS_STATUSES[statusIdx]);
    }, 3000);
    try {
      const formData = new FormData();
      formData.append("file", proposalFile);
      formData.append("vendorId", proposalVendorId);
      const API_BASE = "";
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/analyze-proposal`, { method: "POST", body: formData });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error((err as any).error || "Analysis failed"); }
      const result = await res.json();
      setProposalResult(result.analysis);
      setProposalStep(3);
    } catch (err: any) {
      toast({ title: "Analysis failed", description: err.message, variant: "destructive" });
      setProposalStep(1);
    } finally { clearInterval(statusInterval); }
  }, [proposalFile, proposalVendorId, projectId, toast]);

  const handleAcceptProposal = useCallback(async () => {
    if (!proposalResult?.dimensions || !proposalVendorId) return;
    try {
      await apiRequest("POST", `/api/projects/${projectId}/vendor-intelligence`, {
        vendorId: parseInt(proposalVendorId),
        dimensions: proposalResult.dimensions.map((d: any) => ({
          dimension: d.dimension || d.label, score: d.score, summary: d.summary,
          evidence: d.evidence || [], concerns: d.concerns || [],
          sourceDocument: proposalFile?.name || null,
        })),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "vendor-intelligence"] });
      toast({ title: "Intelligence saved", description: "Vendor intelligence data has been saved." });
      setProposalDialogOpen(false); setProposalStep(1); setProposalFile(null); setProposalVendorId(""); setProposalResult(null);
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    }
  }, [proposalResult, proposalVendorId, projectId, proposalFile, toast]);

  if (isLoading) {
    return (
      <div className="workspace-page">
        <div className="workspace-stack">
          <Skeleton className="h-10 w-48 rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-[2rem]" />
          <Skeleton className="h-[30rem] w-full rounded-[2rem]" />
        </div>
      </div>
    );
  }

  const vendors = data?.vendors || [];
  const selectedVendors = vendors.filter(v => selectedVendorIds.includes(v.id));
  const hasScores = data?.hasScores || false;

  const vendorsWithIntelligence = (data?.vendors || []).filter((v: any) => intelligenceByVendor[v.id]?.length > 0);

  return (
    <div className="workspace-page h-full">
      <div className="workspace-stack">
        <div className="workspace-hero shrink-0">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-white/90">
                  <Link href={`/projects/${projectId}`}>
                    <Button variant="ghost" size="sm" className="h-8 gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 text-white hover:bg-white/15 hover:text-white -ml-1">
                      <ChevronLeft className="w-4 h-4" />
                      {project?.name || "Project"}
                    </Button>
                  </Link>
                  <span className="workspace-hero-kicker">Vendor Evaluation</span>
                </div>
                <div className="space-y-1">
                  <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
                    <BarChart3 className="h-6 w-6 text-white" />
                    Vendor evaluation command center
                  </h1>
                  <p className="max-w-2xl text-sm text-white/78">
                    Compare vendor fit, proposal strength, and delivery posture with a clearer executive lens across requirements, scoring, and intelligence.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="workspace-stat-chip"><strong>{vendors.length}</strong> vendors loaded</span>
                <span className="workspace-stat-chip"><strong>{selectedVendorIds.length}</strong> selected</span>
                <span className="workspace-stat-chip"><strong>{hasScores ? "Live" : "Pending"}</strong> score state</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
            {!hasScores && (
              <Button
                onClick={() => loadSampleRfpMutation.mutate()}
                disabled={loadSampleRfpMutation.isPending || generateScoresMutation.isPending}
                className="gap-2 border border-white/15 bg-white/10 text-white hover:bg-white/15"
                data-testid="button-load-sample-rfp-header"
              >
                <MapPin className="w-4 h-4" />
                {loadSampleRfpMutation.isPending ? "Loading..." : "Load Sample RFP Data"}
              </Button>
            )}
            {hasScores && (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 border-white/15 bg-white/10 text-xs text-white hover:bg-white/15 hover:text-white"
                      data-testid="button-download-report"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download Report
                      <ChevronDown className="w-3 h-3 ml-0.5 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleDownloadReport("pdf")} data-testid="download-pdf">
                      <FileText className="w-4 h-4 mr-2 text-red-500" />
                      Download as PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDownloadReport("docx")} data-testid="download-docx">
                      <FileText className="w-4 h-4 mr-2 text-blue-500" />
                      Download as Word
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleDownloadComparisonReport("pdf")} data-testid="download-comparison-pdf">
                      <FileText className="w-4 h-4 mr-2 text-red-400" />
                      Comparison Report (PDF)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDownloadComparisonReport("docx")} data-testid="download-comparison-docx">
                      <FileText className="w-4 h-4 mr-2 text-blue-400" />
                      Comparison Report (Word)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setProposalStep(1); setProposalDialogOpen(true); }}
                  className="gap-2 border-white/15 bg-white/10 text-xs text-white hover:bg-white/15 hover:text-white"
                  data-testid="button-analyze-proposal"
                >
                  <Brain className="w-3.5 h-3.5 text-accent" />
                  Analyze Proposal
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => generateScoresMutation.mutate()}
                  disabled={generateScoresMutation.isPending}
                  className="gap-2 border-white/15 bg-white/10 text-xs text-white hover:bg-white/15 hover:text-white"
                  data-testid="button-regenerate-scores"
                >
                  {generateScoresMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                  {generateScoresMutation.isPending ? "Generating..." : "Regenerate"}
                </Button>
              </>
            )}
            </div>
          </div>
        </div>

        <ScrollArea className="app-scrollbar flex-1">
          <div className="space-y-5">

          {/* Generate Scores CTA (when no scores yet) */}
          {!hasScores && (
            <Card className="border-accent/30 bg-accent/5" data-testid="card-no-scores">
              <CardContent className="py-8 flex flex-col items-center text-center gap-4">
                <div className="w-12 h-12 rounded-full bg-accent/15 flex items-center justify-center">
                  <MapPin className="w-6 h-6 text-accent" />
                </div>
                <div>
                  <p className="text-base font-semibold text-foreground">Load Real Vendor Proposal Data</p>
                  <p className="text-sm text-muted-foreground mt-1 max-w-lg">
                    Load 1,260+ real requirements and actual S/F/C/T/N vendor responses from a completed government ERP solicitation.
                    Five vendors responded with real proposal data across 25 functional modules.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 mt-1">
                  <Button
                    onClick={() => loadSampleRfpMutation.mutate()}
                    disabled={loadSampleRfpMutation.isPending || generateScoresMutation.isPending}
                    className="bg-accent hover:bg-accent/90 text-accent-foreground gap-2"
                    data-testid="button-load-sample-rfp-data"
                  >
                    <MapPin className="w-4 h-4" />
                    {loadSampleRfpMutation.isPending ? "Loading requirements..." : "Load Sample RFP Data"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => generateScoresMutation.mutate()}
                    disabled={generateScoresMutation.isPending || loadSampleRfpMutation.isPending}
                    className="gap-2"
                    data-testid="button-generate-scores-cta"
                  >
                    <Zap className="w-4 h-4" />
                    {generateScoresMutation.isPending ? "Generating Scores..." : "Auto-Generate Scores"}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  {project?.stats?.totalRequirements
                    ? `Project has ${project.stats.totalRequirements} requirements loaded`
                    : "No requirements loaded yet — use \"Load Sample RFP Data\" to start"}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Vendor Selection Bar */}
          <Card className="border-white/40" data-testid="card-vendor-selection">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <Building2 className="w-4 h-4 text-accent" />
                Select Vendors to Compare
                <Badge variant="outline" className="ml-auto text-xs">
                  {selectedVendorIds.length} of {vendors.length} selected
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3 flex-wrap">
                {vendors.map(v => (
                  <VendorCard
                    key={v.id}
                    vendor={v}
                    isSelected={selectedVendorIds.includes(v.id)}
                    onToggle={() => handleVendorToggle(v.id)}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Vendor Intelligence Section */}
          {vendorsWithIntelligence.length > 0 && (
            <Card className="border-white/40" data-testid="card-vendor-intelligence">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                  <Brain className="w-4 h-4 text-accent" />
                  Vendor Intelligence
                  <Badge variant="outline" className="ml-auto text-xs">
                    {vendorsWithIntelligence.length} vendor{vendorsWithIntelligence.length !== 1 ? "s" : ""} analyzed
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {vendorsWithIntelligence.map(vendor => {
                  const dims = intelligenceByVendor[vendor.id] || [];
                  const radarData = dims.map((d: any) => ({
                    dimension: (d.dimension || "").replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase()),
                    score: d.score || 0,
                    fullMark: 10,
                  }));

                  return (
                    <div key={vendor.id} className="rounded-[22px] border border-white/35 bg-background/60 p-4" data-testid={`vendor-intelligence-${vendor.id}`}>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-base font-semibold">{vendor.name}</span>
                        <Badge variant="outline" className="text-xs">{vendor.platformType}</Badge>
                      </div>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Radar Chart */}
                        <div className="flex items-center justify-center">
                          <ResponsiveContainer width="100%" height={260}>
                            <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                              <PolarGrid stroke="hsl(var(--border))" />
                              <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                              <PolarRadiusAxis domain={[0, 10]} tick={{ fontSize: 9 }} axisLine={false} />
                              <Radar dataKey="score" stroke="#d4a853" fill="#d4a853" fillOpacity={0.2} />
                            </RadarChart>
                          </ResponsiveContainer>
                        </div>
                        {/* Dimension Grid */}
                        <div className="grid grid-cols-2 gap-2">
                          {dims.map((dim: any, idx: number) => {
                            const score = dim.score || 0;
                            const scoreColor = score >= 8 ? "text-green-600 bg-green-50 dark:bg-green-950/30" : score >= 5 ? "text-amber-600 bg-amber-50 dark:bg-amber-950/30" : "text-red-600 bg-red-50 dark:bg-red-950/30";
                            const label = (dim.dimension || "").replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase());
                            return (
                              <VendorIntelligenceDimension key={idx} dim={dim} label={label} score={score} scoreColor={scoreColor} />
                            );
                          })}
                        </div>
                      </div>
                      {dims[0]?.sourceDocument && (
                        <p className="text-sm text-muted-foreground mt-3">
                          Source: {dims[0].sourceDocument} &bull; Analyzed {new Date(dims[0].createdAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Cost Comparison Card — between vendor selection and score overview */}
          <CostComparisonCard vendors={vendors} totalRequirements={project?.stats?.totalRequirements} />

          {/* Scoring Weights Configuration */}
          {hasScores && (
            <ScoringWeightsCard
              weights={moduleWeights}
              activeModules={activeModules}
              onWeightChange={handleWeightChange}
              onApplyPreset={handleApplyPreset}
              isSaving={saveSettingsMutation.isPending}
            />
          )}

          {/* Score Overview — Weighted Fit Chart */}
          {hasScores && filteredEvaluation && chartData.length > 0 && (
            <Card className="border-white/40" data-testid="card-score-overview">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-accent" />
                  Weighted Fit Score
                  <span className="text-xs text-muted-foreground font-normal ml-1">Scores reflect module weight configuration above</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[200px]" data-testid="chart-overall-scores">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                      <XAxis
                        type="number"
                        domain={[0, 100]}
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                        tickFormatter={v => `${v}%`}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={{ fontSize: 12, fill: "hsl(var(--foreground))" }}
                        width={90}
                      />
                      <RechartsTooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload[0]) {
                            const d = payload[0].payload;
                            return (
                              <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg">
                                <p className="text-sm font-semibold text-foreground">{d.fullName}</p>
                                <p className="text-lg font-bold" style={{ color: getScoreColor(d.score) }}>
                                  {d.score}%
                                </p>
                                <p className="text-xs text-muted-foreground">Weighted Fit Score</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="score" radius={[0, 4, 4, 0]} maxBarSize={32}>
                        {chartData.map((entry, i) => (
                          <Cell key={i} fill={getScoreColor(entry.score)} fillOpacity={0.85} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Vendor score pills */}
                <div className="flex flex-wrap gap-3 mt-4">
                  {filteredEvaluation.vendors.map(v => (
                    <div
                      key={v.vendorId}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-border/50"
                      data-testid={`score-pill-${v.vendorShortName}`}
                    >
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: v.color }}
                      />
                      <span className="text-sm text-foreground font-medium">{v.vendorName}</span>
                      <span
                        className="text-sm font-bold ml-1"
                        style={{ color: getScoreColor(v.overallScore) }}
                      >
                        {v.overallScore}%
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Module Scores + Gap Analysis Tabs */}
          {hasScores && (
            <Card className="border-white/40" data-testid="card-analysis-tabs">
              <CardContent className="pt-4">
                <Tabs defaultValue="modules">
                  <TabsList className="mb-4">
                    <TabsTrigger value="modules" data-testid="tab-module-scores">
                      <BarChart3 className="w-3.5 h-3.5 mr-1.5" />
                      Module Scores
                    </TabsTrigger>
                    <TabsTrigger value="gaps" data-testid="tab-gap-analysis">
                      <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />
                      Gap Analysis
                      {filteredEvaluation && filteredEvaluation.gaps.length > 0 && (
                        <Badge variant="destructive" className="ml-2 text-xs px-1.5 py-0">
                          {filteredEvaluation.gaps.filter(g => g.criticality === "Critical").length}
                        </Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="customCriteria" data-testid="tab-custom-criteria">
                      <ListChecks className="w-3.5 h-3.5 mr-1.5" />
                      Custom Criteria
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="modules" className="mt-4 workspace-subsection">
                    <ModuleScoresTab
                      evaluation={filteredEvaluation}
                      selectedVendors={selectedVendors}
                      weights={moduleWeights}
                    />
                  </TabsContent>
                  <TabsContent value="gaps" className="mt-4 workspace-subsection">
                    <GapAnalysisTab
                      evaluation={filteredEvaluation}
                      selectedVendors={selectedVendors}
                    />
                  </TabsContent>
                  <TabsContent value="customCriteria" className="mt-4 workspace-subsection">
                    <CustomCriteriaTab
                      projectId={projectId}
                      selectedVendors={selectedVendors}
                    />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          )}

          {/* Score Legend */}
          <Card className="bg-muted/20 border-border/40">
            <CardContent className="py-3">
              <div className="flex flex-wrap items-center gap-4">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Score Key:</span>
                {Object.entries(SCORE_LABELS).map(([code, label]) => (
                  <div key={code} className="flex items-center gap-1.5">
                    <ScoreBadge score={code} />
                    <span className="text-xs text-muted-foreground">{label}</span>
                  </div>
                ))}
                <div className="ml-auto flex items-center gap-4">
                  <span className="text-xs text-muted-foreground">Fit Score:</span>
                  {[["≥80% Excellent", "#22c55e"], ["60–80% Good", "#d4a853"], ["<60% Gap Risk", "#ef4444"]].map(([label, color]) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color as string }} />
                      <span className="text-xs text-muted-foreground">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
      </div>
      {/* Analyze Proposal Dialog */}
      <Dialog open={proposalDialogOpen} onOpenChange={(open) => { if (!open && proposalStep !== 2) { setProposalDialogOpen(false); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-accent" />
              Analyze Vendor Proposal
            </DialogTitle>
          </DialogHeader>

          {/* Step 1: Upload */}
          {proposalStep === 1 && (
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Vendor</label>
                <Select value={proposalVendorId} onValueChange={setProposalVendorId}>
                  <SelectTrigger data-testid="proposal-vendor-select">
                    <SelectValue placeholder="Choose a vendor..." />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.map(v => (
                      <SelectItem key={v.id} value={v.id.toString()}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Upload Proposal (PDF)</label>
                <div
                  className="border-2 border-dashed border-border/60 rounded-lg p-8 text-center cursor-pointer hover:border-accent/50 hover:bg-accent/5 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="proposal-drop-zone"
                >
                  <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  {proposalFile ? (
                    <div>
                      <p className="text-sm font-medium text-foreground">{proposalFile.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">{(proposalFile.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm text-muted-foreground">Click to select a PDF file</p>
                      <p className="text-sm text-muted-foreground mt-1">PDF files only</p>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => setProposalFile(e.target.files?.[0] || null)}
                    data-testid="proposal-file-input"
                  />
                </div>
              </div>

              <Button
                className="w-full bg-accent hover:bg-accent/90 text-accent-foreground gap-2"
                disabled={!proposalVendorId || !proposalFile}
                onClick={handleAnalyzeProposal}
                data-testid="proposal-analyze-button"
              >
                <Brain className="w-4 h-4" />
                Analyze with AI
              </Button>
            </div>
          )}

          {/* Step 2: Processing */}
          {proposalStep === 2 && (
            <div className="flex flex-col items-center py-12 gap-4">
              <Loader2 className="w-10 h-10 text-accent animate-spin" />
              <p className="text-sm font-medium text-foreground">{analysisStatusText}</p>
              <p className="text-sm text-muted-foreground">This may take a minute for large documents</p>
            </div>
          )}

          {/* Step 3: Results */}
          {proposalStep === 3 && proposalResult?.dimensions && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                {proposalResult.dimensions.map((dim: any, idx: number) => {
                  const score = dim.score || 0;
                  const scoreColor = score >= 8 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                    : score >= 5 ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                    : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400";
                  const dimLabel = (dim.dimension || dim.label || "").replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase());
                  const evidence = Array.isArray(dim.evidence) ? dim.evidence : [];
                  const concerns = Array.isArray(dim.concerns) ? dim.concerns : [];

                  return (
                    <ProposalResultCard
                      key={idx}
                      dimLabel={dimLabel}
                      score={score}
                      scoreColor={scoreColor}
                      summary={dim.summary}
                      evidence={evidence}
                      concerns={concerns}
                    />
                  );
                })}
              </div>

              {proposalResult.overallAssessment && (
                <div className="p-3 rounded-lg bg-accent/5 border border-accent/20">
                  <p className="text-xs font-semibold text-accent mb-1">Overall Assessment</p>
                  <p className="text-sm text-foreground">{proposalResult.overallAssessment}</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button
                  className="flex-1 bg-accent hover:bg-accent/90 text-accent-foreground"
                  onClick={handleAcceptProposal}
                  data-testid="proposal-accept-button"
                >
                  Accept &amp; Save
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => { setProposalDialogOpen(false); setProposalStep(1); setProposalFile(null); setProposalResult(null); }}
                  data-testid="proposal-discard-button"
                >
                  Discard
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
