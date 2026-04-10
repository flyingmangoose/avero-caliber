import OpenAI from "openai";
import { storage } from "./storage";

// Use xAI Grok API (OpenAI-compatible)
const xai = new OpenAI({
  apiKey: process.env.XAI_API_KEY || process.env.ANTHROPIC_API_KEY || "",
  baseURL: process.env.XAI_API_KEY ? "https://api.x.ai/v1" : undefined,
});

const MODEL = process.env.XAI_API_KEY ? "grok-3-mini" : "gpt-4o";

// Helper to call the LLM (replaces anthropic.messages.create)
async function llmCall(prompt: string, systemPrompt?: string, maxTokens = 4096): Promise<string> {
  const messages: any[] = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });
  const response = await xai.chat.completions.create({
    model: MODEL,
    max_tokens: maxTokens,
    messages,
  });
  return response.choices[0]?.message?.content || "";
}

// Streaming helper for SSE responses
async function llmStream(prompt: string, systemPrompt?: string, maxTokens = 4096) {
  const messages: any[] = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });
  return xai.chat.completions.create({
    model: MODEL,
    max_tokens: maxTokens,
    messages,
    stream: true,
  });
}

const CHAT_SYSTEM_PROMPT = `You are Caliber AI, an expert consulting assistant embedded in Avero Caliber — a government ERP implementation management platform built by Avero Advisors. You have complete access to this project's data across all modules.

PROJECT CONTEXT:
{projectContext}

Your role:
- Answer questions about project health, risks, vendor evaluation, discovery findings, and implementation status
- Provide strategic analysis and recommendations grounded in the data
- Generate executive summaries, risk assessments, talking points, and status updates
- Analyze health check findings, RAID items, budget status, and schedule delays
- Compare vendors across requirements, outcomes, and scenario-based evaluation
- Assess go-live readiness and identify blockers
- Summarize discovery interviews, processes, and pain points
- Be direct, data-driven, and consultative in tone (authoritative yet compassionate — the Avero way)
- Always cite specific numbers and evidence from the project data
- When asked to generate content, write in a professional IV&V consulting style`;

const PROPOSAL_ANALYSIS_PROMPT = `You are analyzing a vendor proposal for a government ERP/EAM implementation. Extract structured information across two dimensions:

QUALITATIVE PROFILE — Extract and assess:
1. Company Profile: revenue, employees, founding year, growth, acquisitions, financial stability
2. Government Experience: # of similar implementations, reference clients, sector expertise
3. Implementation Approach: methodology, timeline, phases, risk mitigation, change management
4. Team & Staffing: key personnel qualifications, team size, local presence, subcontractors
5. Support Model: SLA commitments, support tiers, response times, escalation, account management
6. Innovation & Roadmap: R&D investment, release cadence, AI/automation, cloud strategy
7. Cultural Fit: communication style, partnership approach, flexibility, customization willingness
8. Risk Factors: vague commitments, dependencies, litigation, over-promising

For each dimension, provide:
- score: 1-10
- summary: 2-3 sentence assessment
- evidence: key quotes or page references from the proposal
- concerns: any red flags

QUANTITATIVE — If the proposal contains requirement responses:
- Map vendor responses to S/F/C/T/N scoring where identifiable
- Extract any cost/pricing data
- Note implementation timeline estimates

Return as structured JSON with this exact shape:
{
  "dimensions": [
    {
      "dimension": "company_profile",
      "label": "Company Profile",
      "score": 8,
      "summary": "...",
      "evidence": ["quote1", "quote2"],
      "concerns": ["concern1"]
    }
  ],
  "quantitative": {
    "costData": "...",
    "timeline": "...",
    "requirementResponses": "..."
  },
  "overallAssessment": "2-3 sentence bottom-line assessment"
}`;

