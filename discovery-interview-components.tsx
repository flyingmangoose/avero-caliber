/**
 * discovery-interview-components.tsx
 *
 * Drop-in replacements for InterviewList (lines 278-338) and InterviewChat (lines 342-530)
 * in discovery.tsx. Export both as named exports.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ADD THESE IMPORTS to discovery.tsx (they are NOT yet in the parent file):
 *
 *   import { Progress } from "@/components/ui/progress";
 *   import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
 *   import { ChevronRight, Edit2, Upload, Check, SkipForward, AlertCircle, X } from "lucide-react";
 *    → append AlertCircle, Check, ChevronRight, Edit2, SkipForward, Upload, X
 *      to the existing lucide-react import line.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Additional imports — add these to discovery.tsx
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ChevronRight,
  Edit2,
  Upload,
  Check,
  SkipForward,
  AlertCircle,
  X,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface GuideQuestion {
  id: string;
  category: string;
  question: string;
  probes: string[];
  whatToListenFor: string;
}

interface GuideAnswer {
  answer: string;
  status: "answered" | "skipped" | "follow_up";
  keyPoints: string[];
  painPoints: string[];
  followUpNeeded: boolean;
  source: "manual" | "transcript";
}

interface InterviewData {
  id: number;
  functionalArea: string;
  interviewee?: string;
  role?: string;
  status: string;
  messages?: any;
  findings?: any;
  painPoints?: any;
  processSteps?: any;
}

interface GuideData {
  guide: GuideQuestion[];
  answers: Record<string, GuideAnswer>;
  additionalFindings: string[];
  transcriptImported?: boolean;
}

// ─── Category color map ───────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  "Current State":  "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  "Day-to-Day":     "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  "Pain Points":    "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  "Volume":         "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400",
  "Integrations":   "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400",
  "Future State":   "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-400",
};

function categoryColor(cat: string): string {
  return CATEGORY_COLORS[cat] ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
}

// ─── QuestionCard ─────────────────────────────────────────────────────────────

interface QuestionCardProps {
  question: GuideQuestion;
  index: number;
  answer: GuideAnswer | undefined;
  readOnly: boolean;
  onSave: (qId: string, answer: string, status: GuideAnswer["status"]) => void;
}

function QuestionCard({ question, index, answer, readOnly, onSave }: QuestionCardProps) {
  const [localAnswer, setLocalAnswer] = useState(answer?.answer ?? "");
  const [localStatus, setLocalStatus] = useState<GuideAnswer["status"]>(answer?.status ?? "answered");
  const [editing, setEditing] = useState(!answer);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep local state in sync when props change (e.g. after transcript import)
  useEffect(() => {
    setLocalAnswer(answer?.answer ?? "");
    setLocalStatus(answer?.status ?? "answered");
    if (answer) setEditing(false);
  }, [answer?.answer, answer?.status]);

  const handleBlur = () => {
    if (readOnly) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (localAnswer.trim()) onSave(question.id, localAnswer, localStatus);
    }, 400);
  };

  const handleSave = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (localAnswer.trim()) {
      onSave(question.id, localAnswer, localStatus);
      setEditing(false);
    }
  };

  const statusOptions: { value: GuideAnswer["status"]; label: string; icon: React.ReactNode }[] = [
    { value: "answered",   label: "Answered",       icon: <Check className="w-3 h-3" /> },
    { value: "skipped",    label: "Skipped",         icon: <SkipForward className="w-3 h-3" /> },
    { value: "follow_up",  label: "Follow-up needed", icon: <AlertCircle className="w-3 h-3" /> },
  ];

  const isFromTranscript = answer?.source === "transcript";

  return (
    <Card
      className="overflow-hidden border border-border/60"
      data-testid={`question-card-${question.id}`}
    >
      <CardContent className="p-4 space-y-3">
        {/* Question header */}
        <div className="flex items-start gap-3">
          <span className="shrink-0 w-6 h-6 rounded-full bg-[#1a2744] text-white flex items-center justify-center text-[10px] font-bold mt-0.5">
            {index + 1}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Badge className={`text-[10px] ${categoryColor(question.category)}`}>
                {question.category}
              </Badge>
            </div>
            <p className="text-sm font-semibold text-foreground leading-snug">
              {question.question}
            </p>
          </div>
        </div>

        {/* Collapsible probes + hints */}
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            data-testid={`btn-probes-${question.id}`}
          >
            <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
            {open ? "Hide" : "Show"} follow-up probes &amp; hints
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-2 pl-1">
            {question.probes.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Follow-up probes
                </p>
                <ul className="space-y-0.5">
                  {question.probes.map((p, pi) => (
                    <li key={pi} className="text-xs text-foreground/80 flex gap-1.5">
                      <span className="text-[#d4a853] mt-0.5">›</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {question.whatToListenFor && (
              <p className="text-[11px] italic text-muted-foreground border-l-2 border-[#d4a853]/40 pl-2">
                {question.whatToListenFor}
              </p>
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* Answer area */}
        <div className="space-y-2">
          {!editing && answer ? (
            <div className="relative rounded-md bg-muted/50 border border-border/40 p-3">
              {isFromTranscript && (
                <Badge className="text-[9px] mb-2 bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400">
                  From transcript
                </Badge>
              )}
              <p className="text-xs text-foreground whitespace-pre-wrap">{answer.answer}</p>
              {answer.keyPoints.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {answer.keyPoints.map((kp, i) => (
                    <span
                      key={i}
                      className="inline-block text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400"
                    >
                      {kp}
                    </span>
                  ))}
                </div>
              )}
              {answer.painPoints.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {answer.painPoints.map((pp, i) => (
                    <span
                      key={i}
                      className="inline-block text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                    >
                      ⚠ {pp}
                    </span>
                  ))}
                </div>
              )}
              {!readOnly && (
                <button
                  className="absolute top-2 right-2 p-1 rounded hover:bg-border/60 text-muted-foreground"
                  onClick={() => setEditing(true)}
                  data-testid={`btn-edit-${question.id}`}
                  title="Edit answer"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ) : !readOnly ? (
            <Textarea
              className="text-xs min-h-[80px] resize-none focus:ring-[#d4a853]/50"
              placeholder="Type the client's response or key notes…"
              value={localAnswer}
              onChange={e => setLocalAnswer(e.target.value)}
              onBlur={handleBlur}
              data-testid={`textarea-answer-${question.id}`}
            />
          ) : (
            <p className="text-xs text-muted-foreground italic">No answer recorded.</p>
          )}
        </div>

        {/* Status + Save */}
        {!readOnly && (
          <div className="flex items-center justify-between gap-2 flex-wrap">
            {/* Status toggle */}
            <div className="flex rounded-md overflow-hidden border border-border/60 shrink-0">
              {statusOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setLocalStatus(opt.value)}
                  className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium transition-colors ${
                    localStatus === opt.value
                      ? opt.value === "answered"
                        ? "bg-emerald-600 text-white"
                        : opt.value === "follow_up"
                        ? "bg-amber-500 text-white"
                        : "bg-gray-500 text-white"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  }`}
                  data-testid={`btn-status-${opt.value}-${question.id}`}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              ))}
            </div>

            {editing && localAnswer.trim() && (
              <Button
                size="sm"
                className="h-7 text-[10px] bg-[#1a2744] hover:bg-[#1a2744]/90 text-white"
                onClick={handleSave}
                data-testid={`btn-save-${question.id}`}
              >
                Save
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Import Transcript Dialog ─────────────────────────────────────────────────

interface ImportTranscriptDialogProps {
  interviewId: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported: () => void;
}

function ImportTranscriptDialog({
  interviewId,
  open,
  onOpenChange,
  onImported,
}: ImportTranscriptDialogProps) {
  const { toast } = useToast();
  const [transcript, setTranscript] = useState("");
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{ answers: number; followUps: number } | null>(null);

  const handleProcess = async () => {
    if (!transcript.trim()) return;
    setProcessing(true);
    setResult(null);
    try {
      const res = await apiRequest(
        "POST",
        `/api/discovery/interviews/${interviewId}/import-transcript`,
        { transcript }
      );
      const data = await res.json();
      const answers = Array.isArray(data.answers) ? data.answers.length : 0;
      const followUps = Array.isArray(data.answers)
        ? data.answers.filter((a: any) => a.followUpNeeded).length
        : 0;
      setResult({ answers, followUps });
      queryClient.invalidateQueries({ queryKey: ["/api/discovery/interviews", interviewId] });
      toast({ title: "Transcript imported", description: `${answers} answers extracted.` });
      onImported();
    } catch (e: any) {
      toast({ title: "Import failed", description: e.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const handleClose = () => {
    setTranscript("");
    setResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); else onOpenChange(v); }}>
      <DialogContent className="max-w-2xl w-full" data-testid="dialog-import-transcript">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <Upload className="w-4 h-4 text-[#d4a853]" />
            Import Meeting Notes
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Paste your transcript from Fireflies, Otter, or other meeting capture tools. AI will
            extract answers and map them to interview questions.
          </p>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea
            className="text-xs min-h-[200px] resize-none font-mono"
            placeholder="Paste transcript here…"
            value={transcript}
            onChange={e => setTranscript(e.target.value)}
            disabled={processing}
            data-testid="textarea-transcript"
          />

          {result && (
            <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3 text-xs text-emerald-700 dark:text-emerald-400">
              <CheckCircle className="w-3.5 h-3.5 inline mr-1" />
              <strong>{result.answers} answers extracted</strong>
              {result.followUps > 0 && `, ${result.followUps} follow-ups flagged`}.
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={handleClose}
              data-testid="btn-cancel-import"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs bg-[#d4a853] hover:bg-[#c49843] text-white"
              onClick={handleProcess}
              disabled={!transcript.trim() || processing}
              data-testid="btn-process-transcript"
            >
              {processing ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                  Processing…
                </>
              ) : (
                "Process Transcript"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── InterviewList ─────────────────────────────────────────────────────────────

export function InterviewList({
  projectId,
  onSelect,
}: {
  projectId: string;
  onSelect: (id: number) => void;
}) {
  const { toast } = useToast();
  const { data: interviews = [] } = useQuery<InterviewData[]>({
    queryKey: ["/api/projects", projectId, "discovery", "interviews"],
    queryFn: () =>
      apiRequest("GET", `/api/projects/${projectId}/discovery/interviews`).then(r => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: (area: string) =>
      apiRequest("POST", `/api/projects/${projectId}/discovery/interviews`, {
        functionalArea: area,
      }).then(r => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", projectId, "discovery", "interviews"],
      });
      onSelect(data.id);
    },
    onError: (e: any) =>
      toast({ title: "Failed to create interview", description: e.message, variant: "destructive" }),
  });

  const interviewMap: Record<string, InterviewData> = {};
  for (const iv of interviews) interviewMap[iv.functionalArea] = iv;

  return (
    <div className="grid grid-cols-2 gap-3">
      {FUNCTIONAL_AREAS.map(area => {
        const iv = interviewMap[area];
        const status = iv?.status || "not_started";
        const guideData = parseJsonSafe<GuideData>(iv?.messages, {
          guide: [],
          answers: {},
          additionalFindings: [],
        });
        const totalQ = guideData.guide.length;
        const answeredQ = Object.values(guideData.answers).filter(
          a => a.status === "answered"
        ).length;
        const findings = parseJsonSafe(iv?.findings, null);
        const slugArea = area.replace(/[^a-zA-Z]/g, "-").toLowerCase();

        return (
          <Card
            key={area}
            className="overflow-hidden"
            data-testid={`interview-card-${slugArea}`}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h4 className="text-sm font-semibold">{area}</h4>
                  {iv?.interviewee && (
                    <p className="text-[10px] text-muted-foreground">
                      {iv.interviewee}
                      {iv.role ? ` — ${iv.role}` : ""}
                    </p>
                  )}
                </div>
                <Badge className={`text-[10px] ${STATUS_STYLES[status]}`}>
                  {status.replace(/_/g, " ")}
                </Badge>
              </div>

              {/* Progress indicator */}
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground mb-3">
                {totalQ > 0 ? (
                  <span className="flex items-center gap-1">
                    <ClipboardList className="w-3 h-3" />
                    {answeredQ} of {totalQ} questions answered
                  </span>
                ) : status !== "not_started" ? (
                  <span className="flex items-center gap-1">
                    <ClipboardList className="w-3 h-3" />
                    No guide generated yet
                  </span>
                ) : null}
                {findings && (
                  <span className="flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    Findings extracted
                  </span>
                )}
              </div>

              {status === "not_started" ? (
                <Button
                  size="sm"
                  className="h-7 text-xs bg-[#d4a853] hover:bg-[#c49843] text-white gap-1"
                  onClick={() => createMutation.mutate(area)}
                  disabled={createMutation.isPending}
                  data-testid={`btn-generate-guide-${slugArea}`}
                >
                  {createMutation.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3" />
                  )}
                  Generate Interview Guide
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => onSelect(iv.id)}
                  data-testid={`btn-open-${slugArea}`}
                >
                  Open Interview
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─── GuidedInterview ──────────────────────────────────────────────────────────

export function GuidedInterview({
  interviewId,
  projectId,
  onBack,
}: {
  interviewId: number;
  projectId: string;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const [importOpen, setImportOpen] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [generatingGuide, setGeneratingGuide] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editingRole, setEditingRole] = useState(false);
  const [intervieweeName, setIntervieweeName] = useState("");
  const [intervieweeRole, setIntervieweeRole] = useState("");

  // ── Data fetch ──────────────────────────────────────────────────────────────
  const { data: interview, refetch } = useQuery<InterviewData>({
    queryKey: ["/api/discovery/interviews", interviewId],
    queryFn: () =>
      apiRequest("GET", `/api/discovery/interviews/${interviewId}`).then(r => r.json()),
  });

  // Sync editable name/role from fetched data
  useEffect(() => {
    if (interview) {
      setIntervieweeName(prev => prev || interview.interviewee || "");
      setIntervieweeRole(prev => prev || interview.role || "");
    }
  }, [interview?.id]);

  // ── Derived data ────────────────────────────────────────────────────────────
  const guideData = parseJsonSafe<GuideData>(interview?.messages, {
    guide: [],
    answers: {},
    additionalFindings: [],
  });

  const guide = guideData.guide;
  const answers = guideData.answers;
  const additionalFindings = guideData.additionalFindings;
  const isCompleted = interview?.status === "completed";
  const findings = parseJsonSafe(interview?.findings, null);
  const painPoints = parseJsonSafe<any[]>(interview?.painPoints, []);
  const processSteps = parseJsonSafe<any[]>(interview?.processSteps, []);

  const totalQ = guide.length;
  const answeredQ = Object.values(answers).filter(a => a.status === "answered").length;
  const progressPct = totalQ > 0 ? Math.round((answeredQ / totalQ) * 100) : 0;

  // ── Save answer mutation ────────────────────────────────────────────────────
  const saveAnswerMutation = useMutation({
    mutationFn: (payload: { questionId: string; answer: string; status: GuideAnswer["status"] }) =>
      apiRequest("POST", `/api/discovery/interviews/${interviewId}/save-answer`, payload).then(r =>
        r.json()
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/discovery/interviews", interviewId] });
      refetch();
    },
    onError: (e: any) =>
      toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const handleSaveAnswer = useCallback(
    (qId: string, answer: string, status: GuideAnswer["status"]) => {
      saveAnswerMutation.mutate({ questionId: qId, answer, status });
    },
    [saveAnswerMutation]
  );

  // ── Generate guide ──────────────────────────────────────────────────────────
  const handleGenerateGuide = async () => {
    setGeneratingGuide(true);
    try {
      await apiRequest("POST", `/api/discovery/interviews/${interviewId}/generate-guide`);
      queryClient.invalidateQueries({ queryKey: ["/api/discovery/interviews", interviewId] });
      await refetch();
      toast({ title: "Interview guide generated" });
    } catch (e: any) {
      toast({ title: "Generation failed", description: e.message, variant: "destructive" });
    } finally {
      setGeneratingGuide(false);
    }
  };

  // ── Complete interview ───────────────────────────────────────────────────────
  const handleComplete = async () => {
    setCompleting(true);
    try {
      await apiRequest("POST", `/api/discovery/interviews/${interviewId}/complete`);
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", projectId, "discovery", "interviews"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/discovery/interviews", interviewId] });
      await refetch();
      toast({ title: "Interview completed", description: "Findings have been extracted." });
    } catch (e: any) {
      toast({ title: "Completion failed", description: e.message, variant: "destructive" });
    } finally {
      setCompleting(false);
    }
  };

  // ── ALL hooks before any early return ───────────────────────────────────────
  // (none below this point)

  return (
    <div className="flex flex-col" style={{ minHeight: "calc(100vh - 220px)" }}>
      {/* ── Header Bar ── */}
      <div className="flex items-center gap-3 pb-3 border-b border-border/50 mb-4 shrink-0 flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1 shrink-0"
          onClick={onBack}
          data-testid="btn-back-interviews"
        >
          <ArrowLeft className="w-3 h-3" />
          Back
        </Button>

        {/* Functional area + interviewee */}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground truncate">
            {interview?.functionalArea}
          </h3>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground flex-wrap">
            {/* Editable name */}
            {editingName ? (
              <input
                autoFocus
                className="text-[10px] border-b border-[#d4a853] outline-none bg-transparent"
                value={intervieweeName}
                onChange={e => setIntervieweeName(e.target.value)}
                onBlur={() => setEditingName(false)}
                onKeyDown={e => e.key === "Enter" && setEditingName(false)}
                data-testid="input-interviewee-name"
                placeholder="Interviewee name"
              />
            ) : (
              <button
                className="hover:underline"
                onClick={() => setEditingName(true)}
                data-testid="btn-edit-name"
              >
                {intervieweeName || "Add name"}
              </button>
            )}
            {intervieweeName && (
              <>
                <span className="mx-0.5">—</span>
                {/* Editable role */}
                {editingRole ? (
                  <input
                    autoFocus
                    className="text-[10px] border-b border-[#d4a853] outline-none bg-transparent"
                    value={intervieweeRole}
                    onChange={e => setIntervieweeRole(e.target.value)}
                    onBlur={() => setEditingRole(false)}
                    onKeyDown={e => e.key === "Enter" && setEditingRole(false)}
                    data-testid="input-interviewee-role"
                    placeholder="Role / title"
                  />
                ) : (
                  <button
                    className="hover:underline"
                    onClick={() => setEditingRole(true)}
                    data-testid="btn-edit-role"
                  >
                    {intervieweeRole || "Add role"}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Progress */}
        {totalQ > 0 && (
          <div className="flex items-center gap-2 shrink-0 min-w-[160px]">
            <div className="flex-1">
              <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                <span>{answeredQ} of {totalQ} answered</span>
                <span>{progressPct}%</span>
              </div>
              <Progress value={progressPct} className="h-1.5" data-testid="progress-bar" />
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {!isCompleted && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={() => setImportOpen(true)}
              data-testid="btn-import-transcript"
            >
              <Upload className="w-3 h-3" />
              Import Transcript
            </Button>
          )}
          {!isCompleted && guide.length > 0 && (
            <Button
              size="sm"
              className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleComplete}
              disabled={completing}
              data-testid="btn-complete-interview"
            >
              {completing ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <CheckCircle className="w-3 h-3" />
              )}
              Complete Interview
            </Button>
          )}
          <Badge
            className={`text-[10px] ${STATUS_STYLES[interview?.status ?? "not_started"]}`}
            data-testid="badge-status"
          >
            {(interview?.status ?? "not_started").replace(/_/g, " ")}
          </Badge>
        </div>
      </div>

      {/* ── No guide yet → Generate prompt ── */}
      {guide.length === 0 && !generatingGuide && (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <div className="w-14 h-14 rounded-full bg-[#d4a853]/10 flex items-center justify-center">
            <Sparkles className="w-7 h-7 text-[#d4a853]" />
          </div>
          <div>
            <h4 className="text-sm font-semibold mb-1">No interview guide yet</h4>
            <p className="text-xs text-muted-foreground max-w-xs">
              Generate a tailored set of discovery questions for this functional area. Takes 5–10
              seconds.
            </p>
          </div>
          <Button
            size="sm"
            className="gap-1.5 bg-[#d4a853] hover:bg-[#c49843] text-white"
            onClick={handleGenerateGuide}
            data-testid="btn-generate-guide"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Generate Interview Guide
          </Button>
        </div>
      )}

      {/* ── Guide generating spinner ── */}
      {generatingGuide && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#d4a853]" />
          <p className="text-sm text-muted-foreground">Generating interview guide…</p>
          <p className="text-[10px] text-muted-foreground">This may take 5–10 seconds</p>
        </div>
      )}

      {/* ── Completed findings ── */}
      {isCompleted && findings && (
        <div className="space-y-4 mb-6 shrink-0">
          {processSteps.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h4 className="text-xs font-semibold mb-2">Process Steps</h4>
                <div className="flex items-center gap-1 overflow-x-auto pb-2">
                  {processSteps.map((s: any, i: number) => (
                    <div key={i} className="flex items-center gap-1 shrink-0">
                      <div className="w-7 h-7 rounded-full bg-[#d4a853]/20 text-[#d4a853] flex items-center justify-center text-[10px] font-bold">
                        {s.step || i + 1}
                      </div>
                      <div className="text-[10px] max-w-[120px]">
                        <p className="font-medium truncate">{s.description}</p>
                        {s.system && (
                          <span className="text-muted-foreground">{s.system}</span>
                        )}
                      </div>
                      {i < processSteps.length - 1 && (
                        <ChevronRight className="w-3 h-3 text-muted-foreground/40 mx-0.5 shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {painPoints.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold mb-2">Pain Points Extracted</h4>
              <div className="grid grid-cols-2 gap-2">
                {painPoints.map((pp: any, i: number) => (
                  <div
                    key={i}
                    className={`border-l-4 rounded-r p-3 ${
                      SEVERITY_COLORS[pp.severity] || SEVERITY_COLORS.low
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        className={`text-[9px] ${
                          STATUS_STYLES[
                            pp.severity === "critical" ? "completed" : "in_progress"
                          ] || STATUS_STYLES.not_started
                        }`}
                      >
                        {pp.severity}
                      </Badge>
                      {pp.frequency && (
                        <span className="text-[10px] text-muted-foreground">{pp.frequency}</span>
                      )}
                    </div>
                    <p className="text-xs">{pp.description}</p>
                    {pp.impact && (
                      <p className="text-[10px] text-muted-foreground mt-1">{pp.impact}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {additionalFindings.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold mb-2">Additional Findings</h4>
              <ul className="space-y-1">
                {additionalFindings.map((f, i) => (
                  <li key={i} className="text-xs flex gap-1.5">
                    <span className="text-[#d4a853] mt-0.5">›</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── Question cards ── */}
      {guide.length > 0 && (
        <div className="space-y-3">
          {guide.map((q, idx) => (
            <QuestionCard
              key={q.id}
              question={q}
              index={idx}
              answer={answers[q.id]}
              readOnly={isCompleted}
              onSave={handleSaveAnswer}
            />
          ))}
        </div>
      )}

      {/* ── Import transcript dialog ── */}
      <ImportTranscriptDialog
        interviewId={interviewId}
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => {
          refetch();
          setImportOpen(false);
        }}
      />
    </div>
  );
}
