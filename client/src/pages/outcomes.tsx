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

  const { data: requirements = [] } = useQuery<any[]>({ queryKey: ["/api/projects", projectId, "requirements"], queryFn: () => apiRequest("GET", `/api/projects/${projectId}/requirements`).then(r => r.json()), enabled: !!projectId });

  const [outcomeDialog, setOutcomeDialog] = useState<{ open: boolean; editId?: number; form: any }>({ open: false, form: {} });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "outcomes"] });
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "scenarios"] });
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "scenario-scores"] });
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

  const [generatingId, setGeneratingId] = useState<number | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);

  const generateScenarios = useMutation({
    mutationFn: (outcomeId: number) => {
      setGeneratingId(outcomeId);
      return apiRequest("POST", `/api/outcomes/${outcomeId}/scenarios/generate`).then(r => r.json());
    },
    onSuccess: (data: any) => { setGeneratingId(null); invalidateAll(); toast({ title: `${data.count} scenarios generated` }); },
    onError: (e: any) => { setGeneratingId(null); toast({ title: "Generation failed", description: e.message, variant: "destructive" }); },
  });

  const generateAllScenarios = async () => {
    setGeneratingAll(true);
    let total = 0;
    for (const o of outcomes) {
      try {
        setGeneratingId(o.id);
        const res = await apiRequest("POST", `/api/outcomes/${o.id}/scenarios/generate`);
        const data = await res.json();
        total += data.count || 0;
      } catch {}
    }
    setGeneratingId(null);
    setGeneratingAll(false);
    invalidateAll();
    toast({ title: `${total} scenarios generated across ${outcomes.length} outcomes` });
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
                  <p className="text-base font-medium">No outcomes defined yet</p>
                  <p className="text-sm text-muted-foreground mt-1">Generate from discovery pain points or create manually.</p>
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
                                <h3 className="text-base font-semibold">{o.title}</h3>
                                <Badge className={`text-xs ${CAT_COLORS[o.category] || CAT_COLORS.general}`}>{o.category.replace(/_/g, " ")}</Badge>
                                <Badge className={`text-xs ${PRI_COLORS[o.priority] || ""}`}>{o.priority}</Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">{o.description}</p>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setOutcomeDialog({ open: true, editId: o.id, form: { title: o.title, description: o.description, category: o.category, priority: o.priority, currentState: o.currentState || "", targetState: o.targetState || "", currentKpi: o.currentKpi || "", targetKpi: o.targetKpi || "", kpiUnit: o.kpiUnit || "" } })}><Edit2 className="w-3 h-3" /></Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteOutcome.mutate(o.id)}><Trash2 className="w-3 h-3" /></Button>
                            </div>
                          </div>

                          {(o.currentState || o.targetState) && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                              {o.currentState && <div className="px-2 py-1 rounded bg-red-50 dark:bg-red-950/20 text-sm"><span className="font-medium text-red-600 dark:text-red-400">Current: </span>{o.currentState}</div>}
                              {o.targetState && <div className="px-2 py-1 rounded bg-emerald-50 dark:bg-emerald-950/20 text-sm"><span className="font-medium text-emerald-600 dark:text-emerald-400">Target: </span>{o.targetState}</div>}
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

                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                            <span>{scenarioCount} scenario{scenarioCount !== 1 ? "s" : ""}</span>
                            {(() => {
                              const linkedIds = parseJson(o.linkedRequirementIds);
                              const linked = requirements.filter((r: any) => linkedIds.includes(r.id));
                              return linked.length > 0 ? (
                                <span className="flex items-center gap-1 flex-wrap">
                                  <span className="text-muted-foreground/60">|</span>
                                  {linked.slice(0, 6).map((r: any) => (
                                    <Badge key={r.id} variant="outline" className="text-[10px] px-1 py-0 font-mono">{r.reqNumber}</Badge>
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
                  <p className="text-base text-muted-foreground">Create outcomes first to generate demo scripts.</p>
                </Card>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <Button size="sm" className="gap-1.5 text-xs" onClick={generateAllScenarios} disabled={generatingAll || generatingId !== null}>
                      {generatingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      {generatingAll ? "Generating All..." : "Generate All Scripts"}
                    </Button>
                  </div>
                  {outcomes.map((o: any) => {
                    const scenarios = allScenarios.filter((s: any) => s.outcomeId === o.id);
                    const isGenerating = generatingId === o.id;
                    return (
                      <Collapsible key={o.id} defaultOpen>
                        <CollapsibleTrigger className="flex items-center gap-2 w-full text-left p-2 rounded hover:bg-muted/30">
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          <span className="text-base font-semibold flex-1">{o.title}</span>
                          <Badge className={`text-xs ${PRI_COLORS[o.priority] || ""}`}>{o.priority}</Badge>
                          <Button size="sm" className="h-7 text-xs gap-1" onClick={(e) => { e.stopPropagation(); generateScenarios.mutate(o.id); }} disabled={generatingId !== null || generatingAll} data-testid={`btn-gen-scenarios-${o.id}`}>
                            {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                            {isGenerating ? "Generating..." : "Generate"}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          {scenarios.length === 0 ? (
                            <p className="text-sm text-muted-foreground pl-8 py-2">No scenarios yet. Click Generate above.</p>
                          ) : (
                            <div className="space-y-3 pl-4 mt-2">
                              {scenarios.map((s: any) => {
                                const walkthrough = parseJson(s.walkthrough);
                                const criteria = parseJson(s.successCriteria);
                                return (
                                  <Card key={s.id} data-testid={`scenario-${s.id}`}>
                                    <CardContent className="p-4 space-y-3">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <h4 className="text-base font-semibold flex-1">{s.title}</h4>
                                        <Badge variant="outline" className="text-xs gap-1"><Clock className="w-3 h-3" />{s.estimatedMinutes} min</Badge>
                                      </div>

                                      {s.narrative && (
                                        <div className="p-3 rounded-lg bg-muted/40 border-l-2 border-primary text-sm italic text-muted-foreground leading-relaxed">
                                          {s.narrative}
                                        </div>
                                      )}

                                      {s.setupInstructions && (
                                        <Collapsible>
                                          <CollapsibleTrigger className="text-sm font-medium text-muted-foreground flex items-center gap-1 hover:text-foreground">
                                            <ChevronRight className="w-3 h-3" />Setup Instructions
                                          </CollapsibleTrigger>
                                          <CollapsibleContent className="text-sm text-muted-foreground mt-1 pl-4">{s.setupInstructions}</CollapsibleContent>
                                        </Collapsible>
                                      )}

                                      {walkthrough.length > 0 && (
                                        <div>
                                          <p className="text-sm font-medium mb-1.5">Walkthrough</p>
                                          <div className="space-y-1.5">
                                            {walkthrough.map((step: any, i: number) => (
                                              <div key={i} className="flex gap-2 text-sm">
                                                <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">{step.step || i + 1}</span>
                                                <div>
                                                  <p>{step.instruction}</p>
                                                  {step.whatToEvaluate && <p className="text-muted-foreground italic text-sm">Evaluate: {step.whatToEvaluate}</p>}
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      {criteria.length > 0 && (
                                        <div>
                                          <p className="text-sm font-medium mb-1.5">Success Criteria</p>
                                          <div className="space-y-1">
                                            {criteria.map((c: any, i: number) => (
                                              <div key={i} className="flex items-start gap-2 text-sm">
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
          </Tabs>
        </div>
      </ScrollArea>

      {/* Outcome Dialog */}
      <Dialog open={outcomeDialog.open} onOpenChange={o => !o && setOutcomeDialog({ open: false, form: {} })}>
        <DialogContent>
          <DialogHeader><DialogTitle className="text-base">{outcomeDialog.editId ? "Edit" : "Add"} Outcome</DialogTitle></DialogHeader>
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

