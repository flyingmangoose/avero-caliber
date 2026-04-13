import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowRightLeft, Sparkles, Loader2, ArrowDown, TrendingDown, Minus, Plus } from "lucide-react";

const PLATFORMS = [
  { value: "workday", label: "Workday", color: "#F68D2E" },
  { value: "oracle_cloud", label: "Oracle Cloud", color: "#C74634" },
  { value: "tyler", label: "Tyler", color: "#1B365D" },
  { value: "maximo", label: "Maximo", color: "#0530AD" },
  { value: "nv5", label: "NV5", color: "#00843D" },
  { value: "oracle_eam", label: "Oracle EAM", color: "#C74634" },
];

const LOADING_MSGS = [
  "Analyzing current processes...",
  "Mapping vendor capabilities...",
  "Modeling future state workflows...",
  "Calculating improvement metrics...",
];

function parseJson<T>(val: any, fallback: T): T {
  if (!val) return fallback;
  try { return typeof val === "string" ? JSON.parse(val) : val; } catch { return fallback; }
}

function pctChange(before: number, after: number): { pct: number; label: string } {
  if (!before) return { pct: 0, label: "—" };
  const pct = Math.round(((before - after) / before) * 100);
  return { pct, label: pct > 0 ? `↓${pct}%` : pct < 0 ? `↑${Math.abs(pct)}%` : "—" };
}

export default function FutureStatePage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id!;
  const { toast } = useToast();
  const [selected, setSelected] = useState("workday");
  const [loadIdx, setLoadIdx] = useState(0);

  const { data: transformations = [] } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "future-state", selected],
    queryFn: () => apiRequest("GET", `/api/projects/${projectId}/future-state?platform=${selected}`).then(r => r.json()),
  });

  const genMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/projects/${projectId}/future-state/generate`, { vendorPlatform: selected }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "future-state", selected] });
      toast({ title: "Analysis complete" });
    },
    onError: (e: any) => toast({ title: "Generation failed", description: e.message, variant: "destructive" }),
  });

  useEffect(() => {
    if (!genMutation.isPending) return;
    const t = setInterval(() => setLoadIdx(i => (i + 1) % LOADING_MSGS.length), 2500);
    return () => clearInterval(t);
  }, [genMutation.isPending]);

  const platformObj = PLATFORMS.find(p => p.value === selected)!;

  // Aggregate KPIs
  const totals = transformations.reduce((acc, t) => ({
    curSteps: acc.curSteps + (t.currentStepCount || 0),
    futSteps: acc.futSteps + (t.futureStepCount || 0),
    curManual: acc.curManual + (t.currentManualSteps || 0),
    futManual: acc.futManual + (t.futureManualSteps || 0),
    curSystems: acc.curSystems + (t.currentSystems || 0),
    futSystems: acc.futSystems + (t.futureSystems || 0),
    painPoints: acc.painPoints + (t.currentPainPoints || 0),
  }), { curSteps: 0, futSteps: 0, curManual: 0, futManual: 0, curSystems: 0, futSystems: 0, painPoints: 0 });

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-border/50 bg-card/50 backdrop-blur-sm shrink-0">
        <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <ArrowRightLeft className="w-5 h-5 text-accent" />Current vs. Future State
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">See how vendor platforms would transform your operations</p>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {/* Platform selector + generate */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex gap-2 flex-wrap" data-testid="platform-selector">
              {PLATFORMS.map(p => (
                <Button key={p.value} variant={selected === p.value ? "default" : "outline"} size="sm"
                  className="text-xs h-8"
                  style={selected === p.value ? { backgroundColor: p.color, borderColor: p.color, color: "#fff" } : { borderColor: p.color, color: p.color }}
                  onClick={() => setSelected(p.value)} data-testid={`platform-${p.value}`}>
                  {p.label}
                </Button>
              ))}
            </div>
            <Button size="sm" className="h-8 text-xs bg-accent hover:bg-accent/90 text-accent-foreground gap-1.5"
              onClick={() => genMutation.mutate()} disabled={genMutation.isPending} data-testid="btn-generate-analysis">
              {genMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Generate Analysis
            </Button>
          </div>

          {/* Loading overlay */}
          {genMutation.isPending && (
            <div className="text-center py-16">
              <Loader2 className="w-10 h-10 mx-auto animate-spin mb-4" style={{ color: platformObj.color }} />
              <p className="text-sm font-medium animate-pulse">{LOADING_MSGS[loadIdx]}</p>
            </div>
          )}

          {/* No data */}
          {!genMutation.isPending && transformations.length === 0 && (
            <div className="text-center py-16">
              <ArrowRightLeft className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">Select a vendor platform and click "Generate Analysis" to see how it would transform your operations.</p>
            </div>
          )}

          {/* Executive Summary KPIs */}
          {!genMutation.isPending && transformations.length > 0 && (
            <>
              <div className="grid grid-cols-4 gap-3" data-testid="kpi-summary">
                <DeltaCard label="Total Steps" before={totals.curSteps} after={totals.futSteps} />
                <DeltaCard label="Manual Steps" before={totals.curManual} after={totals.futManual} />
                <DeltaCard label="Systems" before={totals.curSystems} after={totals.futSystems} />
                <Card data-testid="kpi-painpoints">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Pain Points Addressed</p>
                    <p className="text-2xl font-bold text-red-500">{totals.painPoints}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Per-area transformation cards */}
              <div className="space-y-4">
                {transformations.map((t: any) => (
                  <TransformationCard key={t.id} t={t} platform={platformObj} />
                ))}
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function DeltaCard({ label, before, after }: { label: string; before: number; after: number }) {
  const { pct, label: pctLabel } = pctChange(before, after);
  return (
    <Card data-testid={`kpi-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <CardContent className="p-4 text-center">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <div className="flex items-center justify-center gap-2">
          <span className="text-xl text-muted-foreground">{before}</span>
          <ArrowDown className="w-3.5 h-3.5 text-emerald-500" />
          <span className="text-2xl font-bold">{after}</span>
        </div>
        {pct > 0 && <Badge className="mt-1 text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">{pctLabel}</Badge>}
      </CardContent>
    </Card>
  );
}

