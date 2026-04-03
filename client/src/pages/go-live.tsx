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
import { Rocket, ChevronLeft, Plus, Check, Loader2 } from "lucide-react";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts";

const DEFAULT_CRITERIA = [
  { category: "Testing", key: "sit_completion", name: "SIT Completion", weight: 10, score: 0, notes: "" },
  { category: "Testing", key: "e2e_testing", name: "E2E Testing Exit", weight: 12, score: 0, notes: "" },
  { category: "Testing", key: "uat_completion", name: "UAT/UER Completion", weight: 12, score: 0, notes: "" },
  { category: "Testing", key: "payroll_compare", name: "Payroll Compare", weight: 8, score: 0, notes: "" },
  { category: "Defects", key: "critical_high_resolution", name: "Critical/High Defect Resolution", weight: 15, score: 0, notes: "" },
  { category: "Defects", key: "burndown_trend", name: "Defect Burn-down Trend", weight: 5, score: 0, notes: "" },
  { category: "Data", key: "migration_quality", name: "Data Migration Quality", weight: 10, score: 0, notes: "" },
  { category: "Data", key: "reconciliation", name: "Reconciliation Results", weight: 5, score: 0, notes: "" },
  { category: "Cutover", key: "plan_completeness", name: "Cutover Plan Completeness", weight: 8, score: 0, notes: "" },
  { category: "Cutover", key: "rollback_plan", name: "Rollback Plan", weight: 3, score: 0, notes: "" },
  { category: "Readiness", key: "training", name: "Training Completion", weight: 5, score: 0, notes: "" },
  { category: "Readiness", key: "support_model", name: "Support Model Activated", weight: 4, score: 0, notes: "" },
  { category: "Readiness", key: "hypercare_plan", name: "Hypercare Plan", weight: 3, score: 0, notes: "" },
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

export default function GoLivePage() {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id || "0");
  const { toast } = useToast();

  const [criteria, setCriteria] = useState(DEFAULT_CRITERIA);
  const [assessorNotes, setAssessorNotes] = useState("");
  const [initialized, setInitialized] = useState(false);

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

  // Calculate scores
  const totalWeight = criteria.reduce((s, c) => s + c.weight, 0);
  const weightedSum = criteria.reduce((s, c) => s + c.weight * c.score, 0);
  const overallScore = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 10 * 10) / 10 : 0;
  const readiness = overallScore >= 85 ? "ready" : overallScore >= 70 ? "ready_with_conditions" : overallScore >= 50 ? "not_ready" : "critical_hold";
  const scoreColor = overallScore >= 85 ? "text-emerald-500" : overallScore >= 70 ? "text-amber-500" : overallScore >= 50 ? "text-red-500" : "text-red-900";

  // Radar data
  const categories = [...new Set(criteria.map(c => c.category))];
  const radarData = categories.map(cat => {
    const items = criteria.filter(c => c.category === cat);
    const catWeight = items.reduce((s, i) => s + i.weight, 0);
    const catSum = items.reduce((s, i) => s + i.weight * i.score, 0);
    return { category: cat, score: catWeight > 0 ? Math.round((catSum / catWeight) * 10) / 10 : 0, fullMark: 10 };
  });

  function updateCriterion(key: string, field: "score" | "notes", value: any) {
    setCriteria(prev => prev.map(c => c.key === key ? { ...c, [field]: value } : c));
  }

  function handleSave() {
    saveMutation.mutate({ criteria, assessorNotes, assessedAt: new Date().toISOString() });
  }

  if (isLoading) {
    return <div className="p-6 space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>;
  }

  const hasScorecard = scorecard || initialized;

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-border/50 bg-card/50 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <Link href={`/projects/${projectId}`}>
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground hover:text-foreground -ml-2">
              <ChevronLeft className="w-4 h-4" />
              {project?.name || "Project"}
            </Button>
          </Link>
          <span className="text-muted-foreground/40">/</span>
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Rocket className="w-5 h-5 text-[#d4a853]" />
            Go-Live Readiness Scorecard
          </h1>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-5">
          {!contractId ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              Add a contract on the Compliance page first to create a go-live scorecard.
            </div>
          ) : !hasScorecard ? (
            <div className="flex flex-col items-center py-12 gap-4">
              <Rocket className="w-12 h-12 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No go-live scorecard yet</p>
              <Button className="bg-[#d4a853] hover:bg-[#c49843] text-white gap-2" onClick={() => setInitialized(true)} data-testid="button-create-scorecard">
                <Plus className="w-4 h-4" /> Create Scorecard
              </Button>
            </div>
          ) : (
            <>
              {/* Score Overview */}
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <span className={`text-4xl font-bold ${scoreColor}`}>{overallScore}</span>
                  <span className="text-lg text-muted-foreground">/100</span>
                  <p className="text-xs text-muted-foreground mt-1">Overall Score</p>
                </div>
                <Badge className={`text-sm px-3 py-1 ${READINESS_COLORS[readiness] || ""}`} data-testid="readiness-badge">
                  {READINESS_LABELS[readiness]}
                </Badge>
                <div className="ml-auto">
                  <Button size="sm" className="bg-[#d4a853] hover:bg-[#c49843] text-white text-xs gap-1.5" onClick={handleSave}
                    disabled={saveMutation.isPending} data-testid="button-save-scorecard">
                    {saveMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save Scorecard
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                {/* Criteria Table */}
                <div className="col-span-2">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Criteria</TableHead>
                        <TableHead className="text-xs w-16 text-center">Weight</TableHead>
                        <TableHead className="text-xs w-36">Score (0-10)</TableHead>
                        <TableHead className="text-xs">Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categories.map(cat => (
                        <>
                          <TableRow key={`cat-${cat}`} className="bg-muted/30">
                            <TableCell colSpan={4} className="text-xs font-semibold py-1.5">{cat}</TableCell>
                          </TableRow>
                          {criteria.filter(c => c.category === cat).map(item => (
                            <TableRow key={item.key}>
                              <TableCell className="text-xs py-1.5">{item.name}</TableCell>
                              <TableCell className="text-center py-1.5">
                                <Badge className="text-[10px] bg-muted text-muted-foreground">{item.weight}</Badge>
                              </TableCell>
                              <TableCell className="py-1.5">
                                <div className="flex items-center gap-1.5">
                                  <input type="range" min="0" max="10" step="1" className="w-20 h-1.5 accent-[#d4a853]"
                                    value={item.score} onChange={e => updateCriterion(item.key, "score", parseInt(e.target.value))}
                                    data-testid={`score-${item.key}`} />
                                  <span className="text-[11px] font-mono w-4">{item.score}</span>
                                </div>
                              </TableCell>
                              <TableCell className="py-1.5">
                                <Input className="h-6 text-[11px]" placeholder="Notes" value={item.notes}
                                  onChange={e => updateCriterion(item.key, "notes", e.target.value)} />
                              </TableCell>
                            </TableRow>
                          ))}
                        </>
                      ))}
                    </TableBody>
                  </Table>
                  <Textarea placeholder="Assessor notes" className="mt-3 text-xs" value={assessorNotes} onChange={e => setAssessorNotes(e.target.value)} data-testid="assessor-notes" />
                </div>

                {/* Radar Chart */}
                <Card>
                  <CardContent className="pt-4">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Category Radar</h4>
                    <ResponsiveContainer width="100%" height={280}>
                      <RadarChart data={radarData}>
                        <PolarGrid stroke="hsl(var(--border))" />
                        <PolarAngleAxis dataKey="category" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                        <PolarRadiusAxis angle={90} domain={[0, 10]} tick={{ fontSize: 9 }} />
                        <Radar dataKey="score" stroke="#d4a853" fill="#d4a853" fillOpacity={0.3} />
                      </RadarChart>
                    </ResponsiveContainer>
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
