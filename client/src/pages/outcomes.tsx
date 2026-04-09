import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Target, Sparkles, Plus, Trash2, Edit2, ChevronDown, ChevronRight, ChevronLeft, Check, Clock, Loader2, ArrowRight, BarChart3 } from "lucide-react";

const CATEGORIES = ["finance", "hr", "procurement", "asset_management", "it", "utilities", "general"];
const PRIORITIES = ["critical", "high", "medium", "low"];
const CAT_COLORS: Record<string, string> = {
  finance: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  hr: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400",
  procurement: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  asset_management: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  it: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400",
  utilities: "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-400",
  general: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
};
const PRI_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400",
  medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400",
  low: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
};
const SCORE_COLORS = ["", "bg-red-500", "bg-orange-500", "bg-amber-500", "bg-green-500", "bg-emerald-500"];

function parseJson(str: string | null | undefined, fallback: any = []) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

export default function OutcomesPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id || "0");
  const { toast } = useToast();

  const { data: project } = useQuery<any>({ queryKey: ["/api/projects", projectId], queryFn: () => apiRequest("GET", `/api/projects/${projectId}`).then(r => r.json()), enabled: !!projectId });
  const { data: outcomes = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/projects", projectId, "outcomes"], queryFn: () => apiRequest("GET", `/api/projects/${projectId}/outcomes`).then(r => r.json()), enabled: !!projectId });
  const { data: allScenarios = [] } = useQuery<any[]>({ queryKey: ["/api/projects", projectId, "scenarios"], queryFn: () => apiRequest("GET", `/api/projects/${projectId}/scenarios`).then(r => r.json()), enabled: !!projectId });
  const { data: scorecard } = useQuery<any>({ queryKey: ["/api/projects", projectId, "outcome-scorecard"], queryFn: () => apiRequest("GET", `/api/projects/${projectId}/outcome-scorecard`).then(r => r.json()), enabled: !!projectId });
  const { data: allScores = [] } = useQuery<any[]>({ queryKey: ["/api/projects", projectId, "scenario-scores"], queryFn: () => apiRequest("GET", `/api/projects/${projectId}/scenario-scores`).then(r => r.json()), enabled: !!projectId });

  const { data: requirements = [] } = useQuery<any[]>({ queryKey: ["/api/projects", projectId, "requirements"], queryFn: () => apiRequest("GET", `/api/projects/${projectId}/requirements`).then(r => r.json()), enabled: !!projectId });
  const { data: unifiedEval } = useQuery<any>({ queryKey: ["/api/projects", projectId, "unified-evaluation"], queryFn: () => apiRequest("GET", `/api/projects/${projectId}/unified-evaluation`).then(r => r.json()), enabled: !!projectId });

  const [outcomeDialog, setOutcomeDialog] = useState<{ open: boolean; editId?: number; form: any }>({ open: false, form: {} });
  const [selectedVendorId, setSelectedVendorId] = useState<string>("");

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "outcomes"] });
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "scenarios"] });
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "scenario-scores"] });
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "outcome-scorecard"] });
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "unified-evaluation"] });
  };

  const generateOutcomes = useMutation({
    mutationFn: () => apiRequest("POST", `/api/projects/${projectId}/outcomes/generate`).then(r => r.json()),
    onSuccess: (data: any) => { invalidateAll(); toast({ title: `${data.count} outcomes generated` }); },
    onError: (e: any) => toast({ title: "Generation failed", description: e.message, variant: "destructive" }),
  });

  const saveOutcome = useMutation({
    mutationFn: (data: any) => {
      if (outcomeDialog.editId) return apiRequest("PATCH", `/api/outcomes/${outcomeDialog.editId}`, data).then(r => r.json());
      return apiRequest("POST", `/api/projects/${projectId}/outcomes`, data).then(r => r.json());
    },
    onSuccess: () => { invalidateAll(); setOutcomeDialog({ open: false, form: {} }); toast({ title: "Outcome saved" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteOutcome = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/outcomes/${id}`),
    onSuccess: () => { invalidateAll(); toast({ title: "Deleted" }); },
  });

  const generateScenarios = useMutation({
    mutationFn: (outcomeId: number) => apiRequest("POST", `/api/outcomes/${outcomeId}/scenarios/generate`).then(r => r.json()),
    onSuccess: (data: any) => { invalidateAll(); toast({ title: `${data.count} scenarios generated` }); },
    onError: (e: any) => toast({ title: "Generation failed", description: e.message, variant: "destructive" }),
  });

  const saveScore = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/scenario-scores", { projectId, ...data }).then(r => r.json()),
    onSuccess: () => invalidateAll(),
  });

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
            <Target className="w-5 h-5 text-accent" />Outcomes & Scenarios
          </h1>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 sm:p-6">
          <Tabs defaultValue="outcomes" data-testid="outcomes-tabs">
            <TabsList className="mb-4">
              <TabsTrigger value="outcomes">Outcomes</TabsTrigger>
              <TabsTrigger value="scripts">Demo Scripts</TabsTrigger>
              <TabsTrigger value="scoring">Scoring</TabsTrigger>
              <TabsTrigger value="scorecard">Scorecard</TabsTrigger>
            </TabsList>

            {/* TAB 1: OUTCOMES */}
            <TabsContent value="outcomes">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-muted-foreground">{outcomes.length} outcome{outcomes.length !== 1 ? "s" : ""} defined</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setOutcomeDialog({ open: true, form: { category: "general", priority: "high" } })} data-testid="btn-add-outcome">
                    <Plus className="w-3.5 h-3.5" />Add Outcome
                  </Button>
                  <Button size="sm" className="gap-1.5 text-xs" onClick={() => generateOutcomes.mutate()} disabled={generateOutcomes.isPending} data-testid="btn-generate-outcomes">
                    {generateOutcomes.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    {generateOutcomes.isPending ? "Generating..." : "Generate from Discovery"}
                  </Button>
                </div>
              </div>

              {isLoading ? <Skeleton className="h-40 w-full" /> : outcomes.length === 0 ? (
                <Card className="p-8 text-center">
                  <Sparkles className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-sm font-medium">No outcomes defined yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Generate from discovery pain points or create manually.</p>
                </Card>
              ) : (
                <div className="space-y-3">
                  {outcomes.map((o: any) => {
                    const scenarioCount = allScenarios.filter((s: any) => s.outcomeId === o.id).length;
                    return (
                      <Card key={o.id} data-testid={`outcome-${o.id}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <h3 className="text-sm font-semibold">{o.title}</h3>
                                <Badge className={`text-[9px] ${CAT_COLORS[o.category] || CAT_COLORS.general}`}>{o.category.replace(/_/g, " ")}</Badge>
                                <Badge className={`text-[9px] ${PRI_COLORS[o.priority] || ""}`}>{o.priority}</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">{o.description}</p>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setOutcomeDialog({ open: true, editId: o.id, form: { title: o.title, description: o.description, category: o.category, priority: o.priority, currentState: o.currentState || "", targetState: o.targetState || "", currentKpi: o.currentKpi || "", targetKpi: o.targetKpi || "", kpiUnit: o.kpiUnit || "" } })}><Edit2 className="w-3 h-3" /></Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteOutcome.mutate(o.id)}><Trash2 className="w-3 h-3" /></Button>
                            </div>
                          </div>

                          {(o.currentState || o.targetState) && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                              {o.currentState && <div className="p-2 rounded bg-red-50 dark:bg-red-950/20 text-xs"><span className="font-medium text-red-600 dark:text-red-400">Current: </span>{o.currentState}</div>}
                              {o.targetState && <div className="p-2 rounded bg-emerald-50 dark:bg-emerald-950/20 text-xs"><span className="font-medium text-emerald-600 dark:text-emerald-400">Target: </span>{o.targetState}</div>}
                            </div>
                          )}

                          {o.currentKpi && o.targetKpi && (
                            <div className="flex items-center gap-2 mt-2 text-xs">
                              <span className="font-mono font-bold text-red-600">{o.currentKpi}</span>
                              <ArrowRight className="w-3 h-3 text-muted-foreground" />
                              <span className="font-mono font-bold text-emerald-600">{o.targetKpi}</span>
                              <span className="text-muted-foreground">{o.kpiUnit}</span>
                            </div>
                          )}

                          <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground flex-wrap">
                            <span>{scenarioCount} scenario{scenarioCount !== 1 ? "s" : ""}</span>
                            {(() => {
                              const linkedIds = parseJson(o.linkedRequirementIds);
                              const linked = requirements.filter((r: any) => linkedIds.includes(r.id));
                              return linked.length > 0 ? (
                                <span className="flex items-center gap-1 flex-wrap">
                                  <span className="text-muted-foreground/60">|</span>
                                  {linked.slice(0, 6).map((r: any) => (
                                    <Badge key={r.id} variant="outline" className="text-[8px] px-1 py-0 font-mono">{r.reqNumber}</Badge>
                                  ))}
                                  {linked.length > 6 && <span>+{linked.length - 6} more</span>}
                                </span>
                              ) : null;
                            })()}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* TAB 2: DEMO SCRIPTS */}
            <TabsContent value="scripts">
              {outcomes.length === 0 ? (
                <Card className="p-8 text-center">
                  <p className="text-sm text-muted-foreground">Create outcomes first to generate demo scripts.</p>
                </Card>
              ) : (
                <div className="space-y-4">
                  {outcomes.map((o: any) => {
                    const scenarios = allScenarios.filter((s: any) => s.outcomeId === o.id);
                    return (
                      <Collapsible key={o.id} defaultOpen>
                        <CollapsibleTrigger className="flex items-center gap-2 w-full text-left p-2 rounded hover:bg-muted/30">
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm font-semibold flex-1">{o.title}</span>
                          <Badge className={`text-[9px] ${PRI_COLORS[o.priority] || ""}`}>{o.priority}</Badge>
                          <Button size="sm" className="h-7 text-[10px] gap-1" onClick={(e) => { e.stopPropagation(); generateScenarios.mutate(o.id); }} disabled={generateScenarios.isPending} data-testid={`btn-gen-scenarios-${o.id}`}>
                            {generateScenarios.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                            Generate
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          {scenarios.length === 0 ? (
                            <p className="text-xs text-muted-foreground pl-8 py-2">No scenarios yet. Click Generate above.</p>
                          ) : (
                            <div className="space-y-3 pl-4 mt-2">
                              {scenarios.map((s: any) => {
                                const walkthrough = parseJson(s.walkthrough);
                                const criteria = parseJson(s.successCriteria);
                                return (
                                  <Card key={s.id} data-testid={`scenario-${s.id}`}>
                                    <CardContent className="p-4 space-y-3">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <h4 className="text-sm font-semibold flex-1">{s.title}</h4>
                                        <Badge variant="outline" className="text-[9px] gap-1"><Clock className="w-3 h-3" />{s.estimatedMinutes} min</Badge>
                                      </div>

                                      {s.narrative && (
                                        <div className="p-3 rounded-lg bg-muted/40 border-l-2 border-primary text-xs italic text-muted-foreground leading-relaxed">
                                          {s.narrative}
                                        </div>
                                      )}

                                      {s.setupInstructions && (
                                        <Collapsible>
                                          <CollapsibleTrigger className="text-[11px] font-medium text-muted-foreground flex items-center gap-1 hover:text-foreground">
                                            <ChevronRight className="w-3 h-3" />Setup Instructions
                                          </CollapsibleTrigger>
                                          <CollapsibleContent className="text-xs text-muted-foreground mt-1 pl-4">{s.setupInstructions}</CollapsibleContent>
                                        </Collapsible>
                                      )}

                                      {walkthrough.length > 0 && (
                                        <div>
                                          <p className="text-[11px] font-medium mb-1.5">Walkthrough</p>
                                          <div className="space-y-1.5">
                                            {walkthrough.map((step: any, i: number) => (
                                              <div key={i} className="flex gap-2 text-xs">
                                                <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5">{step.step || i + 1}</span>
                                                <div>
                                                  <p>{step.instruction}</p>
                                                  {step.whatToEvaluate && <p className="text-muted-foreground italic text-[11px]">Evaluate: {step.whatToEvaluate}</p>}
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      {criteria.length > 0 && (
                                        <div>
                                          <p className="text-[11px] font-medium mb-1.5">Success Criteria</p>
                                          <div className="space-y-1">
                                            {criteria.map((c: any, i: number) => (
                                              <div key={i} className="flex items-start gap-2 text-xs">
                                                <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                                                <div>
                                                  <span>{c.criterion}</span>
                                                  {c.target && <span className="text-muted-foreground"> — {c.target}</span>}
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </CardContent>
                                  </Card>
                                );
                              })}
                            </div>
                          )}
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* TAB 3: SCORING */}
            <TabsContent value="scoring">
              {scorecard?.vendorTotals?.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex gap-2 items-center">
                    <Select value={selectedVendorId} onValueChange={setSelectedVendorId}>
                      <SelectTrigger className="w-48 h-8 text-xs"><SelectValue placeholder="Select vendor..." /></SelectTrigger>
                      <SelectContent>
                        {scorecard.vendorTotals.map((v: any) => (
                          <SelectItem key={v.vendorId} value={String(v.vendorId)} className="text-xs">{v.vendorName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {!selectedVendorId ? (
                    <Card className="p-8 text-center"><p className="text-sm text-muted-foreground">Select a vendor to start scoring.</p></Card>
                  ) : (
                    <div className="space-y-3">
                      {allScenarios.map((s: any) => {
                        const outcome = outcomes.find((o: any) => o.id === s.outcomeId);
                        const existing = allScores.find((sc: any) => sc.scenarioId === s.id && sc.vendorId === parseInt(selectedVendorId));
                        const dims = ["processFit", "automationLevel", "configComplexity", "userExperience", "dataVisibility"];
                        const dimLabels: Record<string, string> = {
                          processFit: "Process Fit", automationLevel: "Automation", configComplexity: "Config (5=OOB)",
                          userExperience: "User Experience", dataVisibility: "Data Visibility",
                        };

                        return (
                          <Card key={s.id} data-testid={`score-card-${s.id}`}>
                            <CardContent className="p-4 space-y-3">
                              <div>
                                <p className="text-[10px] text-muted-foreground">{outcome?.title}</p>
                                <h4 className="text-sm font-semibold">{s.title}</h4>
                              </div>
                              <div className="grid grid-cols-5 gap-2">
                                {dims.map(dim => (
                                  <div key={dim}>
                                    <p className="text-[10px] text-muted-foreground mb-1">{dimLabels[dim]}</p>
                                    <div className="flex gap-0.5">
                                      {[1, 2, 3, 4, 5].map(v => (
                                        <button key={v}
                                          className={`w-6 h-6 rounded text-[10px] font-bold transition-colors ${(existing?.[dim] || 0) >= v ? SCORE_COLORS[v] + " text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                                          onClick={() => saveScore.mutate({ scenarioId: s.id, vendorId: parseInt(selectedVendorId), [dim]: v })}
                                          data-testid={`score-${s.id}-${dim}-${v}`}
                                        >{v}</button>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                              {existing?.overallScore && (
                                <p className="text-xs text-muted-foreground">Overall: <span className="font-bold">{existing.overallScore}/5</span></p>
                              )}
                              <VendorKbHint scenarioId={s.id} vendorId={parseInt(selectedVendorId)} />
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <Card className="p-8 text-center"><p className="text-sm text-muted-foreground">Generate outcomes and scenarios first, then select vendors in Vendor Evaluation to score them.</p></Card>
              )}
            </TabsContent>

            {/* TAB 4: SCORECARD */}
            <TabsContent value="scorecard">
              {scorecard?.outcomes?.length > 0 && scorecard?.vendorTotals?.length > 0 ? (
                <div className="space-y-6">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2 font-medium">Outcome</th>
                          <th className="text-left p-2 font-medium w-16">Priority</th>
                          {scorecard.vendorTotals.map((v: any) => (
                            <th key={v.vendorId} className="text-center p-2 font-medium">{v.vendorName}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {scorecard.outcomes.map((o: any) => (
                          <tr key={o.id} className="border-b">
                            <td className="p-2 font-medium">{o.title}</td>
                            <td className="p-2"><Badge className={`text-[9px] ${PRI_COLORS[o.priority] || ""}`}>{o.priority}</Badge></td>
                            {o.vendors.map((v: any) => (
                              <td key={v.vendorId} className="text-center p-2">
                                {v.avgOverall ? (
                                  <span className={`inline-flex w-8 h-8 items-center justify-center rounded-full text-white text-xs font-bold ${SCORE_COLORS[Math.round(v.avgOverall)] || "bg-gray-400"}`}>
                                    {v.avgOverall.toFixed(1)}
                                  </span>
                                ) : <span className="text-muted-foreground">—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {/* Weighted total row */}
                        <tr className="border-t-2 font-bold">
                          <td className="p-2">Weighted Total</td>
                          <td className="p-2"></td>
                          {scorecard.vendorTotals.map((v: any) => (
                            <td key={v.vendorId} className="text-center p-2">
                              {v.weightedAvg ? (
                                <span className={`inline-flex w-10 h-10 items-center justify-center rounded-full text-white text-sm font-bold ${SCORE_COLORS[Math.round(v.weightedAvg)] || "bg-gray-400"}`}>
                                  {v.weightedAvg.toFixed(1)}
                                </span>
                              ) : "—"}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="text-[10px] text-muted-foreground mb-6">
                    Priority weighting: Critical (4x) | High (3x) | Medium (2x) | Low (1x)
                  </div>

                  {/* Unified Evaluation */}
                  {unifiedEval?.vendors?.length > 0 && (
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold flex items-center gap-2"><BarChart3 className="w-4 h-4" />Unified Vendor Evaluation</h3>
                      <p className="text-xs text-muted-foreground">Combined score: {unifiedEval.weights.requirements}% requirements matrix + {unifiedEval.weights.outcomes}% outcome evaluation</p>
                      <div className="space-y-2">
                        {unifiedEval.vendors.map((v: any) => (
                          <div key={v.vendorId} className="flex items-center gap-3 p-3 rounded-lg border">
                            <div className="flex-1">
                              <p className="text-sm font-medium">{v.vendorName}</p>
                              <div className="flex items-center gap-4 mt-1 text-[11px] text-muted-foreground">
                                <span>Requirements: {v.requirementScore}%</span>
                                {v.outcomeScore !== null && <span>Outcomes: {v.outcomeScore}%</span>}
                              </div>
                            </div>
                            <div className="text-right">
                              <span className={`text-2xl font-bold ${v.combinedScore >= 80 ? "text-emerald-600" : v.combinedScore >= 60 ? "text-amber-600" : "text-red-600"}`}>
                                {v.combinedScore}%
                              </span>
                              <p className="text-[10px] text-muted-foreground">combined</p>
                            </div>
                            <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                              <div className={`h-full rounded-full ${v.combinedScore >= 80 ? "bg-emerald-500" : v.combinedScore >= 60 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${v.combinedScore}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <Card className="p-8 text-center">
                  <BarChart3 className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground">Score vendors on scenarios to see the scorecard.</p>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>

      {/* Outcome Dialog */}
      <Dialog open={outcomeDialog.open} onOpenChange={o => !o && setOutcomeDialog({ open: false, form: {} })}>
        <DialogContent>
          <DialogHeader><DialogTitle className="text-sm">{outcomeDialog.editId ? "Edit" : "Add"} Outcome</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Title</label>
              <Input className="h-8 text-xs" value={outcomeDialog.form.title || ""} onChange={e => setOutcomeDialog(p => ({ ...p, form: { ...p.form, title: e.target.value } }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Description</label>
              <Textarea className="text-xs" rows={2} value={outcomeDialog.form.description || ""} onChange={e => setOutcomeDialog(p => ({ ...p, form: { ...p.form, description: e.target.value } }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Category</label>
                <Select value={outcomeDialog.form.category || "general"} onValueChange={v => setOutcomeDialog(p => ({ ...p, form: { ...p.form, category: v } }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c} className="text-xs capitalize">{c.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Priority</label>
                <Select value={outcomeDialog.form.priority || "high"} onValueChange={v => setOutcomeDialog(p => ({ ...p, form: { ...p.form, priority: v } }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{PRIORITIES.map(p => <SelectItem key={p} value={p} className="text-xs capitalize">{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Current State</label>
              <Textarea className="text-xs" rows={2} value={outcomeDialog.form.currentState || ""} onChange={e => setOutcomeDialog(p => ({ ...p, form: { ...p.form, currentState: e.target.value } }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Target State</label>
              <Textarea className="text-xs" rows={2} value={outcomeDialog.form.targetState || ""} onChange={e => setOutcomeDialog(p => ({ ...p, form: { ...p.form, targetState: e.target.value } }))} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Current KPI</label>
                <Input className="h-8 text-xs" value={outcomeDialog.form.currentKpi || ""} onChange={e => setOutcomeDialog(p => ({ ...p, form: { ...p.form, currentKpi: e.target.value } }))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Target KPI</label>
                <Input className="h-8 text-xs" value={outcomeDialog.form.targetKpi || ""} onChange={e => setOutcomeDialog(p => ({ ...p, form: { ...p.form, targetKpi: e.target.value } }))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">KPI Unit</label>
                <Input className="h-8 text-xs" placeholder="days, %, hours" value={outcomeDialog.form.kpiUnit || ""} onChange={e => setOutcomeDialog(p => ({ ...p, form: { ...p.form, kpiUnit: e.target.value } }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" className="text-xs" disabled={saveOutcome.isPending || !outcomeDialog.form.title}
              onClick={() => saveOutcome.mutate(outcomeDialog.form)}>
              {saveOutcome.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VendorKbHint({ scenarioId, vendorId }: { scenarioId: number; vendorId: number }) {
  const [open, setOpen] = useState(false);
  const { data: context } = useQuery<any>({
    queryKey: ["/api/scenarios", scenarioId, "vendor-context", vendorId],
    queryFn: () => apiRequest("GET", `/api/scenarios/${scenarioId}/vendor-context/${vendorId}`).then(r => r.json()),
    enabled: open && !!vendorId,
    staleTime: 60000,
  });

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="text-[10px] text-accent flex items-center gap-1 hover:underline mt-1">
        <ChevronRight className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`} />
        Vendor Knowledge Base
      </CollapsibleTrigger>
      <CollapsibleContent>
        {context?.hasData ? (
          <div className="mt-1.5 p-2 rounded bg-muted/30 text-[10px] text-muted-foreground space-y-1 max-h-32 overflow-y-auto">
            {context.capabilities?.map((c: string, i: number) => <p key={i}>{c}</p>)}
            {context.processDetails?.slice(0, 5).map((d: string, i: number) => <p key={`d${i}`} className="font-mono">{d}</p>)}
          </div>
        ) : (
          <p className="mt-1 text-[10px] text-muted-foreground italic">No KB data for this vendor/area.</p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
