import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Flag, XCircle, ChevronDown, ChevronUp } from "lucide-react";

// Types for workshop data
interface WorkshopFeedback {
  id: number;
  workshopLinkId: number;
  requirementId: number;
  criticality: string | null;
  comment: string;
  flaggedForDiscussion: number;
  status: string;
  updatedAt: string;
}

interface WorkshopRequirement {
  id: number;
  reqNumber: string;
  category: string;
  functionalArea: string;
  subCategory: string;
  description: string;
  criticality: string;
  feedback: WorkshopFeedback | null;
}

interface WorkshopData {
  projectName: string;
  stakeholderName: string;
  stakeholderEmail: string;
  allowedModules: string[];
  requirements: WorkshopRequirement[];
}

// Individual requirement card with local state + auto-save
function RequirementCard({
  req,
  token,
  onSaved,
}: {
  req: WorkshopRequirement;
  token: string;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [criticality, setCriticality] = useState<string>(req.feedback?.criticality || "");
  const [status, setStatus] = useState<string>(req.feedback?.status || "pending");
  const [comment, setComment] = useState<string>(req.feedback?.comment || "");
  const [flagged, setFlagged] = useState<boolean>((req.feedback?.flaggedForDiscussion || 0) === 1);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveFeedback = useCallback(
    async (patch: {
      criticality?: string;
      comment?: string;
      flaggedForDiscussion?: boolean;
      status?: string;
    }) => {
      setSaveState("saving");
      try {
        await apiRequest("PATCH", `/api/workshop/${token}/feedback/${req.id}`, patch);
        setSaveState("saved");
        onSaved();
        if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
        fadeTimeoutRef.current = setTimeout(() => setSaveState("idle"), 2000);
      } catch {
        setSaveState("idle");
        toast({ title: "Save failed", variant: "destructive" });
      }
    },
    [token, req.id, onSaved, toast]
  );

  const handleCriticality = (val: string) => {
    setCriticality(val);
    saveFeedback({ criticality: val });
  };

  const handleStatus = (val: string) => {
    setStatus(val);
    saveFeedback({ status: val });
  };

  const handleFlagged = () => {
    const next = !flagged;
    setFlagged(next);
    saveFeedback({ flaggedForDiscussion: next });
  };

  const handleCommentBlur = () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveFeedback({ comment });
  };

  const handleCommentChange = (val: string) => {
    setComment(val);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => saveFeedback({ comment: val }), 500);
  };

  const isReviewed = status !== "pending";

  return (
    <div
      data-testid={`card-requirement-${req.id}`}
      style={{
        background: "#fff",
        border: `1.5px solid ${isReviewed ? "#d4a853" : "#e2e6ef"}`,
        borderRadius: 10,
        padding: "18px 22px",
        marginBottom: 14,
        boxShadow: "0 1px 4px rgba(26,39,68,0.05)",
        position: "relative",
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span
              style={{
                fontFamily: "monospace",
                fontSize: 11,
                fontWeight: 700,
                background: "#1a2744",
                color: "#fff",
                padding: "1px 7px",
                borderRadius: 4,
              }}
            >
              {req.reqNumber}
            </span>
            <span style={{ fontSize: 11, color: "#6b7280" }}>
              {req.functionalArea} · {req.subCategory}
            </span>
          </div>
          <p style={{ fontSize: 13.5, color: "#1a2744", lineHeight: 1.5, margin: 0 }}>
            {req.description}
          </p>
        </div>
        {/* Save indicator */}
        <div
          style={{
            fontSize: 11,
            color: saveState === "saved" ? "#16a34a" : "#6b7280",
            minWidth: 60,
            textAlign: "right",
            paddingLeft: 12,
            opacity: saveState === "idle" ? 0 : 1,
            transition: "opacity 0.3s",
          }}
        >
          {saveState === "saving" ? "saving…" : "saved ✓"}
        </div>
      </div>

      {/* Criticality row */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", minWidth: 72 }}>Criticality:</span>
        {(["Critical", "Desired", "Not Required", "Not Applicable"] as const).map((opt) => (
          <button
            key={opt}
            data-testid={`btn-criticality-${req.id}-${opt.replace(/\s/g, "-").toLowerCase()}`}
            onClick={() => handleCriticality(criticality === opt ? "" : opt)}
            style={{
              fontSize: 11,
              fontWeight: criticality === opt ? 700 : 500,
              padding: "3px 10px",
              borderRadius: 20,
              border: "1.5px solid",
              cursor: "pointer",
              transition: "all 0.15s",
              borderColor:
                criticality === opt
                  ? opt === "Critical"
                    ? "#1a2744"
                    : opt === "Desired"
                    ? "#2563eb"
                    : opt === "Not Required"
                    ? "#6b7280"
                    : "#d1d5db"
                  : "#e5e7eb",
              background:
                criticality === opt
                  ? opt === "Critical"
                    ? "#1a2744"
                    : opt === "Desired"
                    ? "#2563eb"
                    : opt === "Not Required"
                    ? "#6b7280"
                    : "#d1d5db"
                  : "#f9fafb",
              color: criticality === opt && opt !== "Not Applicable" ? "#fff" : "#374151",
            }}
          >
            {opt}
          </button>
        ))}
      </div>

      {/* Status row */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", minWidth: 72 }}>Decision:</span>

        <button
          data-testid={`btn-approve-${req.id}`}
          onClick={() => handleStatus(status === "approved" ? "pending" : "approved")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            fontWeight: status === "approved" ? 700 : 500,
            padding: "3px 10px",
            borderRadius: 20,
            border: "1.5px solid",
            cursor: "pointer",
            transition: "all 0.15s",
            borderColor: status === "approved" ? "#16a34a" : "#e5e7eb",
            background: status === "approved" ? "#16a34a" : "#f9fafb",
            color: status === "approved" ? "#fff" : "#374151",
          }}
        >
          <CheckCircle2 size={12} />
          Approve
        </button>

        <button
          data-testid={`btn-flag-${req.id}`}
          onClick={handleFlagged}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            fontWeight: flagged ? 700 : 500,
            padding: "3px 10px",
            borderRadius: 20,
            border: "1.5px solid",
            cursor: "pointer",
            transition: "all 0.15s",
            borderColor: flagged ? "#d97706" : "#e5e7eb",
            background: flagged ? "#d97706" : "#f9fafb",
            color: flagged ? "#fff" : "#374151",
          }}
        >
          <Flag size={12} />
          Flag for Discussion
        </button>

        <button
          data-testid={`btn-reject-${req.id}`}
          onClick={() => handleStatus(status === "rejected" ? "pending" : "rejected")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            fontWeight: status === "rejected" ? 700 : 500,
            padding: "3px 10px",
            borderRadius: 20,
            border: "1.5px solid",
            cursor: "pointer",
            transition: "all 0.15s",
            borderColor: status === "rejected" ? "#dc2626" : "#e5e7eb",
            background: status === "rejected" ? "#dc2626" : "#f9fafb",
            color: status === "rejected" ? "#fff" : "#374151",
          }}
        >
          <XCircle size={12} />
          Reject
        </button>
      </div>

      {/* Comment row */}
      <div style={{ marginTop: 10 }}>
        <input
          data-testid={`input-comment-${req.id}`}
          type="text"
          placeholder="Add a comment (optional)…"
          value={comment}
          onChange={(e) => handleCommentChange(e.target.value)}
          onBlur={handleCommentBlur}
          style={{
            width: "100%",
            fontSize: 12,
            padding: "6px 10px",
            border: "1px solid #e5e7eb",
            borderRadius: 6,
            color: "#374151",
            background: "#f9fafb",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>
    </div>
  );
}

export default function WorkshopView() {
  const { token } = useParams<{ token: string }>();
  const queryClient = useQueryClient();
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);

  const { data, isLoading, isError, error } = useQuery<WorkshopData>({
    queryKey: ["/api/workshop", token],
    queryFn: () => apiRequest("GET", `/api/workshop/${token}`).then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  // Count reviewed (status !== "pending") on load and update
  const refreshReviewedCount = useCallback(() => {
    if (data) {
      queryClient.invalidateQueries({ queryKey: ["/api/workshop", token] });
    }
  }, [data, queryClient, token]);

  useEffect(() => {
    if (data) {
      setReviewedCount(data.requirements.filter((r) => r.feedback && r.feedback.status !== "pending").length);
      if (!activeModule && data.allowedModules.length > 0) {
        setActiveModule(data.allowedModules[0]);
      }
    }
  }, [data]);

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f5f7fa",
          fontFamily: "'DM Sans', system-ui, sans-serif",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 40,
              height: 40,
              border: "3px solid #1a2744",
              borderTopColor: "#d4a853",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
              margin: "0 auto 12px",
            }}
          />
          <p style={{ color: "#6b7280", fontSize: 14 }}>Loading workshop…</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    const msg = (error as any)?.message || "This workshop link is invalid or has expired.";
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f5f7fa",
          fontFamily: "'DM Sans', system-ui, sans-serif",
        }}
      >
        <div
          style={{
            background: "#fff",
            border: "1px solid #fee2e2",
            borderRadius: 12,
            padding: "32px 40px",
            textAlign: "center",
            maxWidth: 400,
          }}
        >
          <XCircle size={40} style={{ color: "#dc2626", margin: "0 auto 12px" }} />
          <h2 style={{ fontSize: 18, color: "#1a2744", marginBottom: 8 }}>Workshop Unavailable</h2>
          <p style={{ fontSize: 13.5, color: "#6b7280" }}>{msg}</p>
        </div>
      </div>
    );
  }

  // Build module list and counts
  const allModules = Array.from(new Set(data.requirements.map((r) => r.functionalArea)));
  const displayModules = data.allowedModules.length > 0 ? data.allowedModules : allModules;

  const moduleCounts: Record<string, number> = {};
  for (const m of displayModules) {
    moduleCounts[m] = data.requirements.filter((r) => r.functionalArea === m).length;
  }

  // Filter requirements
  let filtered = activeModule
    ? data.requirements.filter((r) => r.functionalArea === activeModule)
    : data.requirements;

  if (showFlaggedOnly) {
    filtered = filtered.filter((r) => r.feedback?.flaggedForDiscussion === 1);
  }

  const total = data.requirements.length;
  const reviewed = data.requirements.filter((r) => r.feedback && r.feedback.status !== "pending").length;
  const progressPct = total > 0 ? Math.round((reviewed / total) * 100) : 0;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f5f7fa",
        fontFamily: "'DM Sans', system-ui, sans-serif",
        color: "#1a2744",
      }}
    >
      {/* Header */}
      <header
        style={{
          background: "#1a2744",
          color: "#fff",
          padding: "0 0",
          boxShadow: "0 2px 8px rgba(26,39,68,0.18)",
          position: "sticky",
          top: 0,
          zIndex: 20,
        }}
      >
        <div
          style={{
            maxWidth: 900,
            margin: "0 auto",
            padding: "14px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* SVG Logo */}
            <svg
              viewBox="0 0 32 32"
              width="32"
              height="32"
              fill="none"
              aria-label="Avero Caliber"
            >
              <rect width="32" height="32" rx="6" fill="#d4a853" />
              <path d="M8 23L16 9l8 14" stroke="#1a2744" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M11.5 18h9" stroke="#1a2744" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em" }}>Avero Caliber</div>
              <div style={{ fontSize: 11, color: "#d4a853", fontWeight: 500 }}>Requirements Workshop</div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 13, fontWeight: 600 }} data-testid="text-stakeholder-name">{data.stakeholderName}</div>
            <div style={{ fontSize: 11, color: "#94a3b8" }} data-testid="text-project-name">{data.projectName}</div>
          </div>
        </div>
      </header>

      {/* Progress bar */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "10px 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: "#6b7280" }}>
              Review progress
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#1a2744" }} data-testid="text-progress">
              {reviewed} of {total} requirements reviewed
            </span>
          </div>
          <div
            style={{
              height: 6,
              background: "#e5e7eb",
              borderRadius: 99,
              overflow: "hidden",
            }}
          >
            <div
              data-testid="progress-bar"
              style={{
                height: "100%",
                width: `${progressPct}%`,
                background: "#d4a853",
                borderRadius: 99,
                transition: "width 0.4s ease",
              }}
            />
          </div>
        </div>
      </div>

      {/* Module filter tabs */}
      <div
        style={{
          background: "#fff",
          borderBottom: "1px solid #e5e7eb",
          padding: "0 24px",
          overflowX: "auto",
        }}
      >
        <div
          style={{
            maxWidth: 900,
            margin: "0 auto",
            display: "flex",
            gap: 4,
            padding: "8px 0",
            alignItems: "center",
            flexWrap: "nowrap",
          }}
        >
          <button
            data-testid="btn-module-all"
            onClick={() => setActiveModule(null)}
            style={{
              fontSize: 11,
              fontWeight: activeModule === null ? 700 : 500,
              padding: "4px 12px",
              borderRadius: 20,
              border: "1.5px solid",
              cursor: "pointer",
              whiteSpace: "nowrap",
              borderColor: activeModule === null ? "#1a2744" : "#e5e7eb",
              background: activeModule === null ? "#1a2744" : "#f9fafb",
              color: activeModule === null ? "#fff" : "#374151",
            }}
          >
            All ({data.requirements.length})
          </button>
          {displayModules.map((mod) => (
            <button
              key={mod}
              data-testid={`btn-module-${mod.replace(/\s/g, "-").toLowerCase()}`}
              onClick={() => setActiveModule(activeModule === mod ? null : mod)}
              style={{
                fontSize: 11,
                fontWeight: activeModule === mod ? 700 : 500,
                padding: "4px 12px",
                borderRadius: 20,
                border: "1.5px solid",
                cursor: "pointer",
                whiteSpace: "nowrap",
                borderColor: activeModule === mod ? "#1a2744" : "#e5e7eb",
                background: activeModule === mod ? "#1a2744" : "#f9fafb",
                color: activeModule === mod ? "#fff" : "#374151",
              }}
            >
              {mod} ({moduleCounts[mod] || 0})
            </button>
          ))}

          <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
            <button
              data-testid="btn-flagged-filter"
              onClick={() => setShowFlaggedOnly(!showFlaggedOnly)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontSize: 11,
                fontWeight: showFlaggedOnly ? 700 : 500,
                padding: "4px 12px",
                borderRadius: 20,
                border: "1.5px solid",
                cursor: "pointer",
                borderColor: showFlaggedOnly ? "#d97706" : "#e5e7eb",
                background: showFlaggedOnly ? "#d97706" : "#f9fafb",
                color: showFlaggedOnly ? "#fff" : "#374151",
              }}
            >
              <Flag size={11} />
              Flagged Only
            </button>
          </div>
        </div>
      </div>

      {/* Requirements list */}
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "20px 24px 60px" }}>
        {filtered.length === 0 ? (
          <div
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              padding: "40px",
              textAlign: "center",
              color: "#6b7280",
              fontSize: 13.5,
            }}
          >
            {showFlaggedOnly
              ? "No flagged requirements in this view."
              : "No requirements found for this module."}
          </div>
        ) : (
          filtered.map((req) => (
            <RequirementCard
              key={req.id}
              req={req}
              token={token!}
              onSaved={() => {
                queryClient.invalidateQueries({ queryKey: ["/api/workshop", token] });
              }}
            />
          ))
        )}
      </main>

      {/* Footer */}
      <footer
        style={{
          background: "#1a2744",
          color: "#94a3b8",
          textAlign: "center",
          fontSize: 11,
          padding: "16px 24px",
        }}
      >
        Powered by <span style={{ color: "#d4a853", fontWeight: 600 }}>Avero Caliber</span>
      </footer>
    </div>
  );
}
