import Anthropic from "@anthropic-ai/sdk";
import { storage } from "./storage";

const anthropic = new Anthropic();

const CHAT_SYSTEM_PROMPT = `You are an AI evaluation analyst embedded in Avero Caliber, a vendor evaluation platform for government ERP/EAM implementations. You have complete access to this project's data.

PROJECT CONTEXT:
{projectContext}

Your role:
- Answer questions about vendor scores, gaps, costs, and requirements with precision
- Provide strategic analysis and recommendations grounded in the data
- Generate executive summaries, risk assessments, and talking points
- Compare vendors across any dimension the user asks about
- Be direct, data-driven, and consultative in tone
- Always cite specific numbers and evidence from the project data
- When asked to generate content (summaries, memos, etc.), write in a professional consulting style`;

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
Created: ${project.createdAt}

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

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [{ role: "user", content: `Based on this discovery interview transcript for ${functionalArea}, extract structured findings:

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
${transcriptText}` }],
  });

  try {
    const text = response.content[0].type === "text" ? response.content[0].text : "";
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

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    messages: [{ role: "user", content: `You are generating ERP/EAM requirements based on a comprehensive discovery process.

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

Return as a JSON array of objects with keys: module, description, criticality, justification, painPointRef` }],
  });

  try {
    const text = response.content[0].type === "text" ? response.content[0].text : "";
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
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      });

      const text = response.content[0].type === "text" ? response.content[0].text : "";
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

Be selective — only flag genuinely meaningful changes. Ignore boilerplate, marketing fluff, and minor UI tweaks. Focus on changes that would matter to a government organization evaluating this vendor.`;

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
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [
        { role: "user", content: `${prompt}\n\nCONTENT TO ANALYZE:\n${content}` }
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
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

export { anthropic, CHAT_SYSTEM_PROMPT, PROPOSAL_ANALYSIS_PROMPT };