export function buildProjectContext(projectId: number): string {
  const project = storage.getProject(projectId);
  if (!project) return "Project not found.";

  const reqs = storage.getRequirements(projectId);
  const stats = storage.getProjectStats(projectId);
  const settings = storage.getProjectVendorSettings(projectId);
  const allVendors = storage.getVendors();
  const evaluation = storage.calculateEvaluation(projectId);
  const workshopSummary = storage.getWorkshopSummary(projectId);
  const customCriteriaData = storage.getCustomCriteria(projectId);

  // Contract/SOW baseline
  const baseline = storage.getProjectBaseline(projectId);

  // Discovery & client context
  const client = project.clientId ? storage.getClient(project.clientId) : undefined;
  const orgProfileData = storage.getOrgProfile(projectId);
  const painPoints = storage.getPainPoints(projectId);
  const interviews = storage.getDiscoveryInterviews(projectId);
  const transformations = storage.getProcessTransformations(projectId);

  // Module breakdown
  const moduleGroups: Record<string, { total: number; critical: number; desired: number }> = {};
  for (const req of reqs) {
    const area = req.functionalArea;
    if (!moduleGroups[area]) moduleGroups[area] = { total: 0, critical: 0, desired: 0 };
    moduleGroups[area].total++;
    if (req.criticality === "Critical") moduleGroups[area].critical++;
    if (req.criticality === "Desired") moduleGroups[area].desired++;
  }

  // Selected vendors
  const selectedVendorIds: number[] = settings ? JSON.parse(settings.selectedVendors) : [];
  const selectedVendors = allVendors.filter(v => selectedVendorIds.includes(v.id));

  // Module weights
  const weights: Record<string, number> = settings ? JSON.parse(settings.moduleWeights) : {};

  // Vendor intelligence data
  const vendorIntelligenceData = storage.getVendorIntelligence(projectId);

  let context = `PROJECT: ${project.name}
Description: ${project.description || "N/A"}
Status: ${project.status}
Engagement Modules: ${project.engagementModules || "N/A"}
Created: ${project.createdAt}
`;

  // Contract/SOW baseline context
  if (baseline) {
    context += `\nCONTRACT/SOW BASELINE:`;
    if (baseline.contractedAmount) context += `\n- Contracted Amount: $${baseline.contractedAmount.toLocaleString()}`;
    if (baseline.goLiveDate) {
      const daysToGoLive = Math.ceil((new Date(baseline.goLiveDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      context += `\n- Go-Live Date: ${baseline.goLiveDate} (${daysToGoLive > 0 ? daysToGoLive + " days remaining" : Math.abs(daysToGoLive) + " days past"})`;
    }
    if (baseline.contractStartDate) context += `\n- Contract Start: ${baseline.contractStartDate}`;
    if (baseline.vendorName) context += `\n- Implementation Vendor: ${baseline.vendorName}`;
    if (baseline.notes) context += `\n- Notes: ${baseline.notes}`;
    try {
      const scope = baseline.scopeItems ? JSON.parse(baseline.scopeItems) : [];
      if (scope.length > 0) {
        context += `\nScope Items:`;
        for (const s of scope) context += `\n  - ${s.name}${s.status ? ` [${s.status}]` : ""}${s.description ? `: ${s.description}` : ""}`;
      }
    } catch {}
    try {
      const milestones = baseline.keyMilestones ? JSON.parse(baseline.keyMilestones) : [];
      if (milestones.length > 0) {
        context += `\nKey Contractual Milestones:`;
        for (const m of milestones) context += `\n  - ${m.name}: ${m.date || "TBD"}${m.description ? ` — ${m.description}` : ""}`;
      }
    } catch {}
    context += `\n`;
  }

  // Client/Organization context
  if (client) {
    context += `\nCLIENT ORGANIZATION:
- Name: ${client.name}
- Entity Type: ${client.entityType || "Unknown"}
- State: ${client.state || "Unknown"}
- Population: ${client.population ? client.population.toLocaleString() : "Unknown"}
- Employees: ${client.employeeCount ? client.employeeCount.toLocaleString() : "Unknown"}
- Annual Budget: ${client.annualBudget || "Unknown"}
- Description: ${client.description || "N/A"}
- Pain Summary: ${client.painSummary || "N/A"}
`;
    try {
      const systems = client.currentSystems ? JSON.parse(client.currentSystems) : [];
      if (systems.length > 0) {
        context += `Current Systems:\n`;
        for (const sys of systems) {
          context += `  - ${sys.name || sys.vendor || "Unknown"}: ${sys.module || ""} (${sys.yearsInUse ? sys.yearsInUse + " years" : "unknown tenure"})\n`;
        }
      }
    } catch {}
    try {
      const depts = client.departments ? JSON.parse(client.departments) : [];
      if (depts.length > 0) {
        context += `Departments: ${depts.map((d: any) => `${d.name}${d.headcount ? ` (${d.headcount})` : ""}`).join(", ")}\n`;
      }
    } catch {}
  }

  // Org profile from discovery
  if (orgProfileData) {
    context += `\nORGANIZATION PROFILE (from discovery):
- Entity: ${orgProfileData.entityName || client?.name || "N/A"} (${orgProfileData.entityType || "Unknown"})
- State: ${orgProfileData.state || "Unknown"}
- Population: ${orgProfileData.population ? orgProfileData.population.toLocaleString() : "Unknown"}
- Employees: ${orgProfileData.employeeCount ? orgProfileData.employeeCount.toLocaleString() : "Unknown"}
- Annual Budget: ${orgProfileData.annualBudget || "Unknown"}
- Pain Summary: ${orgProfileData.painSummary || "N/A"}
`;
  }

  // Discovery pain points
  if (painPoints.length > 0) {
    context += `\nDISCOVERY PAIN POINTS (${painPoints.length} identified):\n`;
    for (const pp of painPoints.slice(0, 15)) {
      context += `- [${pp.functionalArea}] ${pp.description}`;
      if (pp.severity) context += ` (severity: ${pp.severity})`;
      if (pp.impact) context += ` — Impact: ${pp.impact}`;
      if (pp.currentWorkaround) context += ` — Workaround: ${pp.currentWorkaround}`;
      context += `\n`;
    }
    if (painPoints.length > 15) context += `  ... and ${painPoints.length - 15} more pain points\n`;
  }

  // Discovery interviews - extracted findings
  if (interviews.length > 0) {
    const interviewsWithFindings = interviews.filter(i => i.findings);
    if (interviewsWithFindings.length > 0) {
      context += `\nDISCOVERY INTERVIEW FINDINGS (${interviewsWithFindings.length} interviews):\n`;
      for (const interview of interviewsWithFindings.slice(0, 10)) {
        context += `- ${interview.functionalArea}`;
        if (interview.interviewee) context += ` (${interview.interviewee}${interview.role ? `, ${interview.role}` : ""})`;
        context += `: ${interview.findings?.substring(0, 200) || "No findings extracted"}\n`;
      }
    }
  }

  // Process transformations
  if (transformations.length > 0) {
    context += `\nPROCESS TRANSFORMATIONS (${transformations.length} areas analyzed):\n`;
    for (const t of transformations.slice(0, 10)) {
      context += `- ${t.functionalArea} (${t.vendorPlatform}):`;
      if (t.currentManualSteps != null) context += ` Current: ${t.currentStepCount || "?"} steps (${t.currentManualSteps} manual)`;
      if (t.futureStepCount != null) context += ` → Future: ${t.futureStepCount} steps`;
      if (t.currentDescription) context += ` | Current: ${t.currentDescription.substring(0, 100)}`;
      context += `\n`;
    }
  }

  context += `
REQUIREMENTS SUMMARY:
- Total: ${stats.totalRequirements}
- Critical: ${stats.criticalCount}
- Desired: ${stats.desiredCount}
- Module Coverage: ${stats.moduleCoverage} modules

MODULES:
${Object.entries(moduleGroups).map(([mod, data]) =>
  `- ${mod}: ${data.total} requirements (${data.critical} critical, ${data.desired} desired), weight: ${weights[mod] || "default"}`
).join("\n")}

SELECTED VENDORS (${selectedVendors.length}):
${selectedVendors.map(v => `- ${v.name} (${v.shortName}) — ${v.platformType} platform`).join("\n")}
`;

  // Evaluation scores
  if (evaluation.vendors.length > 0) {
    context += `\nVENDOR EVALUATION SCORES:\n`;
    for (const ve of evaluation.vendors) {
      context += `\n${ve.vendorName} (${ve.vendorShortName}): Overall ${ve.overallScore.toFixed(1)}%\n`;
      const moduleEntries = Object.entries(ve.moduleScores);
      if (moduleEntries.length > 0) {
        for (const [mod, ms] of moduleEntries) {
          context += `  - ${mod}: ${ms.score.toFixed(1)}% (${ms.requirementCount} reqs, ${ms.criticalGapCount} critical gaps)\n`;
        }
      }
    }
  }

  // Gaps
  if (evaluation.gaps.length > 0) {
    context += `\nCRITICAL GAPS (${evaluation.gaps.length} total):\n`;
    const topGaps = evaluation.gaps.slice(0, 20);
    for (const gap of topGaps) {
      const scoreStr = Object.entries(gap.scores)
        .map(([vid, s]) => {
          const v = allVendors.find(v => v.id === Number(vid));
          return `${v?.shortName || vid}: ${s}`;
        })
        .join(", ");
      context += `- ${gap.reqNumber} (${gap.functionalArea}/${gap.criticality}): ${gap.description.substring(0, 100)}... [${scoreStr}]\n`;
    }
    if (evaluation.gaps.length > 20) {
      context += `  ... and ${evaluation.gaps.length - 20} more gaps\n`;
    }
  }

  // Stakeholder feedback
  if (workshopSummary.totalFeedback > 0) {
    context += `\nSTAKEHOLDER FEEDBACK:
- Total feedback items: ${workshopSummary.totalFeedback}
- Approval rate: ${workshopSummary.aggregated.approvalRate.toFixed(0)}%
- Flagged for discussion: ${workshopSummary.flaggedCount}
- Stakeholder links: ${workshopSummary.totalLinks}
`;
    if (workshopSummary.aggregated.topConcerns.length > 0) {
      context += `Top concerns:\n`;
      for (const c of workshopSummary.aggregated.topConcerns.slice(0, 5)) {
        context += `  - ${c.reqNumber} (${c.module}): ${c.flagCount} flags, ${c.commentCount} comments\n`;
      }
    }
  }

  // Custom criteria
  if (customCriteriaData.length > 0) {
    context += `\nCUSTOM EVALUATION CRITERIA:\n`;
    for (const cc of customCriteriaData) {
      context += `- ${cc.name} (weight: ${cc.weight}): ${cc.description || "No description"}\n`;
      for (const s of cc.scores) {
        const v = allVendors.find(v => v.id === s.vendorId);
        context += `    ${v?.shortName || s.vendorId}: ${s.score}/10${s.notes ? ` — ${s.notes}` : ""}\n`;
      }
    }
  }

  // AI-analyzed vendor intelligence
  if (vendorIntelligenceData.length > 0) {
    context += `\nAI VENDOR INTELLIGENCE (from proposal analysis):\n`;
    const byVendor: Record<number, typeof vendorIntelligenceData> = {};
    for (const vi of vendorIntelligenceData) {
      if (!byVendor[vi.vendorId]) byVendor[vi.vendorId] = [];
      byVendor[vi.vendorId].push(vi);
    }
    for (const [vid, dims] of Object.entries(byVendor)) {
      const v = allVendors.find(v => v.id === Number(vid));
      context += `\n${v?.name || vid}:\n`;
      for (const d of dims) {
        context += `  - ${d.dimension}: ${d.score}/10 — ${d.summary || "No summary"}\n`;
      }
    }
  }

  return context;
}

// ==================== DISCOVERY WIZARD AI ====================

// Generate structured interview guide for a consultant to use in face-to-face meetings
export async function generateInterviewGuide(
  functionalArea: string,
  orgProfileData: any | null
): Promise<{ questions: Array<{ id: string; category: string; question: string; probes: string[]; whatToListenFor: string }> }> {
  let orgContext = "No organization profile available yet.";
  if (orgProfileData) {
    const parts: string[] = [];
    if (orgProfileData.entityName) parts.push(`Organization: ${orgProfileData.entityName}`);
    if (orgProfileData.entityType) parts.push(`Type: ${orgProfileData.entityType}`);
    if (orgProfileData.state) parts.push(`State: ${orgProfileData.state}`);
    if (orgProfileData.population) parts.push(`Population served: ${orgProfileData.population?.toLocaleString()}`);
    if (orgProfileData.employeeCount) parts.push(`Employees: ${orgProfileData.employeeCount?.toLocaleString()}`);
    if (orgProfileData.annualBudget) parts.push(`Annual budget: ${orgProfileData.annualBudget}`);
    if (orgProfileData.currentSystems) {
      try {
        const systems = typeof orgProfileData.currentSystems === "string" ? JSON.parse(orgProfileData.currentSystems) : orgProfileData.currentSystems;
        if (Array.isArray(systems) && systems.length > 0) {
          parts.push(`Current systems: ${systems.map((s: any) => `${s.name} (${s.module || s.vendor || ""})`).join(", ")}`);
        }
      } catch {}
    }
    if (orgProfileData.painSummary) parts.push(`Key challenges: ${orgProfileData.painSummary}`);
    orgContext = parts.join("\n");
  }

  const text = await llmCall(`You are a senior ERP/EAM implementation consultant preparing a discovery interview guide for the ${functionalArea} department.

ORGANIZATION CONTEXT:
${orgContext}

Generate a structured interview guide with 10-12 questions organized into categories. This guide will be used by a consultant sitting face-to-face with a client stakeholder.

Categories should follow this progression:
1. "Current State" — understand existing systems, processes, users
2. "Day-to-Day Operations" — walk through key workflows step by step
3. "Pain Points & Challenges" — what's broken, slow, manual, error-prone
4. "Volume & Complexity" — transaction counts, user counts, approval chains, reporting
5. "Integrations & Dependencies" — what other systems/departments are connected
6. "Future State" — what does success look like, what capabilities are missing

For each question, provide:
- A clear, conversational question the consultant should ask
- 2-3 follow-up probes if the answer is too brief
- A "what to listen for" note (what signals matter in the answer)

Return JSON:
{
  "questions": [
    {
      "id": "q1",
      "category": "Current State",
      "question": "Walk me through your current [process] — from start to finish, how does it work today?",
      "probes": ["How many people are involved?", "What system do you use for this?", "How long does it typically take?"],
      "whatToListenFor": "Manual handoffs, system limitations, workarounds"
    }
  ]
}

Make questions specific to ${functionalArea} in a government context. Use conversational language a consultant would actually say.`);

  const jsonMatch = text.match(/\{[\s\S]*"questions"[\s\S]*\}/);
  if (!jsonMatch) return { questions: [] };
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return { questions: [] };
  }
}

// Process meeting transcript (from Fireflies, Otter, manual notes) and extract structured answers
export async function processTranscript(
  functionalArea: string,
  transcript: string,
  questions: Array<{ id: string; question: string }>
): Promise<{ answers: Array<{ questionId: string; extractedAnswer: string; keyPoints: string[]; painPoints: string[]; followUpNeeded: boolean }>; additionalFindings: string[] }> {
  const questionList = questions.map(q => `${q.id}: ${q.question}`).join("\n");

  const text = await llmCall(`You are analyzing a meeting transcript from a ${functionalArea} discovery interview. Extract structured answers mapped to the interview questions.

INTERVIEW QUESTIONS:
${questionList}

TRANSCRIPT:
${transcript}

For each question that was discussed in the transcript, extract:
- The answer/response from the client (summarized clearly, not verbatim)
- Key points mentioned
- Any pain points or problems revealed
- Whether a follow-up conversation is needed (answer was incomplete or raised new questions)

Also identify any additional findings from the transcript that don't map to specific questions but are relevant to the ${functionalArea} discovery.

Return JSON:
{
  "answers": [
    {
      "questionId": "q1",
      "extractedAnswer": "Clear summary of their response",
      "keyPoints": ["point 1", "point 2"],
      "painPoints": ["pain point if mentioned"],
      "followUpNeeded": false
    }
  ],
  "additionalFindings": ["finding not tied to a specific question"]
}`);
  const jsonMatch = text.match(/\{[\s\S]*"answers"[\s\S]*\}/);
  if (!jsonMatch) return { answers: [], additionalFindings: [] };
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return { answers: [], additionalFindings: [] };
  }
}

export function buildDiscoveryInterviewPrompt(
  functionalArea: string,
  orgProfileData: any | null,
  previousMessages: { role: string; content: string }[]
): string {
  let orgContext = "No organization profile available yet.";
  if (orgProfileData) {
    const parts: string[] = [];
    if (orgProfileData.entityName) parts.push(`Organization: ${orgProfileData.entityName}`);
    if (orgProfileData.entityType) parts.push(`Type: ${orgProfileData.entityType}`);
    if (orgProfileData.state) parts.push(`State: ${orgProfileData.state}`);
    if (orgProfileData.population) parts.push(`Population served: ${orgProfileData.population.toLocaleString()}`);
    if (orgProfileData.employeeCount) parts.push(`Employees: ${orgProfileData.employeeCount.toLocaleString()}`);
    if (orgProfileData.annualBudget) parts.push(`Annual budget: ${orgProfileData.annualBudget}`);
    if (orgProfileData.currentSystems) {
      try {
        const systems = typeof orgProfileData.currentSystems === "string" ? JSON.parse(orgProfileData.currentSystems) : orgProfileData.currentSystems;
        if (Array.isArray(systems) && systems.length > 0) {
          parts.push(`Current systems: ${systems.map((s: any) => `${s.name} (${s.module || s.vendor || ""})`).join(", ")}`);
        }
      } catch {}
    }
    if (orgProfileData.painSummary) parts.push(`Key challenges: ${orgProfileData.painSummary}`);
    orgContext = parts.join("\n");
  }

  return `You are a senior ERP/EAM implementation consultant conducting a discovery interview for ${functionalArea}. You are thorough, patient, and methodical.

ORGANIZATION CONTEXT:
${orgContext}

YOUR APPROACH:
1. Start by understanding the current state — what systems, what processes, how things work today
2. Dig into pain points — what takes too long, what breaks, what causes rework, what's manual that should be automated
3. Understand volume and complexity — transaction counts, user counts, approval chains, reporting needs
4. Identify integration dependencies — what other systems does this area touch
5. Ask about desired future state — what would "great" look like

RULES:
- Ask ONE question at a time
- When they give a short answer, probe deeper: "Can you walk me through that step by step?"
- When they mention a pain point, quantify it: "How often does that happen? How much time does it cost?"
- After 8-12 exchanges, begin summarizing what you've heard and confirm understanding
- When you feel you have a comprehensive picture, say "I think I have a good understanding of your ${functionalArea} processes. Let me summarize what I've heard..." and provide a structured summary

Do NOT make assumptions. Everything must come from what they tell you.`;
}

export async function extractDiscoveryFindings(
  functionalArea: string,
  transcript: { role: string; content: string }[]
): Promise<{ processSteps: any[]; painPoints: any[]; keyMetrics: any[]; integrationDeps: string[]; desiredOutcomes: string[] }> {
  const transcriptText = transcript.map(m => `${m.role === "assistant" ? "Consultant" : "Interviewee"}: ${m.content}`).join("\n\n");

  const text = await llmCall(`Based on this discovery interview transcript for ${functionalArea}, extract structured findings:

1. PROCESS STEPS: List each step in their current process
   - step (number), description, system (which system), manual (yes/no), painPoint (associated pain point if any)

2. PAIN POINTS: Each pain point identified
   - description, severity (critical/high/medium/low), frequency (daily/weekly/monthly/quarterly/annual), impact (business impact description), currentWorkaround

3. KEY METRICS: Any numbers mentioned (transaction volumes, processing times, user counts, error rates)
   - metric, value, context

4. INTEGRATION DEPENDENCIES: Systems that connect to this area (list of strings)

5. DESIRED OUTCOMES: What they want to achieve (list of strings)

Return as JSON with keys: processSteps, painPoints, keyMetrics, integrationDeps, desiredOutcomes

TRANSCRIPT:
${transcriptText}`);

  try {
    // text set by llmCall above
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {}
  return { processSteps: [], painPoints: [], keyMetrics: [], integrationDeps: [], desiredOutcomes: [] };
}

export async function generateRequirementsFromDiscovery(projectId: number): Promise<any[]> {
  const profile = storage.getOrgProfile(projectId);
  const interviews = storage.getDiscoveryInterviews(projectId).filter(i => i.status === "completed");
  const painPoints = storage.getPainPoints(projectId);

  // Gather vendor capabilities summary
  let vendorKnowledge = "No vendor capability data available.";
  try {
    const capabilities = storage.getVendorCapabilities();
    if (capabilities.length > 0) {
      const byModule: Record<string, string[]> = {};
      for (const cap of capabilities) {
        if (!byModule[cap.module]) byModule[cap.module] = [];
        byModule[cap.module].push(`${cap.vendorPlatform}: maturity ${cap.maturityRating}/5, ${cap.automationLevel || "unknown automation"}`);
      }
      vendorKnowledge = Object.entries(byModule)
        .map(([mod, vendors]) => `${mod}:\n${vendors.map(v => `  - ${v}`).join("\n")}`)
        .join("\n\n");
    }
  } catch {}

  // Build org profile summary
  let orgSummary = "No organization profile.";
  if (profile) {
    orgSummary = [
      profile.entityName && `${profile.entityName} (${profile.entityType || "unknown type"})`,
      profile.state && `State: ${profile.state}`,
      profile.employeeCount && `${profile.employeeCount} employees`,
      profile.annualBudget && `Budget: ${profile.annualBudget}`,
      profile.painSummary,
    ].filter(Boolean).join(". ");
  }

  // Build per-area findings
  const areaFindings = interviews.map(i => {
    let findingsSummary = "";
    if (i.findings) {
      try {
        const f = JSON.parse(i.findings);
        if (f.desiredOutcomes) findingsSummary += `Desired outcomes: ${JSON.stringify(f.desiredOutcomes)}\n`;
        if (f.integrationDeps) findingsSummary += `Integration dependencies: ${JSON.stringify(f.integrationDeps)}\n`;
      } catch {}
    }
    let ppSummary = "";
    if (i.painPoints) {
      try {
        const pp = JSON.parse(i.painPoints);
        if (Array.isArray(pp)) ppSummary = pp.map((p: any) => `- [${p.severity}] ${p.description}`).join("\n");
      } catch {}
    }
    return `## ${i.functionalArea}\nFindings: ${findingsSummary}\nPain Points:\n${ppSummary}`;
  }).join("\n\n");

  // Build pain points list
  const ppList = painPoints
    .sort((a, b) => (b.stakeholderPriority || 0) - (a.stakeholderPriority || 0))
    .map(p => `- [${p.severity || "unknown"}] (priority: ${p.stakeholderPriority || "unranked"}) ${p.functionalArea}: ${p.description}`)
    .join("\n");

  const text = await llmCall(`You are generating ERP/EAM requirements based on a comprehensive discovery process.

ORGANIZATION PROFILE:
${orgSummary}

DISCOVERY FINDINGS BY AREA:
${areaFindings}

PRIORITIZED PAIN POINTS (ranked by stakeholder priority):
${ppList}

VENDOR KNOWLEDGE:
${vendorKnowledge}

Generate a focused set of requirements that:
1. Directly address identified pain points (reference which pain point each requirement addresses)
2. Are specific to this organization's size, type, and complexity
3. Include criticality levels based on pain point severity and stakeholder priority
4. Cover all functional areas that were interviewed
5. Do NOT include generic requirements that weren't surfaced in discovery

For each requirement, provide:
- module: which functional area
- description: the specific requirement text
- criticality: Critical, Desired, or Not Required based on pain point severity
- justification: 1-2 sentences explaining WHY this is needed, referencing discovery findings
- painPointRef: description of the linked pain point

Return as a JSON array of objects with keys: module, description, criticality, justification, painPointRef`, undefined, 8192);

  try {
    // text set by llmCall above
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {}
  return [];
}

export async function generateFutureState(projectId: number, vendorPlatform: string) {
  const orgProfileData = storage.getOrgProfile(projectId);
  const interviews = storage.getDiscoveryInterviews(projectId).filter(i => i.status === "completed");
  const painPoints = storage.getPainPoints(projectId);
  const vendorCaps = storage.getVendorCapabilities({ platform: vendorPlatform });

  if (interviews.length === 0) return [];

  const orgSummary = orgProfileData
    ? `${orgProfileData.entityName || "Organization"} (${orgProfileData.entityType || "government"}), ${orgProfileData.state || "US"}, Population: ${orgProfileData.population || "N/A"}, Employees: ${orgProfileData.employeeCount || "N/A"}, Budget: ${orgProfileData.annualBudget || "N/A"}`
    : "Government organization (no profile data)";

  const results: any[] = [];

  for (const interview of interviews) {
    const area = interview.functionalArea;
    let currentSteps: any[] = [];
    try { currentSteps = interview.processSteps ? JSON.parse(interview.processSteps) : []; } catch {}
    let interviewPainPoints: any[] = [];
    try { interviewPainPoints = interview.painPoints ? JSON.parse(interview.painPoints) : []; } catch {}

    const areaPainPoints = painPoints.filter(p => p.functionalArea === area);
    const allPainPointsList = [...interviewPainPoints, ...areaPainPoints.map(p => ({ description: p.description, severity: p.severity, impact: p.impact }))];
    const uniquePainPoints = allPainPointsList.filter((p, i, arr) => arr.findIndex(x => x.description === p.description) === i);

    const areaCaps = vendorCaps.filter(c => {
      const mod = (c.module || "").toLowerCase();
      const areaLower = area.toLowerCase();
      return mod.includes(areaLower) || areaLower.includes(mod) ||
        (areaLower.includes("finance") && (mod.includes("financ") || mod.includes("accounting") || mod.includes("budget"))) ||
        (areaLower.includes("human resources") && (mod.includes("hr") || mod.includes("human") || mod.includes("payroll") || mod.includes("talent"))) ||
        (areaLower.includes("procurement") && (mod.includes("procur") || mod.includes("supply") || mod.includes("sourcing"))) ||
        (areaLower.includes("asset") && (mod.includes("asset") || mod.includes("eam") || mod.includes("maintenance")));
    });

    const capsText = areaCaps.length > 0
      ? areaCaps.map(c => `- ${c.capabilityName}: ${c.description || ""} (Maturity: ${c.maturityLevel || "N/A"}, Automation: ${c.automationLevel || "N/A"})`).join("\n")
      : `No specific capabilities found for ${vendorPlatform} in ${area}. Use general knowledge of ${vendorPlatform} platform capabilities.`;

    const stepsText = currentSteps.length > 0
      ? currentSteps.map((s: any, i: number) => `${i + 1}. ${s.description || s.step || "Step"} ${s.manual ? "(MANUAL)" : "(automated)"} ${s.system ? `[${s.system}]` : ""}`).join("\n")
      : "No detailed steps recorded.";

    const painText = uniquePainPoints.length > 0
      ? uniquePainPoints.map((p: any) => `- [${p.severity || "medium"}] ${p.description}${p.impact ? ` — Impact: ${p.impact}` : ""}`).join("\n")
      : "No specific pain points recorded.";

    const prompt = `You are analyzing how ${vendorPlatform} would transform ${area} processes for this organization.

ORGANIZATION: ${orgSummary}

CURRENT STATE (from discovery):
Process Steps:
${stepsText}

Pain Points:
${painText}

VENDOR CAPABILITIES FOR ${area}:
${capsText}

Generate a transformation analysis as JSON with these exact keys:

{
  "currentStepCount": <number of current steps>,
  "currentManualSteps": <how many are manual>,
  "currentSystems": <number of different systems>,
  "currentProcessingTime": "<estimated time e.g. '15 days'>",
  "currentDescription": "<2-3 sentence narrative of current state>",
  "futureStepCount": <reduced number>,
  "futureManualSteps": <remaining manual>,
  "futureSystems": <consolidated count, usually 1>,
  "futureProcessingTime": "<improved time>",
  "futureDescription": "<2-3 sentence narrative of future state with ${vendorPlatform}>",
  "futureSteps": [{"step": 1, "description": "...", "automated": true/false, "feature": "vendor feature name"}],
  "improvements": [{"area": "...", "before": "...", "after": "...", "impact": "..."}],
  "eliminatedSteps": ["step description that goes away"],
  "newCapabilities": ["new capability enabled by vendor"]
}

Return ONLY valid JSON, no markdown fencing.`;

    let transformation: any = null;

    try {
      const text = await llmCall(prompt );

      // text set by llmCall above
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        transformation = JSON.parse(jsonMatch[0]);
      }
    } catch (err) {
      console.error(`AI call failed for ${area}, generating mock:`, err);
    }

    // Fallback mock if AI fails
    if (!transformation) {
      const stepCount = currentSteps.length || 8;
      const manualCount = currentSteps.filter((s: any) => s.manual).length || Math.ceil(stepCount * 0.6);
      const systemCount = new Set(currentSteps.map((s: any) => s.system).filter(Boolean)).size || 3;
      transformation = {
        currentStepCount: stepCount,
        currentManualSteps: manualCount,
        currentSystems: systemCount,
        currentProcessingTime: `${Math.max(5, stepCount * 2)} days`,
        currentDescription: `Current ${area} processes involve ${stepCount} steps across ${systemCount} systems with significant manual effort and fragmented data.`,
        futureStepCount: Math.max(3, Math.ceil(stepCount * 0.5)),
        futureManualSteps: Math.max(1, Math.ceil(manualCount * 0.2)),
        futureSystems: 1,
        futureProcessingTime: `${Math.max(1, Math.ceil(stepCount * 0.5))} days`,
        futureDescription: `With ${vendorPlatform}, ${area} processes would be consolidated into a single platform with automated workflows, reducing manual effort by ~80%.`,
        futureSteps: [
          { step: 1, description: "Automated data capture and validation", automated: true, feature: "AI-powered data entry" },
          { step: 2, description: "Workflow-driven approval routing", automated: true, feature: "Configurable workflows" },
          { step: 3, description: "Real-time reporting and dashboards", automated: true, feature: "Embedded analytics" },
        ],
        improvements: uniquePainPoints.slice(0, 4).map((p: any) => ({
          area: area,
          before: p.description,
          after: `Automated with ${vendorPlatform} capabilities`,
          impact: `Addresses ${p.severity || "medium"} severity pain point`,
        })),
        eliminatedSteps: currentSteps.filter((s: any) => s.manual).slice(0, 3).map((s: any) => s.description || "Manual processing step"),
        newCapabilities: ["Real-time dashboards", "Mobile approvals", "AI-powered automation"],
      };
    }

    const record = storage.createProcessTransformation({
      projectId,
      functionalArea: area,
      vendorPlatform,
      currentStepCount: transformation.currentStepCount,
      currentManualSteps: transformation.currentManualSteps,
      currentSystems: transformation.currentSystems,
      currentProcessingTime: transformation.currentProcessingTime,
      currentPainPoints: uniquePainPoints.length,
      currentDescription: transformation.currentDescription,
      currentSteps: JSON.stringify(transformation.currentSteps || currentSteps),
      futureStepCount: transformation.futureStepCount,
      futureManualSteps: transformation.futureManualSteps,
      futureSystems: transformation.futureSystems,
      futureProcessingTime: transformation.futureProcessingTime,
      futureDescription: transformation.futureDescription,
      futureSteps: JSON.stringify(transformation.futureSteps || []),
      improvements: JSON.stringify(transformation.improvements || []),
      eliminatedSteps: JSON.stringify(transformation.eliminatedSteps || []),
      newCapabilities: JSON.stringify(transformation.newCapabilities || []),
    });

    results.push(record);
  }

  return results;
}

// ==================== VENDOR MONITORING AI ====================

const VENDOR_CHANGE_ANALYSIS_PROMPT = `You are an expert analyst monitoring enterprise software vendor activity. You are analyzing content from a vendor's website/blog/release notes to identify meaningful changes that could affect organizations evaluating or using this software.

VENDOR: {vendorPlatform}
SOURCE TYPE: {sourceType}
SOURCE NAME: {sourceName}
CONTEXT: {context}

Analyze the following content and extract any significant changes, updates, or announcements. For each change found, classify it:

Change Types:
- new_feature: New capability, module, or significant enhancement
- deprecation: Feature removal, end-of-life, sunset announcement
- pricing_change: Licensing model change, price increase/decrease
- acquisition: Company acquired or was acquired
- partnership: New strategic partnership or integration
- certification: New compliance cert, security cert, or gov approval
- bug_fix: Major bug fix or security patch
- roadmap_update: Future plans, version announcements, strategic shifts

Severity levels:
- critical: Breaking change, major deprecation, significant pricing change
- high: New major feature, important partnership, security issue
- medium: Notable enhancement, minor pricing adjustment
- low: Minor update, small feature addition
- info: General news, blog content, minor announcement

Return a JSON array of changes (empty array if no notable changes):
[
  {
    "changeType": "new_feature",
    "severity": "high",
    "title": "Short descriptive title",
    "summary": "2-3 sentence summary of the change and its implications",
    "details": "Longer analysis of business impact",
    "affectedModules": ["Finance", "Procurement"],
    "rawExcerpt": "Relevant quote from the source"
  }
]

IMPORTANT RULES:
- Be highly selective — only flag genuinely NEW and meaningful changes
- Ignore boilerplate, marketing fluff, minor UI tweaks, and generic blog content
- Focus on: product releases, deprecations, pricing changes, acquisitions, roadmap shifts, security updates, compliance certifications
- Each change must be a specific, actionable item — not a general summary of the page
- Do NOT repeat information that would appear on every page load (navigation text, footer content, "about us" text)
- If the content is mostly static marketing copy, return an empty array
- For press releases: extract the actual news, not the boilerplate
- For release notes: focus on major features and breaking changes, skip minor fixes
- For roadmaps: note timeline changes, new module announcements, platform direction shifts
- Focus on changes that would matter to a government organization evaluating this vendor for ERP/EAM implementation`;

export async function analyzeVendorChanges(
  vendorPlatform: string,
  sourceType: string,
  sourceName: string,
  content: string,
  context: string
): Promise<Array<{
  changeType: string;
  severity: string;
  title: string;
  summary: string;
  details?: string;
  affectedModules?: string[];
  rawExcerpt?: string;
}>> {
  const prompt = VENDOR_CHANGE_ANALYSIS_PROMPT
    .replace("{vendorPlatform}", vendorPlatform)
    .replace("{sourceType}", sourceType)
    .replace("{sourceName}", sourceName)
    .replace("{context}", context);

  try {
    const text = await llmCall(`${prompt}\n\nCONTENT TO ANALYZE:\n${content}`);
    // Extract JSON from response
    const jsonMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error: any) {
    console.error("Vendor change analysis error:", error.message);
    return [];
  }
}

// ==================== HEALTH CHECK DOCUMENT ANALYSIS ====================

export async function analyzeHealthCheckDocument(
  documentType: string,
  documentText: string,
  projectContext?: string
): Promise<{
  summary: string;
  overallHealth: string;
  raids: Array<{ type: string; title: string; description: string; severity: string; status: string; owner?: string; dueDate?: string }>;
  budgetItems: Array<{ category: string; description: string; amount: number; date?: string; notes?: string }>;
  scheduleItems: Array<{ milestone: string; originalDate?: string; currentDate?: string; status: string; varianceDays?: number; notes?: string }>;
  findings: Array<{ domain: string; severity: string; finding: string; evidence: string; recommendation: string }>;
  metrics: Record<string, any>;
}> {
  const contextStr = projectContext ? `\nPROJECT CONTEXT:\n${projectContext}` : "";

  const text = await llmCall(`You are an expert IV&V consultant analyzing a project document for a government ERP/EAM implementation health check.

DOCUMENT TYPE: ${documentType}
${contextStr}

Analyze the following document and extract ALL structured data. Be thorough — every risk, issue, budget line, schedule milestone, and finding matters.

For each category, extract as much as possible:

1. RAID ITEMS: Risks, Assumptions, Issues, Dependencies
   - Classify each as risk/assumption/issue/dependency
   - Assign severity: critical, high, medium, low
   - Status: open, mitigated, closed, escalated
   - Include owner and due dates if mentioned

2. BUDGET ITEMS: Any financial data
   - Categories: original_contract, change_order, additional_funding, actual_spend
   - Amounts in dollars (as integers, no decimals)

3. SCHEDULE ITEMS: Milestones, dates, delays
   - Original vs current dates
   - Status: on_track, at_risk, delayed, completed
   - Calculate variance in days if dates are available

4. FINDINGS: Assessment observations
   - Domain: governance, technical, raid, budget_schedule, change_management, data_migration, testing_quality, vendor_performance, compliance_security, scope_requirements
   - Severity: critical, high, medium, low, info
   - Include specific evidence from the document
   - Provide actionable recommendations
   - Map findings to the most relevant domain:
     * change_management: training, adoption, communications, organizational readiness
     * data_migration: data quality, mapping, conversion testing, cutover planning
     * testing_quality: SIT/UAT, defect trends, test coverage, regression
     * vendor_performance: SI delivery, resource availability, staffing, knowledge transfer
     * compliance_security: regulatory, audit, data privacy, security controls
     * scope_requirements: scope creep, requirements traceability, gap analysis, customizations

5. METRICS: Key numbers mentioned (defect counts, user counts, completion %, SLA adherence, etc.)

6. OVERALL HEALTH: critical, high, medium, low, or satisfactory

7. SUMMARY: 2-3 sentence executive summary of the document

Return JSON:
{
  "summary": "Executive summary",
  "overallHealth": "medium",
  "raids": [{"type": "risk", "title": "", "description": "", "severity": "high", "status": "open", "owner": "", "dueDate": ""}],
  "budgetItems": [{"category": "actual_spend", "description": "", "amount": 0, "date": "", "notes": ""}],
  "scheduleItems": [{"milestone": "", "originalDate": "", "currentDate": "", "status": "delayed", "varianceDays": 30, "notes": ""}],
  "findings": [{"domain": "governance", "severity": "high", "finding": "", "evidence": "", "recommendation": ""}],
  "metrics": {}
}

DOCUMENT TEXT:
${documentText.substring(0, 30000)}`, undefined, 8192);

  const jsonMatch = text.match(/\{[\s\S]*"summary"[\s\S]*\}/);
  if (!jsonMatch) {
    return { summary: "Unable to parse document", overallHealth: "medium", raids: [], budgetItems: [], scheduleItems: [], findings: [], metrics: {} };
  }
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return { summary: "Unable to parse document", overallHealth: "medium", raids: [], budgetItems: [], scheduleItems: [], findings: [], metrics: {} };
  }
}

// ==================== HEALTH CHECK SYNTHESIS ====================

export interface SynthesisResult {
  overallHealth: string;
  executiveSummary: string;
  domains: Array<{
    domain: string;
    rating: string;
    summary: string;
    findings: Array<{ severity: string; finding: string; evidence: string; recommendation: string }>;
  }>;
  topRisks: Array<{ title: string; severity: string; impact: string }>;
  budgetStatus: { summary: string; health: string };
  scheduleStatus: { summary: string; health: string };
  recommendedActions: string[];
}

export async function synthesizeHealthCheck(data: {
  projectContext: string;
  raidItems: any[];
  budgetEntries: any[];
  budgetSummary: any;
  scheduleItems: any[];
  documents: any[];
  existingAssessments: any[];
}): Promise<SynthesisResult> {
  // Build a comprehensive snapshot of all health check data
  let snapshot = `${data.projectContext}\n\n`;

  // RAID summary
  snapshot += `CURRENT RAID LOG (${data.raidItems.length} items):\n`;
  const raidByType: Record<string, number> = {};
  const openCritical: any[] = [];
  for (const r of data.raidItems) {
    raidByType[r.type] = (raidByType[r.type] || 0) + 1;
    if (r.status === "open" && (r.severity === "critical" || r.severity === "high")) {
      openCritical.push(r);
    }
  }
  snapshot += `Breakdown: ${Object.entries(raidByType).map(([t, c]) => `${c} ${t}s`).join(", ")}\n`;
  if (openCritical.length > 0) {
    snapshot += `Open Critical/High items:\n`;
    for (const r of openCritical.slice(0, 15)) {
      snapshot += `- [${r.type}/${r.severity}] ${r.title}: ${r.description || "No description"}${r.owner ? ` (Owner: ${r.owner})` : ""}\n`;
    }
  }
  // Include all items for thoroughness (up to 50)
  snapshot += `\nFull RAID items:\n`;
  for (const r of data.raidItems.slice(0, 50)) {
    snapshot += `- [${r.type}/${r.severity}/${r.status}] ${r.title}: ${(r.description || "").substring(0, 150)}${r.owner ? ` (Owner: ${r.owner})` : ""}${r.dueDate ? ` Due: ${r.dueDate}` : ""}\n`;
  }

  // Budget summary
  snapshot += `\nBUDGET STATUS:\n`;
  const bs = data.budgetSummary;
  snapshot += `- Original Contract: $${(bs.originalContract || 0).toLocaleString()}\n`;
  snapshot += `- Change Orders: $${(bs.totalChangeOrders || 0).toLocaleString()}\n`;
  snapshot += `- Additional Funding: $${(bs.totalAdditionalFunding || 0).toLocaleString()}\n`;
  snapshot += `- Total Authorized: $${((bs.originalContract || 0) + (bs.totalChangeOrders || 0) + (bs.totalAdditionalFunding || 0)).toLocaleString()}\n`;
  snapshot += `- Actual Spend: $${(bs.totalActualSpend || 0).toLocaleString()}\n`;
  snapshot += `- Variance: $${(bs.variance || 0).toLocaleString()}\n`;
  if (data.budgetEntries.length > 0) {
    snapshot += `Budget line items:\n`;
    for (const b of data.budgetEntries.slice(0, 20)) {
      snapshot += `- [${b.category}] ${b.description}: $${(b.amount || 0).toLocaleString()}${b.date ? ` (${b.date})` : ""}${b.notes ? ` — ${b.notes}` : ""}\n`;
    }
  }

  // Schedule summary
  snapshot += `\nSCHEDULE STATUS (${data.scheduleItems.length} milestones):\n`;
  const schedByStatus: Record<string, number> = {};
  for (const s of data.scheduleItems) {
    schedByStatus[s.status || "on_track"] = (schedByStatus[s.status || "on_track"] || 0) + 1;
  }
  snapshot += `Status: ${Object.entries(schedByStatus).map(([s, c]) => `${c} ${s}`).join(", ")}\n`;
  for (const s of data.scheduleItems.slice(0, 20)) {
    snapshot += `- ${s.milestone}: ${s.status || "on_track"}`;
    if (s.originalDate) snapshot += ` (baseline: ${s.originalDate}`;
    if (s.currentDate) snapshot += ` → current: ${s.currentDate}`;
    if (s.originalDate) snapshot += `)`;
    if (s.varianceDays) snapshot += ` [${s.varianceDays > 0 ? "+" : ""}${s.varianceDays}d]`;
    if (s.notes) snapshot += ` — ${s.notes}`;
    snapshot += `\n`;
  }

  // Document analysis summaries
  const analyzedDocs = data.documents.filter(d => d.analysisStatus === "completed" && d.aiAnalysis);
  if (analyzedDocs.length > 0) {
    snapshot += `\nANALYZED DOCUMENTS (${analyzedDocs.length}):\n`;
    for (const doc of analyzedDocs.slice(0, 10)) {
      try {
        const analysis = JSON.parse(doc.aiAnalysis);
        snapshot += `- ${doc.fileName} (${doc.documentType}${doc.period ? `, ${doc.period}` : ""}): ${analysis.summary || "No summary"}\n`;
        if (analysis.overallHealth) snapshot += `  Health rating from this document: ${analysis.overallHealth}\n`;
      } catch {
        snapshot += `- ${doc.fileName} (${doc.documentType}): Analysis available but not parseable\n`;
      }
    }
  }

  // Existing assessments for context
  if (data.existingAssessments.length > 0) {
    snapshot += `\nEXISTING DOMAIN ASSESSMENTS:\n`;
    for (const a of data.existingAssessments) {
      snapshot += `- ${a.domain}: ${a.overallRating || "unrated"} — ${a.summary || "No summary"}`;
      if (a.assessedBy) snapshot += ` (by ${a.assessedBy})`;
      snapshot += `\n`;
    }
  }

  const text = await llmCall(`You are a senior IV&V consultant synthesizing a comprehensive health check assessment for a government ERP/EAM implementation project.

You have been given the full project context including client information, discovery findings, vendor evaluation data, and all current health check data (RAID log, budget, schedule, documents, prior assessments).

Your job is to produce a UNIFIED health assessment that:
1. Synthesizes across ALL data sources — don't just repeat individual findings
2. Connects the dots between upstream data (discovery pain points, vendor evaluation gaps) and current project health
3. Identifies patterns and systemic issues, not just individual items
4. Provides actionable, specific recommendations
5. Rates each domain honestly — don't sugarcoat problems

HEALTH CHECK DATA:
${snapshot}

Return a JSON response with this exact structure:
{
  "overallHealth": "critical|high|medium|low|satisfactory",
  "executiveSummary": "3-5 sentence executive summary of project health, highlighting the most important issues and trends",
  "domains": [
    {"domain": "governance", "rating": "critical|high|medium|low|satisfactory", "summary": "2-3 sentence assessment", "findings": [{"severity": "...", "finding": "...", "evidence": "...", "recommendation": "..."}]},
    {"domain": "raid", "rating": "...", "summary": "...", "findings": [...]},
    {"domain": "technical", "rating": "...", "summary": "...", "findings": [...]},
    {"domain": "budget_schedule", "rating": "...", "summary": "...", "findings": [...]},
    {"domain": "change_management", "rating": "...", "summary": "Organizational readiness, training progress, adoption risks", "findings": [...]},
    {"domain": "data_migration", "rating": "...", "summary": "Data quality, mapping completeness, conversion testing status", "findings": [...]},
    {"domain": "testing_quality", "rating": "...", "summary": "SIT/UAT progress, defect trends, test coverage", "findings": [...]},
    {"domain": "vendor_performance", "rating": "...", "summary": "SI delivery quality, resource availability, contract performance", "findings": [...]},
    {"domain": "compliance_security", "rating": "...", "summary": "Regulatory compliance, audit readiness, security posture", "findings": [...]},
    {"domain": "scope_requirements", "rating": "...", "summary": "Scope management, requirements coverage, gap analysis status", "findings": [...]}
  ],
  "topRisks": [
    {"title": "Risk title", "severity": "critical|high|medium|low", "impact": "Brief description of potential impact"}
  ],
  "budgetStatus": {"summary": "1-2 sentence budget health summary", "health": "on_track|at_risk|over_budget|under_budget"},
  "scheduleStatus": {"summary": "1-2 sentence schedule health summary", "health": "on_track|at_risk|delayed|critical"},
  "recommendedActions": ["Specific action 1", "Specific action 2", "...up to 5 prioritized actions"]
}

Keep topRisks to the 3-5 most important. Keep recommendedActions to 3-5 prioritized items. Each domain should have 2-5 findings.
If insufficient data exists for a domain, still include it with rating "low" and a finding noting that more data is needed.
Return ONLY valid JSON.`, undefined, 16384);

  const jsonMatch = text.match(/\{[\s\S]*"overallHealth"[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      overallHealth: "medium",
      executiveSummary: "Unable to synthesize health assessment. Please ensure project has sufficient data.",
      domains: [],
      topRisks: [],
      budgetStatus: { summary: "Insufficient data", health: "at_risk" },
      scheduleStatus: { summary: "Insufficient data", health: "at_risk" },
      recommendedActions: ["Upload project documents and run analysis to enable health synthesis"],
    };
  }
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return {
      overallHealth: "medium",
      executiveSummary: "Unable to parse synthesis results.",
      domains: [],
      topRisks: [],
      budgetStatus: { summary: "Parse error", health: "at_risk" },
      scheduleStatus: { summary: "Parse error", health: "at_risk" },
      recommendedActions: ["Retry synthesis"],
    };
  }
}

// ==================== IV&V CHECKPOINT ASSESSMENT ====================

export async function assessCheckpoint(data: {
  checkpointName: string;
  checkpointPhase: string;
  projectContext: string;
  assessments: any[];
  raidItems: any[];
  scheduleItems: any[];
  documents: any[];
}): Promise<{ dimensions: any[]; overallAssessment: string; recommendations: string; findings: string }> {
  let snapshot = `Checkpoint: ${data.checkpointName} (Phase: ${data.checkpointPhase})\n\n`;
  snapshot += data.projectContext + "\n\n";

  // Health check summary
  snapshot += "HEALTH CHECK DOMAINS:\n";
  for (const a of data.assessments) {
    snapshot += `- ${a.domain}: ${a.overallRating || "unrated"} — ${(a.summary || "").substring(0, 150)}\n`;
  }

  // RAID
  const openCrit = data.raidItems.filter(r => r.status === "open" && (r.severity === "critical" || r.severity === "high"));
  snapshot += `\nRAID: ${data.raidItems.length} total, ${openCrit.length} open critical/high\n`;
  for (const r of openCrit.slice(0, 8)) {
    snapshot += `- [${r.type}/${r.severity}] ${r.title}\n`;
  }

  // Schedule
  const delayed = data.scheduleItems.filter(s => s.status === "delayed");
  snapshot += `\nSCHEDULE: ${data.scheduleItems.length} milestones, ${delayed.length} delayed\n`;

  // Documents
  const analyzed = data.documents.filter(d => d.analysisStatus === "completed" && d.aiAnalysis);
  for (const doc of analyzed.slice(0, 3)) {
    try { snapshot += `\nDocument "${doc.fileName}": ${JSON.parse(doc.aiAnalysis).summary || ""}\n`; } catch {}
  }

  const text = await llmCall(`You are a senior IV&V consultant performing a checkpoint assessment for a government ERP implementation.

PROJECT DATA:
${snapshot}

Assess each of the 7 IV&V dimensions. For each, provide:
- rating: satisfactory, needs_attention, at_risk, or unsatisfactory
- observation: 1-2 sentences on what you observed
- evidence: specific data points
- recommendation: what to do

DIMENSIONS:
1. schedule_discipline — Are milestones being met? Is the schedule realistic?
2. deliverable_completeness — Are contract deliverables being produced on time and at quality?
3. requirements_traceability — Can requirements be traced from discovery through design to testing?
4. design_architecture — Is the technical design sound? Are integrations properly planned?
5. data_migration — Is data migration on track with acceptable quality?
6. defect_management — Are defects being tracked, triaged, and resolved effectively?
7. testing_coverage — Is testing comprehensive? Are test cases covering critical paths?

Also provide:
- overallAssessment: 2-3 sentence summary
- recommendations: top 3-5 recommendations
- findings: key findings paragraph

Return JSON:
{
  "dimensions": [
    {"dimension": "schedule_discipline", "rating": "at_risk", "observation": "...", "evidence": "...", "recommendation": "..."},
    ...all 7
  ],
  "overallAssessment": "...",
  "recommendations": "...",
  "findings": "..."
}
Return ONLY valid JSON.`, undefined, 4096);

  const jsonMatch = text.match(/\{[\s\S]*"dimensions"[\s\S]*\}/);
  if (!jsonMatch) return { dimensions: [], overallAssessment: "Unable to assess.", recommendations: "", findings: "" };
  try { return JSON.parse(jsonMatch[0]); } catch { return { dimensions: [], overallAssessment: "Parse error.", recommendations: "", findings: "" }; }
}

// ==================== GO-LIVE READINESS ASSESSMENT ====================

export async function assessGoLiveReadiness(data: {
  projectContext: string;
  assessments: any[];
  raidItems: any[];
  budgetSummary: any;
  scheduleItems: any[];
  documents: any[];
  baseline: any;
}): Promise<{ criteria: any[]; overallNotes: string }> {
  let snapshot = data.projectContext + "\n\n";

  // RAID summary
  const openRisks = data.raidItems.filter(r => r.status === "open");
  const criticalItems = openRisks.filter(r => r.severity === "critical");
  snapshot += `RAID: ${data.raidItems.length} total, ${openRisks.length} open, ${criticalItems.length} critical\n`;
  for (const r of criticalItems.slice(0, 10)) {
    snapshot += `- [${r.type}/${r.severity}] ${r.title}: ${r.description || ""}\n`;
  }

  // Health check assessments
  snapshot += "\nHEALTH CHECK ASSESSMENTS:\n";
  for (const a of data.assessments) {
    snapshot += `- ${a.domain}: ${a.overallRating || "unrated"} — ${a.summary || ""}\n`;
  }

  // Schedule
  const delayed = data.scheduleItems.filter(s => s.status === "delayed");
  snapshot += `\nSCHEDULE: ${data.scheduleItems.length} milestones, ${delayed.length} delayed\n`;
  for (const s of delayed.slice(0, 5)) {
    snapshot += `- ${s.milestone}: ${s.varianceDays ? s.varianceDays + " days late" : "delayed"}\n`;
  }

  // Budget
  const bs = data.budgetSummary;
  const totalAuth = (bs.originalContract || 0) + (bs.totalChangeOrders || 0) + (bs.totalAdditionalFunding || 0);
  snapshot += `\nBUDGET: $${(bs.totalActualSpend || 0).toLocaleString()} spent of $${totalAuth.toLocaleString()} authorized\n`;

  // Baseline
  if (data.baseline?.goLiveDate) {
    const days = Math.ceil((new Date(data.baseline.goLiveDate).getTime() - Date.now()) / (86400000));
    snapshot += `\nGO-LIVE: ${data.baseline.goLiveDate} (${days > 0 ? days + " days remaining" : Math.abs(days) + " days past"})\n`;
  }

  // Document summaries
  const analyzedDocs = data.documents.filter(d => d.analysisStatus === "completed" && d.aiAnalysis);
  for (const doc of analyzedDocs.slice(0, 5)) {
    try {
      const analysis = JSON.parse(doc.aiAnalysis);
      snapshot += `\nDOCUMENT "${doc.fileName}": ${analysis.summary || ""}\n`;
    } catch {}
  }

  const text = await llmCall(`You are a senior IV&V consultant assessing go-live readiness for a government ERP implementation.

PROJECT DATA:
${snapshot}

Score each of the following 13 go-live readiness criteria on a scale of 0-10. For each criterion, provide:
- score (0-10)
- evidence (specific data points from the project that justify the score)
- recommendation (what needs to happen before go-live)
- confidence (high/medium/low — how confident you are in this score given available data)

CRITERIA:
1. SIT Completion (weight: 10) — Has System Integration Testing been completed? What % of test cases passed?
2. E2E Testing Exit (weight: 12) — Have end-to-end business process tests been completed and signed off?
3. UAT/UER Completion (weight: 12) — Has User Acceptance Testing been completed with sign-off from business owners?
4. Payroll Compare (weight: 8) — Have parallel payroll runs been completed and reconciled?
5. Critical/High Defect Resolution (weight: 15) — Have all critical and high-severity defects been resolved?
6. Defect Burn-down Trend (weight: 5) — Is the defect discovery/resolution trend positive?
7. Data Migration Quality (weight: 10) — Has data migration been validated with acceptable error rates?
8. Reconciliation Results (weight: 5) — Have financial and data reconciliation checks passed?
9. Cutover Plan Completeness (weight: 8) — Is the cutover plan documented, reviewed, and rehearsed?
10. Rollback Plan (weight: 3) — Is a rollback plan documented and tested?
11. Training Completion (weight: 5) — Have all end users been trained?
12. Support Model Activated (weight: 4) — Is the post-go-live support model (hypercare team, help desk) ready?
13. Hypercare Plan (weight: 3) — Is the hypercare plan documented with escalation procedures?

Return JSON:
{
  "criteria": [
    {"name": "SIT Completion", "score": 4, "weight": 10, "evidence": "SIT at 34% completion per health check", "recommendation": "Extend SIT by 4 weeks minimum", "confidence": "high"},
    ...all 13 criteria
  ],
  "overallNotes": "2-3 sentence executive summary of go-live readiness"
}
Return ONLY valid JSON.`, undefined, 4096);

  const jsonMatch = text.match(/\{[\s\S]*"criteria"[\s\S]*\}/);
  if (!jsonMatch) return { criteria: [], overallNotes: "Unable to assess readiness." };
  try { return JSON.parse(jsonMatch[0]); } catch { return { criteria: [], overallNotes: "Parse error." }; }
}

// ==================== PROCESS DESCRIPTIONS ====================

export async function generateProcessDescriptions(
  interviews: any[],
  painPoints: any[],
  orgProfile: any
): Promise<{ processes: any[] }> {
  const interviewSummary = interviews.filter(i => i.status === "completed" || i.findings).map(i => {
    let findings = "";
    try {
      const data = i.messages ? JSON.parse(i.messages) : {};
      if (data.answers) findings = Object.values(data.answers).map((a: any) => a.answer).filter(Boolean).join(". ");
    } catch {}
    return `[${i.functionalArea}] ${i.interviewee || "Interview"}: ${i.findings || findings || "No findings"}`;
  }).join("\n\n");

  const ppList = painPoints.map(p =>
    `[${p.functionalArea}] ${p.description} (severity: ${p.severity || "medium"})${p.currentWorkaround ? " — Workaround: " + p.currentWorkaround : ""}`
  ).join("\n");

  const orgSummary = orgProfile
    ? `${orgProfile.entityName || orgProfile.name || "Organization"} (${orgProfile.entityType || "government"})`
    : "Government organization";

  const text = await llmCall(`You are a senior business process analyst documenting current-state processes for a government ERP implementation.

ORGANIZATION: ${orgSummary}

INTERVIEW FINDINGS:
${interviewSummary}

KNOWN PAIN POINTS:
${ppList}

From these interviews and pain points, identify and document 4-8 key business processes. For each process:
1. Give it a clear name (e.g., "Purchase Order Processing", "Month-End Financial Close")
2. Write a 2-3 sentence description
3. List 4-8 current-state steps with the actor (role), system used, whether it's manual, and any pain points at that step
4. Identify the systems involved and actors/roles
5. Estimate average duration and frequency
6. Generate TWO Mermaid diagrams:
   a) A simple flowchart (graph TD) showing the process flow
   b) A swimlane diagram using Mermaid's "block-beta" or flowchart subgraph syntax that groups steps by actor/role

For the swimlane, use this Mermaid syntax pattern with subgraphs per role:
graph LR
  subgraph AP_Clerk[AP Clerk]
    A[Receive Invoice] --> B[Enter in SAP]
  end
  subgraph AP_Supervisor[AP Supervisor]
    C[Review & Approve]
  end
  subgraph AP_Manager[AP Manager]
    D[3-Way Match]
  end
  subgraph Treasury[Treasury]
    E[Schedule Payment] --> F[Execute Payment]
  end
  B --> C
  C --> D
  D --> E

Return JSON:
{
  "processes": [
    {
      "functionalArea": "Accounts Payable",
      "processName": "Invoice Processing",
      "description": "End-to-end process from invoice receipt to payment execution",
      "currentSteps": [
        {"step": 1, "actor": "AP Clerk", "system": "Manual/Email", "description": "Receive invoice via email or mail", "isManual": true, "painPoints": ["No automated capture"]},
        {"step": 2, "actor": "AP Clerk", "system": "SAP", "description": "Manually enter invoice details into SAP", "isManual": true, "painPoints": ["Duplicate entry", "Data errors"]},
        {"step": 3, "actor": "AP Supervisor", "system": "SAP", "description": "Review and approve invoice", "isManual": false, "painPoints": []},
        {"step": 4, "actor": "AP Manager", "system": "SAP/Excel", "description": "Match to PO and receiving", "isManual": true, "painPoints": ["Manual 3-way match"]},
        {"step": 5, "actor": "Treasury", "system": "SAP", "description": "Schedule and execute payment", "isManual": false, "painPoints": ["No early pay discount tracking"]}
      ],
      "currentSystems": "SAP, Email, Excel",
      "currentActors": "AP Clerk, AP Supervisor, AP Manager, Treasury",
      "avgDuration": "5-7 business days",
      "frequency": "Daily (50-100 invoices/week)",
      "mermaidDiagram": "graph TD\\n    A[Receive Invoice] --> B[Enter in SAP]\\n    B --> C{PO Match?}\\n    C -->|Yes| D[Approve]\\n    C -->|No| E[Return to Vendor]\\n    D --> F[Schedule Payment]\\n    F --> G[Execute Payment]",
      "swimlaneDiagram": "graph LR\\n  subgraph AP_Clerk[AP Clerk]\\n    A[Receive Invoice] --> B[Enter in SAP]\\n  end\\n  subgraph AP_Supervisor[AP Supervisor]\\n    C[Review & Approve]\\n  end\\n  subgraph AP_Manager[AP Manager]\\n    D[3-Way Match]\\n  end\\n  subgraph Treasury[Treasury]\\n    E[Schedule Payment] --> F[Execute Payment]\\n  end\\n  B --> C\\n  C --> D\\n  D --> E"
    }
  ]
}

Make processes specific to government operations. Use realistic examples. Return ONLY valid JSON.`, undefined, 8192);

  const jsonMatch = text.match(/\{[\s\S]*"processes"[\s\S]*\}/);
  if (!jsonMatch) return { processes: [] };
  try { return JSON.parse(jsonMatch[0]); } catch { return { processes: [] }; }
}

// ==================== OUTCOMES & SCENARIOS ====================

export async function generateOutcomes(painPoints: any[], orgProfile: any): Promise<{ outcomes: any[] }> {
  const ppList = painPoints.map((p, i) =>
    `${i + 1}. [${p.severity || "medium"}] [${p.functionalArea}] ${p.description}${p.impact ? " — Impact: " + p.impact : ""}`
  ).join("\n");

  const orgSummary = orgProfile
    ? `${orgProfile.entityName || orgProfile.name || "Organization"} (${orgProfile.entityType || "government"}), ${orgProfile.state || "US"}, Pop: ${orgProfile.population || "N/A"}, Employees: ${orgProfile.employeeCount || "N/A"}, Budget: ${orgProfile.annualBudget || "N/A"}`
    : "Government organization";

  const text = await llmCall(`You are a senior ERP/EAM implementation consultant converting discovery pain points into strategic outcome statements for a vendor evaluation.

ORGANIZATION: ${orgSummary}

PAIN POINTS:
${ppList}

Generate 6-10 strategic outcome statements. Each outcome should:
1. Be measurable and specific (not vague like "improve efficiency")
2. Reference a target KPI with current vs target values
3. Map to one or more source pain points by their index number
4. Be written from the client's perspective ("Achieve...", "Reduce...", "Enable...")

Categories: finance, hr, procurement, asset_management, it, utilities, general

Return JSON:
{
  "outcomes": [
    {
      "title": "Achieve 3-day month-end financial close",
      "description": "Eliminate manual reconciliation bottlenecks to compress the close cycle",
      "category": "finance",
      "sourcePainPointIndexes": [1, 2],
      "currentState": "Month-end close takes 12 business days",
      "targetState": "Automated close process completing in 3 business days",
      "currentKpi": "12",
      "targetKpi": "3",
      "kpiUnit": "business days",
      "priority": "critical"
    }
  ]
}
Return ONLY valid JSON.`, undefined, 4096);

  const jsonMatch = text.match(/\{[\s\S]*"outcomes"[\s\S]*\}/);
  if (!jsonMatch) return { outcomes: [] };
  try { return JSON.parse(jsonMatch[0]); } catch { return { outcomes: [] }; }
}

export async function generateDemoScenarios(outcome: any, orgProfile: any): Promise<{ scenarios: any[] }> {
  const orgSummary = orgProfile
    ? `${orgProfile.entityName || orgProfile.name || "Organization"} (${orgProfile.entityType || "government"})`
    : "Government organization";

  const text = await llmCall(`You are creating vendor demo evaluation scenarios for a government ERP implementation.

OUTCOME: ${outcome.title}
DESCRIPTION: ${outcome.description || ""}
CURRENT STATE: ${outcome.currentState || "Not documented"}
TARGET STATE: ${outcome.targetState || "Not documented"}
ORGANIZATION: ${orgSummary}

Generate 3-5 demo scenarios that test whether a vendor can deliver this outcome. Each scenario should be a realistic end-to-end process walkthrough.

Return JSON:
{
  "scenarios": [
    {
      "title": "Process title",
      "narrative": "Business context story for the vendor before the demo",
      "setupInstructions": "What test data/config the vendor should prepare",
      "walkthrough": [
        {"step": 1, "instruction": "What to demonstrate", "whatToEvaluate": "What evaluator watches for"}
      ],
      "successCriteria": [
        {"criterion": "What success looks like", "measurable": true, "target": "Specific target"}
      ],
      "estimatedMinutes": 15,
      "functionalArea": "${outcome.category || "general"}"
    }
  ]
}
Make scenarios specific to government processes. Return ONLY valid JSON.`, undefined, 8192);

  const jsonMatch = text.match(/\{[\s\S]*"scenarios"[\s\S]*\}/);
  if (!jsonMatch) return { scenarios: [] };
  try { return JSON.parse(jsonMatch[0]); } catch { return { scenarios: [] }; }
}

export async function mapOutcomesToRequirements(
  outcomes: Array<{ id: number; title: string; description: string; category: string }>,
  requirements: Array<{ id: number; reqNumber: string; functionalArea: string; description: string; category: string }>
): Promise<Record<number, number[]>> {
  // Build concise lists for the LLM
  const outcomeList = outcomes.map(o => `${o.id}: [${o.category}] ${o.title} — ${o.description}`).join("\n");
  const reqList = requirements.slice(0, 200).map(r => `${r.id}|${r.reqNumber}: [${r.functionalArea}] ${r.description}`).join("\n");

  const text = await llmCall(`You are mapping strategic outcomes to specific ERP requirements.

OUTCOMES:
${outcomeList}

REQUIREMENTS (id|reqNumber: description):
${reqList}

For each outcome, identify the 3-10 most relevant requirements that directly support achieving that outcome.

Return JSON mapping outcome ID to array of requirement IDs:
{
  "mapping": {
    "1": [101, 102, 105],
    "2": [203, 204]
  }
}
Return ONLY valid JSON.`, undefined, 4096);

  const jsonMatch = text.match(/\{[\s\S]*"mapping"[\s\S]*\}/);
  if (!jsonMatch) return {};
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const result: Record<number, number[]> = {};
    for (const [outcomeId, reqIds] of Object.entries(parsed.mapping || {})) {
      result[parseInt(outcomeId)] = (reqIds as any[]).map(Number).filter(id => requirements.some(r => r.id === id));
    }
    return result;
  } catch { return {}; }
}

export function getVendorKbContext(
  vendorPlatform: string,
  functionalArea: string,
  capabilities: any[]
): string {
  const relevant = capabilities.filter(c =>
    c.vendorPlatform === vendorPlatform &&
    (c.module === functionalArea || c.processArea?.toLowerCase().includes(functionalArea.toLowerCase()))
  );
  if (relevant.length === 0) return "No knowledge base data available for this vendor/area.";

  return relevant.map(c => {
    let summary = `${c.processArea}: ${c.workflowDescription || ""}`;
    if (c.maturityRating) summary += ` (Maturity: ${c.maturityRating}/5)`;
    if (c.automationLevel) summary += ` [${c.automationLevel}]`;
    try {
      const diffs = JSON.parse(c.differentiators || "[]");
      if (diffs.length) summary += `\nStrengths: ${diffs.join(", ")}`;
    } catch {}
    try {
      const lims = JSON.parse(c.limitations || "[]");
      if (lims.length) summary += `\nLimitations: ${lims.join(", ")}`;
    } catch {}
    return summary;
  }).join("\n\n");
}

export { xai, CHAT_SYSTEM_PROMPT, PROPOSAL_ANALYSIS_PROMPT, llmCall, llmStream };
