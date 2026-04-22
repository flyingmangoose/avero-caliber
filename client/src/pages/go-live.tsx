import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Rocket, ChevronLeft, Check, Loader2, Sparkles, AlertTriangle, Download } from "lucide-react";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from "recharts";

const DEFAULT_CRITERIA = [
  { category: "Testing", key: "sit_completion", name: "SIT Completion", weight: 10, score: 0, notes: "", evidence: "", recommendation: "", confidence: "", isManual: false },
  { category: "Testing", key: "e2e_testing", name: "E2E Testing Exit", weight: 12, score: 0, notes: "", evidence: "", recommendation: "", confidence: "", isManual: false },
  { category: "Testing", key: "uat_completion", name: "UAT/UER Completion", weight: 12, score: 0, notes: "", evidence: "", recommendation: "", confidence: "", isManual: false },
  { category: "Testing", key: "payroll_compare", name: "Payroll Compare", weight: 8, score: 0, notes: "", evidence: "", recommendation: "", confidence: "", isManual: false },
  { category: "Defects", key: "critical_high_resolution", name: "Critical/High Defect Resolution", weight: 15, score: 0, notes: "", evidence: "", recommendation: "", confidence: "", isManual: false },
  { category: "Defects", key: "burndown_trend", name: "Defect Burn-down Trend", weight: 5, score: 0, notes: "", evidence: "", recommendation: "", confidence: "", isManual: false },
  { category: "Data", key: "migration_quality", name: "Data Migration Quality", weight: 10, score: 0, notes: "", evidence: "", recommendation: "", confidence: "", isManual: false },
  { category: "Data", key: "reconciliation", name: "Reconciliation Results", weight: 5, score: 0, notes: "", evidence: "", recommendation: "", confidence: "", isManual: false },
  { category: "Cutover", key: "plan_completeness", name: "Cutover Plan Completeness", weight: 8, score: 0, notes: "", evidence: "", recommendation: "", confidence: "", isManual: false },
  { category: "Cutover", key: "rollback_plan", name: "Rollback Plan", weight: 3, score: 0, notes: "", evidence: "", recommendation: "", confidence: "", isManual: false },
  { category: "Readiness", key: "training", name: "Training Completion", weight: 5, score: 0, notes: "", evidence: "", recommendation: "", confidence: "", isManual: false },
  { category: "Readiness", key: "support_model", name: "Support Model Activated", weight: 4, score: 0, notes: "", evidence: "", recommendation: "", confidence: "", isManual: false },
  { category: "Readiness", key: "hypercare_plan", name: "Hypercare Plan", weight: 3, score: 0, notes: "", evidence: "", recommendation: "", confidence: "", isManual: false },
];

const READINESS_COLORS: Record<string, string> = {
  ready: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  ready_with_conditions: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  not_ready: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  critical_hold: "bg-red-200 text-red-900 dark:bg-red-950/60 dark:text-red-300",
};

const READINESS_LABELS: Record<string, string> = {
  ready: "Ready", ready_with_conditions: "Ready with Conditions", not_ready: "Not Ready", critical_hold: "Critical Hold",
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "text-emerald-600", medium: "text-amber-600", low: "text-red-600",
};

