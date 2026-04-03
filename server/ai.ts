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

export { anthropic, CHAT_SYSTEM_PROMPT, PROPOSAL_ANALYSIS_PROMPT };
