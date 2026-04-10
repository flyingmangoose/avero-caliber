import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, ShieldAlert, Calendar, DollarSign, Stethoscope, FolderOpen, Rocket, ChevronDown, ChevronRight, ArrowRight } from "lucide-react";

const HEALTH_BG: Record<string, string> = {
  critical: "bg-red-500", high: "bg-orange-500", medium: "bg-amber-500", low: "bg-blue-500", satisfactory: "bg-emerald-500",
};
const HEALTH_LIGHT: Record<string, string> = {
  critical: "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800",
  high: "bg-orange-50 border-orange-200 dark:bg-orange-950/20 dark:border-orange-800",
  medium: "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800",
  low: "bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800",
  satisfactory: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800",
};
const DOMAIN_LABELS: Record<string, string> = {
  governance: "Governance", raid: "RAID", technical: "Technical", budget_schedule: "Budget & Schedule",
  change_management: "Change Mgmt", data_migration: "Data Migration", testing_quality: "Testing",
  vendor_performance: "Vendor/SI", compliance_security: "Compliance", scope_requirements: "Scope",
};

export default function Portfolio() {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/analytics/program-dashboard"],
    queryFn: () => apiRequest("GET", "/api/analytics/program-dashboard").then(r => r.json()),
  });

  const toggle = (id: number) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  if (isLoading) {
    return <div className="p-6 space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-96" /></div>;
  }

  const projects = data?.projects || [];
  const agg = data?.aggregates || {};

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border/50 shrink-0">
        <h1 className="text-lg font-semibold">Program Dashboard</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Cross-project health and status at a glance</p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">

          {/* KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="px-4 py-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground">Projects</p>
              <p className="text-2xl font-semibold">{agg.totalProjects || 0}</p>
            </div>
            <div className="px-4 py-3 rounded-lg bg-red-50 dark:bg-red-950/20">
              <p className="text-xs text-red-600 dark:text-red-400">At Risk</p>
              <p className="text-2xl font-semibold text-red-600">{agg.projectsAtRisk || 0}</p>
            </div>
            <div className="px-4 py-3 rounded-lg bg-red-50 dark:bg-red-950/20">
              <p className="text-xs text-red-600 dark:text-red-400">Critical Items</p>
              <p className="text-2xl font-semibold text-red-600">{agg.totalCritical || 0}</p>
            </div>
            <div className="px-4 py-3 rounded-lg bg-orange-50 dark:bg-orange-950/20">
              <p className="text-xs text-orange-600 dark:text-orange-400">High Risk</p>
              <p className="text-2xl font-semibold text-orange-600">{agg.totalHighRisks || 0}</p>
            </div>
          </div>

          {/* Project Cards */}
          {projects.length === 0 ? (
            <Card className="p-8 text-center">
              <FolderOpen className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No projects yet</p>
            </Card>
          ) : (
            <div className="space-y-4">
              {projects.map((p: any) => {
                const isOpen = expanded.has(p.id);
                return (
                  <Card key={p.id} className={`overflow-hidden transition-all ${p.healthRating === "critical" ? "border-red-300 dark:border-red-800" : p.healthRating === "high" ? "border-orange-300 dark:border-orange-800" : ""}`}>
                    <CardContent className="p-0">
                      {/* Header row — always visible */}
                      <button className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-muted/20 transition-colors" onClick={() => toggle(p.id)}>
                        <div className={`w-2.5 h-10 rounded-full shrink-0 ${HEALTH_BG[p.healthRating] || "bg-gray-300"}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold">{p.name}</span>
                            {p.clientName && <span className="text-xs text-muted-foreground">— {p.clientName}</span>}
                            {p.healthRating && <Badge className={`text-[9px] text-white ${HEALTH_BG[p.healthRating]}`}>{p.healthRating.toUpperCase()}</Badge>}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground flex-wrap">
                            {p.openCritical > 0 && <span className="text-red-600 font-medium">{p.openCritical} critical</span>}
                            {p.openRisks > 0 && <span>{p.openRisks} risks</span>}
                            {p.budgetSpendPct !== null && <span><DollarSign className="w-3 h-3 inline" />{p.budgetSpendPct}%</span>}
                            {p.delayedMilestones > 0 && <span className="text-red-600"><Calendar className="w-3 h-3 inline" /> {p.delayedMilestones} delayed</span>}
                            {p.daysToGoLive !== null && <span className={p.daysToGoLive <= 0 ? "text-red-600 font-medium" : p.daysToGoLive <= 90 ? "text-amber-600" : ""}><Rocket className="w-3 h-3 inline" /> {p.daysToGoLive > 0 ? `${p.daysToGoLive}d` : `${Math.abs(p.daysToGoLive)}d past`}</span>}
                          </div>
                        </div>
                        {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                      </button>

                      {/* Expanded detail */}
                      {isOpen && (
                        <div className="px-4 pb-4 space-y-4 border-t">
                          {/* Domain health tiles */}
                          {p.domains && p.domains.length > 0 && (
                            <div className="pt-3">
                              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Health Assessment</p>
                              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                                {p.domains.map((d: any) => (
                                  <div key={d.domain} className={`p-2.5 rounded-lg border text-xs ${HEALTH_LIGHT[d.rating] || "bg-muted/30 border-border/40"}`}>
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="font-medium text-[10px]">{DOMAIN_LABELS[d.domain] || d.domain}</span>
                                      <span className={`text-[9px] font-bold ${d.rating === "critical" || d.rating === "high" ? "text-red-600" : d.rating === "medium" ? "text-amber-600" : "text-emerald-600"}`}>
                                        {(d.rating || "—").toUpperCase()}
                                      </span>
                                    </div>
                                    {d.summary && <p className="text-[9px] text-muted-foreground line-clamp-2">{d.summary}</p>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Top risks */}
                          {p.topRisks && p.topRisks.length > 0 && (
                            <div>
                              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Top Risks & Issues</p>
                              <div className="space-y-1">
                                {p.topRisks.map((r: any, i: number) => (
                                  <div key={i} className="flex items-center gap-2 text-xs">
                                    <Badge className={`text-[8px] ${r.severity === "critical" ? "bg-red-500 text-white" : "bg-orange-500 text-white"}`}>{r.severity}</Badge>
                                    <Badge variant="outline" className="text-[8px]">{r.type}</Badge>
                                    <span className="truncate">{r.title}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Status tiles */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {p.budgetTotal > 0 && (
                              <div className="p-2.5 rounded-lg bg-muted/30">
                                <p className="text-[10px] text-muted-foreground mb-0.5">Budget</p>
                                <p className="text-sm font-semibold">{p.budgetSpendPct}%</p>
                                <p className="text-[9px] text-muted-foreground">${(p.budgetSpent || 0).toLocaleString()} of ${p.budgetTotal.toLocaleString()}</p>
                              </div>
                            )}
                            {p.totalMilestones > 0 && (
                              <div className="p-2.5 rounded-lg bg-muted/30">
                                <p className="text-[10px] text-muted-foreground mb-0.5">Schedule</p>
                                <p className="text-sm font-semibold">{p.totalMilestones} milestones</p>
                                {p.delayedMilestones > 0 && <p className="text-[9px] text-red-600">{p.delayedMilestones} delayed</p>}
                              </div>
                            )}
                            {p.requirementCount > 0 && (
                              <div className="p-2.5 rounded-lg bg-muted/30">
                                <p className="text-[10px] text-muted-foreground mb-0.5">Requirements</p>
                                <p className="text-sm font-semibold">{p.requirementCount}</p>
                              </div>
                            )}
                            {p.goLiveDate && (
                              <div className={`p-2.5 rounded-lg ${p.daysToGoLive && p.daysToGoLive <= 0 ? "bg-red-50 dark:bg-red-950/20" : "bg-muted/30"}`}>
                                <p className="text-[10px] text-muted-foreground mb-0.5">Go-Live</p>
                                <p className="text-sm font-semibold">{p.goLiveDate}</p>
                                {p.vendorName && <p className="text-[9px] text-muted-foreground">{p.vendorName}</p>}
                              </div>
                            )}
                          </div>

                          {/* Quick navigation */}
                          <div className="flex gap-2 flex-wrap">
                            {p.assessmentCount > 0 && (
                              <Link href={`/projects/${p.id}/health-check`}>
                                <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1">
                                  <Stethoscope className="w-3 h-3" />Health Check<ArrowRight className="w-3 h-3" />
                                </Button>
                              </Link>
                            )}
                            <Link href={`/projects/${p.id}/go-live`}>
                              <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1">
                                <Rocket className="w-3 h-3" />Go-Live<ArrowRight className="w-3 h-3" />
                              </Button>
                            </Link>
                            {p.requirementCount > 0 && (
                              <Link href={`/projects/${p.id}/evaluation`}>
                                <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1">
                                  Vendor Evaluation<ArrowRight className="w-3 h-3" />
                                </Button>
                              </Link>
                            )}
                            {p.outcomeCount > 0 && (
                              <Link href={`/projects/${p.id}/scorecard`}>
                                <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1">
                                  Scorecard<ArrowRight className="w-3 h-3" />
                                </Button>
                              </Link>
                            )}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
