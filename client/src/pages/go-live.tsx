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
        setCriteria(parsed);
        setAssessorNotes(scorecard.assessorNotes || "");
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
      // Merge AI scores into criteria, preserving manual overrides
      setCriteria(prev => prev.map((c, i) => {
        const aiCriterion = data.criteria?.[i] || data.criteria?.find((ac: any) => ac.name === c.name);
        if (!aiCriterion) return c;
        // Don't override if manually set
        if (c.isManual) return { ...c, evidence: aiCriterion.evidence || c.evidence, recommendation: aiCriterion.recommendation || c.recommendation, confidence: aiCriterion.confidence || "" };
        return {
          ...c,
          score: aiCriterion.score ?? c.score,
          evidence: aiCriterion.evidence || "",
          recommendation: aiCriterion.recommendation || "",
          confidence: aiCriterion.confidence || "",
          isManual: false,
        };
      }));
      setAiNotes(data.overallNotes || "");
      setInitialized(true);
      toast({ title: `Auto-assessed: ${data.overallReadiness?.replace(/_/g, " ")} (${data.overallScore}/100)` });
    },
    onError: (e: any) => toast({ title: "Auto-assess failed", description: e.message, variant: "destructive" }),
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
    return { category: cat, score: catWeight > 0 ? Math.round((catSum / catWeight) * 10) / 10 : 0, fullMark: 10 };
  });

  function updateCriterion(key: string, field: string, value: any) {
    setCriteria(prev => prev.map(c => c.key === key ? { ...c, [field]: value, isManual: field === "score" ? true : c.isManual } : c));
  }

  function handleSave() {
    saveMutation.mutate({ criteria, assessorNotes, assessedAt: new Date().toISOString() });
  }

  if (isLoading) {
    return <div className="p-6 space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>;
  }

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
            <Rocket className="w-5 h-5 text-accent" />Go-Live Readiness
          </h1>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 sm:p-6 space-y-5">
          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
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
            <div className="p-3 rounded-lg bg-accent/5 border border-accent/20 text-sm text-muted-foreground">
              <span className="font-medium text-accent">AI Assessment: </span>{aiNotes}
            </div>
          )}

          {/* Score Overview */}
          {initialized && (
            <>
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <span className={`text-4xl font-bold ${scoreColor}`}>{overallScore}</span>
                  <span className="text-lg text-muted-foreground">/100</span>
                  <p className="text-xs text-muted-foreground mt-1">Overall Score</p>
                </div>
                <Badge className={`text-sm px-3 py-1 ${READINESS_COLORS[readiness] || ""}`} data-testid="readiness-badge">
                  {READINESS_LABELS[readiness]}
                </Badge>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Criteria Table */}
                <div className="lg:col-span-2 overflow-x-auto">
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
                            <TableCell colSpan={4} className="text-sm font-semibold py-1.5">{cat}</TableCell>
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

                {/* Radar Chart */}
                <Card>
                  <CardContent className="pt-4">
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase mb-2">Category Radar</h4>
                    <ResponsiveContainer width="100%" height={280}>
                      <RadarChart data={radarData}>
                        <PolarGrid stroke="hsl(var(--border))" />
                        <PolarAngleAxis dataKey="category" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                        <PolarRadiusAxis angle={90} domain={[0, 10]} tick={{ fontSize: 9 }} />
                        <Radar dataKey="score" stroke="hsl(var(--accent))" fill="hsl(var(--accent))" fillOpacity={0.3} />
                      </RadarChart>
                    </ResponsiveContainer>
                    <div className="mt-3 space-y-1">
                      {radarData.map(d => (
                        <div key={d.category} className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{d.category}</span>
                          <span className={`font-mono font-bold ${d.score <= 3 ? "text-red-600" : d.score <= 6 ? "text-amber-600" : "text-emerald-600"}`}>{d.score}/10</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Readiness Trend Over Time */}
              {scorecardHistory && scorecardHistory.length > 0 && (
                <Card>
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
            <Card className="p-8 text-center">
              <Rocket className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-base font-medium">Go-Live Readiness Assessment</p>
              <p className="text-sm text-muted-foreground mt-1">Click "Auto-Assess from Project Data" to generate an AI-powered readiness assessment based on health check findings, RAID items, and project documents.</p>
            </Card>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
