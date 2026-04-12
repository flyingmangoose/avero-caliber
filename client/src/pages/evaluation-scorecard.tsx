import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronLeft, ChevronRight, Sparkles, Loader2, BarChart3, Trophy, Download } from "lucide-react";

const PRI_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400",
  medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400",
  low: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
};
const SCORE_COLORS = ["", "bg-red-500", "bg-orange-500", "bg-amber-500", "bg-green-500", "bg-emerald-500"];
const SCORE_TEXT = ["", "text-red-600", "text-orange-600", "text-amber-600", "text-green-600", "text-emerald-600"];

export default function EvaluationScorecardPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id || "0");
  const { toast } = useToast();

  const { data: project } = useQuery<any>({ queryKey: ["/api/projects", projectId], queryFn: () => apiRequest("GET", `/api/projects/${projectId}`).then(r => r.json()), enabled: !!projectId });
  const { data: scorecard } = useQuery<any>({ queryKey: ["/api/projects", projectId, "outcome-scorecard"], queryFn: () => apiRequest("GET", `/api/projects/${projectId}/outcome-scorecard`).then(r => r.json()), enabled: !!projectId });
  const { data: allScores = [] } = useQuery<any[]>({ queryKey: ["/api/projects", projectId, "scenario-scores"], queryFn: () => apiRequest("GET", `/api/projects/${projectId}/scenario-scores`).then(r => r.json()), enabled: !!projectId });
  const { data: allScenarios = [] } = useQuery<any[]>({ queryKey: ["/api/projects", projectId, "scenarios"], queryFn: () => apiRequest("GET", `/api/projects/${projectId}/scenarios`).then(r => r.json()), enabled: !!projectId });
  const { data: outcomes = [] } = useQuery<any[]>({ queryKey: ["/api/projects", projectId, "outcomes"], queryFn: () => apiRequest("GET", `/api/projects/${projectId}/outcomes`).then(r => r.json()), enabled: !!projectId });
  const { data: unifiedEval } = useQuery<any>({ queryKey: ["/api/projects", projectId, "unified-evaluation"], queryFn: () => apiRequest("GET", `/api/projects/${projectId}/unified-evaluation`).then(r => r.json()), enabled: !!projectId });

  const [autoSuggestingVendor, setAutoSuggestingVendor] = useState<number | null>(null);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "outcome-scorecard"] });
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "scenario-scores"] });
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "unified-evaluation"] });
  };

  const saveScore = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/scenario-scores", { projectId, ...data }).then(r => r.json()),
    onSuccess: () => invalidateAll(),
  });

  const vendors = scorecard?.vendorTotals || [];
  const dims = ["processFit", "automationLevel", "configComplexity", "userExperience", "dataVisibility"];
  const dimLabels: Record<string, string> = {
    processFit: "Process Fit", automationLevel: "Automation", configComplexity: "Config (5=OOB)",
    userExperience: "UX", dataVisibility: "Data",
  };

  const autoSuggest = async (vendorId: number) => {
    setAutoSuggestingVendor(vendorId);
    try {
      const res = await apiRequest("POST", `/api/projects/${projectId}/scenario-scores/auto-suggest`, { vendorId });
      const data = await res.json();
      invalidateAll();
      toast({ title: `${data.suggested} scores auto-filled for ${data.vendorName}` });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    }
    setAutoSuggestingVendor(null);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-3">
          <Link href={`/projects/${projectId}`}>
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground hover:text-foreground -ml-2">
              <ChevronLeft className="w-4 h-4" />{project?.name || "Project"}
            </Button>
          </Link>
          <span className="text-muted-foreground/40">/</span>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Trophy className="w-5 h-5 text-accent" />Evaluation Scorecard
          </h1>
          <div className="ml-auto">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => window.open(`/api/projects/${projectId}/scorecard/report-pdf`, "_blank")} data-testid="btn-scorecard-pdf">
              <Download className="w-3.5 h-3.5" />PDF
            </Button>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 sm:p-6">
          <Tabs defaultValue="scorecard">
            <TabsList className="mb-4">
              <TabsTrigger value="scorecard">Scorecard</TabsTrigger>
              <TabsTrigger value="scoring">Detailed Scoring</TabsTrigger>
              <TabsTrigger value="unified">Unified Evaluation</TabsTrigger>
            </TabsList>

            {/* TAB 1: SCORECARD MATRIX */}
            <TabsContent value="scorecard">
              {scorecard?.outcomes?.length > 0 && vendors.length > 0 ? (
                <div className="space-y-4">
                  {/* Auto-score buttons per vendor */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-muted-foreground">Auto-score from KB:</span>
                    {vendors.map((v: any) => (
                      <Button key={v.vendorId} size="sm" variant="outline" className="h-7 text-xs gap-1"
                        onClick={() => autoSuggest(v.vendorId)}
                        disabled={autoSuggestingVendor === v.vendorId}
                      >
                        {autoSuggestingVendor === v.vendorId ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        {v.vendorName}
                      </Button>
                    ))}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="text-left p-2.5 font-medium min-w-[200px]">Outcome</th>
                          <th className="text-left p-2.5 font-medium w-20">Priority</th>
                          {vendors.map((v: any) => (
                            <th key={v.vendorId} className="text-center p-2.5 font-medium min-w-[80px]">{v.vendorName}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {scorecard.outcomes.map((o: any) => (
                          <tr key={o.id} className="border-b hover:bg-muted/10">
                            <td className="p-2.5">
                              <p className="font-medium">{o.title}</p>
                              {o.scenarioCount > 0 && <p className="text-muted-foreground text-xs">{o.scenarioCount} scenarios</p>}
                            </td>
                            <td className="p-2.5"><Badge className={`text-xs ${PRI_COLORS[o.priority] || ""}`}>{o.priority}</Badge></td>
                            {o.vendors.map((v: any) => (
                              <td key={v.vendorId} className="text-center p-2.5">
                                {v.avgOverall ? (
                                  <span className={`inline-flex w-9 h-9 items-center justify-center rounded-lg text-white text-sm font-bold ${SCORE_COLORS[Math.round(v.avgOverall)] || "bg-gray-400"}`}>
                                    {v.avgOverall.toFixed(1)}
                                  </span>
                                ) : <span className="text-muted-foreground">—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                        <tr className="border-t-2 bg-muted/20">
                          <td className="p-2.5 font-bold">Weighted Total</td>
                          <td className="p-2.5"></td>
                          {vendors.map((v: any) => (
                            <td key={v.vendorId} className="text-center p-2.5">
                              {v.weightedAvg ? (
                                <span className={`inline-flex w-11 h-11 items-center justify-center rounded-xl text-white text-base font-bold ${SCORE_COLORS[Math.round(v.weightedAvg)] || "bg-gray-400"}`}>
                                  {v.weightedAvg.toFixed(1)}
                                </span>
                              ) : "—"}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="text-sm text-muted-foreground">Priority weighting: Critical (4x) | High (3x) | Medium (2x) | Low (1x)</p>
                </div>
              ) : (
                <Card className="p-8 text-center">
                  <BarChart3 className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-base font-medium">No scorecard data yet</p>
                  <p className="text-sm text-muted-foreground mt-1">Generate outcomes and scenarios in the Outcomes module, then auto-score vendors here.</p>
                </Card>
              )}
            </TabsContent>

            {/* TAB 2: DETAILED SCORING — all vendors side by side */}
            <TabsContent value="scoring">
              {allScenarios.length > 0 && vendors.length > 0 ? (
                <div className="space-y-4">
                  {outcomes.map((o: any) => {
                    const scenarios = allScenarios.filter((s: any) => s.outcomeId === o.id);
                    if (scenarios.length === 0) return null;

                    return (
                      <Collapsible key={o.id} defaultOpen>
                        <CollapsibleTrigger className="flex items-center gap-2 w-full text-left p-2 rounded hover:bg-muted/30">
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          <span className="text-base font-semibold flex-1">{o.title}</span>
                          <Badge className={`text-xs ${PRI_COLORS[o.priority] || ""}`}>{o.priority}</Badge>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="space-y-3 mt-2">
                            {scenarios.map((s: any) => (
                              <Card key={s.id}>
                                <CardContent className="p-4">
                                  <p className="text-base font-semibold mb-3">{s.title}</p>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                      <thead>
                                        <tr className="border-b">
                                          <th className="text-left p-2 font-medium w-28">Vendor</th>
                                          {dims.map(d => <th key={d} className="text-center p-2 font-medium text-xs">{dimLabels[d]}</th>)}
                                          <th className="text-center p-2 font-medium">Overall</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {vendors.map((v: any) => {
                                          const score = allScores.find((sc: any) => sc.scenarioId === s.id && sc.vendorId === v.vendorId);
                                          return (
                                            <tr key={v.vendorId} className="border-b">
                                              <td className="p-2 font-medium">
                                                {v.vendorName}
                                                {score?.evaluatedBy === "KB Auto-Suggest" && <Badge variant="outline" className="text-[10px] ml-1">KB</Badge>}
                                              </td>
                                              {dims.map(dim => (
                                                <td key={dim} className="text-center p-1">
                                                  <div className="flex gap-0.5 justify-center">
                                                    {[1, 2, 3, 4, 5].map(val => (
                                                      <button key={val}
                                                        className={`w-5 h-5 rounded text-xs font-bold transition-colors ${(score?.[dim] || 0) >= val ? SCORE_COLORS[val] + " text-white" : "bg-muted text-muted-foreground/40 hover:bg-muted/80"}`}
                                                        onClick={() => saveScore.mutate({ scenarioId: s.id, vendorId: v.vendorId, [dim]: val })}
                                                      >{val}</button>
                                                    ))}
                                                  </div>
                                                </td>
                                              ))}
                                              <td className="text-center p-2">
                                                {score?.overallScore ? (
                                                  <span className={`font-bold ${SCORE_TEXT[Math.round(score.overallScore)] || ""}`}>{score.overallScore}/5</span>
                                                ) : <span className="text-muted-foreground">—</span>}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  })}
                </div>
              ) : (
                <Card className="p-8 text-center">
                  <p className="text-base text-muted-foreground">Generate outcomes and scenarios first.</p>
                </Card>
              )}
            </TabsContent>

            {/* TAB 3: UNIFIED EVALUATION */}
            <TabsContent value="unified">
              {unifiedEval?.vendors?.length > 0 ? (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-semibold mb-1">Combined Vendor Ranking</h3>
                    <p className="text-sm text-muted-foreground">{unifiedEval.weights.requirements}% requirements matrix + {unifiedEval.weights.outcomes}% outcome evaluation</p>
                  </div>

                  <div className="space-y-3">
                    {unifiedEval.vendors.map((v: any, rank: number) => (
                      <Card key={v.vendorId} className={rank === 0 ? "border-accent/40 bg-accent/5" : ""}>
                        <CardContent className="p-4">
                          <div className="flex items-center gap-4">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${rank === 0 ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"}`}>
                              {rank + 1}
                            </div>
                            <div className="flex-1">
                              <p className="text-base font-semibold">{v.vendorName}</p>
                              <div className="flex items-center gap-4 mt-1">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                                    <div className="h-full rounded-full bg-primary" style={{ width: `${v.requirementScore}%` }} />
                                  </div>
                                  <span className="text-xs text-muted-foreground">Req: {v.requirementScore}%</span>
                                </div>
                                {v.outcomeScore !== null && (
                                  <div className="flex items-center gap-1.5">
                                    <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                                      <div className="h-full rounded-full bg-accent" style={{ width: `${v.outcomeScore}%` }} />
                                    </div>
                                    <span className="text-xs text-muted-foreground">Out: {v.outcomeScore}%</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <span className={`text-3xl font-bold ${v.combinedScore >= 80 ? "text-emerald-600" : v.combinedScore >= 60 ? "text-amber-600" : "text-red-600"}`}>
                                {v.combinedScore}%
                              </span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ) : (
                <Card className="p-8 text-center">
                  <Trophy className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-base text-muted-foreground">Complete requirements scoring and outcome evaluation to see the unified ranking.</p>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  );
}
