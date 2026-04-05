import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Compass, Plus, Trash2, Save, ArrowLeft, Send, Loader2, CheckCircle, MessageSquare, Sparkles, ClipboardList, AlertTriangle, ChevronDown, BarChart3, FileText, Target } from "lucide-react";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

const ENTITY_TYPES = [
  { value: "city", label: "City" },
  { value: "county", label: "County" },
  { value: "utility", label: "Utility District" },
  { value: "transit", label: "Transit Authority" },
  { value: "port", label: "Port Authority" },
  { value: "state_agency", label: "State Agency" },
  { value: "special_district", label: "Special District" },
];

const FUNCTIONAL_AREAS = [
  "Finance", "Human Resources", "Procurement", "Asset Management",
  "Public Works & Operations", "IT & Technology", "Customer Service & Billing", "Public Safety",
];

const STATUS_STYLES: Record<string, string> = {
  not_started: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  in_progress: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "border-l-red-500 bg-red-50/50 dark:bg-red-950/20",
  high: "border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/20",
  medium: "border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20",
  low: "border-l-gray-400 bg-gray-50/50 dark:bg-gray-950/20",
};

function parseJsonSafe<T>(val: any, fallback: T): T {
  if (!val) return fallback;
  try { return typeof val === "string" ? JSON.parse(val) : val; } catch { return fallback; }
}

export default function DiscoveryPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const { toast } = useToast();
  const [activeInterview, setActiveInterview] = useState<number | null>(null);

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-border/50 bg-card/50 backdrop-blur-sm shrink-0">
        <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Compass className="w-5 h-5 text-[#d4a853]" />Discovery Wizard
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">Guided organizational analysis to generate tailored requirements</p>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-6">
          <Tabs defaultValue="profile" data-testid="discovery-tabs">
            <TabsList className="mb-4">
              <TabsTrigger value="profile" data-testid="tab-profile">Organization Profile</TabsTrigger>
              <TabsTrigger value="interviews" data-testid="tab-interviews">Process Interviews</TabsTrigger>
              <TabsTrigger value="painpoints" data-testid="tab-painpoints">Pain Points</TabsTrigger>
              <TabsTrigger value="generate" data-testid="tab-generate">Generate Requirements</TabsTrigger>
            </TabsList>

            <TabsContent value="profile">
              <OrgProfileTab projectId={projectId!} />
            </TabsContent>
            <TabsContent value="interviews">
              {activeInterview ? (
                <InterviewChat interviewId={activeInterview} projectId={projectId!} onBack={() => setActiveInterview(null)} />
              ) : (
                <InterviewList projectId={projectId!} onSelect={setActiveInterview} />
              )}
            </TabsContent>
            <TabsContent value="painpoints">
              <PainPointsTab projectId={projectId!} />
            </TabsContent>
            <TabsContent value="generate">
              <GenerateRequirementsTab projectId={projectId!} />
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  );
}

/* ==================== Tab 1: Organization Profile ==================== */

