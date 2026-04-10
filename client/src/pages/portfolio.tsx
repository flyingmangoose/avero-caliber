import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, ShieldAlert, Calendar, DollarSign, Stethoscope, FolderOpen, ChevronRight, Rocket } from "lucide-react";

const HEALTH_COLORS: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-amber-500",
  low: "bg-blue-500",
  satisfactory: "bg-emerald-500",
};

const HEALTH_TEXT: Record<string, string> = {
  critical: "text-red-600",
  high: "text-orange-600",
  medium: "text-amber-600",
  low: "text-blue-600",
  satisfactory: "text-emerald-600",
};

export default function Portfolio() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/analytics/program-dashboard"],
    queryFn: () => apiRequest("GET", "/api/analytics/program-dashboard").then(r => r.json()),
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const projects = data?.projects || [];
  const agg = data?.aggregates || {};

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border/50 shrink-0">
        <h1 className="text-lg font-semibold">Program Dashboard</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Cross-project health and status overview</p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">

          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <FolderOpen className="w-4 h-4 text-primary" />
                  <span className="text-xs text-muted-foreground">Projects</span>
                </div>
                <p className="text-2xl font-semibold">{agg.totalProjects || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <ShieldAlert className="w-4 h-4 text-red-500" />
                  <span className="text-xs text-muted-foreground">At Risk</span>
                </div>
                <p className="text-2xl font-semibold">{agg.projectsAtRisk || 0}</p>
                <p className="text-[10px] text-muted-foreground">projects rated critical/high</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <span className="text-xs text-muted-foreground">Critical Items</span>
                </div>
                <p className="text-2xl font-semibold">{agg.totalCritical || 0}</p>
                <p className="text-[10px] text-muted-foreground">open critical RAID items</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-4 h-4 text-orange-500" />
                  <span className="text-xs text-muted-foreground">High Risk</span>
                </div>
                <p className="text-2xl font-semibold">{agg.totalHighRisks || 0}</p>
                <p className="text-[10px] text-muted-foreground">open high-severity items</p>
              </CardContent>
            </Card>
          </div>

          {/* Project Cards */}
          {projects.length === 0 ? (
            <Card className="p-8 text-center">
              <FolderOpen className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No projects yet</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {projects.map((p: any) => (
                <Link key={p.id} href={`/projects/${p.id}`} className="block no-underline">
                  <Card className="hover:bg-muted/20 transition-colors cursor-pointer">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        {/* Health indicator */}
                        <div className="shrink-0 mt-1">
                          {p.healthRating ? (
                            <div className={`w-3 h-3 rounded-full ${HEALTH_COLORS[p.healthRating] || "bg-gray-400"}`} title={p.healthRating} />
                          ) : (
                            <div className="w-3 h-3 rounded-full bg-gray-200" title="No assessment" />
                          )}
                        </div>

                        {/* Project info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-semibold truncate">{p.name}</h3>
                            {p.clientName && <span className="text-xs text-muted-foreground">{p.clientName}</span>}
                            <Badge variant="outline" className="text-[9px]">{p.status}</Badge>
                            {p.healthRating && (
                              <Badge className={`text-[9px] text-white ${HEALTH_COLORS[p.healthRating] || "bg-gray-400"}`}>
                                {p.healthRating.toUpperCase()}
                              </Badge>
                            )}
                          </div>

                          {/* Metrics row */}
                          <div className="flex items-center gap-4 mt-2 flex-wrap text-[11px] text-muted-foreground">
                            {p.openCritical > 0 && (
                              <span className="text-red-600 font-medium">{p.openCritical} critical</span>
                            )}
                            {p.openRisks > 0 && (
                              <span>{p.openRisks} risks</span>
                            )}
                            {p.openIssues > 0 && (
                              <span>{p.openIssues} issues</span>
                            )}
                            {p.budgetSpendPct !== null && (
                              <span className="flex items-center gap-1">
                                <DollarSign className="w-3 h-3" />
                                {p.budgetSpendPct}% spent
                              </span>
                            )}
                            {p.totalMilestones > 0 && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {p.delayedMilestones > 0 ? (
                                  <span className="text-red-600">{p.delayedMilestones} delayed</span>
                                ) : (
                                  <span>{p.totalMilestones} milestones</span>
                                )}
                              </span>
                            )}
                            {p.goLiveDate && (
                              <span className={`flex items-center gap-1 ${p.daysToGoLive && p.daysToGoLive <= 90 ? "text-amber-600 font-medium" : ""} ${p.daysToGoLive && p.daysToGoLive <= 0 ? "text-red-600 font-medium" : ""}`}>
                                <Rocket className="w-3 h-3" />
                                {p.daysToGoLive && p.daysToGoLive > 0 ? `${p.daysToGoLive}d to go-live` : p.daysToGoLive !== null ? `${Math.abs(p.daysToGoLive)}d past` : p.goLiveDate}
                              </span>
                            )}
                            {p.requirementCount > 0 && <span>{p.requirementCount} reqs</span>}
                            {p.outcomeCount > 0 && <span>{p.outcomeCount} outcomes</span>}
                          </div>
                        </div>

                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
