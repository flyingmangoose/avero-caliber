import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TrendingUp, TrendingDown, Minus, AlertTriangle, FolderOpen } from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";

const HEALTH_BG: Record<string, string> = {
  critical: "bg-red-500", high: "bg-orange-500", medium: "bg-amber-500", low: "bg-blue-500", satisfactory: "bg-emerald-500",
};
const HEALTH_TEXT: Record<string, string> = {
  critical: "text-red-600", high: "text-orange-600", medium: "text-amber-600", low: "text-blue-600", satisfactory: "text-emerald-600",
};
const HEALTH_CELL: Record<string, string> = {
  critical: "bg-red-500 text-white",
  high: "bg-orange-500 text-white",
  medium: "bg-amber-400 text-white",
  low: "bg-blue-400 text-white",
  satisfactory: "bg-emerald-500 text-white",
};
const DOMAIN_LABELS: Record<string, string> = {
  governance: "Gov", raid: "RAID", technical: "Tech", budget_schedule: "Budget",
  change_management: "Chg Mgmt", data_migration: "Data Mig", testing_quality: "Testing",
  vendor_performance: "Vendor", compliance_security: "Compliance", scope_requirements: "Scope",
};
const DOMAIN_FULL: Record<string, string> = {
  governance: "Governance", raid: "RAID", technical: "Technical", budget_schedule: "Budget & Schedule",
  change_management: "Change Mgmt", data_migration: "Data Migration", testing_quality: "Testing",
  vendor_performance: "Vendor/SI", compliance_security: "Compliance", scope_requirements: "Scope",
};
const RATING_LABELS: Record<number, string> = {
  1: "Critical", 2: "High", 3: "Medium", 4: "Low", 5: "Satisfactory",
};
const PROJECT_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#8b5cf6", "#f97316", "#06b6d4", "#ec4899", "#84cc16",
];

function TrendArrow({ trend }: { trend: string }) {
  if (trend === "up") return <TrendingUp className="w-3.5 h-3.5 text-emerald-500 inline ml-1" />;
  if (trend === "down") return <TrendingDown className="w-3.5 h-3.5 text-red-500 inline ml-1" />;
  return <Minus className="w-3.5 h-3.5 text-muted-foreground inline ml-1" />;
}

