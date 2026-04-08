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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Stethoscope, ChevronLeft, Plus, Trash2, Edit2, Loader2, AlertTriangle, DollarSign, Calendar, Sparkles, FileText } from "lucide-react";
import { DocumentsTab } from "./health-check-documents";

const DOMAINS = [
  { key: "governance", label: "Governance & Oversight", icon: "🏛️", desc: "Project governance, decision-making, stakeholder engagement" },
  { key: "raid", label: "RAID Log Analysis", icon: "⚠️", desc: "Risks, assumptions, issues, dependencies" },
  { key: "technical", label: "Technical Architecture", icon: "🔧", desc: "Architecture quality, technical debt, integration health" },
  { key: "budget_schedule", label: "Budget & Schedule", icon: "📊", desc: "Budget variance, schedule adherence, resource utilization" },
];

const RATINGS = ["critical", "high", "medium", "low", "satisfactory"];
const RATING_COLORS: Record<string, string> = {
  critical: "bg-red-200 text-red-900 dark:bg-red-950/60 dark:text-red-300",
  high: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  low: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  satisfactory: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
};

const RAID_TYPES = ["risk", "assumption", "issue", "dependency"];
const SEVERITIES = ["critical", "high", "medium", "low"];
const STATUSES = ["open", "mitigated", "closed", "accepted"];
const SCHEDULE_STATUSES = ["on_track", "at_risk", "delayed", "completed"];
const BUDGET_CATEGORIES = ["original_contract", "change_order", "additional_funding", "actual_spend"];

type AssessmentForm = { domain: string; overallRating: string; summary: string; findings: string; assessedBy: string };
type RaidForm = { type: string; title: string; description: string; severity: string; status: string; owner: string };
type BudgetForm = { category: string; description: string; amount: string; date: string; notes: string };
type ScheduleForm = { milestone: string; originalDate: string; currentDate: string; status: string; notes: string };

const emptyAssessment = (): AssessmentForm => ({ domain: "", overallRating: "", summary: "", findings: "", assessedBy: "" });
const emptyRaid = (): RaidForm => ({ type: "risk", title: "", description: "", severity: "medium", status: "open", owner: "" });
const emptyBudget = (): BudgetForm => ({ category: "actual_spend", description: "", amount: "", date: "", notes: "" });
const emptySchedule = (): ScheduleForm => ({ milestone: "", originalDate: "", currentDate: "", status: "on_track", notes: "" });

// Helper to render findings that may be JSON or plain text
function renderFindings(findings: string | null | undefined): string {
  if (!findings) return "";
  try {
    const parsed = JSON.parse(findings);
    if (Array.isArray(parsed)) {
      return parsed.map((f: any) => {
        if (typeof f === "string") return f;
        const parts: string[] = [];
        if (f.finding) parts.push(f.finding);
        if (f.severity) parts.push(`[${f.severity}]`);
        if (f.evidence) parts.push(`Evidence: ${f.evidence}`);
        if (f.recommendation) parts.push(`Recommendation: ${f.recommendation}`);
        return parts.join(" — ");
      }).join("\n\n");
    }
    return findings;
  } catch {
    return findings;
  }
}

