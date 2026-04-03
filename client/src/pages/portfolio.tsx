import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FolderOpen,
  FileText,
  Calculator,
  LayoutGrid,
  ArrowUpDown,
  ChevronRight,
} from "lucide-react";
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
} from "recharts";

// ==================== TYPES ====================

interface ProjectAnalytics {
  id: number;
  name: string;
  status: string;
  totalRequirements: number;
  criticalCount: number;
  desiredCount: number;
  moduleCoverage: number;
  moduleBreakdown: Record<string, number>;
  criticalityDistribution: {
    critical: number;
    desired: number;
    notRequired: number;
    notApplicable: number;
  };
  hasEvaluation: boolean;
  topVendor?: { name: string; score: number };
  workshopProgress?: { total: number; reviewed: number; flagged: number };
}

interface PortfolioData {
  projects: ProjectAnalytics[];
  aggregates: {
    totalProjects: number;
    totalRequirements: number;
    avgRequirementsPerProject: number;
    moduleFrequency: Record<string, number>;
    criticalityTrend: {
      critical: number;
      desired: number;
      notRequired: number;
      notApplicable: number;
    };
    platformComparison: Array<{
      vendorName: string;
      avgScore: number;
      projectCount: number;
    }>;
  };
}

type SortKey =
  | "name"
  | "status"
  | "totalRequirements"
  | "criticalPct"
  | "moduleCoverage"
  | "topVendorScore";
type SortDir = "asc" | "desc";

// ==================== COLORS ====================

const NAVY = "#1a2744";
const GOLD = "#d4a853";
const SLATE = "#94a3b8";
const LIGHT_SLATE = "#cbd5e1";

// ==================== HELPERS ====================

function statusBadge(status: string) {
  const map: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    active:
      "bg-primary/10 text-primary dark:bg-accent/20 dark:text-accent",
    finalized:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  };
  return (
    <Badge
      variant="outline"
      className={`text-[10px] font-semibold uppercase tracking-wide ${map[status] || ""}`}
    >
      {status}
    </Badge>
  );
}