function formatCurrency(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toLocaleString()}`;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    on_track: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
    at_risk: "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
    delayed: "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400",
    completed: "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400",
    not_started: "bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400",
  };
  return <Badge className={`text-[10px] ${colors[status] || colors.not_started}`}>{(status || "unknown").replace(/_/g, " ")}</Badge>;
}

export default function ExecutiveDashboard() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/analytics/executive-dashboard"],
    queryFn: () => apiRequest("GET", "/api/analytics/executive-dashboard").then(r => r.json()),
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-72" />
        <div className="grid grid-cols-5 gap-3"><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
        <div className="grid grid-cols-2 gap-4"><Skeleton className="h-72" /><Skeleton className="h-72" /></div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const kpis = data?.kpis || {};
  const healthTrend = data?.healthTrend || [];
  const raidSummary = data?.raidSummary || { byProject: [], totals: {} };
  const budgetOverview = data?.budgetOverview || [];
  const heatmap = data?.heatmap || { projects: [], domains: [], cells: [] };
  const milestones = data?.milestones || [];
  const topRisks = data?.topRisks || [];

  // --- Health Trend: pivot to one row per date with worst rating per project ---
  const trendByDateProject: Record<string, Record<number, number>> = {};
  const projectIdSet = new Set<number>();
  const projectNameMap: Record<number, string> = {};
  for (const entry of healthTrend) {
    projectIdSet.add(entry.projectId);
    projectNameMap[entry.projectId] = entry.projectName;
    const key = entry.date;
    if (!trendByDateProject[key]) trendByDateProject[key] = {};
    const prev = trendByDateProject[key][entry.projectId];
    // Keep worst (lowest numeric = worst)
    if (prev === undefined || entry.ratingNumeric < prev) {
      trendByDateProject[key][entry.projectId] = entry.ratingNumeric;
    }
  }
  const projectIds = Array.from(projectIdSet);
  const trendChartData = Object.keys(trendByDateProject)
    .sort()
    .map(date => {
      const row: any = { date: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) };
      for (const pid of projectIds) {
        row[`p_${pid}`] = trendByDateProject[date][pid] ?? null;
      }
      return row;
    });

  // --- RAID stacked bar data ---
  const raidChartData = raidSummary.byProject
    .filter((p: any) => p.critical + p.high + p.medium + p.low > 0)
    .map((p: any) => ({ name: p.projectName.length > 18 ? p.projectName.substring(0, 16) + "..." : p.projectName, fullName: p.projectName, ...p }));

  // --- Budget chart data ---
  const budgetChartData = budgetOverview.map((b: any) => ({
    name: b.projectName.length > 18 ? b.projectName.substring(0, 16) + "..." : b.projectName,
    fullName: b.projectName,
    authorized: b.authorized,
    spent: b.actualSpend,
    spendPct: b.spendPct,
  }));

  const hasNoData = kpis.totalProjects === 0;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border/50 shrink-0">
        <h1 className="text-lg font-semibold">Executive Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Trends, analytics, and cross-project insights</p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">

          {/* KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="px-4 py-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground">Projects</p>
              <p className="text-2xl font-semibold">{kpis.totalProjects || 0}</p>
            </div>
            <div className="px-4 py-3 rounded-lg bg-red-50 dark:bg-red-950/20">
              <p className="text-xs text-red-600 dark:text-red-400">At Risk</p>
              <p className="text-2xl font-semibold text-red-600">{kpis.projectsAtRisk || 0}</p>
            </div>
            <div className="px-4 py-3 rounded-lg bg-red-50 dark:bg-red-950/20">
              <p className="text-xs text-red-600 dark:text-red-400">Critical Items</p>
              <p className="text-2xl font-semibold text-red-600">{kpis.totalCriticalItems || 0}</p>
            </div>
            <div className="px-4 py-3 rounded-lg bg-orange-50 dark:bg-orange-950/20">
              <p className="text-xs text-orange-600 dark:text-orange-400">High Risk</p>
              <p className="text-2xl font-semibold text-orange-600">{kpis.totalHighRisks || 0}</p>
            </div>
            <div className="px-4 py-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground">Avg Readiness</p>
              <p className="text-2xl font-semibold">
                {kpis.avgReadinessScore !== null ? `${kpis.avgReadinessScore}/100` : "—"}
                <TrendArrow trend={kpis.readinessScoreTrend || "flat"} />
              </p>
            </div>
          </div>

          {hasNoData && (
            <Card className="p-8 text-center">
              <FolderOpen className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No projects yet. Create projects from the Dashboard to see executive analytics.</p>
            </Card>
          )}

          {!hasNoData && (
            <>
              {/* Charts Row: Health Trend + RAID Distribution */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                {/* Health Trend */}
                <Card>
                  <CardContent className="pt-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Health Trend</h3>
                    {trendChartData.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-8 text-center">No assessment history yet. Rate health check domains to see trends.</p>
                    ) : (
                      <ResponsiveContainer width="100%" height={260}>
                        <LineChart data={trendChartData} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                          <YAxis
                            domain={[1, 5]}
                            ticks={[1, 2, 3, 4, 5]}
                            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                            tickFormatter={(v: number) => RATING_LABELS[v] || ""}
                            width={70}
                          />
                          <RechartsTooltip
                            contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "12px" }}
                            formatter={(value: number, name: string) => {
                              const pid = parseInt(name.replace("p_", ""));
                              return [RATING_LABELS[value] || value, projectNameMap[pid] || name];
                            }}
                          />
                          {projectIds.map((pid, i) => (
                            <Line
                              key={pid}
                              type="monotone"
                              dataKey={`p_${pid}`}
                              name={`p_${pid}`}
                              stroke={PROJECT_COLORS[i % PROJECT_COLORS.length]}
                              strokeWidth={2}
                              dot={{ r: 3 }}
                              connectNulls
                            />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                    {projectIds.length > 0 && (
                      <div className="flex flex-wrap gap-3 mt-2 px-2">
                        {projectIds.map((pid, i) => (
                          <div key={pid} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <div className="w-3 h-0.5 rounded" style={{ backgroundColor: PROJECT_COLORS[i % PROJECT_COLORS.length] }} />
                            {projectNameMap[pid]}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* RAID Distribution */}
                <Card>
                  <CardContent className="pt-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">RAID Distribution</h3>
                    {raidChartData.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-8 text-center">No open RAID items across projects.</p>
                    ) : (
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={raidChartData} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                          <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--foreground))" }} width={120} />
                          <RechartsTooltip
                            contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "12px" }}
                            content={({ active, payload }) => {
                              if (active && payload && payload.length > 0) {
                                const d = payload[0]?.payload;
                                return (
                                  <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg">
                                    <p className="text-sm font-semibold text-foreground mb-1">{d?.fullName}</p>
                                    {payload.map((p: any) => (
                                      <p key={p.dataKey} className="text-xs" style={{ color: p.color }}>{p.name}: {p.value}</p>
                                    ))}
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                          <Bar dataKey="critical" stackId="a" fill="#ef4444" name="Critical" />
                          <Bar dataKey="high" stackId="a" fill="#f97316" name="High" />
                          <Bar dataKey="medium" stackId="a" fill="#f59e0b" name="Medium" />
                          <Bar dataKey="low" stackId="a" fill="#3b82f6" name="Low" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Budget Overview */}
              {budgetChartData.length > 0 && (
                <Card>
                  <CardContent className="pt-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Budget Overview</h3>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={budgetChartData} margin={{ top: 20, right: 16, left: 8, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v: number) => formatCurrency(v)} width={60} />
                        <RechartsTooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length > 0) {
                              const d = payload[0]?.payload;
                              return (
                                <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg">
                                  <p className="text-sm font-semibold text-foreground mb-1">{d?.fullName}</p>
                                  <p className="text-xs text-muted-foreground">Authorized: {formatCurrency(d?.authorized || 0)}</p>
                                  <p className="text-xs text-foreground font-medium">Spent: {formatCurrency(d?.spent || 0)} ({d?.spendPct}%)</p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Bar dataKey="authorized" fill="hsl(var(--muted-foreground))" fillOpacity={0.3} name="Authorized" radius={[4, 4, 0, 0]} maxBarSize={40} />
                        <Bar dataKey="spent" name="Spent" radius={[4, 4, 0, 0]} maxBarSize={40}>
                          {budgetChartData.map((entry: any, i: number) => (
                            <Cell key={i} fill={entry.spendPct > 90 ? "#ef4444" : entry.spendPct > 75 ? "#f97316" : "#3b82f6"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Health Heatmap */}
              {heatmap.projects.length > 0 && heatmap.cells.some((c: any) => c.rating) && (
                <Card>
                  <CardContent className="pt-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Project Health Heatmap</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr>
                            <th className="text-left py-1.5 px-2 font-medium text-muted-foreground whitespace-nowrap">Project</th>
                            {heatmap.domains.map((d: string) => (
                              <th key={d} className="text-center py-1.5 px-1 font-medium text-muted-foreground whitespace-nowrap">
                                {DOMAIN_LABELS[d] || d}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {heatmap.projects.map((proj: any) => {
                            const cells = heatmap.cells.filter((c: any) => c.projectId === proj.id);
                            const hasAny = cells.some((c: any) => c.rating);
                            if (!hasAny) return null;
                            return (
                              <tr key={proj.id} className="border-t border-border/30">
                                <td className="py-1.5 px-2 font-medium whitespace-nowrap">{proj.name}</td>
                                {heatmap.domains.map((d: string) => {
                                  const cell = cells.find((c: any) => c.domain === d);
                                  const rating = cell?.rating;
                                  return (
                                    <td key={d} className="py-1.5 px-1 text-center">
                                      {rating ? (
                                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${HEALTH_CELL[rating] || "bg-gray-200 text-gray-600"}`} title={`${DOMAIN_FULL[d] || d}: ${rating}`}>
                                          {rating.charAt(0).toUpperCase()}
                                        </span>
                                      ) : (
                                        <span className="inline-block px-2 py-0.5 rounded text-[10px] bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600">—</span>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex items-center gap-3 mt-3 text-[10px] text-muted-foreground">
                      <span className="font-medium">Legend:</span>
                      {["critical", "high", "medium", "low", "satisfactory"].map(r => (
                        <div key={r} className="flex items-center gap-1">
                          <span className={`inline-block w-3 h-3 rounded ${HEALTH_BG[r]}`} />
                          <span className="capitalize">{r}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Bottom Row: Milestones + Risk Register */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                {/* Upcoming Milestones */}
                <Card>
                  <CardContent className="pt-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Upcoming Milestones</h3>
                    {milestones.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">No upcoming milestones tracked.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Project</TableHead>
                              <TableHead className="text-xs">Milestone</TableHead>
                              <TableHead className="text-xs">Target</TableHead>
                              <TableHead className="text-xs">Status</TableHead>
                              <TableHead className="text-xs text-right">Variance</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {milestones.map((m: any, i: number) => (
                              <TableRow key={i}>
                                <TableCell className="text-xs font-medium whitespace-nowrap">{m.projectName}</TableCell>
                                <TableCell className="text-xs">{m.milestone}</TableCell>
                                <TableCell className="text-xs whitespace-nowrap">
                                  {m.currentDate ? new Date(m.currentDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }) : "—"}
                                </TableCell>
                                <TableCell><StatusBadge status={m.status || "not_started"} /></TableCell>
                                <TableCell className="text-xs text-right">
                                  {m.varianceDays != null ? (
                                    <span className={m.varianceDays > 0 ? "text-red-600 font-medium" : m.varianceDays < 0 ? "text-emerald-600" : ""}>
                                      {m.varianceDays > 0 ? `+${m.varianceDays}d` : m.varianceDays < 0 ? `${m.varianceDays}d` : "On time"}
                                    </span>
                                  ) : "—"}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Cross-Project Risk Register */}
                <Card>
                  <CardContent className="pt-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                      <AlertTriangle className="w-3.5 h-3.5 inline mr-1.5 text-amber-500" />
                      Cross-Project Risk Register
                    </h3>
                    {topRisks.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">No critical or high severity items across projects.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs w-16">Severity</TableHead>
                              <TableHead className="text-xs w-14">Type</TableHead>
                              <TableHead className="text-xs">Title</TableHead>
                              <TableHead className="text-xs">Project</TableHead>
                              <TableHead className="text-xs">Owner</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {topRisks.map((r: any) => (
                              <TableRow key={r.id}>
                                <TableCell>
                                  <Badge className={`text-[10px] text-white ${r.severity === "critical" ? "bg-red-500" : "bg-orange-500"}`}>
                                    {r.severity}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-[10px]">{r.type}</Badge>
                                </TableCell>
                                <TableCell className="text-xs max-w-[200px] truncate">{r.title}</TableCell>
                                <TableCell className="text-xs whitespace-nowrap">{r.projectName}</TableCell>
                                <TableCell className="text-xs whitespace-nowrap text-muted-foreground">{r.owner || "—"}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