export default function HealthCheckPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id || "0");
  const { toast } = useToast();

  const [assessDialog, setAssessDialog] = useState<{ open: boolean; editId?: number; form: AssessmentForm }>({ open: false, form: emptyAssessment() });
  const [raidDialog, setRaidDialog] = useState<{ open: boolean; editId?: number; form: RaidForm }>({ open: false, form: emptyRaid() });
  const [budgetDialog, setBudgetDialog] = useState<{ open: boolean; editId?: number; form: BudgetForm }>({ open: false, form: emptyBudget() });
  const [scheduleDialog, setScheduleDialog] = useState<{ open: boolean; editId?: number; form: ScheduleForm }>({ open: false, form: emptySchedule() });
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; type: string; id: number; label: string }>({ open: false, type: "", id: 0, label: "" });

  const { data: project } = useQuery<any>({ queryKey: ["/api/projects", projectId], queryFn: () => apiRequest("GET", `/api/projects/${projectId}`).then(r => r.json()), enabled: !!projectId });
  const { data: assessments = [] } = useQuery<any[]>({ queryKey: ["/api/projects", projectId, "hc-assessments"], queryFn: () => apiRequest("GET", `/api/projects/${projectId}/health-check/assessments`).then(r => r.json()), enabled: !!projectId });
  const { data: raidItems = [] } = useQuery<any[]>({ queryKey: ["/api/projects", projectId, "raid"], queryFn: () => apiRequest("GET", `/api/projects/${projectId}/raid`).then(r => r.json()), enabled: !!projectId });
  const { data: budgetData } = useQuery<any>({ queryKey: ["/api/projects", projectId, "budget"], queryFn: () => apiRequest("GET", `/api/projects/${projectId}/budget`).then(r => r.json()), enabled: !!projectId });
  const { data: scheduleItems = [] } = useQuery<any[]>({ queryKey: ["/api/projects", projectId, "schedule"], queryFn: () => apiRequest("GET", `/api/projects/${projectId}/schedule`).then(r => r.json()), enabled: !!projectId });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "hc-assessments"] });
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "raid"] });
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "budget"] });
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "schedule"] });
  };

  const saveAssessment = useMutation({
    mutationFn: (d: any) => {
      if (assessDialog.editId) return apiRequest("PATCH", `/api/health-check/assessments/${assessDialog.editId}`, d).then(r => r.json());
      return apiRequest("POST", `/api/projects/${projectId}/health-check/assessments`, d).then(r => r.json());
    },
    onSuccess: () => { invalidateAll(); setAssessDialog({ open: false, form: emptyAssessment() }); toast({ title: "Assessment saved" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteAssessment = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/health-check/assessments/${id}`),
    onSuccess: () => { invalidateAll(); toast({ title: "Deleted" }); },
  });

  const saveRaid = useMutation({
    mutationFn: (d: any) => {
      if (raidDialog.editId) return apiRequest("PATCH", `/api/raid/${raidDialog.editId}`, d).then(r => r.json());
      return apiRequest("POST", `/api/projects/${projectId}/raid`, d).then(r => r.json());
    },
    onSuccess: () => { invalidateAll(); setRaidDialog({ open: false, form: emptyRaid() }); toast({ title: "RAID item saved" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteRaid = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/raid/${id}`),
    onSuccess: () => { invalidateAll(); toast({ title: "Deleted" }); },
  });

  const saveBudget = useMutation({
    mutationFn: (d: any) => {
      if (budgetDialog.editId) return apiRequest("PATCH", `/api/budget/${budgetDialog.editId}`, d).then(r => r.json());
      return apiRequest("POST", `/api/projects/${projectId}/budget`, d).then(r => r.json());
    },
    onSuccess: () => { invalidateAll(); setBudgetDialog({ open: false, form: emptyBudget() }); toast({ title: "Budget entry saved" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteBudget = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/budget/${id}`),
    onSuccess: () => { invalidateAll(); toast({ title: "Deleted" }); },
  });

  const saveSchedule = useMutation({
    mutationFn: (d: any) => {
      if (scheduleDialog.editId) return apiRequest("PATCH", `/api/schedule/${scheduleDialog.editId}`, d).then(r => r.json());
      return apiRequest("POST", `/api/projects/${projectId}/schedule`, d).then(r => r.json());
    },
    onSuccess: () => { invalidateAll(); setScheduleDialog({ open: false, form: emptySchedule() }); toast({ title: "Milestone saved" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteSchedule = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/schedule/${id}`),
    onSuccess: () => { invalidateAll(); toast({ title: "Deleted" }); },
  });

  function confirmDelete(type: string, id: number, label: string) {
    setDeleteConfirm({ open: true, type, id, label });
  }

  function executeDelete() {
    const { type, id } = deleteConfirm;
    if (type === "assessment") deleteAssessment.mutate(id);
    else if (type === "raid") deleteRaid.mutate(id);
    else if (type === "budget") deleteBudget.mutate(id);
    else if (type === "schedule") deleteSchedule.mutate(id);
    setDeleteConfirm({ open: false, type: "", id: 0, label: "" });
  }

  const assessmentMap = Object.fromEntries(assessments.map((a: any) => [a.domain, a]));
  const budgetEntries = budgetData?.entries || [];
  const budgetSummary = budgetData?.summary || { originalContract: 0, totalChangeOrders: 0, totalAdditionalFunding: 0, totalActualSpend: 0, variance: 0 };

  function openAssessDialog(domain: string) {
    const existing = assessmentMap[domain];
    if (existing) {
      setAssessDialog({ open: true, editId: existing.id, form: { domain, overallRating: existing.overallRating || "", summary: existing.summary || "", findings: renderFindings(existing.findings), assessedBy: existing.assessedBy || "" } });
    } else {
      setAssessDialog({ open: true, form: { ...emptyAssessment(), domain } });
    }
  }

  function openRaidEdit(item: any) {
    setRaidDialog({ open: true, editId: item.id, form: { type: item.type, title: item.title, description: item.description || "", severity: item.severity || "medium", status: item.status || "open", owner: item.owner || "" } });
  }

  function openBudgetEdit(item: any) {
    setBudgetDialog({ open: true, editId: item.id, form: { category: item.category || "actual_spend", description: item.description || "", amount: String(item.amount || 0), date: item.date || "", notes: item.notes || "" } });
  }

  function openScheduleEdit(item: any) {
    setScheduleDialog({ open: true, editId: item.id, form: { milestone: item.milestone || "", originalDate: item.originalDate || "", currentDate: item.currentDate || "", status: item.status || "on_track", notes: item.notes || "" } });
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-border/50 bg-card/50 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <Link href={`/projects/${projectId}`}>
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground hover:text-foreground -ml-2">
              <ChevronLeft className="w-4 h-4" />{project?.name || "Project"}
            </Button>
          </Link>
          <span className="text-muted-foreground/40">/</span>
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-[#d4a853]" />Health Check & Rescue
          </h1>
          <div className="ml-auto">
            <Button variant="outline" className="gap-2 text-xs" data-testid="button-seed-health-check" onClick={() => {
              apiRequest("POST", `/api/projects/${projectId}/seed-health-check-data`).then(() => {
                invalidateAll();
                toast({ title: "Sample health check data loaded" });
              }).catch((err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }));
            }}>
              <Sparkles className="w-4 h-4" /> Load Sample Health Check Data
            </Button>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6">
          <Tabs defaultValue="assessment" data-testid="health-check-tabs">
            <TabsList className="mb-4">
              <TabsTrigger value="assessment" data-testid="tab-assessment">Assessment</TabsTrigger>
              <TabsTrigger value="raid" data-testid="tab-raid">RAID Log</TabsTrigger>
              <TabsTrigger value="budget" data-testid="tab-budget">Budget & Schedule</TabsTrigger>
              <TabsTrigger value="documents" data-testid="tab-documents"><FileText className="w-4 h-4 mr-1 inline" />Documents</TabsTrigger>
            </TabsList>

            {/* TAB 1: Assessment Domains */}
            <TabsContent value="assessment">
              <div className="grid grid-cols-2 gap-4">
                {DOMAINS.map(d => {
                  const a = assessmentMap[d.key];
                  return (
                    <Card key={d.key} className="cursor-pointer hover:border-[#d4a853]/50 transition-colors" onClick={() => openAssessDialog(d.key)} data-testid={`domain-card-${d.key}`}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm flex items-center gap-2"><span>{d.icon}</span>{d.label}</CardTitle>
                          {a?.overallRating && <Badge className={`text-[10px] ${RATING_COLORS[a.overallRating] || ""}`}>{a.overallRating.toUpperCase()}</Badge>}
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-xs text-muted-foreground">{a?.summary || d.desc}</p>
                        {a?.assessedBy && <p className="text-[10px] text-muted-foreground/60 mt-2">Assessed by {a.assessedBy}</p>}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </TabsContent>

            {/* TAB 2: RAID Log */}
            <TabsContent value="raid">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" />RAID Log ({raidItems.length})</h3>
                <Button size="sm" className="bg-[#d4a853] hover:bg-[#c49843] text-white text-xs gap-1" onClick={() => setRaidDialog({ open: true, form: emptyRaid() })} data-testid="button-add-raid">
                  <Plus className="w-3 h-3" />Add Item
                </Button>
              </div>
              {raidItems.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No RAID items yet. Add risks, assumptions, issues, or dependencies.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs w-24">Type</TableHead>
                      <TableHead className="text-xs">Title</TableHead>
                      <TableHead className="text-xs w-20">Severity</TableHead>
                      <TableHead className="text-xs w-20">Status</TableHead>
                      <TableHead className="text-xs w-20">Owner</TableHead>
                      <TableHead className="text-xs w-20">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {raidItems.map((item: any) => (
                      <TableRow key={item.id}>
                        <TableCell><Badge variant="outline" className="text-[10px] uppercase">{item.type}</Badge></TableCell>
                        <TableCell className="text-xs">{item.title}</TableCell>
                        <TableCell>{item.severity && <Badge className={`text-[10px] ${RATING_COLORS[item.severity] || "bg-muted text-muted-foreground"}`}>{item.severity}</Badge>}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{item.status}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.owner || "—"}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => openRaidEdit(item)} data-testid={`edit-raid-${item.id}`}><Edit2 className="w-3 h-3" /></Button>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => confirmDelete("raid", item.id, item.title)} data-testid={`delete-raid-${item.id}`}><Trash2 className="w-3 h-3" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            {/* TAB 3: Budget & Schedule */}
            <TabsContent value="budget">
              <div className="grid grid-cols-2 gap-6">
                {/* Budget Section */}
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2"><DollarSign className="w-4 h-4 text-emerald-500" />Budget</h3>
                    <Button size="sm" className="bg-[#d4a853] hover:bg-[#c49843] text-white text-xs gap-1" onClick={() => setBudgetDialog({ open: true, form: emptyBudget() })} data-testid="button-add-budget">
                      <Plus className="w-3 h-3" />Add Entry
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {[
                      { label: "Original Contract", value: budgetSummary.originalContract },
                      { label: "Change Orders", value: budgetSummary.totalChangeOrders },
                      { label: "Additional Funding", value: budgetSummary.totalAdditionalFunding },
                      { label: "Actual Spend", value: budgetSummary.totalActualSpend },
                    ].map(s => (
                      <Card key={s.label} className="p-2">
                        <p className="text-[10px] text-muted-foreground">{s.label}</p>
                        <p className="text-sm font-semibold">${(s.value || 0).toLocaleString()}</p>
                      </Card>
                    ))}
                  </div>
                  <Card className={`p-2 mb-3 ${budgetSummary.variance >= 0 ? "border-emerald-500/30" : "border-red-500/30"}`}>
                    <p className="text-[10px] text-muted-foreground">Variance</p>
                    <p className={`text-sm font-bold ${budgetSummary.variance >= 0 ? "text-emerald-500" : "text-red-500"}`}>${(budgetSummary.variance || 0).toLocaleString()}</p>
                  </Card>
                  {budgetEntries.length > 0 && (
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead className="text-xs">Category</TableHead>
                        <TableHead className="text-xs">Description</TableHead>
                        <TableHead className="text-xs text-right">Amount</TableHead>
                        <TableHead className="text-xs w-16"></TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {budgetEntries.map((e: any) => (
                          <TableRow key={e.id}>
                            <TableCell><Badge variant="outline" className="text-[10px]">{e.category?.replace(/_/g, " ")}</Badge></TableCell>
                            <TableCell className="text-xs">{e.description}</TableCell>
                            <TableCell className="text-xs text-right font-mono">${Number(e.amount || 0).toLocaleString()}</TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => openBudgetEdit(e)} data-testid={`edit-budget-${e.id}`}><Edit2 className="w-3 h-3" /></Button>
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => confirmDelete("budget", e.id, e.description)} data-testid={`delete-budget-${e.id}`}><Trash2 className="w-3 h-3" /></Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>

                {/* Schedule Section */}
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2"><Calendar className="w-4 h-4 text-blue-500" />Schedule Milestones</h3>
                    <Button size="sm" className="bg-[#d4a853] hover:bg-[#c49843] text-white text-xs gap-1" onClick={() => setScheduleDialog({ open: true, form: emptySchedule() })} data-testid="button-add-schedule">
                      <Plus className="w-3 h-3" />Add Milestone
                    </Button>
                  </div>
                  {scheduleItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No milestones tracked yet.</p>
                  ) : (
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead className="text-xs">Milestone</TableHead>
                        <TableHead className="text-xs">Original</TableHead>
                        <TableHead className="text-xs">Current</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs w-16"></TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {scheduleItems.map((s: any) => (
                          <TableRow key={s.id}>
                            <TableCell className="text-xs font-medium">{s.milestone}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{s.originalDate || "—"}</TableCell>
                            <TableCell className="text-xs">{s.currentDate || "—"}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`text-[10px] ${s.status === "delayed" ? "border-red-500 text-red-500" : s.status === "at_risk" ? "border-amber-500 text-amber-500" : s.status === "completed" ? "border-emerald-500 text-emerald-500" : ""}`}>
                                {s.status?.replace(/_/g, " ")}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => openScheduleEdit(s)} data-testid={`edit-schedule-${s.id}`}><Edit2 className="w-3 h-3" /></Button>
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => confirmDelete("schedule", s.id, s.milestone)} data-testid={`delete-schedule-${s.id}`}><Trash2 className="w-3 h-3" /></Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </div>
            </TabsContent>
            <TabsContent value="documents">
              <DocumentsTab projectId={projectId} />
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>

      {/* Assessment Dialog */}
      <Dialog open={assessDialog.open} onOpenChange={o => !o && setAssessDialog({ open: false, form: emptyAssessment() })}>
        <DialogContent data-testid="dialog-assessment">
          <DialogHeader><DialogTitle className="text-sm">
            {DOMAINS.find(d => d.key === assessDialog.form.domain)?.label || "Assessment"}
          </DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Overall Rating</label>
              <Select value={assessDialog.form.overallRating} onValueChange={v => setAssessDialog(p => ({ ...p, form: { ...p.form, overallRating: v } }))}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-rating"><SelectValue placeholder="Select rating" /></SelectTrigger>
                <SelectContent>{RATINGS.map(r => <SelectItem key={r} value={r} className="text-xs capitalize">{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Summary</label>
              <Textarea className="text-xs" rows={2} value={assessDialog.form.summary} onChange={e => setAssessDialog(p => ({ ...p, form: { ...p.form, summary: e.target.value } }))} data-testid="input-assessment-summary" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Findings</label>
              <Textarea className="text-xs" rows={3} placeholder="Enter findings (free text)" value={assessDialog.form.findings} onChange={e => setAssessDialog(p => ({ ...p, form: { ...p.form, findings: e.target.value } }))} data-testid="input-assessment-findings" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Assessed By</label>
              <Input className="h-8 text-xs" value={assessDialog.form.assessedBy} onChange={e => setAssessDialog(p => ({ ...p, form: { ...p.form, assessedBy: e.target.value } }))} data-testid="input-assessed-by" />
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" className="bg-[#d4a853] hover:bg-[#c49843] text-white text-xs" disabled={saveAssessment.isPending}
              onClick={() => saveAssessment.mutate(assessDialog.form)} data-testid="button-save-assessment">
              {saveAssessment.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* RAID Dialog */}
      <Dialog open={raidDialog.open} onOpenChange={o => !o && setRaidDialog({ open: false, form: emptyRaid() })}>
        <DialogContent data-testid="dialog-raid">
          <DialogHeader><DialogTitle className="text-sm">{raidDialog.editId ? "Edit" : "Add"} RAID Item</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Type</label>
                <Select value={raidDialog.form.type} onValueChange={v => setRaidDialog(p => ({ ...p, form: { ...p.form, type: v } }))}>
                  <SelectTrigger className="h-8 text-xs" data-testid="select-raid-type"><SelectValue /></SelectTrigger>
                  <SelectContent>{RAID_TYPES.map(t => <SelectItem key={t} value={t} className="text-xs capitalize">{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Status</label>
                <Select value={raidDialog.form.status} onValueChange={v => setRaidDialog(p => ({ ...p, form: { ...p.form, status: v } }))}>
                  <SelectTrigger className="h-8 text-xs" data-testid="select-raid-status"><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s} className="text-xs capitalize">{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Title</label>
              <Input className="h-8 text-xs" value={raidDialog.form.title} onChange={e => setRaidDialog(p => ({ ...p, form: { ...p.form, title: e.target.value } }))} data-testid="input-raid-title" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Description</label>
              <Textarea className="text-xs" rows={2} value={raidDialog.form.description} onChange={e => setRaidDialog(p => ({ ...p, form: { ...p.form, description: e.target.value } }))} data-testid="input-raid-description" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Severity</label>
                <Select value={raidDialog.form.severity} onValueChange={v => setRaidDialog(p => ({ ...p, form: { ...p.form, severity: v } }))}>
                  <SelectTrigger className="h-8 text-xs" data-testid="select-raid-severity"><SelectValue /></SelectTrigger>
                  <SelectContent>{SEVERITIES.map(s => <SelectItem key={s} value={s} className="text-xs capitalize">{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Owner</label>
                <Input className="h-8 text-xs" value={raidDialog.form.owner} onChange={e => setRaidDialog(p => ({ ...p, form: { ...p.form, owner: e.target.value } }))} data-testid="input-raid-owner" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" className="bg-[#d4a853] hover:bg-[#c49843] text-white text-xs" disabled={saveRaid.isPending}
              onClick={() => saveRaid.mutate(raidDialog.form)} data-testid="button-save-raid">
              {saveRaid.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Budget Dialog */}
      <Dialog open={budgetDialog.open} onOpenChange={o => !o && setBudgetDialog({ open: false, form: emptyBudget() })}>
        <DialogContent data-testid="dialog-budget">
          <DialogHeader><DialogTitle className="text-sm">{budgetDialog.editId ? "Edit" : "Add"} Budget Entry</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Category</label>
              <Select value={budgetDialog.form.category} onValueChange={v => setBudgetDialog(p => ({ ...p, form: { ...p.form, category: v } }))}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-budget-category"><SelectValue /></SelectTrigger>
                <SelectContent>{BUDGET_CATEGORIES.map(c => <SelectItem key={c} value={c} className="text-xs">{c.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Description</label>
              <Input className="h-8 text-xs" value={budgetDialog.form.description} onChange={e => setBudgetDialog(p => ({ ...p, form: { ...p.form, description: e.target.value } }))} data-testid="input-budget-description" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Amount ($)</label>
                <Input type="number" className="h-8 text-xs" value={budgetDialog.form.amount} onChange={e => setBudgetDialog(p => ({ ...p, form: { ...p.form, amount: e.target.value } }))} data-testid="input-budget-amount" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Date</label>
                <Input type="date" className="h-8 text-xs" value={budgetDialog.form.date} onChange={e => setBudgetDialog(p => ({ ...p, form: { ...p.form, date: e.target.value } }))} data-testid="input-budget-date" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Notes</label>
              <Input className="h-8 text-xs" value={budgetDialog.form.notes} onChange={e => setBudgetDialog(p => ({ ...p, form: { ...p.form, notes: e.target.value } }))} data-testid="input-budget-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" className="bg-[#d4a853] hover:bg-[#c49843] text-white text-xs" disabled={saveBudget.isPending}
              onClick={() => saveBudget.mutate({ ...budgetDialog.form, amount: parseFloat(budgetDialog.form.amount) || 0 })} data-testid="button-save-budget">
              {saveBudget.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule Dialog */}
      <Dialog open={scheduleDialog.open} onOpenChange={o => !o && setScheduleDialog({ open: false, form: emptySchedule() })}>
        <DialogContent data-testid="dialog-schedule">
          <DialogHeader><DialogTitle className="text-sm">{scheduleDialog.editId ? "Edit" : "Add"} Schedule Milestone</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Milestone</label>
              <Input className="h-8 text-xs" value={scheduleDialog.form.milestone} onChange={e => setScheduleDialog(p => ({ ...p, form: { ...p.form, milestone: e.target.value } }))} data-testid="input-schedule-milestone" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Original Date</label>
                <Input type="date" className="h-8 text-xs" value={scheduleDialog.form.originalDate} onChange={e => setScheduleDialog(p => ({ ...p, form: { ...p.form, originalDate: e.target.value } }))} data-testid="input-schedule-original" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Current Date</label>
                <Input type="date" className="h-8 text-xs" value={scheduleDialog.form.currentDate} onChange={e => setScheduleDialog(p => ({ ...p, form: { ...p.form, currentDate: e.target.value } }))} data-testid="input-schedule-current" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Status</label>
              <Select value={scheduleDialog.form.status} onValueChange={v => setScheduleDialog(p => ({ ...p, form: { ...p.form, status: v } }))}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-schedule-status"><SelectValue /></SelectTrigger>
                <SelectContent>{SCHEDULE_STATUSES.map(s => <SelectItem key={s} value={s} className="text-xs">{s.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Notes</label>
              <Input className="h-8 text-xs" value={scheduleDialog.form.notes} onChange={e => setScheduleDialog(p => ({ ...p, form: { ...p.form, notes: e.target.value } }))} data-testid="input-schedule-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" className="bg-[#d4a853] hover:bg-[#c49843] text-white text-xs" disabled={saveSchedule.isPending}
              onClick={() => saveSchedule.mutate(scheduleDialog.form)} data-testid="button-save-schedule">
              {saveSchedule.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirm.open} onOpenChange={o => !o && setDeleteConfirm({ open: false, type: "", id: 0, label: "" })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">Delete {deleteConfirm.type}?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              This will permanently delete "{deleteConfirm.label}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs h-8">Cancel</AlertDialogCancel>
            <AlertDialogAction className="text-xs h-8 bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={executeDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