function scoreColor(score: number): string {
  if (score >= 75) return "text-green-600 dark:text-green-400";
  if (score >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

// ==================== COMPONENT ====================

export default function Portfolio() {
  const [sortKey, setSortKey] = useState<SortKey>("totalRequirements");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data, isLoading } = useQuery<PortfolioData>({
    queryKey: ["/api/analytics/portfolio"],
  });

  // Sort logic
  const sortedProjects = useMemo(() => {
    if (!data) return [];
    const list = [...data.projects];
    list.sort((a, b) => {
      let av: number | string = 0;
      let bv: number | string = 0;
      switch (sortKey) {
        case "name":
          av = a.name.toLowerCase();
          bv = b.name.toLowerCase();
          break;
        case "status":
          av = a.status;
          bv = b.status;
          break;
        case "totalRequirements":
          av = a.totalRequirements;
          bv = b.totalRequirements;
          break;
        case "criticalPct":
          av = a.totalRequirements > 0 ? a.criticalCount / a.totalRequirements : 0;
          bv = b.totalRequirements > 0 ? b.criticalCount / b.totalRequirements : 0;
          break;
        case "moduleCoverage":
          av = a.moduleCoverage;
          bv = b.moduleCoverage;
          break;
        case "topVendorScore":
          av = a.topVendor?.score ?? -1;
          bv = b.topVendor?.score ?? -1;
          break;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [data, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  // Derived chart data
  const moduleUsageData = useMemo(() => {
    if (!data) return [];
    const entries = Object.entries(data.aggregates.moduleFrequency)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    return entries;
  }, [data]);

  const maxModuleCount = useMemo(
    () => Math.max(...moduleUsageData.map((d) => d.count), 0),
    [moduleUsageData]
  );

  const mostCommonModule = moduleUsageData.length > 0 ? moduleUsageData[0].name : "—";

  const criticalityChartData = useMemo(() => {
    if (!data) return [];
    return data.projects
      .filter((p) => p.totalRequirements > 0)
      .map((p) => ({
        name: p.name.length > 25 ? p.name.substring(0, 25) + "…" : p.name,
        Critical: p.criticalityDistribution.critical,
        Desired: p.criticalityDistribution.desired,
        "Not Required": p.criticalityDistribution.notRequired,
        "Not Applicable": p.criticalityDistribution.notApplicable,
      }));
  }, [data]);

  const platformChartData = useMemo(() => {
    if (!data) return [];
    return data.aggregates.platformComparison.map((v) => ({
      name: v.vendorName.length > 30 ? v.vendorName.substring(0, 30) + "…" : v.vendorName,
      avgScore: v.avgScore,
      projectCount: v.projectCount,
    }));
  }, [data]);

  const hasEvaluationData = platformChartData.length > 0;

  // Loading state
  if (isLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6" data-testid="page-portfolio">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-lg" />
        <Skeleton className="h-80 w-full rounded-lg" />
      </div>
    );
  }

  if (!data || data.projects.length === 0) {
    return (
      <div className="p-6 max-w-7xl mx-auto" data-testid="page-portfolio">
        <h1 className="text-xl font-bold tracking-tight mb-1">Portfolio Insights</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Cross-project analytics and comparison
        </p>
        <Card>
          <CardContent className="p-12 text-center">
            <FolderOpen className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
            <h3 className="text-sm font-semibold mb-1">No projects yet</h3>
            <p className="text-xs text-muted-foreground">
              Create projects on the Dashboard to see portfolio-level insights.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" data-testid="page-portfolio">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight">Portfolio Insights</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Cross-project analytics and comparison across {data.aggregates.totalProjects} engagement{data.aggregates.totalProjects !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Section 1: KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="section-kpi-cards">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 dark:bg-accent/15">
              <FolderOpen className="w-5 h-5 text-primary dark:text-accent" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-total-projects">
                {data.aggregates.totalProjects}
              </p>
              <p className="text-xs text-muted-foreground">Total Projects</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/15">
              <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-total-requirements">
                {data.aggregates.totalRequirements.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">Total Requirements</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-900/15">
              <Calculator className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-avg-requirements">
                {data.aggregates.avgRequirementsPerProject}
              </p>
              <p className="text-xs text-muted-foreground">Avg per Project</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-50 dark:bg-green-900/15">
              <LayoutGrid className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm font-bold truncate max-w-[120px]" data-testid="text-most-common-module" title={mostCommonModule}>
                {mostCommonModule}
              </p>
              <p className="text-xs text-muted-foreground">Most Common Module</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section 2: Project Comparison Table */}
      <Card data-testid="section-project-table">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Project Comparison</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead
                    className="cursor-pointer select-none hover:text-foreground"
                    onClick={() => toggleSort("name")}
                    data-testid="sort-name"
                  >
                    <span className="flex items-center gap-1">
                      Project Name
                      <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
                    </span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none hover:text-foreground"
                    onClick={() => toggleSort("status")}
                    data-testid="sort-status"
                  >
                    <span className="flex items-center gap-1">
                      Status
                      <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
                    </span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none hover:text-foreground text-right"
                    onClick={() => toggleSort("totalRequirements")}
                    data-testid="sort-requirements"
                  >
                    <span className="flex items-center gap-1 justify-end">
                      Requirements
                      <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
                    </span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none hover:text-foreground text-right"
                    onClick={() => toggleSort("criticalPct")}
                    data-testid="sort-critical"
                  >
                    <span className="flex items-center gap-1 justify-end">
                      Critical %
                      <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
                    </span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none hover:text-foreground text-right"
                    onClick={() => toggleSort("moduleCoverage")}
                    data-testid="sort-modules"
                  >
                    <span className="flex items-center gap-1 justify-end">
                      Modules
                      <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
                    </span>
                  </TableHead>
                  <TableHead>Top Vendor</TableHead>
                  <TableHead
                    className="cursor-pointer select-none hover:text-foreground text-right"
                    onClick={() => toggleSort("topVendorScore")}
                    data-testid="sort-score"
                  >
                    <span className="flex items-center gap-1 justify-end">
                      Score
                      <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
                    </span>
                  </TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedProjects.map((p) => {
                  const critPct =
                    p.totalRequirements > 0
                      ? Math.round((p.criticalCount / p.totalRequirements) * 100)
                      : 0;
                  return (
                    <TableRow key={p.id} data-testid={`row-project-${p.id}`}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/projects/${p.id}`}
                          className="text-primary dark:text-accent hover:underline"
                          data-testid={`link-project-${p.id}`}
                        >
                          {p.name}
                        </Link>
                      </TableCell>
                      <TableCell>{statusBadge(p.status)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.totalRequirements.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{critPct}%</TableCell>
                      <TableCell className="text-right tabular-nums">{p.moduleCoverage}</TableCell>
                      <TableCell className="text-xs text-muted-foreground truncate max-w-[140px]">
                        {p.topVendor ? p.topVendor.name : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.topVendor ? (
                          <span className={`font-semibold ${scoreColor(p.topVendor.score)}`}>
                            {p.topVendor.score.toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Link href={`/projects/${p.id}`} data-testid={`link-go-project-${p.id}`}>
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Section 3: Module Usage Heatmap */}
      {moduleUsageData.length > 0 && (
        <Card data-testid="section-module-usage">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Module Usage Across Engagements</CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ height: Math.max(moduleUsageData.length * 32 + 40, 200) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={moduleUsageData}
                  layout="vertical"
                  margin={{ top: 0, right: 24, bottom: 0, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={170}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                    labelStyle={{ fontWeight: 600 }}
                    formatter={(value: number) => [`${value} project${value !== 1 ? "s" : ""}`, "Used in"]}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20}>
                    {moduleUsageData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={entry.count === maxModuleCount ? GOLD : NAVY}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section 4: Criticality Distribution */}
      {criticalityChartData.length > 0 && (
        <Card data-testid="section-criticality">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              Requirements Criticality by Project
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ height: Math.max(criticalityChartData.length * 48 + 60, 200) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={criticalityChartData}
                  layout="vertical"
                  margin={{ top: 0, right: 24, bottom: 0, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={170}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                    labelStyle={{ fontWeight: 600 }}
                  />
                  <Legend
                    iconType="square"
                    wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                  />
                  <Bar dataKey="Critical" stackId="crit" fill={NAVY} radius={[0, 0, 0, 0]} barSize={24} />
                  <Bar dataKey="Desired" stackId="crit" fill={GOLD} radius={[0, 0, 0, 0]} barSize={24} />
                  <Bar dataKey="Not Required" stackId="crit" fill={SLATE} radius={[0, 0, 0, 0]} barSize={24} />
                  <Bar dataKey="Not Applicable" stackId="crit" fill={LIGHT_SLATE} radius={[0, 4, 4, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section 5: Platform Performance */}
      {hasEvaluationData && (
        <Card data-testid="section-platform-performance">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              Average Platform Fit Score Across Engagements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ height: Math.max(platformChartData.length * 48 + 60, 200) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={platformChartData}
                  layout="vertical"
                  margin={{ top: 0, right: 24, bottom: 0, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={200}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                    labelStyle={{ fontWeight: 600 }}
                    formatter={(value: number, _name: string, props: { payload: { projectCount: number } }) => [
                      `${value.toFixed(1)} (${props.payload.projectCount} project${props.payload.projectCount !== 1 ? "s" : ""} evaluated)`,
                      "Avg Score",
                    ]}
                  />
                  <Bar dataKey="avgScore" radius={[0, 4, 4, 0]} barSize={24}>
                    {platformChartData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={entry.avgScore >= 75 ? "#16a34a" : entry.avgScore >= 50 ? GOLD : "#dc2626"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