function TransformationCard({ t, platform }: { t: any; platform: { label: string; color: string; value: string } }) {
  const curSteps = parseJson<any[]>(t.currentSteps, []);
  const futSteps = parseJson<any[]>(t.futureSteps, []);
  const improvements = parseJson<any[]>(t.improvements, []);
  const eliminated = parseJson<string[]>(t.eliminatedSteps, []);
  const newCaps = parseJson<string[]>(t.newCapabilities, []);

  return (
    <Card className="overflow-hidden" data-testid={`transform-${t.functionalArea.replace(/[^a-zA-Z]/g, "-").toLowerCase()}`}>
      <CardContent className="p-0">
        <div className="grid grid-cols-2 min-h-[200px]">
          {/* Current State */}
          <div className="p-5 bg-gray-50 dark:bg-gray-900 border-r border-border/50">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="text-base font-semibold">{t.functionalArea}</h4>
            </div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Current State</p>
            <div className="flex gap-3 mb-3 flex-wrap">
              <KpiBadge label="steps" value={t.currentStepCount} />
              <KpiBadge label="manual" value={t.currentManualSteps} />
              <KpiBadge label="systems" value={t.currentSystems} />
              {t.currentProcessingTime && <KpiBadge label="time" value={t.currentProcessingTime} />}
            </div>
            {t.currentPainPoints > 0 && (
              <Badge className="mb-3 text-xs bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400">
                {t.currentPainPoints} pain points
              </Badge>
            )}
            <p className="text-sm text-muted-foreground mb-3">{t.currentDescription}</p>
            {curSteps.length > 0 && (
              <div className="space-y-1.5">
                {curSteps.map((s: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center shrink-0 text-xs font-bold">{s.step || i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <span>{s.description || s.step}</span>
                      <div className="flex gap-1 mt-0.5">
                        {(s.manual || s.isManual) && <Badge variant="outline" className="text-[10px] h-3.5 border-red-300 text-red-500">manual</Badge>}
                        {s.system && <Badge variant="outline" className="text-[10px] h-3.5">{s.system}</Badge>}
                        {s.actor && <Badge variant="outline" className="text-[10px] h-3.5">{s.actor}</Badge>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Future State */}
          <div className="p-5 border-l-4" style={{ borderLeftColor: platform.color }}>
            <div className="flex items-center gap-2 mb-1">
              <h4 className="text-base font-semibold">{t.functionalArea}</h4>
            </div>
            <p className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: platform.color }}>
              Future State with {platform.label}
            </p>
            <div className="flex gap-3 mb-3 flex-wrap">
              <KpiBadge label="steps" value={t.futureStepCount} accent />
              <KpiBadge label="manual" value={t.futureManualSteps} accent />
              <KpiBadge label="systems" value={t.futureSystems} accent />
              {t.futureProcessingTime && <KpiBadge label="time" value={t.futureProcessingTime} accent />}
            </div>
            <p className="text-sm mb-3">{t.futureDescription}</p>
            {futSteps.length > 0 && (
              <div className="space-y-1.5">
                {futSteps.map((s: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white" style={{ backgroundColor: platform.color }}>{s.step || i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <span>{s.description}</span>
                      <div className="flex gap-1 mt-0.5">
                        {s.automated && <Badge className="text-[10px] h-3.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">automated</Badge>}
                        {s.feature && <Badge variant="outline" className="text-[10px] h-3.5" style={{ borderColor: platform.color, color: platform.color }}>{s.feature}</Badge>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Improvements section */}
        {(improvements.length > 0 || eliminated.length > 0 || newCaps.length > 0) && (
          <div className="border-t border-border/50 p-4 bg-muted/30">
            {improvements.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Key Improvements</p>
                <div className="grid grid-cols-2 gap-2">
                  {improvements.map((imp: any, i: number) => (
                    <div key={i} className="border rounded p-2 text-sm bg-background">
                      <p className="font-medium mb-0.5">{imp.area}</p>
                      <p className="text-muted-foreground">{imp.before}</p>
                      <p className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                        <span className="text-muted-foreground/50">&rarr;</span> {imp.after}
                      </p>
                      {imp.impact && <p className="text-sm text-muted-foreground mt-0.5 italic">{imp.impact}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {eliminated.map((s, i) => (
                <Badge key={`e-${i}`} variant="outline" className="text-xs border-red-300 text-red-500 dark:border-red-700 dark:text-red-400 line-through" data-testid={`eliminated-${i}`}>
                  <Minus className="w-2.5 h-2.5 mr-0.5" />{s}
                </Badge>
              ))}
              {newCaps.map((c, i) => (
                <Badge key={`n-${i}`} variant="outline" className="text-xs border-emerald-400 text-emerald-600 dark:border-emerald-600 dark:text-emerald-400" data-testid={`new-cap-${i}`}>
                  <Plus className="w-2.5 h-2.5 mr-0.5" />{c}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function KpiBadge({ label, value, accent }: { label: string; value: any; accent?: boolean }) {
  return (
    <div className={`text-center ${accent ? "" : "opacity-70"}`}>
      <p className={`text-sm font-bold ${accent ? "text-foreground" : "text-muted-foreground"}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