export default function GoLivePage() {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id || "0");
  const { toast } = useToast();

  const [criteria, setCriteria] = useState(DEFAULT_CRITERIA);
  const [assessorNotes, setAssessorNotes] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [aiNotes, setAiNotes] = useState("");

  const { data: project } = useQuery<any>({
    queryKey: ["/api/projects", projectId],
    queryFn: () => apiRequest("GET", `/api/projects/${projectId}`).then(r => r.json()),
    enabled: !!projectId,
  });

  const { data: clientData } = useQuery<any>({
    queryKey: ["/api/clients", project?.clientId],
    queryFn: () => apiRequest("GET", `/api/clients/${project.clientId}`).then(r => r.json()),
    enabled: !!project?.clientId,
  });

  const { data: summary } = useQuery<any>({
    queryKey: ["/api/projects", projectId, "compliance-summary"],
    queryFn: () => apiRequest("GET", `/api/projects/${projectId}/compliance-summary`).then(r => r.json()),
    enabled: !!projectId,
  });

  const contractId = summary?.contracts?.[0]?.id || null;

  const { data: scorecard, isLoading } = useQuery<any>({
    queryKey: ["/api/contracts", contractId, "go-live-scorecard"],
    queryFn: () => apiRequest("GET", `/api/contracts/${contractId}/go-live-scorecard`).then(r => r.json()),
    enabled: !!contractId,
  });

  const { data: scorecardHistory } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "go-live", "history"],
    queryFn: () => apiRequest("GET", `/api/projects/${projectId}/go-live/history`).then(r => r.json()),
    enabled: !!projectId,
  });

  useEffect(() => {
    if (scorecard?.criteria && !initialized) {
      try {
        const parsed = typeof scorecard.criteria === "string" ? JSON.parse(scorecard.criteria) : scorecard.criteria;
        // Merge saved criteria with DEFAULT_CRITERIA to restore category/key/weight if missing
        const normalize = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        const merged = DEFAULT_CRITERIA.map(def => {
          const saved = parsed.find((p: any) => normalize(p.name) === normalize(def.name) || normalize(p.key) === normalize(def.key));
          if (!saved) return def;
          return {
            ...def,
            score: typeof saved.score === "number" ? saved.score : def.score,
            evidence: saved.evidence ?? def.evidence,
            recommendation: saved.recommendation ?? def.recommendation,
            confidence: saved.confidence ?? def.confidence,
            notes: saved.notes ?? def.notes,
            isManual: saved.isManual ?? def.isManual,
          };
        });
        setCriteria(merged);
        setAssessorNotes(scorecard.assessorNotes || "");
        setAiNotes(scorecard.assessorNotes || "");
        setInitialized(true);
      } catch {}
    }
  }, [scorecard, initialized]);

  const saveMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/contracts/${contractId}/go-live-scorecard`, data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "go-live-scorecard"] });
      toast({ title: "Scorecard saved" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const autoAssess = useMutation({
    mutationFn: () => apiRequest("POST", `/api/projects/${projectId}/go-live/auto-assess`).then(r => r.json()),
    onSuccess: (data: any) => {
      if (!data.criteria || data.criteria.length === 0) {
        toast({ title: "No criteria returned", description: data.overallNotes || "AI response was empty. Try again.", variant: "destructive" });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "compliance-summary"] });
        return;
      }
      const normalize = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      setCriteria(prev => prev.map((c, i) => {
        const byName = data.criteria?.find((ac: any) => normalize(ac.name) === normalize(c.name));
        const byKey = data.criteria?.find((ac: any) => ac.key && normalize(ac.key) === normalize(c.key));
        const aiCriterion = byName || byKey || data.criteria?.[i];
        if (!aiCriterion) return c;
        if (c.isManual) return { ...c, evidence: aiCriterion.evidence || c.evidence, recommendation: aiCriterion.recommendation || c.recommendation, confidence: aiCriterion.confidence || "" };
        return {
          ...c,
          score: typeof aiCriterion.score === "number" ? aiCriterion.score : c.score,
          evidence: aiCriterion.evidence || "",
          recommendation: aiCriterion.recommendation || "",
          confidence: aiCriterion.confidence || "",
          isManual: false,
        };
      }));
      setAiNotes(data.overallNotes || "");
      setInitialized(true);
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "compliance-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "go-live", "history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "go-live-scorecard"] });
      toast({ title: `Auto-assessed: ${data.overallReadiness?.replace(/_/g, " ")} (${data.overallScore}/100)` });
    },
    onError: (e: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "go-live", "history"] });
      toast({ title: "Assessment may still be processing", description: "Results will appear shortly. Refresh if needed." });
    },
  });

  // Calculate scores
  const totalWeight = criteria.reduce((s, c) => s + c.weight, 0);
  const weightedSum = criteria.reduce((s, c) => s + c.weight * c.score, 0);
  const overallScore = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 10 * 10) / 10 : 0;
  const readiness = overallScore >= 85 ? "ready" : overallScore >= 70 ? "ready_with_conditions" : overallScore >= 50 ? "not_ready" : "critical_hold";
  const scoreColor = overallScore >= 85 ? "text-emerald-500" : overallScore >= 70 ? "text-amber-500" : overallScore >= 50 ? "text-red-500" : "text-red-900";

  // Radar data
  const categories = ["Testing", "Defects", "Data", "Cutover", "Readiness"];
  const radarData = categories.map(cat => {
    const items = criteria.filter(c => c.category === cat);
    const catWeight = items.reduce((s, i) => s + i.weight, 0);
    const catSum = items.reduce((s, i) => s + i.weight * i.score, 0);
    return { category: cat, score: catWeight > 0 ? Math.round((catSum / catWeight) * 10) / 10 : 0, target: 8.5, fullMark: 10 };
  });

  function updateCriterion(key: string, field: string, value: any) {
    setCriteria(prev => prev.map(c => c.key === key ? { ...c, [field]: value, isManual: field === "score" ? true : c.isManual } : c));
  }

  function handleSave() {
    saveMutation.mutate({ criteria, assessorNotes, assessedAt: new Date().toISOString() });
  }

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

  return (
    <div className="workspace-page h-full">
      <div className="workspace-stack">
        <div className="workspace-hero shrink-0">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-white/90">
                <Link href={`/projects/${projectId}`}>
                  <Button variant="ghost" size="sm" className="h-8 gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 text-white hover:bg-white/15 hover:text-white -ml-1">
                    <ChevronLeft className="w-4 h-4" />{project?.name || "Project"}
                  </Button>
                </Link>
                {clientData?.logoPath && <img src={clientData.logoPath} alt="" className="h-7 w-7 rounded-lg bg-white/85 p-1 object-contain" />}
                <span className="workspace-hero-kicker">Go-Live Readiness</span>
              </div>
              <div className="space-y-1">
                <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
                  <Rocket className="h-6 w-6 text-white" />Go-live readiness board
                </h1>
                <p className="max-w-2xl text-sm text-white/78">
                  Convert testing, defects, data readiness, and cutover confidence into a single decision view for go/no-go discussions.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="workspace-stat-chip"><strong>{initialized ? overallScore : "—"}</strong> current score</span>
              <span className="workspace-stat-chip"><strong>{initialized ? READINESS_LABELS[readiness] : "Draft"}</strong> posture</span>
              <span className="workspace-stat-chip"><strong>{scorecardHistory?.length || 0}</strong> prior snapshots</span>
            </div>
          </div>
        </div>

        <ScrollArea className="app-scrollbar flex-1">
        <div className="space-y-5">
          {/* Action buttons */}
          <div className="workspace-toolbar flex items-center gap-2 flex-wrap">
            <Button size="sm" className="gap-1.5 text-xs" onClick={() => autoAssess.mutate()} disabled={autoAssess.isPending} data-testid="btn-auto-assess">
              {autoAssess.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {autoAssess.isPending ? "Assessing..." : "Auto-Assess from Project Data"}
            </Button>
            {initialized && (
              <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => window.open(`/api/projects/${projectId}/go-live/report-pdf`, "_blank")} data-testid="btn-export-pdf">
                <Download className="w-3 h-3" />PDF
              </Button>
            )}
            {initialized && (
              <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={handleSave} disabled={saveMutation.isPending} data-testid="btn-save-scorecard">
                {saveMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}Save
              </Button>
            )}
          </div>

          {/* AI Summary */}
          {aiNotes && (
            <div className="workspace-subsection border-accent/20 bg-accent/5 text-sm text-muted-foreground">
              <span className="font-medium text-accent">AI Assessment: </span>{aiNotes}
            </div>
          )}

          {/* Score Overview */}
          {initialized && (
            <>
              <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                <div className="workspace-subsection">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Decision Signal</p>
                      <h3 className="mt-1 text-lg font-semibold">Overall readiness posture</h3>
                    </div>
                    <Badge className={`text-sm px-3 py-1 ${READINESS_COLORS[readiness] || ""}`} data-testid="readiness-badge">
                      {READINESS_LABELS[readiness]}
                    </Badge>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-[24px] border border-white/35 bg-background/70 p-4 text-center">
                      <span className={`text-4xl font-bold ${scoreColor}`}>{overallScore}</span>
                      <span className="text-lg text-muted-foreground">/100</span>
                      <p className="mt-1 text-xs text-muted-foreground">Overall Score</p>
                    </div>
                    <div className="rounded-[24px] border border-white/35 bg-background/70 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Lowest Category</p>
                      {(() => {
                        const lowest = [...radarData].sort((a, b) => a.score - b.score)[0];
                        return (
                          <>
                            <p className="mt-2 text-base font-semibold">{lowest?.category || "—"}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{lowest ? `${lowest.score}/10 current confidence` : "No data"}</p>
                          </>
                        );
                      })()}
                    </div>
                    <div className="rounded-[24px] border border-white/35 bg-background/70 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Assessments Logged</p>
                      <p className="mt-2 text-base font-semibold">{scorecardHistory?.length || 1}</p>
                      <p className="mt-1 text-sm text-muted-foreground">Historical checkpoints</p>
                    </div>
                  </div>
                </div>
                <div className="workspace-subsection relative overflow-hidden">
                  <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-amber-300/25 blur-3xl" />
                  <div className="pointer-events-none absolute -bottom-12 -left-10 h-40 w-40 rounded-full bg-blue-400/15 blur-3xl" />
                  <div className="relative">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Category Confidence</p>
                        <h3 className="mt-1 text-lg font-semibold">Readiness across the five signals</h3>
                      </div>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/35 bg-background/70 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Target 8.5+
                      </span>
                    </div>
                    <ResponsiveContainer width="100%" height={320}>
                      <RadarChart data={radarData} margin={{ top: 16, right: 28, bottom: 8, left: 28 }} outerRadius="78%">
                        <defs>
                          <radialGradient id="radar-fill" cx="50%" cy="50%" r="65%" fx="50%" fy="50%">
                            <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.08} />
                            <stop offset="60%" stopColor="hsl(var(--accent))" stopOpacity={0.32} />
                            <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0.55} />
                          </radialGradient>
                          <radialGradient id="radar-target" cx="50%" cy="50%" r="65%" fx="50%" fy="50%">
                            <stop offset="0%" stopColor="#10b981" stopOpacity={0} />
                            <stop offset="100%" stopColor="#10b981" stopOpacity={0.1} />
                          </radialGradient>
                        </defs>
                        <PolarGrid stroke="hsl(var(--border))" strokeDasharray="3 4" strokeOpacity={0.6} />
                        <PolarAngleAxis
                          dataKey="category"
                          tick={{ fontSize: 11, fontWeight: 600, fill: "hsl(var(--foreground))" }}
                          tickLine={false}
                        />
                        <PolarRadiusAxis
                          angle={90}
                          domain={[0, 10]}
                          tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                          tickCount={6}
                          axisLine={false}
                          stroke="hsl(var(--border))"
                        />
                        {/* Target threshold overlay at 8.5 */}
                        <Radar
                          name="Target"
                          dataKey="target"
                          stroke="#10b981"
                          strokeWidth={1.25}
                          strokeDasharray="4 4"
                          fill="url(#radar-target)"
                          isAnimationActive={false}
                          dot={false}
                        />
                        <Radar
                          name="Score"
                          dataKey="score"
                          stroke="hsl(var(--accent))"
                          strokeWidth={2.25}
                          fill="url(#radar-fill)"
                          dot={{ r: 4, fill: "hsl(var(--accent))", stroke: "#fff", strokeWidth: 1.5 }}
                          activeDot={{ r: 6, fill: "hsl(var(--accent))", stroke: "#fff", strokeWidth: 2 }}
                          animationDuration={650}
                        />
                        <Tooltip
                          cursor={{ stroke: "hsl(var(--accent))", strokeWidth: 1, strokeDasharray: "3 3" }}
                          contentStyle={{
                            borderRadius: 12,
                            border: "1px solid hsl(var(--border))",
                            background: "hsl(var(--background) / 0.95)",
                            boxShadow: "0 10px 30px -10px rgba(15,23,42,0.25)",
                            fontSize: 12,
                          }}
                          formatter={(value: any, name: any) => [`${value}/10`, name]}
                        />
                      </RadarChart>
                    </ResponsiveContainer>
                    <div className="mt-2 grid grid-cols-5 gap-2">
                      {radarData.map(d => {
                        const tone = d.score <= 3
                          ? { dot: "bg-red-500", text: "text-red-600", ring: "ring-red-500/20" }
                          : d.score <= 6
                          ? { dot: "bg-amber-500", text: "text-amber-600", ring: "ring-amber-500/20" }
                          : { dot: "bg-emerald-500", text: "text-emerald-600", ring: "ring-emerald-500/20" };
                        return (
                          <div
                            key={d.category}
                            className={`rounded-2xl border border-white/40 bg-background/70 px-2.5 py-2 text-center ring-1 ${tone.ring}`}
                          >
                            <div className="flex items-center justify-center gap-1.5 text-[10px] font-medium text-muted-foreground">
                              <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                              {d.category}
                            </div>
                            <p className={`mt-1 text-base font-semibold tabular-nums ${tone.text}`}>
                              {d.score.toFixed(1)}<span className="text-xs text-muted-foreground font-normal">/10</span>
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Criteria Table */}
                <div className="workspace-subsection lg:col-span-2 overflow-x-auto">
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Criteria Review</p>
                      <h4 className="mt-1 text-lg font-semibold">Weighted readiness scorecard</h4>
                    </div>
                    <Badge variant="secondary" className="text-xs">{criteria.length} criteria</Badge>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-sm">Criteria</TableHead>
                        <TableHead className="text-sm w-14 text-center">Wt</TableHead>
                        <TableHead className="text-sm w-28">Score</TableHead>
                        <TableHead className="text-sm">Evidence / Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categories.map(cat => (
                        <>
                          <TableRow key={`cat-${cat}`} className="bg-muted/30">
                            <TableCell colSpan={4} className="py-2">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold">{cat}</span>
                                <Badge variant="outline" className="text-[10px]">{criteria.filter(c => c.category === cat).length} items</Badge>
                              </div>
                            </TableCell>
                          </TableRow>
                          {criteria.filter(c => c.category === cat).map(item => (
                            <TableRow key={item.key}>
                              <TableCell className="text-sm py-2">
                                <div>
                                  {item.name}
                                  {item.confidence && (
                                    <span className={`ml-1.5 text-xs ${CONFIDENCE_COLORS[item.confidence] || ""}`}>
                                      ({item.confidence})
                                    </span>
                                  )}
                                  {item.isManual && <Badge variant="outline" className="text-[10px] ml-1">manual</Badge>}
                                </div>
                                {item.recommendation && (
                                  <p className="text-sm text-accent mt-0.5">{item.recommendation}</p>
                                )}
                              </TableCell>
                              <TableCell className="text-center py-2">
                                <Badge className="text-xs bg-muted text-muted-foreground">{item.weight}</Badge>
                              </TableCell>
                              <TableCell className="py-2">
                                <div className="flex items-center gap-1.5">
                                  <input type="range" min="0" max="10" step="1" className="w-16 h-1.5 accent-amber-500"
                                    value={item.score} onChange={e => updateCriterion(item.key, "score", parseInt(e.target.value))}
                                    data-testid={`score-${item.key}`} />
                                  <span className={`text-xs font-mono font-bold w-4 ${item.score <= 3 ? "text-red-600" : item.score <= 6 ? "text-amber-600" : "text-emerald-600"}`}>{item.score}</span>
                                </div>
                              </TableCell>
                              <TableCell className="py-2">
                                {item.evidence && <p className="text-sm text-muted-foreground mb-1">{item.evidence}</p>}
                                <Input className="h-7 text-sm" placeholder="Add notes..." value={item.notes}
                                  onChange={e => updateCriterion(item.key, "notes", e.target.value)} />
                              </TableCell>
                            </TableRow>
                          ))}
                        </>
                      ))}
                    </TableBody>
                  </Table>
                  <Textarea placeholder="Assessor notes — add context, conditions, or recommendations" className="mt-3 text-sm" rows={3} value={assessorNotes} onChange={e => setAssessorNotes(e.target.value)} data-testid="assessor-notes" />
                </div>

                <div className="workspace-subsection">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Category Snapshot</p>
                  <div className="mt-4 space-y-3">
                    {radarData.map(d => (
                      <div key={d.category} className="rounded-[20px] border border-white/30 bg-background/70 p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{d.category}</span>
                          <span className={`text-sm font-semibold ${d.score <= 3 ? "text-red-600" : d.score <= 6 ? "text-amber-600" : "text-emerald-600"}`}>{d.score}/10</span>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-muted/50">
                          <div className={`h-2 rounded-full ${d.score <= 3 ? "bg-red-500" : d.score <= 6 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.max(d.score * 10, 8)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Readiness Trend Over Time */}
              {scorecardHistory && scorecardHistory.length > 0 && (
                <Card className="border-white/40">
                  <CardContent className="pt-4">
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase mb-3">Readiness Trend</h4>
                    <ResponsiveContainer width="100%" height={240}>
                      <LineChart data={scorecardHistory.map((s: any) => ({
                        date: new Date(s.assessedAt || s.createdAt).toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
                        score: s.overallScore || 0,
                        readiness: s.overallReadiness,
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                        <Tooltip
                          contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "12px" }}
                          formatter={(value: number) => [`${value}/100`, "Score"]}
                        />
                        <ReferenceLine y={85} stroke="hsl(142 76% 36%)" strokeDasharray="4 4" label={{ value: "Ready", position: "right", fontSize: 10, fill: "hsl(142 76% 36%)" }} />
                        <ReferenceLine y={70} stroke="hsl(38 92% 50%)" strokeDasharray="4 4" label={{ value: "Conditional", position: "right", fontSize: 10, fill: "hsl(38 92% 50%)" }} />
                        <Line type="monotone" dataKey="score" stroke="hsl(var(--accent))" strokeWidth={2} dot={{ r: 4, fill: "hsl(var(--accent))" }} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {!initialized && !autoAssess.isPending && (
            <Card className="border-white/40 p-8 text-center">
              <Rocket className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-base font-medium">Go-Live Readiness Assessment</p>
              <p className="text-sm text-muted-foreground mt-1">Click "Auto-Assess from Project Data" to generate an AI-powered readiness assessment based on health check findings, RAID items, and project documents.</p>
            </Card>
          )}
        </div>
      </ScrollArea>
      </div>
    </div>
  );
}