function OrgProfileTab({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const { data: profile } = useQuery<any>({
    queryKey: ["/api/projects", projectId, "org-profile"],
    queryFn: () => apiRequest("GET", `/api/projects/${projectId}/org-profile`).then(r => r.json()).catch(() => null),
  });

  const [entityType, setEntityType] = useState("__none__");
  const [entityName, setEntityName] = useState("");
  const [state, setState] = useState("");
  const [population, setPopulation] = useState("");
  const [employeeCount, setEmployeeCount] = useState("");
  const [annualBudget, setAnnualBudget] = useState("");
  const [painSummary, setPainSummary] = useState("");
  const [systems, setSystems] = useState<{ name: string; module: string; vendor: string; yearsInUse: string }[]>([]);
  const [departments, setDepartments] = useState<{ name: string; headcount: string }[]>([]);

  useEffect(() => {
    if (profile) {
      setEntityType(profile.entityType || "__none__");
      setEntityName(profile.entityName || "");
      setState(profile.state || "");
      setPopulation(profile.population?.toString() || "");
      setEmployeeCount(profile.employeeCount?.toString() || "");
      setAnnualBudget(profile.annualBudget || "");
      setPainSummary(profile.painSummary || "");
      setSystems(parseJsonSafe(profile.currentSystems, []));
      setDepartments(parseJsonSafe(profile.departments, []));
    }
  }, [profile]);

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/projects/${projectId}/org-profile`, {
      entityType: entityType === "__none__" ? null : entityType,
      entityName, state,
      population: population ? parseInt(population) : null,
      employeeCount: employeeCount ? parseInt(employeeCount) : null,
      annualBudget, painSummary,
      currentSystems: JSON.stringify(systems),
      departments: JSON.stringify(departments),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "org-profile"] });
      toast({ title: "Profile saved" });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const addSystem = () => setSystems(p => [...p, { name: "", module: "", vendor: "", yearsInUse: "" }]);
  const removeSystem = (i: number) => setSystems(p => p.filter((_, idx) => idx !== i));
  const updateSystem = (i: number, field: string, value: string) =>
    setSystems(p => p.map((s, idx) => idx === i ? { ...s, [field]: value } : s));

  const addDept = () => setDepartments(p => [...p, { name: "", headcount: "" }]);
  const removeDept = (i: number) => setDepartments(p => p.filter((_, idx) => idx !== i));
  const updateDept = (i: number, field: string, value: string) =>
    setDepartments(p => p.map((d, idx) => idx === i ? { ...d, [field]: value } : d));

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardContent className="p-5 space-y-4">
          <h3 className="text-sm font-semibold">Basic Information</h3>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Entity Type</label>
              <Select value={entityType} onValueChange={setEntityType}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-entity-type"><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" className="text-xs">Select type...</SelectItem>
                  {ENTITY_TYPES.map(t => <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Entity Name</label>
              <Input className="h-8 text-xs" value={entityName} onChange={e => setEntityName(e.target.value)} data-testid="input-entity-name" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">State</label>
              <Input className="h-8 text-xs" value={state} onChange={e => setState(e.target.value)} data-testid="input-state" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Population Served</label>
              <Input className="h-8 text-xs" type="number" value={population} onChange={e => setPopulation(e.target.value)} data-testid="input-population" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Employee Count</label>
              <Input className="h-8 text-xs" type="number" value={employeeCount} onChange={e => setEmployeeCount(e.target.value)} data-testid="input-employees" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Annual Budget</label>
              <Input className="h-8 text-xs" placeholder="e.g., $150M" value={annualBudget} onChange={e => setAnnualBudget(e.target.value)} data-testid="input-budget" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Key Challenges Summary</label>
            <Textarea className="text-xs min-h-[60px]" value={painSummary} onChange={e => setPainSummary(e.target.value)} data-testid="input-pain-summary" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Current Systems</h3>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addSystem} data-testid="btn-add-system">
              <Plus className="w-3 h-3" />Add System
            </Button>
          </div>
          {systems.map((s, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_80px_28px] gap-2 items-end">
              <div>
                {i === 0 && <label className="text-[10px] text-muted-foreground mb-0.5 block">Name</label>}
                <Input className="h-7 text-xs" value={s.name} onChange={e => updateSystem(i, "name", e.target.value)} data-testid={`sys-name-${i}`} />
              </div>
              <div>
                {i === 0 && <label className="text-[10px] text-muted-foreground mb-0.5 block">Module/Purpose</label>}
                <Input className="h-7 text-xs" value={s.module} onChange={e => updateSystem(i, "module", e.target.value)} data-testid={`sys-module-${i}`} />
              </div>
              <div>
                {i === 0 && <label className="text-[10px] text-muted-foreground mb-0.5 block">Vendor</label>}
                <Input className="h-7 text-xs" value={s.vendor} onChange={e => updateSystem(i, "vendor", e.target.value)} data-testid={`sys-vendor-${i}`} />
              </div>
              <div>
                {i === 0 && <label className="text-[10px] text-muted-foreground mb-0.5 block">Years</label>}
                <Input className="h-7 text-xs" value={s.yearsInUse} onChange={e => updateSystem(i, "yearsInUse", e.target.value)} data-testid={`sys-years-${i}`} />
              </div>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500" onClick={() => removeSystem(i)} data-testid={`sys-remove-${i}`}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))}
          {systems.length === 0 && <p className="text-xs text-muted-foreground">No systems added yet.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Departments</h3>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addDept} data-testid="btn-add-dept">
              <Plus className="w-3 h-3" />Add Department
            </Button>
          </div>
          {departments.map((d, i) => (
            <div key={i} className="grid grid-cols-[1fr_100px_28px] gap-2 items-end">
              <div>
                {i === 0 && <label className="text-[10px] text-muted-foreground mb-0.5 block">Department Name</label>}
                <Input className="h-7 text-xs" value={d.name} onChange={e => updateDept(i, "name", e.target.value)} data-testid={`dept-name-${i}`} />
              </div>
              <div>
                {i === 0 && <label className="text-[10px] text-muted-foreground mb-0.5 block">Headcount</label>}
                <Input className="h-7 text-xs" type="number" value={d.headcount} onChange={e => updateDept(i, "headcount", e.target.value)} data-testid={`dept-hc-${i}`} />
              </div>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500" onClick={() => removeDept(i)} data-testid={`dept-remove-${i}`}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))}
          {departments.length === 0 && <p className="text-xs text-muted-foreground">No departments added yet.</p>}
        </CardContent>
      </Card>

      <Button className="bg-[#d4a853] hover:bg-[#c49843] text-white gap-1.5" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="btn-save-profile">
        {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Save Profile
      </Button>
    </div>
  );
}

/* ==================== Tab 2: Interview List ==================== */

function InterviewList({ projectId, onSelect }: { projectId: string; onSelect: (id: number) => void }) {
  const { toast } = useToast();
  const { data: interviews = [] } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "discovery", "interviews"],
    queryFn: () => apiRequest("GET", `/api/projects/${projectId}/discovery/interviews`).then(r => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: (area: string) => apiRequest("POST", `/api/projects/${projectId}/discovery/interviews`, { functionalArea: area }).then(r => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "discovery", "interviews"] });
      onSelect(data.id);
    },
    onError: (e: any) => toast({ title: "Failed to start interview", description: e.message, variant: "destructive" }),
  });

  const interviewMap: Record<string, any> = {};
  for (const iv of interviews) interviewMap[iv.functionalArea] = iv;

  return (
    <div className="grid grid-cols-2 gap-3">
      {FUNCTIONAL_AREAS.map(area => {
        const iv = interviewMap[area];
        const status = iv?.status || "not_started";
        const msgs = parseJsonSafe(iv?.messages, []);
        const findings = parseJsonSafe(iv?.findings, null);
        return (
          <Card key={area} className="overflow-hidden" data-testid={`interview-card-${area.replace(/[^a-zA-Z]/g, "-").toLowerCase()}`}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h4 className="text-sm font-semibold">{area}</h4>
                  {iv?.interviewee && <p className="text-[10px] text-muted-foreground">{iv.interviewee}{iv.role ? ` — ${iv.role}` : ""}</p>}
                </div>
                <Badge className={`text-[10px] ${STATUS_STYLES[status]}`}>{status.replace(/_/g, " ")}</Badge>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground mb-3">
                {msgs.length > 0 && <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{msgs.length} messages</span>}
                {findings && <span className="flex items-center gap-1"><ClipboardList className="w-3 h-3" />Findings extracted</span>}
              </div>
              {status === "not_started" ? (
                <Button size="sm" className="h-7 text-xs bg-[#d4a853] hover:bg-[#c49843] text-white" onClick={() => createMutation.mutate(area)}
                  disabled={createMutation.isPending} data-testid={`btn-start-${area.replace(/[^a-zA-Z]/g, "-").toLowerCase()}`}>
                  Start Interview
                </Button>
              ) : status === "in_progress" ? (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onSelect(iv.id)} data-testid={`btn-continue-${area.replace(/[^a-zA-Z]/g, "-").toLowerCase()}`}>
                  Continue
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onSelect(iv.id)} data-testid={`btn-review-${area.replace(/[^a-zA-Z]/g, "-").toLowerCase()}`}>
                  Review
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/* ==================== Tab 2: Interview Chat ==================== */

function InterviewChat({ interviewId, projectId, onBack }: { interviewId: number; projectId: string; onBack: () => void }) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [completing, setCompleting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const initRef = useRef(false);

  const { data: interview, refetch } = useQuery<any>({
    queryKey: ["/api/discovery/interviews", interviewId],
    queryFn: () => apiRequest("GET", `/api/discovery/interviews/${interviewId}`).then(r => r.json()),
  });

  useEffect(() => {
    if (interview) {
      const msgs = parseJsonSafe(interview.messages, []);
      setMessages(msgs);
      // Auto-send first message to get AI greeting if no messages yet
      if (msgs.length === 0 && !initRef.current) {
        initRef.current = true;
        sendMessage("Hello, I'm ready to begin the discovery interview.");
      }
    }
  }, [interview?.id]); // only on interview load

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (streaming) return;
    setStreaming(true);
    const userMsg = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg, { role: "assistant", content: "" }]);
    setInput("");

    try {
      const res = await fetch(`${API_BASE}/api/discovery/interviews/${interviewId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok || !res.body) throw new Error("Stream failed");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "text" && data.text) {
                fullText += data.text;
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: "assistant", content: fullText };
                  return updated;
                });
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      toast({ title: "Interview error", description: err.message, variant: "destructive" });
    } finally {
      setStreaming(false);
      refetch();
    }
  };

  const handleComplete = async () => {
    setCompleting(true);
    try {
      await apiRequest("POST", `/api/discovery/interviews/${interviewId}/complete`);
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "discovery", "interviews"] });
      refetch();
      toast({ title: "Interview completed", description: "Findings have been extracted." });
    } catch (e: any) {
      toast({ title: "Completion failed", description: e.message, variant: "destructive" });
    } finally {
      setCompleting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !streaming) sendMessage(input.trim());
    }
  };

  const isCompleted = interview?.status === "completed";
  const findings = parseJsonSafe(interview?.findings, null);
  const painPoints = parseJsonSafe(interview?.painPoints, []);
  const processSteps = parseJsonSafe(interview?.processSteps, []);

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 220px)" }}>
      {/* Header */}
      <div className="flex items-center gap-3 pb-3 border-b border-border/50 mb-3 shrink-0">
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={onBack} data-testid="btn-back-interviews">
          <ArrowLeft className="w-3 h-3" />Back
        </Button>
        <div className="flex-1">
          <h3 className="text-sm font-semibold">{interview?.functionalArea}</h3>
          {interview?.interviewee && <p className="text-[10px] text-muted-foreground">{interview.interviewee}</p>}
        </div>
        {isCompleted ? (
          <Badge className={STATUS_STYLES.completed}>Completed</Badge>
        ) : (
          <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1" onClick={handleComplete}
            disabled={completing || messages.length < 4} data-testid="btn-complete-interview">
            {completing ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
            Complete Interview
          </Button>
        )}
      </div>

      {/* Completed findings view */}
      {isCompleted && findings && (
        <div className="space-y-4 mb-4 shrink-0">
          {processSteps.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h4 className="text-xs font-semibold mb-2">Process Steps</h4>
                <div className="flex items-center gap-1 overflow-x-auto pb-2">
                  {processSteps.map((s: any, i: number) => (
                    <div key={i} className="flex items-center gap-1 shrink-0">
                      <div className="w-7 h-7 rounded-full bg-[#d4a853]/20 text-[#d4a853] flex items-center justify-center text-[10px] font-bold">{s.step || i + 1}</div>
                      <div className="text-[10px] max-w-[120px]">
                        <p className="font-medium truncate">{s.description}</p>
                        {s.system && <span className="text-muted-foreground">{s.system}</span>}
                      </div>
                      {i < processSteps.length - 1 && <span className="text-muted-foreground/40 mx-1">&rarr;</span>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          {painPoints.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {painPoints.map((pp: any, i: number) => (
                <div key={i} className={`border-l-4 rounded-r p-3 ${SEVERITY_COLORS[pp.severity] || SEVERITY_COLORS.low}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className={`text-[9px] ${STATUS_STYLES[pp.severity === "critical" ? "completed" : "in_progress"] || STATUS_STYLES.not_started}`}>
                      {pp.severity}
                    </Badge>
                    {pp.frequency && <span className="text-[10px] text-muted-foreground">{pp.frequency}</span>}
                  </div>
                  <p className="text-xs">{pp.description}</p>
                  {pp.impact && <p className="text-[10px] text-muted-foreground mt-1">{pp.impact}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Chat messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[75%] rounded-lg px-3 py-2 text-xs whitespace-pre-wrap ${
              m.role === "user"
                ? "bg-[#1a2332] text-white dark:bg-[#1a2332]"
                : "bg-muted text-foreground"
            }`}>
              {m.content || (streaming && i === messages.length - 1 && (
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#d4a853] animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#d4a853] animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#d4a853] animate-bounce" style={{ animationDelay: "300ms" }} />
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      {!isCompleted && (
        <div className="flex items-end gap-2 pt-3 border-t border-border/50 mt-3 shrink-0">
          <Textarea className="text-xs min-h-[36px] max-h-[120px] flex-1" placeholder="Type your response..."
            value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} disabled={streaming} data-testid="input-interview-msg" />
          <Button size="sm" className="h-9 w-9 p-0 bg-[#d4a853] hover:bg-[#c49843] text-white shrink-0" disabled={!input.trim() || streaming}
            onClick={() => sendMessage(input.trim())} data-testid="btn-send-interview">
            {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      )}
    </div>
  );
}

/* ==================== Tab 3: Pain Points ==================== */

const SEV_BADGE: Record<string, string> = {
  critical: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  high: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  medium: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  low: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

const FREQ_BADGE: Record<string, string> = {
  daily: "border-red-400 text-red-600 dark:border-red-600 dark:text-red-400",
  weekly: "border-amber-400 text-amber-600 dark:border-amber-600 dark:text-amber-400",
  monthly: "border-blue-400 text-blue-600 dark:border-blue-600 dark:text-blue-400",
  quarterly: "border-gray-400 text-gray-600 dark:border-gray-600 dark:text-gray-400",
  annual: "border-gray-400 text-gray-600 dark:border-gray-600 dark:text-gray-400",
};

function PainPointsTab({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const [areaFilter, setAreaFilter] = useState("__all__");
  const [sevFilter, setSevFilter] = useState("__all__");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [priorities, setPriorities] = useState<Record<number, number>>({});
  const [dirty, setDirty] = useState(false);

  const { data: painPoints = [] } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "discovery", "pain-points"],
    queryFn: () => apiRequest("GET", `/api/projects/${projectId}/discovery/pain-points`).then(r => r.json()),
  });

  useEffect(() => {
    const m: Record<number, number> = {};
    for (const pp of painPoints) if (pp.stakeholderPriority != null) m[pp.id] = pp.stakeholderPriority;
    setPriorities(m);
  }, [painPoints]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const updates = Object.entries(priorities).map(([id, priority]) => ({ id: parseInt(id), priority }));
      return apiRequest("POST", `/api/projects/${projectId}/discovery/pain-points/prioritize`, { updates });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "discovery", "pain-points"] });
      setDirty(false);
      toast({ title: "Priorities saved" });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  if (painPoints.length === 0) {
    return (
      <div className="text-center py-16">
        <AlertTriangle className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">Complete at least one process interview to identify pain points.</p>
      </div>
    );
  }

  const areas = [...new Set(painPoints.map((p: any) => p.functionalArea))];
  const filtered = painPoints
    .filter((p: any) => areaFilter === "__all__" || p.functionalArea === areaFilter)
    .filter((p: any) => sevFilter === "__all__" || p.severity === sevFilter)
    .sort((a: any, b: any) => (priorities[b.id] || 0) - (priorities[a.id] || 0));

  const critHigh = painPoints.filter((p: any) => p.severity === "critical" || p.severity === "high").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{painPoints.length}</span> pain points across{" "}
          <span className="font-semibold text-foreground">{areas.length}</span> functional areas.{" "}
          <span className="font-semibold text-red-600 dark:text-red-400">{critHigh}</span> rated critical or high.
        </p>
        <Button size="sm" className="h-7 text-xs bg-[#d4a853] hover:bg-[#c49843] text-white gap-1" onClick={() => saveMutation.mutate()}
          disabled={!dirty || saveMutation.isPending} data-testid="btn-save-priorities">
          {saveMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          Save Priorities
        </Button>
      </div>

      <div className="flex gap-2">
        <Select value={areaFilter} onValueChange={setAreaFilter}>
          <SelectTrigger className="h-8 text-xs w-48" data-testid="filter-area"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__" className="text-xs">All Areas</SelectItem>
            {areas.map(a => <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sevFilter} onValueChange={setSevFilter}>
          <SelectTrigger className="h-8 text-xs w-40" data-testid="filter-severity"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__" className="text-xs">All Severities</SelectItem>
            {["critical", "high", "medium", "low"].map(s => <SelectItem key={s} value={s} className="text-xs capitalize">{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs w-[140px]">Area</TableHead>
              <TableHead className="text-xs">Description</TableHead>
              <TableHead className="text-xs w-[90px]">Severity</TableHead>
              <TableHead className="text-xs w-[90px]">Frequency</TableHead>
              <TableHead className="text-xs w-[180px]">Impact</TableHead>
              <TableHead className="text-xs w-[70px]">Priority</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((pp: any) => (
              <Collapsible key={pp.id} open={expandedId === pp.id} onOpenChange={(open) => setExpandedId(open ? pp.id : null)} asChild>
                <>
                  <CollapsibleTrigger asChild>
                    <TableRow className="cursor-pointer hover:bg-muted/50" data-testid={`pp-row-${pp.id}`}>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{pp.functionalArea}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{pp.description}</TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] ${SEV_BADGE[pp.severity] || SEV_BADGE.low}`}>{pp.severity}</Badge>
                      </TableCell>
                      <TableCell>
                        {pp.frequency && <Badge variant="outline" className={`text-[10px] ${FREQ_BADGE[pp.frequency] || FREQ_BADGE.quarterly}`}>{pp.frequency}</Badge>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground truncate max-w-[180px]">{pp.impact}</TableCell>
                      <TableCell>
                        <Input type="number" min={1} max={10} className="h-6 w-14 text-xs text-center"
                          value={priorities[pp.id] ?? ""} data-testid={`pp-priority-${pp.id}`}
                          onClick={e => e.stopPropagation()}
                          onChange={e => { setPriorities(p => ({ ...p, [pp.id]: parseInt(e.target.value) || 0 })); setDirty(true); }} />
                      </TableCell>
                    </TableRow>
                  </CollapsibleTrigger>
                  <CollapsibleContent asChild>
                    <TableRow className="bg-muted/30">
                      <TableCell colSpan={6} className="py-3">
                        <div className="grid grid-cols-3 gap-4 text-xs">
                          <div>
                            <p className="font-semibold text-[10px] text-muted-foreground mb-1">Full Impact</p>
                            <p>{pp.impact || "—"}</p>
                          </div>
                          <div>
                            <p className="font-semibold text-[10px] text-muted-foreground mb-1">Current Workaround</p>
                            <p>{pp.currentWorkaround || "None documented"}</p>
                          </div>
                          <div>
                            <p className="font-semibold text-[10px] text-muted-foreground mb-1">Source</p>
                            <p>Interview #{pp.sourceInterviewId || "—"} — {pp.functionalArea}</p>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  </CollapsibleContent>
                </>
              </Collapsible>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/* ==================== Tab 4: Generate Requirements ==================== */

const LOADING_MESSAGES = [
  "Analyzing discovery findings...",
  "Cross-referencing vendor capabilities...",
  "Generating tailored requirements...",
  "Building evidence chain...",
];

function GenerateRequirementsTab({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);

  const { data: summary } = useQuery<any>({
    queryKey: ["/api/projects", projectId, "discovery", "summary"],
    queryFn: () => apiRequest("GET", `/api/projects/${projectId}/discovery/summary`).then(r => r.json()),
  });

  const generateMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/projects/${projectId}/discovery/generate-requirements`).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "discovery", "summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "generated-reqs"] });
      toast({ title: "Requirements generated", description: "AI-generated requirements are ready for review." });
    },
    onError: (e: any) => toast({ title: "Generation failed", description: e.message, variant: "destructive" }),
  });

  // Cycle loading messages while generating
  useEffect(() => {
    if (!generateMutation.isPending) return;
    const interval = setInterval(() => setLoadingMsgIdx(i => (i + 1) % LOADING_MESSAGES.length), 3000);
    return () => clearInterval(interval);
  }, [generateMutation.isPending]);

  const { data: genReqsData } = useQuery<any>({
    queryKey: ["/api/projects", projectId, "generated-reqs"],
    queryFn: () => apiRequest("GET", `/api/projects/${projectId}/requirements?functionalArea=&category=Discovery`).then(r => r.json()).catch(() => []),
    enabled: !!summary && summary.generatedRequirements > 0,
  });

  const interviewsCompleted = summary?.interviews?.completed || 0;
  const interviewsTotal = summary?.interviews?.total || FUNCTIONAL_AREAS.length;
  const ppTotal = summary?.painPoints?.total || 0;
  const ppCritical = summary?.painPoints?.bySeverity?.critical || 0;
  const genReqCount = summary?.generatedRequirements || 0;
  const reqs: any[] = genReqsData || [];

  // Group reqs by module
  const grouped: Record<string, any[]> = {};
  for (const r of reqs) {
    const mod = r.functionalArea || "General";
    if (!grouped[mod]) grouped[mod] = [];
    grouped[mod].push(r);
  }

  const handleAccept = () => {
    toast({ title: "Requirements loaded", description: `${reqs.length} requirements added to your project.` });
    setLocation(`/projects/${projectId}`);
  };

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card data-testid="stat-interviews">
          <CardContent className="p-4 text-center">
            <BarChart3 className="w-6 h-6 mx-auto text-blue-500 mb-1" />
            <p className="text-2xl font-bold">{interviewsCompleted} <span className="text-sm font-normal text-muted-foreground">of {interviewsTotal}</span></p>
            <p className="text-xs text-muted-foreground">Interviews Completed</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-painpoints">
          <CardContent className="p-4 text-center">
            <AlertTriangle className="w-6 h-6 mx-auto text-amber-500 mb-1" />
            <p className="text-2xl font-bold">{ppTotal} {ppCritical > 0 && <span className="text-sm font-normal text-red-500">({ppCritical} critical)</span>}</p>
            <p className="text-xs text-muted-foreground">Pain Points Identified</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-requirements">
          <CardContent className="p-4 text-center">
            <FileText className="w-6 h-6 mx-auto text-emerald-500 mb-1" />
            <p className="text-2xl font-bold">{genReqCount > 0 ? genReqCount : <span className="text-sm font-normal text-muted-foreground">Not yet generated</span>}</p>
            <p className="text-xs text-muted-foreground">Requirements Generated</p>
          </CardContent>
        </Card>
      </div>

      {/* No interviews yet */}
      {interviewsCompleted === 0 && (
        <div className="text-center py-12">
          <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">Complete discovery interviews first to generate requirements.</p>
        </div>
      )}

      {/* Generate button */}
      {interviewsCompleted > 0 && genReqCount === 0 && !generateMutation.isPending && (
        <div className="text-center py-12">
          <Button size="lg" className="bg-[#d4a853] hover:bg-[#c49843] text-white gap-2 text-base px-8 py-6" onClick={() => generateMutation.mutate()}
            data-testid="btn-generate-requirements">
            <Sparkles className="w-5 h-5" />Generate Requirements
          </Button>
          <p className="text-xs text-muted-foreground mt-3 max-w-md mx-auto">
            AI will analyze your discovery findings and vendor knowledge base to generate tailored requirements.
          </p>
        </div>
      )}

      {/* Loading state */}
      {generateMutation.isPending && (
        <div className="text-center py-12">
          <Loader2 className="w-10 h-10 mx-auto text-[#d4a853] animate-spin mb-4" />
          <p className="text-sm font-medium text-foreground animate-pulse">{LOADING_MESSAGES[loadingMsgIdx]}</p>
        </div>
      )}

      {/* Generated requirements */}
      {genReqCount > 0 && Object.keys(grouped).length > 0 && (
        <div className="space-y-4">
          {Object.entries(grouped).map(([mod, items]) => (
            <Card key={mod}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Target className="w-4 h-4 text-[#d4a853]" />
                  <h4 className="text-sm font-semibold">{mod}</h4>
                  <Badge variant="outline" className="text-[10px]">{items.length}</Badge>
                </div>
                <div className="space-y-2">
                  {items.map((r: any) => {
                    const comments = r.comments || "";
                    const justMatch = comments.match(/Justification:\s*(.*?)(?:\nLinked|$)/s);
                    const painMatch = comments.match(/Linked pain point:\s*(.+)/);
                    return (
                      <div key={r.id} className="border rounded p-3" data-testid={`gen-req-${r.id}`}>
                        <div className="flex items-start gap-2">
                          <Badge className="text-[9px] shrink-0 mt-0.5" variant="outline">{r.reqNumber}</Badge>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs">{r.description}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge className={`text-[9px] ${r.criticality === "Critical" ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400" : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"}`}>
                                {r.criticality}
                              </Badge>
                              {painMatch && <span className="text-[10px] text-muted-foreground">Pain point: {painMatch[1]}</span>}
                            </div>
                            {justMatch && <p className="text-[10px] text-muted-foreground italic mt-1">{justMatch[1].trim()}</p>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-muted-foreground">{reqs.length} total requirements generated</p>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5" onClick={handleAccept} data-testid="btn-accept-requirements">
              <CheckCircle className="w-4 h-4" />Accept & Load into Project
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
