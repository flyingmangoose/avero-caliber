import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { templateRequirements, CATEGORIES, MODULE_PREFIXES } from "@shared/templates";
import { defaultModuleWeights, vendorProfiles } from "@shared/vendors";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import multer from "multer";
import * as XLSX from "xlsx";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ==================== DOMAIN RESEARCH ====================

  function stripHtml(html: string): string {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  async function fetchPageText(url: string): Promise<string> {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; CaliberBot/1.0)" },
        signal: AbortSignal.timeout(10000),
        redirect: "follow",
      });
      if (!res.ok) return "";
      const html = await res.text();
      return stripHtml(html);
    } catch {
      return "";
    }
  }

  app.post("/api/research-domain", async (req, res) => {
    const { domain: rawDomain } = req.body;
    if (!rawDomain) return res.status(400).json({ error: "domain is required" });

    const domain = rawDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "");

    let websiteText = "";
    try {
      // Fetch homepage
      const homeText = await fetchPageText(`https://${domain}`);
      websiteText = homeText;

      // Try additional pages in parallel
      const extraUrls = [
        `https://${domain}/about`, `https://${domain}/about-us`, `https://${domain}/government`,
        `https://${domain}/budget`, `https://${domain}/finance`, `https://${domain}/departments`,
      ];
      const extraResults = await Promise.allSettled(extraUrls.map(u => fetchPageText(u)));
      for (const r of extraResults) {
        if (r.status === "fulfilled" && r.value.length > 100) {
          websiteText += "\n\n" + r.value;
        }
      }
    } catch (err) {
      console.error("Website fetch error:", err);
    }

    try {
      const { llmCall } = await import("./ai");

      const websiteSection = websiteText.length > 200
        ? `\n\nWEBSITE CONTENT FROM ${domain}:\n${websiteText.substring(0, 30000)}`
        : "";

      const prompt = `You are a senior government technology consultant researching a client organization.

Domain: ${domain}
${websiteSection}

Provide a comprehensive profile of this government entity. Use the website content above where available, but ALSO use your general knowledge to fill in any gaps. Government entities are public — their population, budget, employee count, and department structure are public information.

Return JSON with ALL fields populated — do not leave fields as null if you can provide a reasonable value or estimate. Mark estimates with "(est)" in string fields.

{
  "entityName": "official full name",
  "entityType": "city/county/utility/transit/port/state_agency/special_district",
  "state": "state abbreviation",
  "population": number (served population),
  "employeeCount": number (approximate, mark description if estimated),
  "annualBudget": "dollar amount string, e.g. $6.2B",
  "departments": [
    { "name": "Department Name", "headcount": number or null }
  ],
  "currentSystems": [
    { "name": "system name", "module": "what it handles", "vendor": "vendor name", "yearsInUse": number or null }
  ],
  "leadership": [
    { "name": "person name", "title": "their title" }
  ],
  "keyFacts": "2-3 sentences about the entity relevant to ERP/technology context",
  "challenges": "common technology and operational challenges for this entity type and size"
}

IMPORTANT:
- For departments: List ALL major departments. For cities include: Finance, HR, IT, Public Works, Parks & Recreation, Police, Fire, Planning/Development, City Attorney, Library, Water/Sewer, Transportation, etc.
- For population/employees/budget: These are public record. Provide your best knowledge. Use approximate numbers rather than null.
- For current systems: Include any ERP/financial/HR systems if known from public information (budget documents, RFPs, job postings often mention these). If unknown, provide an empty array.
- For leadership: Include mayor/manager/administrator, CFO/finance director, CIO/IT director if known.

Return ONLY the JSON object.`;

      const text = await llmCall(prompt);
      const jsonStr = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const data = JSON.parse(jsonStr);
      res.json({ success: true, data, source: websiteText.length > 200 ? "website" : "knowledge" });
    } catch (err: any) {
      console.error("Domain research error:", err);
      // Fallback: basic info from domain name
      res.json({
        success: true,
        source: "fallback",
        data: {
          entityName: domain, entityType: "city", state: null,
          population: null, employeeCount: null, annualBudget: null,
          departments: [
            { name: "Finance", headcount: null }, { name: "Human Resources", headcount: null },
            { name: "Public Works", headcount: null }, { name: "IT/Technology", headcount: null },
            { name: "Police", headcount: null }, { name: "Fire", headcount: null },
          ],
          currentSystems: [], leadership: [],
          keyFacts: null, challenges: null,
        },
      });
    }
  });

  // Document extraction
  const docUpload = multer({ dest: os.tmpdir(), limits: { fileSize: 50 * 1024 * 1024 } });

  app.post("/api/extract-document", docUpload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    try {
      let docText = "";
      const fileBuffer = fs.readFileSync(req.file.path);

      if (req.file.originalname.endsWith(".pdf") || req.file.mimetype === "application/pdf") {
        const pdfParse = require("pdf-parse");
        const pdfData = await pdfParse(fileBuffer);
        docText = pdfData.text || "";
      } else {
        // DOCX or other — extract raw text
        docText = fileBuffer.toString("utf-8").replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s+/g, " ");
      }

      // Cleanup temp file
      try { fs.unlinkSync(req.file.path); } catch {}

      if (!docText || docText.trim().length < 50) {
        return res.status(400).json({ error: "Could not extract meaningful text from the document." });
      }

      const { llmCall } = await import("./ai");
      const response_text = await llmCall(`You are analyzing a government RFP/SOW/procurement document for an ERP/EAM implementation project. Extract all relevant information.

DOCUMENT TEXT:
${docText.substring(0, 50000)}

Extract the following as JSON:

{
  "entityName": "the government entity issuing this document",
  "entityType": "city/county/utility/transit/port/state_agency/special_district",
  "state": "state abbreviation",
  "population": number or null,
  "employeeCount": number or null,
  "annualBudget": "dollar amount string" or null,
  "projectDescription": "2-3 sentence description of what they're looking for",
  "projectScope": ["list of functional areas/modules mentioned"],
  "timeline": {
    "rfpIssueDate": "date" or null,
    "proposalDueDate": "date" or null,
    "expectedStartDate": "date" or null,
    "expectedGoLive": "date" or null,
    "contractTerm": "e.g., 5 years" or null
  },
  "budget": {
    "estimatedTotal": "dollar amount" or null,
    "implementationBudget": "dollar amount" or null,
    "annualOperating": "dollar amount" or null
  },
  "departments": [
    { "name": "department name", "headcount": number or null }
  ],
  "currentSystems": [
    { "name": "system name", "module": "what it's used for", "vendor": "vendor", "yearsInUse": number or null }
  ],
  "keyRequirements": [
    "brief description of a key requirement mentioned"
  ],
  "evaluationCriteria": [
    { "criterion": "name", "weight": "percentage or points" }
  ],
  "challenges": "key challenges or pain points mentioned in the document"
}

Extract as much as you can find. For items not mentioned in the document, use null. Do NOT make up information that isn't in the document.
Return ONLY the JSON.`);

      const jsonStr = response_text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const data = JSON.parse(jsonStr);
      res.json({ success: true, data });
    } catch (err: any) {
      console.error("Document extraction error:", err);
      try { if (req.file?.path) fs.unlinkSync(req.file.path); } catch {}
      res.status(500).json({ error: err.message || "Failed to extract document information" });
    }
  });

  // ==================== PROJECTS ====================

  app.get("/api/projects", (_req, res) => {
    const projects = storage.getProjects();
    // Attach stats to each project
    const projectsWithStats = projects.map(p => ({
      ...p,
      stats: storage.getProjectStats(p.id),
    }));
    res.json(projectsWithStats);
  });

  app.post("/api/projects", (req, res) => {
    const { name, description, status } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Project name is required" });
    }
    const project = storage.createProject({
      name,
      description: description || "",
      status: status || "draft",
    });
    res.status(201).json(project);
  });

  app.get("/api/projects/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const project = storage.getProject(id);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }
    const stats = storage.getProjectStats(id);
    res.json({ ...project, stats });
  });

  app.patch("/api/projects/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const project = storage.updateProject(id, req.body);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }
    res.json(project);
  });

  app.delete("/api/projects/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const project = storage.getProject(id);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }
    storage.deleteProject(id);
    res.status(204).send();
  });

  // ==================== REQUIREMENTS ====================

  app.get("/api/projects/:id/requirements", (req, res) => {
    const projectId = parseInt(req.params.id);
    const { category, functionalArea, criticality, search } = req.query;
    const reqs = storage.getRequirements(projectId, {
      category: category as string | undefined,
      functionalArea: functionalArea as string | undefined,
      criticality: criticality as string | undefined,
      search: search as string | undefined,
    });
    res.json(reqs);
  });

  app.post("/api/projects/:id/requirements", (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const { reqNumber, category, functionalArea, subCategory, description, criticality, vendorResponse, comments } = req.body;
    if (!reqNumber || !category || !functionalArea || !description) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const req2 = storage.createRequirement({
      projectId,
      reqNumber,
      category,
      functionalArea,
      subCategory: subCategory || "",
      description,
      criticality: criticality || "Critical",
      vendorResponse: vendorResponse || null,
      comments: comments || "",
    });
    res.status(201).json(req2);
  });

  app.patch("/api/requirements/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const updated = storage.updateRequirement(id, req.body);
    if (!updated) {
      return res.status(404).json({ error: "Requirement not found" });
    }
    res.json(updated);
  });

  app.delete("/api/requirements/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const req2 = storage.getRequirement(id);
    if (!req2) {
      return res.status(404).json({ error: "Requirement not found" });
    }
    storage.deleteRequirement(id);
    res.status(204).send();
  });

  // ==================== BULK UPDATE / BULK DELETE ====================

  // PATCH /api/projects/:id/requirements/bulk-update
  app.patch("/api/projects/:id/requirements/bulk-update", (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const { ids, updates } = req.body as { ids: number[]; updates: { criticality?: string; comments?: string } };
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids array is required" });
    }
    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "updates object is required" });
    }

    let updated = 0;
    for (const id of ids) {
      const result = storage.updateRequirement(id, updates);
      if (result) updated++;
    }

    res.json({ updated });
  });

  // DELETE /api/projects/:id/requirements/bulk-delete
  app.delete("/api/projects/:id/requirements/bulk-delete", (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const { ids } = req.body as { ids: number[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids array is required" });
    }

    let deleted = 0;
    for (const id of ids) {
      const req2 = storage.getRequirement(id);
      if (req2 && req2.projectId === projectId) {
        storage.deleteRequirement(id);
        deleted++;
      }
    }

    res.json({ deleted });
  });

  // ==================== BULK ADD FROM TEMPLATE ====================

  // Single module
  app.post("/api/projects/:id/requirements/bulk", (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const { functionalArea, functionalAreas } = req.body;
    
    // Support both single module and multi-module
    const areas: string[] = functionalAreas || (functionalArea ? [functionalArea] : []);
    if (areas.length === 0) {
      return res.status(400).json({ error: "functionalArea or functionalAreas is required" });
    }

    let totalCreated: any[] = [];

    for (const area of areas) {
      const templates = templateRequirements.filter(t => t.functionalArea === area);
      if (templates.length === 0) continue;

      const existingReqs = storage.getRequirements(projectId, { functionalArea: area });
      const prefix = MODULE_PREFIXES[area] || "XX";

      let maxNum = 0;
      for (const r of existingReqs) {
        const match = r.reqNumber.match(/[A-Z]{2,}(\d+)/);
        if (match) {
          maxNum = Math.max(maxNum, parseInt(match[1]));
        }
      }

      const toCreate = templates.map((t, i) => ({
        projectId,
        reqNumber: `${prefix}${String(maxNum + i + 1).padStart(2, "0")}`,
        category: t.category,
        functionalArea: t.functionalArea,
        subCategory: t.subCategory,
        description: t.description,
        criticality: t.criticality,
        vendorResponse: null,
        comments: "",
      }));

      const created = storage.bulkCreateRequirements(toCreate);
      totalCreated = totalCreated.concat(created);
    }

    res.status(201).json(totalCreated);
  });

  // ==================== TEMPLATES ====================

  // Lightweight summary for template dialog (no descriptions)
  app.get("/api/templates/summary", (_req, res) => {
    const summary: Record<string, Record<string, number>> = {};
    for (const [category, areas] of Object.entries(CATEGORIES)) {
      summary[category] = {};
      for (const area of areas) {
        const count = templateRequirements.filter(t => t.functionalArea === area).length;
        if (count > 0) {
          summary[category][area] = count;
        }
      }
    }
    const totalCount = templateRequirements.length;
    res.json({ categories: CATEGORIES, prefixes: MODULE_PREFIXES, summary, totalCount });
  });

  app.get("/api/templates", (_req, res) => {
    // Group templates by category > functionalArea
    const grouped: Record<string, Record<string, typeof templateRequirements>> = {};
    for (const [category, areas] of Object.entries(CATEGORIES)) {
      grouped[category] = {};
      for (const area of areas) {
        const templates = templateRequirements.filter(t => t.functionalArea === area);
        if (templates.length > 0) {
          grouped[category][area] = templates;
        }
      }
    }
    res.json({ categories: CATEGORIES, prefixes: MODULE_PREFIXES, grouped });
  });

  // ==================== EXPORT ====================

  app.get("/api/projects/:id/export", (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const allReqs = storage.getRequirements(projectId);
    const stats = storage.getProjectStats(projectId);

    const exportData = {
      project: {
        name: project.name,
        description: project.description,
        status: project.status,
        createdAt: project.createdAt,
        exportedAt: new Date().toISOString(),
      },
      summary: stats,
      requirements: allReqs.map(r => ({
        reqNumber: r.reqNumber,
        category: r.category,
        functionalArea: r.functionalArea,
        subCategory: r.subCategory,
        description: r.description,
        criticality: r.criticality,
        vendorResponse: r.vendorResponse,
        comments: r.comments,
      })),
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${project.name.replace(/[^a-z0-9]/gi, '_')}_requirements.json"`);
    res.json(exportData);
  });

  // ==================== VENDORS ====================

  app.get("/api/vendors", (_req, res) => {
    const allVendors = storage.getVendors();
    // Parse JSON fields for response
    const parsed = allVendors.map(v => ({
      ...v,
      strengths: JSON.parse(v.strengths),
      weaknesses: JSON.parse(v.weaknesses),
      moduleRatings: JSON.parse(v.moduleRatings),
      coveredModules: JSON.parse(v.coveredModules),
    }));
    res.json(parsed);
  });

  // ==================== VENDOR EVALUATION ====================

  // GET /api/projects/:id/evaluation — Get evaluation data
  app.get("/api/projects/:id/evaluation", (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const settings = storage.getProjectVendorSettings(projectId);
    const allVendors = storage.getVendors().map(v => {
      const profile = vendorProfiles.find(p => p.shortName === v.shortName);
      return {
        ...v,
        strengths: JSON.parse(v.strengths),
        weaknesses: JSON.parse(v.weaknesses),
        moduleRatings: JSON.parse(v.moduleRatings),
        coveredModules: JSON.parse(v.coveredModules),
        costs: profile?.costs || null,
      };
    });

    // Check if scores have been generated
    const scores = storage.getVendorScores(projectId);
    const hasScores = scores.length > 0;

    if (!hasScores) {
      // Return empty evaluation with default settings
      return res.json({
        hasScores: false,
        vendors: allVendors,
        settings: {
          moduleWeights: defaultModuleWeights,
          selectedVendors: allVendors.map(v => v.id),
        },
        evaluation: null,
      });
    }

    const evaluation = storage.calculateEvaluation(projectId);

    res.json({
      hasScores: true,
      vendors: allVendors,
      settings: {
        moduleWeights: evaluation.moduleWeights,
        selectedVendors: evaluation.selectedVendorIds,
      },
      evaluation,
    });
  });

  // POST /api/projects/:id/evaluation/settings — Save vendor selection and module weights
  app.post("/api/projects/:id/evaluation/settings", (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const { moduleWeights, selectedVendors } = req.body;
    if (!moduleWeights || !selectedVendors) {
      return res.status(400).json({ error: "moduleWeights and selectedVendors are required" });
    }

    const settings = storage.upsertProjectVendorSettings(projectId, moduleWeights, selectedVendors);
    
    // Recalculate evaluation with new settings
    const scores = storage.getVendorScores(projectId);
    if (scores.length > 0) {
      const evaluation = storage.calculateEvaluation(projectId);
      return res.json({ settings, evaluation });
    }

    res.json({ settings, evaluation: null });
  });

  // POST /api/projects/:id/evaluation/generate-scores — Auto-generate vendor scores
  app.post("/api/projects/:id/evaluation/generate-scores", (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const reqs = storage.getRequirements(projectId);
    if (reqs.length === 0) {
      return res.status(400).json({ error: "No requirements found for this project. Add requirements first." });
    }

    storage.generateVendorScores(projectId);
    const evaluation = storage.calculateEvaluation(projectId);

    res.json({ success: true, evaluation });
  });

  // POST /api/projects/:id/load-sample-rfp — Load sample RFP requirements with real vendor responses
  app.post("/api/projects/:id/load-sample-rfp", (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    try {
      const result = storage.loadSampleRfpData(projectId);
      const evaluation = storage.calculateEvaluation(projectId);
      res.json({
        success: true,
        requirementsCreated: result.requirementsCreated,
        scoresCreated: result.scoresCreated,
        evaluation,
      });
    } catch (err: any) {
      console.error("loadSampleRfpData error:", err);
      res.status(500).json({ error: err.message || "Failed to load sample RFP data" });
    }
  });

  // GET /api/projects/:id/evaluation/report — Generate and download PDF report
  app.get("/api/projects/:id/evaluation/report", (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const scores = storage.getVendorScores(projectId);
    if (scores.length === 0) {
      return res.status(400).json({ error: "No evaluation scores found. Generate scores first." });
    }

    // Build evaluation data payload
    const evaluation = storage.calculateEvaluation(projectId);
    const allVendors = storage.getVendors().map(v => ({
      ...v,
      strengths: JSON.parse(v.strengths),
      weaknesses: JSON.parse(v.weaknesses),
      moduleRatings: JSON.parse(v.moduleRatings),
      coveredModules: JSON.parse(v.coveredModules),
    }));

    const reportData = {
      projectName: project.name,
      projectDescription: project.description,
      generatedAt: new Date().toISOString(),
      evaluation,
      allVendors,
    };

    // Write JSON to temp file
    const tmpDir = os.tmpdir();
    const jsonPath = path.join(tmpDir, `erp-report-${projectId}-${Date.now()}.json`);
    const pdfPath = path.join(tmpDir, `erp-report-${projectId}-${Date.now()}.pdf`);

    try {
      fs.writeFileSync(jsonPath, JSON.stringify(reportData));

      // Run Python PDF generation script
      // In production, __dirname is dist/. The Python script lives alongside the server source.
      // Try multiple locations to find it.
      let scriptPath = path.join(__dirname, "generate-report.py");
      if (!fs.existsSync(scriptPath)) {
        scriptPath = path.join(__dirname, "..", "server", "generate-report.py");
      }
      if (!fs.existsSync(scriptPath)) {
        scriptPath = path.resolve("server", "generate-report.py");
      }
      execFileSync("python3", [scriptPath, jsonPath, pdfPath], {
        timeout: 120000,
        stdio: ["ignore", "pipe", "pipe"],
      });

      if (!fs.existsSync(pdfPath)) {
        return res.status(500).json({ error: "PDF generation failed — output file not found" });
      }

      const safeProjectName = project.name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeProjectName}_vendor_evaluation.pdf"`
      );

      const pdfBuffer = fs.readFileSync(pdfPath);
      res.send(pdfBuffer);
    } catch (err: any) {
      console.error("PDF report generation error:", err);
      return res.status(500).json({
        error: "PDF generation failed",
        details: err.message || String(err),
      });
    } finally {
      // Clean up temp files
      try { fs.unlinkSync(jsonPath); } catch (_) {}
      try { fs.unlinkSync(pdfPath); } catch (_) {}
    }
  });

  // GET /api/projects/:id/evaluation/report-docx — Generate Word document report
  app.get("/api/projects/:id/evaluation/report-docx", (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const evaluation = storage.calculateEvaluation(projectId);
    const allVendors = storage.getVendors().map(v => {
      const profile = vendorProfiles.find(p => p.shortName === v.shortName);
      return {
        ...v,
        strengths: JSON.parse(v.strengths),
        weaknesses: JSON.parse(v.weaknesses),
        moduleRatings: JSON.parse(v.moduleRatings),
        coveredModules: JSON.parse(v.coveredModules),
        platformType: v.platformType,
      };
    });

    const timestamp = Date.now();
    const jsonPath = path.join(os.tmpdir(), `erp-report-${projectId}-${timestamp}.json`);
    const docxPath = path.join(os.tmpdir(), `erp-report-${projectId}-${timestamp}.docx`);

    const reportData = {
      projectName: project.name,
      ...evaluation,
      allVendors: allVendors.filter(v => evaluation.selectedVendorIds.includes(v.id)),
      totalRequirements: storage.getRequirements(projectId).length,
    };

    try {
      fs.writeFileSync(jsonPath, JSON.stringify(reportData));

      let scriptPath = path.join(__dirname, "generate-report-docx.cjs");
      if (!fs.existsSync(scriptPath)) {
        scriptPath = path.join(__dirname, "..", "server", "generate-report-docx.cjs");
      }
      if (!fs.existsSync(scriptPath)) {
        scriptPath = path.resolve("server", "generate-report-docx.cjs");
      }
      execFileSync("node", [scriptPath, jsonPath, docxPath], {
        timeout: 120000,
        stdio: ["ignore", "pipe", "pipe"],
      });

      if (!fs.existsSync(docxPath)) {
        return res.status(500).json({ error: "DOCX generation failed — output file not found" });
      }

      const safeProjectName = project.name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeProjectName}_vendor_evaluation.docx"`
      );

      const docxBuffer = fs.readFileSync(docxPath);
      res.send(docxBuffer);
    } catch (err: any) {
      console.error("DOCX report generation error:", err);
      return res.status(500).json({
        error: "DOCX generation failed",
        details: err.message || String(err),
      });
    } finally {
      try { fs.unlinkSync(jsonPath); } catch (_) {}
      try { fs.unlinkSync(docxPath); } catch (_) {}
    }
  });

  // PATCH /api/projects/:id/evaluation/scores/:requirementId/:vendorId — Override individual score
  app.patch("/api/projects/:id/evaluation/scores/:requirementId/:vendorId", (req, res) => {
    const projectId = parseInt(req.params.id);
    const requirementId = parseInt(req.params.requirementId);
    const vendorId = parseInt(req.params.vendorId);
    const { score } = req.body;

    if (!score || !["S", "F", "C", "T", "N"].includes(score)) {
      return res.status(400).json({ error: "Valid score (S, F, C, T, N) is required" });
    }

    const updated = storage.upsertVendorScore(projectId, requirementId, vendorId, score);
    res.json(updated);
  });

  // ==================== WORKSHOP LINK MANAGEMENT ====================

  // POST /api/projects/:id/workshop-links — Create a new workshop link
  app.post("/api/projects/:id/workshop-links", (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const { stakeholderName, stakeholderEmail, modules } = req.body;
    if (!stakeholderName) return res.status(400).json({ error: "stakeholderName is required" });

    const link = storage.createWorkshopLink({
      projectId,
      stakeholderName,
      stakeholderEmail: stakeholderEmail || "",
      modules: Array.isArray(modules) ? modules : [],
    });
    res.json(link);
  });

  // GET /api/projects/:id/workshop-links — List all workshop links for a project
  app.get("/api/projects/:id/workshop-links", (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const links = storage.getWorkshopLinks(projectId);
    // Attach feedback summary per link
    const linksWithSummary = links.map(link => {
      const feedback = storage.getWorkshopFeedback(link.id);
      return {
        ...link,
        feedbackSummary: {
          total: feedback.length,
          reviewed: feedback.filter(f => f.status !== "pending").length,
          approved: feedback.filter(f => f.status === "approved").length,
          rejected: feedback.filter(f => f.status === "rejected").length,
          flagged: feedback.filter(f => f.flaggedForDiscussion === 1).length,
        },
      };
    });
    res.json(linksWithSummary);
  });

  // DELETE /api/workshop-links/:linkId — Deactivate a workshop link
  app.delete("/api/workshop-links/:linkId", (req, res) => {
    const linkId = parseInt(req.params.linkId);
    storage.deactivateWorkshopLink(linkId);
    res.json({ success: true });
  });

  // GET /api/projects/:id/workshop-summary — Get aggregated feedback summary
  app.get("/api/projects/:id/workshop-summary", (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const summary = storage.getWorkshopSummary(projectId);
    res.json(summary);
  });

  // ==================== PUBLIC WORKSHOP API (no auth, token-based) ====================

  // GET /api/workshop/:token — Get workshop data
  app.get("/api/workshop/:token", (req, res) => {
    const link = storage.getWorkshopLinkByToken(req.params.token);
    if (!link) return res.status(404).json({ error: "Workshop not found" });
    if (!link.isActive) return res.status(403).json({ error: "This workshop link has been deactivated" });
    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      return res.status(403).json({ error: "This workshop link has expired" });
    }

    const project = storage.getProject(link.projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const allowedModules: string[] = JSON.parse(link.modules);
    const allRequirements = storage.getRequirements(link.projectId);
    const scopedRequirements = allowedModules.length > 0
      ? allRequirements.filter(r => allowedModules.includes(r.functionalArea))
      : allRequirements;

    const feedback = storage.getWorkshopFeedback(link.id);
    const feedbackMap: Record<number, typeof feedback[0]> = {};
    for (const f of feedback) {
      feedbackMap[f.requirementId] = f;
    }

    const requirementsWithFeedback = scopedRequirements.map(r => ({
      ...r,
      feedback: feedbackMap[r.id] || null,
    }));

    res.json({
      projectName: project.name,
      stakeholderName: link.stakeholderName,
      stakeholderEmail: link.stakeholderEmail,
      allowedModules,
      requirements: requirementsWithFeedback,
    });
  });

  // PATCH /api/workshop/:token/feedback/:requirementId — Submit feedback on a requirement
  app.patch("/api/workshop/:token/feedback/:requirementId", (req, res) => {
    const link = storage.getWorkshopLinkByToken(req.params.token);
    if (!link) return res.status(404).json({ error: "Workshop not found" });
    if (!link.isActive) return res.status(403).json({ error: "Workshop link is deactivated" });
    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      return res.status(403).json({ error: "Workshop link has expired" });
    }

    const requirementId = parseInt(req.params.requirementId);
    const requirement = storage.getRequirement(requirementId);
    if (!requirement) return res.status(404).json({ error: "Requirement not found" });
    if (requirement.projectId !== link.projectId) return res.status(403).json({ error: "Requirement not in this project" });

    const allowedModules: string[] = JSON.parse(link.modules);
    if (allowedModules.length > 0 && !allowedModules.includes(requirement.functionalArea)) {
      return res.status(403).json({ error: "Requirement not in allowed modules" });
    }

    const { criticality, comment, flaggedForDiscussion, status } = req.body;
    const updated = storage.upsertWorkshopFeedback(link.id, requirementId, {
      criticality,
      comment,
      flaggedForDiscussion,
      status,
    });
    res.json(updated);
  });

  // POST /api/workshop/:token/feedback/bulk — Submit feedback on multiple requirements
  app.post("/api/workshop/:token/feedback/bulk", (req, res) => {
    const link = storage.getWorkshopLinkByToken(req.params.token);
    if (!link) return res.status(404).json({ error: "Workshop not found" });
    if (!link.isActive) return res.status(403).json({ error: "Workshop link is deactivated" });
    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      return res.status(403).json({ error: "Workshop link has expired" });
    }

    const { feedback } = req.body;
    if (!Array.isArray(feedback)) return res.status(400).json({ error: "feedback array required" });

    const allowedModules: string[] = JSON.parse(link.modules);
    const results = [];
    for (const item of feedback) {
      const { requirementId, criticality, comment, flaggedForDiscussion, status } = item;
      const requirement = storage.getRequirement(requirementId);
      if (!requirement || requirement.projectId !== link.projectId) continue;
      if (allowedModules.length > 0 && !allowedModules.includes(requirement.functionalArea)) continue;
      const updated = storage.upsertWorkshopFeedback(link.id, requirementId, {
        criticality,
        comment,
        flaggedForDiscussion,
        status,
      });
      results.push(updated);
    }
    res.json(results);
  });

  // ==================== PORTFOLIO ANALYTICS ====================

  app.get("/api/analytics/portfolio", (_req, res) => {
    const allProjects = storage.getProjects();
    const allVendors = storage.getVendors();

    const moduleFrequency: Record<string, number> = {};
    const criticalityTrend = { critical: 0, desired: 0, notRequired: 0, notApplicable: 0 };
    const vendorScoreAccum: Record<string, { totalScore: number; projectCount: number; vendorName: string }> = {};

    const projectData = allProjects.map((project) => {
      const reqs = storage.getRequirements(project.id);
      const stats = storage.getProjectStats(project.id);

      // Module breakdown
      const moduleBreakdown: Record<string, number> = {};
      const projectModules = new Set<string>();
      for (const req of reqs) {
        moduleBreakdown[req.functionalArea] = (moduleBreakdown[req.functionalArea] || 0) + 1;
        projectModules.add(req.functionalArea);
      }

      // Track module frequency across projects
      for (const mod of projectModules) {
        moduleFrequency[mod] = (moduleFrequency[mod] || 0) + 1;
      }

      // Criticality distribution
      const criticalityDistribution = { critical: 0, desired: 0, notRequired: 0, notApplicable: 0 };
      for (const req of reqs) {
        if (req.criticality === "Critical") {
          criticalityDistribution.critical++;
          criticalityTrend.critical++;
        } else if (req.criticality === "Desired") {
          criticalityDistribution.desired++;
          criticalityTrend.desired++;
        } else if (req.criticality === "Not Required") {
          criticalityDistribution.notRequired++;
          criticalityTrend.notRequired++;
        } else if (req.criticality === "Not Applicable") {
          criticalityDistribution.notApplicable++;
          criticalityTrend.notApplicable++;
        }
      }

      // Check for evaluation data
      let hasEvaluation = false;
      let topVendor: { name: string; score: number } | undefined;
      try {
        const evalResult = storage.calculateEvaluation(project.id);
        if (evalResult.vendors.length > 0 && reqs.length > 0) {
          const scores = storage.getVendorScores(project.id);
          if (scores.length > 0) {
            hasEvaluation = true;
            const best = evalResult.vendors[0]; // already sorted desc
            topVendor = { name: best.vendorName, score: best.overallScore };

            // Accumulate vendor scores for platform comparison
            for (const v of evalResult.vendors) {
              if (!vendorScoreAccum[v.vendorShortName]) {
                vendorScoreAccum[v.vendorShortName] = { totalScore: 0, projectCount: 0, vendorName: v.vendorName };
              }
              vendorScoreAccum[v.vendorShortName].totalScore += v.overallScore;
              vendorScoreAccum[v.vendorShortName].projectCount += 1;
            }
          }
        }
      } catch {
        // No evaluation data
      }

      // Workshop progress
      let workshopProgress: { total: number; reviewed: number; flagged: number } | undefined;
      try {
        const summary = storage.getWorkshopSummary(project.id);
        if (summary.totalLinks > 0) {
          workshopProgress = {
            total: summary.totalFeedback,
            reviewed: summary.approvedCount + summary.rejectedCount,
            flagged: summary.flaggedCount,
          };
        }
      } catch {
        // No workshop data
      }

      return {
        id: project.id,
        name: project.name,
        status: project.status,
        totalRequirements: stats.totalRequirements,
        criticalCount: stats.criticalCount,
        desiredCount: stats.desiredCount,
        moduleCoverage: stats.moduleCoverage,
        moduleBreakdown,
        criticalityDistribution,
        hasEvaluation,
        topVendor,
        workshopProgress,
      };
    });

    const totalRequirements = projectData.reduce((s, p) => s + p.totalRequirements, 0);

    const platformComparison = Object.entries(vendorScoreAccum).map(([_shortName, data]) => ({
      vendorName: data.vendorName,
      avgScore: Math.round((data.totalScore / data.projectCount) * 10) / 10,
      projectCount: data.projectCount,
    })).sort((a, b) => b.avgScore - a.avgScore);

    res.json({
      projects: projectData,
      aggregates: {
        totalProjects: allProjects.length,
        totalRequirements,
        avgRequirementsPerProject: allProjects.length > 0 ? Math.round(totalRequirements / allProjects.length) : 0,
        moduleFrequency,
        criticalityTrend,
        platformComparison,
      },
    });
  });

  // ==================== REQUIREMENTS IMPORT ====================

  const upload = multer({ dest: os.tmpdir() });

  // Preview: parse uploaded file, return headers + all rows + sheet names
  app.post("/api/projects/:id/import/preview", upload.single("file"), (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const workbook = XLSX.readFile(file.path);
      const sheetNames = workbook.SheetNames;
      const sheetName = (req.body.sheetName as string) || sheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) {
        return res.status(400).json({ error: `Sheet "${sheetName}" not found` });
      }

      const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      const headers = rows.length > 0 ? Object.keys(rows[0]) : [];

      // Clean up temp file
      try { fs.unlinkSync(file.path); } catch (_e) { /* ignore */ }

      res.json({
        headers,
        rows,
        sheetNames,
        totalRows: rows.length,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to parse file" });
    }
  });

  // Confirm: receive mapped rows, create requirements
  app.post("/api/projects/:id/import/confirm", (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const project = storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const { mapping, rows } = req.body as {
        mapping: Record<string, string>;
        rows: Record<string, string>[];
      };

      if (!mapping || !rows || !Array.isArray(rows)) {
        return res.status(400).json({ error: "Missing mapping or rows" });
      }

      // Validate required mappings
      if (!mapping.reqNumber || !mapping.category || !mapping.description) {
        return res.status(400).json({ error: "Required mappings: reqNumber, category, description" });
      }

      let importedCount = 0;
      for (const row of rows) {
        const reqNumber = String(row[mapping.reqNumber] || "").trim();
        const category = String(row[mapping.category] || "").trim();
        const description = String(row[mapping.description] || "").trim();

        if (!reqNumber || !category || !description) continue;

        const functionalArea = mapping.functionalArea ? String(row[mapping.functionalArea] || "").trim() : category;
        const subCategory = mapping.subCategory ? String(row[mapping.subCategory] || "").trim() : "";
        const criticality = mapping.criticality ? String(row[mapping.criticality] || "").trim() : "Critical";

        storage.createRequirement({
          projectId,
          reqNumber,
          category,
          functionalArea: functionalArea || category,
          subCategory: subCategory || "General",
          description,
          criticality: ["Critical", "Desired", "Not Required", "Not Applicable"].includes(criticality) ? criticality : "Critical",
          vendorResponse: null,
          comments: "",
        });
        importedCount++;
      }

      res.json({ imported: importedCount });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to import requirements" });
    }
  });

  // ==================== CUSTOM CRITERIA ====================

  // List custom criteria with scores for a project
  app.get("/api/projects/:id/custom-criteria", (req, res) => {
    const projectId = parseInt(req.params.id);
    const criteria = storage.getCustomCriteria(projectId);
    res.json(criteria);
  });

  // Create a custom criterion
  app.post("/api/projects/:id/custom-criteria", (req, res) => {
    const projectId = parseInt(req.params.id);
    const { name, description, weight } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }
    const criterion = storage.createCustomCriterion({
      projectId,
      name,
      description: description || "",
      weight: weight ?? 5,
    });
    res.json(criterion);
  });

  // Update a custom criterion
  app.patch("/api/custom-criteria/:criteriaId", (req, res) => {
    const criteriaId = parseInt(req.params.criteriaId);
    const { name, description, weight } = req.body;
    const updated = storage.updateCustomCriterion(criteriaId, { name, description, weight });
    if (!updated) {
      return res.status(404).json({ error: "Criterion not found" });
    }
    res.json(updated);
  });

  // Delete a custom criterion
  app.delete("/api/custom-criteria/:criteriaId", (req, res) => {
    const criteriaId = parseInt(req.params.criteriaId);
    storage.deleteCustomCriterion(criteriaId);
    res.json({ success: true });
  });

  // Upsert scores for a criterion
  app.put("/api/custom-criteria/:criteriaId/scores", (req, res) => {
    const criteriaId = parseInt(req.params.criteriaId);
    const { scores } = req.body as { scores: Array<{ vendorId: number; score: number; notes: string }> };
    if (!scores || !Array.isArray(scores)) {
      return res.status(400).json({ error: "Scores array required" });
    }
    storage.upsertCustomCriteriaScores(criteriaId, scores);
    res.json({ success: true });
  });

  // ==================== COMPARISON REPORT ====================

  // Helper: gather all comparison report data
  function gatherComparisonData(projectId: number) {
    const project = storage.getProject(projectId);
    if (!project) return null;

    const evaluation = storage.calculateEvaluation(projectId);
    const allVendors = storage.getVendors().map(v => ({
      ...v,
      strengths: JSON.parse(v.strengths),
      weaknesses: JSON.parse(v.weaknesses),
      moduleRatings: JSON.parse(v.moduleRatings),
      coveredModules: JSON.parse(v.coveredModules),
    }));
    const customCriteriaData = storage.getCustomCriteria(projectId);
    const settings = storage.getProjectVendorSettings(projectId);
    const requirements = storage.getRequirements(projectId);

    // Build cost data from vendor profiles
    const costs: any[] = [];
    const selectedVendors = allVendors.filter(v => evaluation.selectedVendorIds.includes(v.id));
    for (const v of selectedVendors) {
      const profile = vendorProfiles.find(p => p.shortName === v.shortName);
      if (profile?.costs) {
        costs.push({ vendorName: v.name, vendorId: v.id, ...profile.costs });
      }
    }

    return {
      project: { name: project.name, description: project.description, status: project.status },
      evaluation: {
        vendors: evaluation.vendors,
        gaps: evaluation.gaps,
        overallScores: evaluation.vendors.map((v: any) => ({ vendorId: v.vendorId, vendorName: v.vendorName, score: v.overallScore })),
        moduleWeights: evaluation.moduleWeights,
        selectedVendorIds: evaluation.selectedVendorIds,
      },
      weights: { moduleWeights: evaluation.moduleWeights },
      customCriteria: customCriteriaData,
      costs,
      allVendors: selectedVendors,
      totalRequirements: requirements.length,
    };
  }

  // PDF comparison report
  app.get("/api/projects/:id/comparison-report/pdf", (req, res) => {
    const projectId = parseInt(req.params.id);
    const reportData = gatherComparisonData(projectId);
    if (!reportData) return res.status(404).json({ error: "Project not found" });

    const timestamp = Date.now();
    const jsonPath = path.join(os.tmpdir(), `erp-comparison-${projectId}-${timestamp}.json`);
    const pdfPath = path.join(os.tmpdir(), `erp-comparison-${projectId}-${timestamp}.pdf`);

    try {
      fs.writeFileSync(jsonPath, JSON.stringify(reportData));

      let scriptPath = path.join(__dirname, "generate-comparison-pdf.py");
      if (!fs.existsSync(scriptPath)) {
        scriptPath = path.join(__dirname, "..", "server", "generate-comparison-pdf.py");
      }
      if (!fs.existsSync(scriptPath)) {
        scriptPath = path.resolve("server", "generate-comparison-pdf.py");
      }

      execFileSync("python3", [scriptPath, jsonPath, pdfPath], {
        timeout: 120000,
        stdio: ["ignore", "pipe", "pipe"],
      });

      if (!fs.existsSync(pdfPath)) {
        return res.status(500).json({ error: "PDF generation failed — output file not found" });
      }

      const safeName = (reportData.project.name || "comparison").replace(/[^a-z0-9]/gi, "_").toLowerCase();
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}_vendor_comparison.pdf"`);
      res.send(fs.readFileSync(pdfPath));
    } catch (err: any) {
      console.error("Comparison PDF generation error:", err);
      return res.status(500).json({ error: "PDF generation failed", details: err.message || String(err) });
    } finally {
      try { fs.unlinkSync(jsonPath); } catch (_) {}
      try { fs.unlinkSync(pdfPath); } catch (_) {}
    }
  });

  // DOCX comparison report
  app.get("/api/projects/:id/comparison-report/docx", (req, res) => {
    const projectId = parseInt(req.params.id);
    const reportData = gatherComparisonData(projectId);
    if (!reportData) return res.status(404).json({ error: "Project not found" });

    const timestamp = Date.now();
    const jsonPath = path.join(os.tmpdir(), `erp-comparison-${projectId}-${timestamp}.json`);
    const docxPath = path.join(os.tmpdir(), `erp-comparison-${projectId}-${timestamp}.docx`);

    try {
      fs.writeFileSync(jsonPath, JSON.stringify(reportData));

      let scriptPath = path.join(__dirname, "generate-comparison-docx.cjs");
      if (!fs.existsSync(scriptPath)) {
        scriptPath = path.join(__dirname, "..", "server", "generate-comparison-docx.cjs");
      }
      if (!fs.existsSync(scriptPath)) {
        scriptPath = path.resolve("server", "generate-comparison-docx.cjs");
      }

      execFileSync("node", [scriptPath, jsonPath, docxPath], {
        timeout: 120000,
        stdio: ["ignore", "pipe", "pipe"],
      });

      if (!fs.existsSync(docxPath)) {
        return res.status(500).json({ error: "DOCX generation failed — output file not found" });
      }

      const safeName = (reportData.project.name || "comparison").replace(/[^a-z0-9]/gi, "_").toLowerCase();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}_vendor_comparison.docx"`);
      res.send(fs.readFileSync(docxPath));
    } catch (err: any) {
      console.error("Comparison DOCX generation error:", err);
      return res.status(500).json({ error: "DOCX generation failed", details: err.message || String(err) });
    } finally {
      try { fs.unlinkSync(jsonPath); } catch (_) {}
      try { fs.unlinkSync(docxPath); } catch (_) {}
    }
  });

  // ==================== PROJECT STATUS WORKFLOW ====================

  const STATUS_ORDER = ["draft", "requirements_review", "stakeholder_workshop", "vendor_evaluation", "final_report", "complete"];
  const STATUS_LABELS: Record<string, string> = {
    draft: "Draft",
    requirements_review: "Requirements Review",
    stakeholder_workshop: "Stakeholder Workshop",
    vendor_evaluation: "Vendor Evaluation",
    final_report: "Final Report",
    complete: "Complete",
  };

  // Get project status info with checklists
  app.get("/api/projects/:id/status-info", (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const currentStatus = project.status || "draft";
    const currentIndex = STATUS_ORDER.indexOf(currentStatus);

    const requirements = storage.getRequirements(projectId);
    const stats = storage.getProjectStats(projectId);
    const workshopLinks = storage.getWorkshopLinks(projectId);
    const settings = storage.getProjectVendorSettings(projectId);
    const scores = storage.getVendorScores(projectId);

    // Count workshop feedback
    let feedbackCount = 0;
    for (const link of workshopLinks) {
      const fb = storage.getWorkshopFeedback(link.id);
      feedbackCount += fb.length;
    }

    // Check if evaluation exists
    const hasEvaluation = scores.length > 0;

    const stages = STATUS_ORDER.map((key, index) => {
      let checklist: Array<{ label: string; done: boolean }> = [];

      switch (key) {
        case "draft":
          checklist = [
            { label: "Project created", done: true },
            { label: "Description added", done: !!project.description && project.description.length > 0 },
          ];
          break;
        case "requirements_review":
          checklist = [
            { label: "At least 1 requirement loaded", done: requirements.length >= 1 },
            { label: "At least 1 module present", done: stats.moduleCoverage >= 1 },
          ];
          break;
        case "stakeholder_workshop":
          checklist = [
            { label: "At least 1 workshop link created", done: workshopLinks.length >= 1 },
            { label: "At least 1 feedback response", done: feedbackCount >= 1 },
          ];
          break;
        case "vendor_evaluation":
          checklist = [
            { label: "At least 1 vendor selected", done: (settings?.selectedVendors ? JSON.parse(settings.selectedVendors).length : 0) >= 1 },
            { label: "Scores loaded", done: hasEvaluation },
          ];
          break;
        case "final_report":
          checklist = [
            { label: "Evaluation completed", done: hasEvaluation },
          ];
          break;
        case "complete":
          checklist = [
            { label: "All previous stages complete", done: currentIndex >= STATUS_ORDER.length - 1 },
          ];
          break;
      }

      const allDone = checklist.every(c => c.done);

      return {
        key,
        label: STATUS_LABELS[key],
        completed: index < currentIndex,
        active: index === currentIndex,
        checklist,
        allDone,
      };
    });

    res.json({ currentStatus, stages });
  });

  // Update project status
  app.patch("/api/projects/:id/status", (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const { status } = req.body;
    if (!status || !STATUS_ORDER.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${STATUS_ORDER.join(", ")}` });
    }

    const currentIndex = STATUS_ORDER.indexOf(project.status || "draft");
    const newIndex = STATUS_ORDER.indexOf(status);
    const diff = newIndex - currentIndex;

    if (Math.abs(diff) > 1) {
      return res.status(400).json({ error: "Can only advance or revert by one step" });
    }

    const updated = storage.updateProject(projectId, { status });
    if (!updated) return res.status(500).json({ error: "Failed to update status" });

    res.json(updated);
  });

  // ==================== AI CHAT (SSE STREAMING) ====================

  app.post("/api/projects/:id/chat", async (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const { message, history } = req.body as {
      message: string;
      history?: { role: string; content: string }[];
    };
    if (!message) return res.status(400).json({ error: "message is required" });

    // Save user message to DB
    storage.addChatMessage(projectId, "user", message);

    // Build project context
    const { buildProjectContext, llmCall, llmStream, CHAT_SYSTEM_PROMPT } = await import("./ai");
    const projectContext = buildProjectContext(projectId);
    const systemPrompt = CHAT_SYSTEM_PROMPT.replace("{projectContext}", projectContext);

    // Build messages array from history + new message
    const messages: { role: "user" | "assistant"; content: string }[] = [];
    if (history && Array.isArray(history)) {
      for (const h of history) {
        messages.push({ role: h.role as "user" | "assistant", content: h.content });
      }
    }
    messages.push({ role: "user", content: message });

    // Set SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });

    try {
      const userMessage = messages[messages.length - 1]?.content || "";
      const stream = await llmStream(userMessage, systemPrompt, 4096);

      let fullResponse = "";

      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content || "";
        if (text) {
          fullResponse += text;
          res.write(`data: ${JSON.stringify({ type: "text", text })}\n\n`);
        }
      }

      // Save assistant message to DB
      storage.addChatMessage(projectId, "assistant", fullResponse);
      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      res.end();
    } catch (error: any) {
      console.error("Chat error:", error);
      res.write(`data: ${JSON.stringify({ type: "error", error: error.message || "Failed to start chat" })}\n\n`);
      res.end();
    }
  });

  // Chat History
  app.get("/api/projects/:id/chat/history", (req, res) => {
    const projectId = parseInt(req.params.id);
    const messages = storage.getChatMessages(projectId);
    res.json(messages);
  });

  app.delete("/api/projects/:id/chat/history", (req, res) => {
    const projectId = parseInt(req.params.id);
    storage.clearChatMessages(projectId);
    res.json({ success: true });
  });

  // ==================== PROPOSAL ANALYSIS ====================

  app.post("/api/projects/:id/analyze-proposal", upload.single("file"), async (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const vendorId = parseInt(req.body.vendorId);
    if (!vendorId) return res.status(400).json({ error: "vendorId is required" });

    try {
      // Read PDF file
      const fileBuffer = fs.readFileSync(req.file.path);
      const pdfParse = require("pdf-parse");
      const pdfData = await pdfParse(fileBuffer);
      const pdfText = pdfData.text;

      if (!pdfText || pdfText.trim().length === 0) {
        return res.status(400).json({ error: "Could not extract text from PDF" });
      }

      // Build context and analyze
      const { llmCall, PROPOSAL_ANALYSIS_PROMPT, buildProjectContext } = await import("./ai");
      const projectContext = buildProjectContext(projectId);

      const responseText = await llmCall(
        `Here is the project context for reference:\n\n${projectContext}\n\n---\n\nHere is the vendor proposal document to analyze:\n\n${pdfText.substring(0, 100000)}`,
        PROPOSAL_ANALYSIS_PROMPT,
        8192
      );

      // Parse the JSON response
      let analysisResult;
      try {
        // Try to extract JSON from markdown code blocks or raw JSON
        const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, responseText];
        analysisResult = JSON.parse(jsonMatch[1]!.trim());
      } catch {
        analysisResult = { raw: responseText, parseError: true };
      }

      // Save each dimension to vendor_intelligence
      if (analysisResult.dimensions && Array.isArray(analysisResult.dimensions)) {
        // Clear existing intelligence for this vendor
        storage.deleteVendorIntelligence(projectId, vendorId);

        for (const dim of analysisResult.dimensions) {
          storage.addVendorIntelligence({
            projectId,
            vendorId,
            dimension: dim.dimension || dim.label,
            score: dim.score ?? null,
            summary: dim.summary ?? null,
            evidence: dim.evidence ? JSON.stringify(dim.evidence) : null,
            concerns: dim.concerns ? JSON.stringify(dim.concerns) : null,
            sourceDocument: req.file.originalname || null,
          });
        }
      }

      res.json({
        success: true,
        analysis: analysisResult,
        sourceDocument: req.file.originalname,
      });
    } catch (error: any) {
      console.error("Proposal analysis error:", error);
      res.status(500).json({ error: error.message || "Failed to analyze proposal" });
    } finally {
      // Clean up uploaded file
      try { fs.unlinkSync(req.file!.path); } catch (_) {}
    }
  });

  // ==================== VENDOR INTELLIGENCE CRUD ====================

  app.get("/api/projects/:id/vendor-intelligence", (req, res) => {
    const projectId = parseInt(req.params.id);
    const vendorId = req.query.vendorId ? parseInt(req.query.vendorId as string) : undefined;
    const intelligence = storage.getVendorIntelligence(projectId, vendorId);
    res.json(intelligence);
  });

  app.post("/api/projects/:id/vendor-intelligence", (req, res) => {
    const projectId = parseInt(req.params.id);
    const { vendorId, dimensions } = req.body as {
      vendorId: number;
      dimensions: Array<{
        dimension: string;
        score: number | null;
        summary: string | null;
        evidence: string[] | null;
        concerns: string[] | null;
        sourceDocument: string | null;
      }>;
    };

    if (!vendorId || !dimensions || !Array.isArray(dimensions)) {
      return res.status(400).json({ error: "vendorId and dimensions array are required" });
    }

    // Clear existing and re-insert
    storage.deleteVendorIntelligence(projectId, vendorId);

    const results = [];
    for (const dim of dimensions) {
      const saved = storage.addVendorIntelligence({
        projectId,
        vendorId,
        dimension: dim.dimension,
        score: dim.score ?? null,
        summary: dim.summary ?? null,
        evidence: dim.evidence ? JSON.stringify(dim.evidence) : null,
        concerns: dim.concerns ? JSON.stringify(dim.concerns) : null,
        sourceDocument: dim.sourceDocument ?? null,
      });
      results.push(saved);
    }

    res.json(results);
  });

  app.delete("/api/vendor-intelligence/:id", (req, res) => {
    const id = parseInt(req.params.id);
    storage.deleteVendorIntelligenceById(id);
    res.json({ success: true });
  });

  // ==================== CONTRACT BASELINES ====================

  app.post("/api/projects/:id/contracts", (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const { contractName, vendorId, contractDate, totalValue, startDate, endDate, sourceDocument, notes } = req.body;
    if (!contractName) return res.status(400).json({ error: "contractName is required" });

    const baseline = storage.createContractBaseline({
      projectId,
      vendorId: vendorId ?? null,
      contractName,
      contractDate: contractDate ?? null,
      totalValue: totalValue ?? null,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      sourceDocument: sourceDocument ?? null,
      notes: notes ?? null,
    });
    res.status(201).json(baseline);
  });

  app.get("/api/projects/:id/contracts", (req, res) => {
    const projectId = parseInt(req.params.id);
    const baselines = storage.getContractBaselines(projectId);
    res.json(baselines);
  });

  app.get("/api/contracts/:contractId", (req, res) => {
    const contractId = parseInt(req.params.contractId);
    const baseline = storage.getContractBaseline(contractId);
    if (!baseline) return res.status(404).json({ error: "Contract not found" });

    const deliverables = storage.getDeliverables(contractId);
    const checkpoints = storage.getCheckpoints(contractId);
    const devs = storage.getDeviations(contractId);
    res.json({ ...baseline, deliverables, checkpoints, deviations: devs });
  });

  app.patch("/api/contracts/:contractId", (req, res) => {
    const contractId = parseInt(req.params.contractId);
    const baseline = storage.getContractBaseline(contractId);
    if (!baseline) return res.status(404).json({ error: "Contract not found" });

    const updated = storage.updateContractBaseline(contractId, req.body);
    if (!updated) return res.status(500).json({ error: "Failed to update contract" });
    res.json(updated);
  });

  app.delete("/api/contracts/:contractId", (req, res) => {
    const contractId = parseInt(req.params.contractId);
    storage.deleteContractBaseline(contractId);
    res.json({ success: true });
  });

  // ==================== CONTRACT DELIVERABLES ====================

  app.post("/api/contracts/:contractId/deliverables", (req, res) => {
    const baselineId = parseInt(req.params.contractId);
    const baseline = storage.getContractBaseline(baselineId);
    if (!baseline) return res.status(404).json({ error: "Contract not found" });

    const { category, name, description, dueDate, status, priority, contractReference, notes } = req.body;
    if (!category || !name) return res.status(400).json({ error: "category and name are required" });

    const deliverable = storage.createDeliverable({
      baselineId,
      category,
      name,
      description: description ?? null,
      dueDate: dueDate ?? null,
      status: status || "not_started",
      priority: priority || "standard",
      contractReference: contractReference ?? null,
      notes: notes ?? null,
    });
    res.status(201).json(deliverable);
  });

  app.post("/api/contracts/:contractId/deliverables/bulk", (req, res) => {
    const baselineId = parseInt(req.params.contractId);
    const baseline = storage.getContractBaseline(baselineId);
    if (!baseline) return res.status(404).json({ error: "Contract not found" });

    const { items } = req.body;
    if (!items || !Array.isArray(items)) return res.status(400).json({ error: "items array is required" });

    const deliverables = storage.createDeliverablesBulk(
      items.map((item: any) => ({ ...item, baselineId }))
    );
    res.status(201).json(deliverables);
  });

  app.patch("/api/deliverables/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const updated = storage.updateDeliverable(id, req.body);
    if (!updated) return res.status(404).json({ error: "Deliverable not found" });
    res.json(updated);
  });

  app.delete("/api/deliverables/:id", (req, res) => {
    const id = parseInt(req.params.id);
    storage.deleteDeliverable(id);
    res.json({ success: true });
  });

  // ==================== COMPLIANCE EVIDENCE ====================

  app.post("/api/deliverables/:id/evidence", upload.single("file"), (req, res) => {
    const deliverableId = parseInt(req.params.id);
    const { type, title, description, assessmentResult, assessorNotes } = req.body;
    if (!type || !title) return res.status(400).json({ error: "type and title are required" });

    let fileName: string | null = null;
    let fileContent: string | null = null;

    if (req.file) {
      fileName = req.file.originalname;
      // Try to read text content from text-based files
      try {
        const content = fs.readFileSync(req.file.path, "utf-8");
        if (content && content.length < 500000) {
          fileContent = content;
        }
      } catch {}
      // Clean up uploaded file
      try { fs.unlinkSync(req.file.path); } catch {}
    }

    const evidence = storage.addEvidence({
      deliverableId,
      type,
      title,
      description: description ?? null,
      fileName,
      fileContent,
      assessmentResult: assessmentResult ?? null,
      assessorNotes: assessorNotes ?? null,
    });
    res.status(201).json(evidence);
  });

  app.get("/api/deliverables/:id/evidence", (req, res) => {
    const deliverableId = parseInt(req.params.id);
    const evidence = storage.getEvidence(deliverableId);
    res.json(evidence);
  });

  app.delete("/api/evidence/:id", (req, res) => {
    const id = parseInt(req.params.id);
    storage.deleteEvidence(id);
    res.json({ success: true });
  });

  // ==================== IV&V CHECKPOINTS ====================

  app.post("/api/contracts/:contractId/checkpoints", (req, res) => {
    const baselineId = parseInt(req.params.contractId);
    const baseline = storage.getContractBaseline(baselineId);
    if (!baseline) return res.status(404).json({ error: "Contract not found" });

    const { name, phase, scheduledDate, status, overallAssessment, recommendations, findings } = req.body;
    if (!name || !phase) return res.status(400).json({ error: "name and phase are required" });

    const checkpoint = storage.createCheckpoint({
      baselineId,
      name,
      phase,
      scheduledDate: scheduledDate ?? null,
      status: status || "upcoming",
      overallAssessment: overallAssessment ?? null,
      recommendations: recommendations ? (typeof recommendations === "string" ? recommendations : JSON.stringify(recommendations)) : null,
      findings: findings ? (typeof findings === "string" ? findings : JSON.stringify(findings)) : null,
    });
    res.status(201).json(checkpoint);
  });

  app.get("/api/contracts/:contractId/checkpoints", (req, res) => {
    const baselineId = parseInt(req.params.contractId);
    const checkpoints = storage.getCheckpoints(baselineId);
    res.json(checkpoints);
  });

  app.patch("/api/checkpoints/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const data = { ...req.body };
    // Ensure JSON fields are stored as strings
    if (data.recommendations && typeof data.recommendations !== "string") {
      data.recommendations = JSON.stringify(data.recommendations);
    }
    if (data.findings && typeof data.findings !== "string") {
      data.findings = JSON.stringify(data.findings);
    }
    const updated = storage.updateCheckpoint(id, data);
    if (!updated) return res.status(404).json({ error: "Checkpoint not found" });
    res.json(updated);
  });

  app.delete("/api/checkpoints/:id", (req, res) => {
    const id = parseInt(req.params.id);
    storage.deleteCheckpoint(id);
    res.json({ success: true });
  });

  // ==================== DEVIATIONS ====================

  app.post("/api/contracts/:contractId/deviations", (req, res) => {
    const baselineId = parseInt(req.params.contractId);
    const baseline = storage.getContractBaseline(baselineId);
    if (!baseline) return res.status(404).json({ error: "Contract not found" });

    const { severity, category, title, description, deliverableId, contractReference, actualDelivery, impact, status, resolution } = req.body;
    if (!severity || !category || !title || !description) {
      return res.status(400).json({ error: "severity, category, title, and description are required" });
    }

    const deviation = storage.createDeviation({
      baselineId,
      deliverableId: deliverableId ?? null,
      severity,
      category,
      title,
      description,
      contractReference: contractReference ?? null,
      actualDelivery: actualDelivery ?? null,
      impact: impact ?? null,
      status: status || "open",
      resolution: resolution ?? null,
    });
    res.status(201).json(deviation);
  });

  app.get("/api/contracts/:contractId/deviations", (req, res) => {
    const baselineId = parseInt(req.params.contractId);
    const devs = storage.getDeviations(baselineId);
    res.json(devs);
  });

  app.patch("/api/deviations/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const updated = storage.updateDeviation(id, req.body);
    if (!updated) return res.status(404).json({ error: "Deviation not found" });
    res.json(updated);
  });

  app.delete("/api/deviations/:id", (req, res) => {
    const id = parseInt(req.params.id);
    storage.deleteDeviation(id);
    res.json({ success: true });
  });

  // ==================== COMPLIANCE SUMMARY ====================

  app.get("/api/projects/:id/compliance-summary", (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const summary = storage.getComplianceSummary(projectId);
    res.json(summary);
  });

  // ==================== PM TOOL INTEGRATIONS ====================

  // Create integration connection
  app.post("/api/projects/:id/integrations", async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const project = storage.getProject(projectId);
      if (!project) return res.status(404).json({ error: "Project not found" });

      const { platform, name, config, contractId, fieldMapping } = req.body;
      if (!platform || !name || !config) {
        return res.status(400).json({ error: "platform, name, and config are required" });
      }

      // Validate connection before saving
      const { getConnector } = await import("./integrations");
      const connector = getConnector(platform);
      const parsedConfig = typeof config === "string" ? JSON.parse(config) : config;
      const validation = await connector.validateConnection(parsedConfig);

      if (!validation.valid) {
        return res.status(400).json({ error: validation.message, valid: false });
      }

      const connection = storage.createIntegrationConnection({
        projectId,
        contractId: contractId || null,
        platform,
        name: name || validation.projectName || `${platform} integration`,
        config: typeof config === "string" ? config : JSON.stringify(config),
        fieldMapping: fieldMapping ? (typeof fieldMapping === "string" ? fieldMapping : JSON.stringify(fieldMapping)) : null,
      });

      res.json({ ...connection, projectName: validation.projectName });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // List integrations for project
  app.get("/api/projects/:id/integrations", (req, res) => {
    const projectId = parseInt(req.params.id);
    const connections = storage.getIntegrationConnections(projectId);
    res.json(connections);
  });

  // Update integration connection
  app.patch("/api/integrations/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const connection = storage.getIntegrationConnection(id);
    if (!connection) return res.status(404).json({ error: "Integration not found" });

    const updateData: any = {};
    if (req.body.name !== undefined) updateData.name = req.body.name;
    if (req.body.config !== undefined) updateData.config = typeof req.body.config === "string" ? req.body.config : JSON.stringify(req.body.config);
    if (req.body.fieldMapping !== undefined) updateData.fieldMapping = typeof req.body.fieldMapping === "string" ? req.body.fieldMapping : JSON.stringify(req.body.fieldMapping);
    if (req.body.status !== undefined) updateData.status = req.body.status;
    if (req.body.contractId !== undefined) updateData.contractId = req.body.contractId;

    const updated = storage.updateIntegrationConnection(id, updateData);
    res.json(updated);
  });

  // Delete integration connection
  app.delete("/api/integrations/:id", (req, res) => {
    const id = parseInt(req.params.id);
    storage.deleteIntegrationConnection(id);
    res.json({ success: true });
  });

  // Test integration connection (validate without saving)
  app.post("/api/integrations/:id/test", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const connection = storage.getIntegrationConnection(id);
      if (!connection) return res.status(404).json({ error: "Integration not found" });

      const { getConnector } = await import("./integrations");
      const connector = getConnector(connection.platform);
      const config = JSON.parse(connection.config);
      const result = await connector.validateConnection(config);

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ valid: false, message: err.message });
    }
  });

  // Trigger sync
  app.post("/api/integrations/:id/sync", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const connection = storage.getIntegrationConnection(id);
      if (!connection) return res.status(404).json({ error: "Integration not found" });

      const { syncConnection } = await import("./integrations");
      const result = await syncConnection(id);

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get sync logs
  app.get("/api/integrations/:id/logs", (req, res) => {
    const id = parseInt(req.params.id);
    const connection = storage.getIntegrationConnection(id);
    if (!connection) return res.status(404).json({ error: "Integration not found" });

    const logs = storage.getSyncLogs(id, 20);
    res.json(logs);
  });

  // Preview items without syncing (for field mapping UI)
  app.get("/api/integrations/:id/preview", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const connection = storage.getIntegrationConnection(id);
      if (!connection) return res.status(404).json({ error: "Integration not found" });

      const { getConnector } = await import("./integrations");
      const connector = getConnector(connection.platform);
      const config = JSON.parse(connection.config);
      const items = await connector.fetchItems(config);

      res.json({ total: items.length, items: items.slice(0, 20) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==================== IV&V PULSE REPORTS ====================

  // Generate a new pulse report (AI-powered)
  app.post("/api/contracts/:contractId/pulse-report/generate", async (req, res) => {
    try {
      const contractId = parseInt(req.params.contractId);
      const baseline = storage.getContractBaseline(contractId);
      if (!baseline) return res.status(404).json({ error: "Contract not found" });

      // Gather compliance data
      const deliverables = storage.getDeliverables(contractId);
      const checkpoints = storage.getCheckpoints(contractId);
      const devs = storage.getDeviations(contractId);

      // Calculate metrics
      const totalDeliverables = deliverables.length;
      const accepted = deliverables.filter(d => d.status === "accepted").length;
      const atRisk = deliverables.filter(d => d.status === "at_risk").length;
      const nonCompliant = deliverables.filter(d => d.status === "non_compliant").length;
      const acceptedPct = totalDeliverables > 0 ? Math.round((accepted / totalDeliverables) * 100) : 100;

      const openDeviations = devs.filter(d => d.status === "open" || d.status === "investigating");
      const criticalDeviations = openDeviations.filter(d => d.severity === "critical");
      const highDeviations = openDeviations.filter(d => d.severity === "major" || d.severity === "high");

      const upcomingCheckpoints = checkpoints.filter(c => c.status === "upcoming" || c.status === "in_progress");
      const overdueCheckpoints = checkpoints.filter(c => {
        if (c.status === "completed" || c.status === "cancelled") return false;
        if (!c.scheduledDate) return false;
        return new Date(c.scheduledDate) < new Date();
      });

      // Auto-determine posture per spec:
      // RED: <60% accepted OR ≥1 critical deviation
      // YELLOW: 60-79% accepted OR ≥1 high deviation
      // GREEN: ≥80% accepted AND 0 critical deviations
      let overallPosture: string;
      if (acceptedPct < 60 || criticalDeviations.length >= 1) {
        overallPosture = "red";
      } else if (acceptedPct < 80 || highDeviations.length >= 1) {
        overallPosture = "yellow";
      } else {
        overallPosture = "green";
      }

      // Determine trend from last report
      const existingReports = storage.getPulseReports(contractId);
      let postureTrend = "stable";
      if (existingReports.length > 0) {
        const lastPosture = existingReports[0].overallPosture;
        const postureRank: Record<string, number> = { green: 3, yellow: 2, red: 1 };
        const current = postureRank[overallPosture] || 2;
        const previous = postureRank[lastPosture] || 2;
        if (current > previous) postureTrend = "improving";
        else if (current < previous) postureTrend = "declining";
      }

      // Build metrics
      const metrics = {
        acceptedPct,
        totalDeliverables,
        acceptedCount: accepted,
        atRiskCount: atRisk,
        nonCompliantCount: nonCompliant,
        deviationCount: openDeviations.length,
        criticalDeviationCount: criticalDeviations.length,
        checkpointCount: checkpoints.length,
        upcomingCheckpoints: upcomingCheckpoints.length,
        overdueCheckpoints: overdueCheckpoints.length,
      };

      // Risk highlights
      const riskHighlights: string[] = [];
      for (const d of criticalDeviations.slice(0, 3)) {
        riskHighlights.push(`Critical deviation: ${d.title}`);
      }
      for (const d of highDeviations.slice(0, 2)) {
        riskHighlights.push(`High deviation: ${d.title}`);
      }
      if (overdueCheckpoints.length > 0) {
        riskHighlights.push(`${overdueCheckpoints.length} overdue checkpoint(s)`);
      }
      if (nonCompliant > 0) {
        riskHighlights.push(`${nonCompliant} non-compliant deliverable(s)`);
      }

      // Milestone status
      const milestoneStatus = upcomingCheckpoints.slice(0, 5).map(c => ({
        name: c.name,
        phase: c.phase,
        scheduledDate: c.scheduledDate,
        status: c.status,
      }));

      // Decision items
      const decisionItems: string[] = [];
      if (criticalDeviations.length > 0) {
        decisionItems.push(`Review and disposition ${criticalDeviations.length} critical deviation(s)`);
      }
      if (overdueCheckpoints.length > 0) {
        decisionItems.push(`Reschedule or complete ${overdueCheckpoints.length} overdue checkpoint(s)`);
      }
      if (atRisk >= 3) {
        decisionItems.push(`${atRisk} deliverables at risk — consider mitigation plan`);
      }

      // Generate AI narrative
      const { llmCall } = await import("./ai");
      const narrativePrompt = `Generate a concise IV&V Weekly Pulse Report executive narrative (3-4 paragraphs) for the following project compliance data.

Contract: ${baseline.contractName}
Overall Posture: ${overallPosture.toUpperCase()} (trend: ${postureTrend})

Metrics:
- Deliverables accepted: ${acceptedPct}% (${accepted}/${totalDeliverables})
- At-risk deliverables: ${atRisk}
- Non-compliant deliverables: ${nonCompliant}
- Open deviations: ${openDeviations.length} (${criticalDeviations.length} critical, ${highDeviations.length} high)
- Upcoming checkpoints: ${upcomingCheckpoints.length}
- Overdue checkpoints: ${overdueCheckpoints.length}

Risk highlights: ${riskHighlights.join("; ") || "None"}
Decisions needed: ${decisionItems.join("; ") || "None"}

Write in professional consulting tone covering: overall posture assessment, key risks and concerns, milestone readiness, and recommended actions. Be specific and data-driven.`;

      let narrative = "";
      try {
        const { llmCall } = await import("./ai");
        narrative = await llmCall(narrativePrompt, undefined, 1024);
      } catch (aiErr: any) {
        console.error("AI narrative generation failed:", aiErr.message);
        narrative = `**Overall Posture: ${overallPosture.toUpperCase()}** (${postureTrend})\n\nDeliverables accepted: ${acceptedPct}% with ${openDeviations.length} open deviations. ${riskHighlights.length > 0 ? "Key risks: " + riskHighlights.join(", ") + "." : "No critical risks identified."}`;
      }

      const weekEnding = new Date().toISOString().split("T")[0];

      const report = storage.createPulseReport({
        baselineId: contractId,
        overallPosture,
        postureTrend,
        narrative,
        riskHighlights: JSON.stringify(riskHighlights),
        milestoneStatus: JSON.stringify(milestoneStatus),
        decisionItems: JSON.stringify(decisionItems),
        metrics: JSON.stringify(metrics),
        weekEnding,
      });

      res.json(report);
    } catch (err: any) {
      console.error("Pulse report generation error:", err);
      res.status(500).json({ error: err.message || "Failed to generate pulse report" });
    }
  });

  // List pulse reports for a contract
  app.get("/api/contracts/:contractId/pulse-reports", (req, res) => {
    const contractId = parseInt(req.params.contractId);
    const reports = storage.getPulseReports(contractId);
    res.json(reports);
  });

  // Get single pulse report
  app.get("/api/pulse-reports/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const report = storage.getPulseReport(id);
    if (!report) return res.status(404).json({ error: "Pulse report not found" });
    res.json(report);
  });

  // ==================== STRUCTURED CHECKPOINT ASSESSMENTS ====================

  // Save structured assessment for a checkpoint (7 dimensions)
  app.post("/api/checkpoints/:id/assessment", (req, res) => {
    const checkpointId = parseInt(req.params.id);
    const { dimensions } = req.body as {
      dimensions: Array<{
        dimension: string;
        rating: string;
        observation?: string;
        evidence?: string;
        recommendation?: string;
      }>;
    };

    if (!dimensions || !Array.isArray(dimensions)) {
      return res.status(400).json({ error: "dimensions array is required" });
    }

    const saved = storage.saveCheckpointAssessment(checkpointId, dimensions);
    res.json(saved);
  });

  // Get assessment for a checkpoint
  app.get("/api/checkpoints/:id/assessment", (req, res) => {
    const checkpointId = parseInt(req.params.id);
    const assessments = storage.getCheckpointAssessment(checkpointId);
    res.json(assessments);
  });

  // Generate readiness report (text) for a checkpoint
  app.get("/api/checkpoints/:id/readiness-report", (req, res) => {
    const checkpointId = parseInt(req.params.id);
    const cp = storage.getCheckpoint(checkpointId);
    if (!cp) return res.status(404).json({ error: "Checkpoint not found" });

    const assessments = storage.getCheckpointAssessment(checkpointId);

    // Calculate overall readiness
    const ratings = assessments.map(a => a.rating);
    let overallReadiness = "Passed";
    if (ratings.some(r => r === "at_risk" || r === "unsatisfactory")) {
      overallReadiness = "Not Ready";
    } else if (ratings.some(r => r === "needs_attention")) {
      overallReadiness = "Passed with Conditions";
    }

    const DIMENSION_LABELS: Record<string, string> = {
      schedule_discipline: "Schedule Discipline",
      deliverable_completeness: "Deliverable Completeness & Acceptance Readiness",
      requirements_traceability: "Requirements Traceability & Scope Integrity",
      design_architecture: "Design & Architecture Validation",
      data_migration: "Data Strategy & Conversion Readiness",
      defect_management: "Defect & Issue Management",
      testing_coverage: "Testing Coverage & Exit Criteria",
    };

    const RATING_LABELS: Record<string, string> = {
      satisfactory: "Satisfactory",
      needs_attention: "Needs Attention",
      at_risk: "At Risk",
      unsatisfactory: "Unsatisfactory",
    };

    // Build text report
    let report = `MILESTONE READINESS OBSERVATION\n`;
    report += `${cp.name} — ${cp.completedDate || cp.scheduledDate || "N/A"}\n`;
    report += `Phase: ${cp.phase}\n\n`;
    report += `OVERALL READINESS: ${overallReadiness}\n\n`;
    report += `VALIDATION SUMMARY:\n`;

    for (let i = 0; i < assessments.length; i++) {
      const a = assessments[i];
      const label = DIMENSION_LABELS[a.dimension] || a.dimension;
      const ratingLabel = RATING_LABELS[a.rating] || a.rating;
      report += `\n${i + 1}. ${label}: ${ratingLabel}\n`;
      if (a.observation) report += `   ${a.observation}\n`;
      if (a.recommendation) report += `   Recommendation: ${a.recommendation}\n`;
    }

    // Residual risks
    const riskyDimensions = assessments.filter(a => a.rating === "at_risk" || a.rating === "unsatisfactory" || a.rating === "needs_attention");
    if (riskyDimensions.length > 0) {
      report += `\nRESIDUAL RISKS:\n`;
      for (const a of riskyDimensions) {
        const label = DIMENSION_LABELS[a.dimension] || a.dimension;
        report += `- ${label}: ${a.observation || "See assessment details"}\n`;
      }
    }

    report += `\nRECOMMENDATION:\n`;
    if (overallReadiness === "Passed") {
      report += `All validation dimensions are satisfactory. The milestone is ready to proceed.\n`;
    } else if (overallReadiness === "Passed with Conditions") {
      report += `The milestone may proceed with conditions. Address the ${riskyDimensions.length} dimension(s) flagged above before full approval.\n`;
    } else {
      report += `The milestone is NOT ready to proceed. ${riskyDimensions.length} dimension(s) require remediation before reassessment.\n`;
    }

    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Content-Disposition", `attachment; filename="readiness_observation_${checkpointId}.txt"`);
    res.send(report);
  });

  // ==================== GO-LIVE READINESS SCORECARD ====================

  // Create or update go-live scorecard
  app.post("/api/contracts/:contractId/go-live-scorecard", (req, res) => {
    const contractId = parseInt(req.params.contractId);
    const baseline = storage.getContractBaseline(contractId);
    if (!baseline) return res.status(404).json({ error: "Contract not found" });

    const { criteria, assessorNotes, assessedAt } = req.body;
    if (!criteria) return res.status(400).json({ error: "criteria is required" });

    // Parse criteria array and calculate overallScore as weighted average * 10
    const criteriaArr: Array<{ weight?: number; score?: number }> = typeof criteria === "string" ? JSON.parse(criteria) : criteria;
    let totalWeight = 0;
    let weightedSum = 0;
    for (const c of criteriaArr) {
      const w = c.weight ?? 1;
      const s = c.score ?? 0;
      totalWeight += w;
      weightedSum += w * s;
    }
    const overallScore = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 10 * 10) / 10 : 0;

    // Determine readiness: ≥85=ready, 70-84=ready_with_conditions, 50-69=not_ready, <50=critical_hold
    let overallReadiness: string;
    if (overallScore >= 85) {
      overallReadiness = "ready";
    } else if (overallScore >= 70) {
      overallReadiness = "ready_with_conditions";
    } else if (overallScore >= 50) {
      overallReadiness = "not_ready";
    } else {
      overallReadiness = "critical_hold";
    }

    const scorecard = storage.saveGoLiveScorecard({
      baselineId: contractId,
      criteria: typeof criteria === "string" ? criteria : JSON.stringify(criteria),
      overallScore,
      overallReadiness,
      assessorNotes: assessorNotes ?? null,
      assessedAt: assessedAt || new Date().toISOString(),
    });

    res.json(scorecard);
  });

  // Get go-live scorecard
  app.get("/api/contracts/:contractId/go-live-scorecard", (req, res) => {
    const contractId = parseInt(req.params.contractId);
    const scorecard = storage.getGoLiveScorecard(contractId);
    if (!scorecard) return res.json(null);
    res.json(scorecard);
  });

  // ==================== ESCALATION STATUS ====================

  // Get escalation status for a project
  app.get("/api/projects/:id/escalation-status", (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const escalations = storage.getEscalationStatus(projectId);
    res.json(escalations);
  });

  // Acknowledge an escalation
  app.patch("/api/deviations/:id/acknowledge", (req, res) => {
    const id = parseInt(req.params.id);
    const deviation = storage.getDeviation(id);
    if (!deviation) return res.status(404).json({ error: "Deviation not found" });

    const updated = storage.updateDeviation(id, {
      escalationStatus: "acknowledged",
      escalatedAt: new Date().toISOString(),
    });
    res.json(updated);
  });

  // ==================== DISCOVERY WIZARD ====================

  // Org Profile
  app.post("/api/projects/:id/org-profile", (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const { entityType, entityName, state, population, employeeCount, annualBudget, currentSystems, departments, painSummary, domain, leadership, documents } = req.body;
    const profile = storage.upsertOrgProfile(projectId, {
      entityType: entityType ?? null,
      entityName: entityName ?? null,
      state: state ?? null,
      population: population ?? null,
      employeeCount: employeeCount ?? null,
      annualBudget: annualBudget ?? null,
      currentSystems: currentSystems ? (typeof currentSystems === "string" ? currentSystems : JSON.stringify(currentSystems)) : null,
      departments: departments ? (typeof departments === "string" ? departments : JSON.stringify(departments)) : null,
      painSummary: painSummary ?? null,
      domain: domain ?? null,
      leadership: leadership ? (typeof leadership === "string" ? leadership : JSON.stringify(leadership)) : null,
      documents: documents ? (typeof documents === "string" ? documents : JSON.stringify(documents)) : null,
    });
    res.json(profile);
  });

  app.get("/api/projects/:id/org-profile", (req, res) => {
    const projectId = parseInt(req.params.id);
    const profile = storage.getOrgProfile(projectId);
    res.json(profile || null);
  });

  // Discovery Interviews
  app.post("/api/projects/:id/discovery/interviews", (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const { functionalArea, interviewee, role } = req.body;
    if (!functionalArea) return res.status(400).json({ error: "functionalArea is required" });

    const interview = storage.createDiscoveryInterview({
      projectId, functionalArea, interviewee: interviewee ?? null, role: role ?? null,
    });
    res.status(201).json(interview);
  });

  app.get("/api/projects/:id/discovery/interviews", (req, res) => {
    const projectId = parseInt(req.params.id);
    const interviews = storage.getDiscoveryInterviews(projectId);
    res.json(interviews);
  });

  app.get("/api/discovery/interviews/:interviewId", (req, res) => {
    const id = parseInt(req.params.interviewId);
    const interview = storage.getDiscoveryInterview(id);
    if (!interview) return res.status(404).json({ error: "Interview not found" });
    res.json(interview);
  });

  // Generate AI interview guide for a functional area
  app.post("/api/discovery/interviews/:interviewId/generate-guide", async (req, res) => {
    const id = parseInt(req.params.interviewId);
    const interview = storage.getDiscoveryInterview(id);
    if (!interview) return res.status(404).json({ error: "Interview not found" });
    try {
      const { generateInterviewGuide } = await import("./ai");
      const orgProfile = storage.getOrgProfile(interview.projectId);
      const guide = await generateInterviewGuide(interview.functionalArea, orgProfile || null);
      // Store the guide in the interview's messages field as JSON
      // Always use object format for guided interview data (not the old chat array format)
      let existingData: any = {};
      if (interview.messages) {
        const parsed = JSON.parse(interview.messages);
        if (parsed && !Array.isArray(parsed)) existingData = parsed;
      }
      existingData.guide = guide.questions;
      if (!existingData.answers) existingData.answers = {};
      const jsonStr = JSON.stringify(existingData);
      console.log(`[guide] Saving guide for interview ${id}, data length: ${jsonStr.length}, guide count: ${existingData.guide?.length}`);
      const result = storage.updateDiscoveryInterview(id, {
        messages: jsonStr,
        status: "in_progress",
      });
      console.log(`[guide] Update result:`, result ? `saved, messages length: ${result.messages?.length}` : 'FAILED');
      res.json(guide);
    } catch (error: any) {
      console.error("Guide generation error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Save answer for a specific question
  app.post("/api/discovery/interviews/:interviewId/save-answer", (req, res) => {
    const id = parseInt(req.params.interviewId);
    const interview = storage.getDiscoveryInterview(id);
    if (!interview) return res.status(404).json({ error: "Interview not found" });
    const { questionId, answer, status } = req.body;
    const parsed = interview.messages ? JSON.parse(interview.messages) : {};
    const data = (parsed && !Array.isArray(parsed)) ? parsed : {};
    if (!data.answers) data.answers = {};
    data.answers[questionId] = { answer, status: status || "answered", updatedAt: new Date().toISOString() };
    storage.updateDiscoveryInterview(id, { messages: JSON.stringify(data) });
    res.json({ success: true });
  });

  // Import transcript from Fireflies, Otter, or manual paste and extract answers
  app.post("/api/discovery/interviews/:interviewId/import-transcript", async (req, res) => {
    const id = parseInt(req.params.interviewId);
    const interview = storage.getDiscoveryInterview(id);
    if (!interview) return res.status(404).json({ error: "Interview not found" });
    const { transcript } = req.body;
    if (!transcript) return res.status(400).json({ error: "Transcript is required" });
    try {
      const { processTranscript } = await import("./ai");
      const data = interview.messages ? JSON.parse(interview.messages) : {};
      const questions = (data.guide || []).map((q: any) => ({ id: q.id, question: q.question }));
      const result = await processTranscript(interview.functionalArea, transcript, questions);
      // Merge extracted answers into existing answers
      if (!data.answers) data.answers = {};
      for (const ans of result.answers) {
        data.answers[ans.questionId] = {
          answer: ans.extractedAnswer,
          keyPoints: ans.keyPoints,
          painPoints: ans.painPoints,
          followUpNeeded: ans.followUpNeeded,
          status: ans.followUpNeeded ? "follow_up" : "answered",
          source: "transcript",
          updatedAt: new Date().toISOString(),
        };
      }
      data.additionalFindings = result.additionalFindings;
      data.transcriptImported = true;
      storage.updateDiscoveryInterview(id, { messages: JSON.stringify(data) });
      res.json(result);
    } catch (error: any) {
      console.error("Transcript processing error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // SSE streaming interview message (legacy chat mode)
  app.post("/api/discovery/interviews/:interviewId/message", async (req, res) => {
    const id = parseInt(req.params.interviewId);
    const interview = storage.getDiscoveryInterview(id);
    if (!interview) return res.status(404).json({ error: "Interview not found" });

    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "message is required" });

    // Parse existing messages
    let existingMessages: { role: string; content: string; timestamp: string }[] = [];
    try { existingMessages = interview.messages ? JSON.parse(interview.messages) : []; } catch {}

    // Add user message
    existingMessages.push({ role: "user", content: message, timestamp: new Date().toISOString() });

    // Build AI context
    const { buildDiscoveryInterviewPrompt, llmStream } = await import("./ai");
    const orgProfileData = storage.getOrgProfile(interview.projectId);
    const systemPrompt = buildDiscoveryInterviewPrompt(
      interview.functionalArea,
      orgProfileData,
      existingMessages,
    );

    // Build messages for Claude (without timestamps)
    const claudeMessages = existingMessages.map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // Update status to in_progress
    if (interview.status === "not_started") {
      storage.updateDiscoveryInterview(id, { status: "in_progress" });
    }

    // Set SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });

    try {
      const lastUserMsg = claudeMessages[claudeMessages.length - 1]?.content || "";
      const stream = await llmStream(lastUserMsg, systemPrompt, 2048);

      let fullResponse = "";

      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content || "";
        if (text) {
          fullResponse += text;
          res.write(`data: ${JSON.stringify({ type: "text", text })}\n\n`);
        }
      }

      // Save assistant response
      existingMessages.push({ role: "assistant", content: fullResponse, timestamp: new Date().toISOString() });
      storage.updateDiscoveryInterview(id, { messages: JSON.stringify(existingMessages) });
      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      res.end();
    } catch (error: any) {
      console.error("Interview error:", error);
      storage.updateDiscoveryInterview(id, { messages: JSON.stringify(existingMessages) });
      res.write(`data: ${JSON.stringify({ type: "error", error: error.message || "Failed to start interview" })}\n\n`);
      res.end();
    }
  });

  // Complete interview — extract findings
  app.post("/api/discovery/interviews/:interviewId/complete", async (req, res) => {
    const id = parseInt(req.params.interviewId);
    const interview = storage.getDiscoveryInterview(id);
    if (!interview) return res.status(404).json({ error: "Interview not found" });

    let messages: { role: string; content: string }[] = [];
    try { messages = interview.messages ? JSON.parse(interview.messages) : []; } catch {}

    if (messages.length === 0) {
      return res.status(400).json({ error: "No messages in this interview to analyze" });
    }

    try {
      const { extractDiscoveryFindings } = await import("./ai");
      const findings = await extractDiscoveryFindings(interview.functionalArea, messages);

      // Save findings to interview
      storage.updateDiscoveryInterview(id, {
        status: "completed",
        findings: JSON.stringify(findings),
        painPoints: JSON.stringify(findings.painPoints || []),
        processSteps: JSON.stringify(findings.processSteps || []),
      });

      // Create discoveryPainPoint records
      if (findings.painPoints && Array.isArray(findings.painPoints)) {
        for (const pp of findings.painPoints) {
          storage.createPainPoint({
            projectId: interview.projectId,
            sourceInterviewId: id,
            functionalArea: interview.functionalArea,
            description: pp.description || pp.finding || JSON.stringify(pp),
            severity: pp.severity || null,
            frequency: pp.frequency || null,
            impact: pp.impact || null,
            currentWorkaround: pp.currentWorkaround || null,
          });
        }
      }

      res.json({ success: true, findings });
    } catch (error: any) {
      console.error("Findings extraction error:", error);
      // Mark as complete even if extraction fails
      storage.updateDiscoveryInterview(id, { status: "completed" });
      res.status(500).json({ error: error.message || "Failed to extract findings" });
    }
  });

  app.delete("/api/discovery/interviews/:interviewId", (req, res) => {
    const id = parseInt(req.params.interviewId);
    storage.deleteDiscoveryInterview(id);
    res.json({ success: true });
  });

  // Pain Points
  app.get("/api/projects/:id/discovery/pain-points", (req, res) => {
    const projectId = parseInt(req.params.id);
    const painPoints = storage.getPainPoints(projectId);
    res.json(painPoints);
  });

  app.patch("/api/discovery/pain-points/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const updated = storage.updatePainPoint(id, req.body);
    if (!updated) return res.status(404).json({ error: "Pain point not found" });
    res.json(updated);
  });

  app.post("/api/projects/:id/discovery/pain-points/prioritize", (req, res) => {
    const { updates } = req.body;
    if (!updates || !Array.isArray(updates)) {
      return res.status(400).json({ error: "updates array is required with [{id, priority}]" });
    }
    storage.bulkUpdatePainPointPriorities(updates);
    res.json({ success: true });
  });

  // Generate Requirements
  app.post("/api/projects/:id/discovery/generate-requirements", async (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    try {
      const { generateRequirementsFromDiscovery } = await import("./ai");
      const generatedReqs = await generateRequirementsFromDiscovery(projectId);

      // Create actual requirement records
      const created = [];
      const moduleCounters: Record<string, number> = {};

      for (const req2 of generatedReqs) {
        const mod = req2.module || "General";
        if (!moduleCounters[mod]) {
          // Count existing requirements in this module to set req numbers
          const existing = storage.getRequirements(projectId, { functionalArea: mod });
          moduleCounters[mod] = existing.length;
        }
        moduleCounters[mod]++;
        const prefix = mod.substring(0, 3).toUpperCase();
        const reqNumber = `${prefix}${String(moduleCounters[mod]).padStart(2, "0")}`;

        const record = storage.createRequirement({
          projectId,
          reqNumber,
          category: "Discovery",
          functionalArea: mod,
          subCategory: "Generated",
          description: req2.description,
          criticality: req2.criticality || "Desired",
          comments: req2.justification ? `Justification: ${req2.justification}${req2.painPointRef ? `\nLinked pain point: ${req2.painPointRef}` : ""}` : "",
        });
        created.push({ ...record, justification: req2.justification, painPointRef: req2.painPointRef });
      }

      res.json({ success: true, requirements: created, count: created.length });
    } catch (error: any) {
      console.error("Requirements generation error:", error);
      res.status(500).json({ error: error.message || "Failed to generate requirements" });
    }
  });

  // Discovery Summary
  app.get("/api/projects/:id/discovery/summary", (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const orgProfileData = storage.getOrgProfile(projectId);
    const interviews = storage.getDiscoveryInterviews(projectId);
    const painPoints = storage.getPainPoints(projectId);
    const reqs = storage.getRequirements(projectId, { functionalArea: undefined });
    const discoveryReqs = reqs.filter(r => r.category === "Discovery");

    const completedInterviews = interviews.filter(i => i.status === "completed");
    const interviewSummaries = completedInterviews.map(i => {
      let ppCount = 0;
      try { ppCount = i.painPoints ? JSON.parse(i.painPoints).length : 0; } catch {}
      let psCount = 0;
      try { psCount = i.processSteps ? JSON.parse(i.processSteps).length : 0; } catch {}
      return {
        id: i.id,
        functionalArea: i.functionalArea,
        interviewee: i.interviewee,
        status: i.status,
        painPointCount: ppCount,
        processStepCount: psCount,
      };
    });

    res.json({
      orgProfile: orgProfileData || null,
      interviews: {
        total: interviews.length,
        completed: completedInterviews.length,
        inProgress: interviews.filter(i => i.status === "in_progress").length,
        summaries: interviewSummaries,
      },
      painPoints: {
        total: painPoints.length,
        bySeverity: {
          critical: painPoints.filter(p => p.severity === "critical").length,
          high: painPoints.filter(p => p.severity === "high").length,
          medium: painPoints.filter(p => p.severity === "medium").length,
          low: painPoints.filter(p => p.severity === "low").length,
        },
        prioritized: painPoints.filter(p => p.stakeholderPriority != null).length,
      },
      generatedRequirements: discoveryReqs.length,
    });
  });

  // ==================== VENDOR KNOWLEDGE BASE ====================

  app.get("/api/knowledge-base/capabilities", (req, res) => {
    const filters: { platform?: string; module?: string; search?: string } = {};
    if (req.query.platform) filters.platform = req.query.platform as string;
    if (req.query.module) filters.module = req.query.module as string;
    if (req.query.search) filters.search = req.query.search as string;
    const capabilities = storage.getVendorCapabilities(filters);
    res.json(capabilities);
  });

  app.get("/api/knowledge-base/capabilities/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const cap = storage.getVendorCapability(id);
    if (!cap) return res.status(404).json({ error: "Capability not found" });
    res.json(cap);
  });

  app.post("/api/knowledge-base/capabilities", (req, res) => {
    const { vendorPlatform, module, processArea } = req.body;
    if (!vendorPlatform || !module || !processArea) {
      return res.status(400).json({ error: "vendorPlatform, module, and processArea are required" });
    }
    const cap = storage.createVendorCapability(req.body);
    res.status(201).json(cap);
  });

  app.patch("/api/knowledge-base/capabilities/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const updated = storage.updateVendorCapability(id, req.body);
    if (!updated) return res.status(404).json({ error: "Capability not found" });
    res.json(updated);
  });

  app.delete("/api/knowledge-base/capabilities/:id", (req, res) => {
    const id = parseInt(req.params.id);
    storage.deleteVendorCapability(id);
    res.json({ success: true });
  });

  app.get("/api/knowledge-base/compare", (req, res) => {
    const module = req.query.module as string;
    const platforms = (req.query.platforms as string || "").split(",").filter(Boolean);
    if (!module || platforms.length === 0) {
      return res.status(400).json({ error: "module and platforms query params required" });
    }
    const results = storage.compareCapabilities(module, platforms);
    res.json(results);
  });

  app.get("/api/knowledge-base/coverage", (_req, res) => {
    const coverage = storage.getModuleCoverage();
    res.json(coverage);
  });

  app.get("/api/knowledge-base/process-details", (req, res) => {
    const filters: { platform?: string; module?: string; search?: string } = {};
    if (req.query.platform) filters.platform = req.query.platform as string;
    if (req.query.module) filters.module = req.query.module as string;
    if (req.query.search) filters.search = req.query.search as string;
    const details = storage.getProcessDetails(filters);
    res.json(details);
  });

  app.post("/api/knowledge-base/seed", (_req, res) => {
    try {
      const dataPath = path.resolve("port_of_portland_vendor_data.json");
      if (!fs.existsSync(dataPath)) {
        return res.status(404).json({ error: "Vendor data file not found at " + dataPath });
      }
      const raw = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
      const { vendorScores, requirements: reqMap } = raw;

      // Build reqNumber -> requirement lookup
      const reqByNumber: Record<string, any> = {};
      for (const req of Object.values(reqMap) as any[]) {
        reqByNumber[req.reqNumber] = req;
      }

      // Vendor-to-platform mapping
      const VENDOR_PLATFORM_MAP: Record<string, Record<string, string>> = {
        "Deloitte (Workday)": { ERP: "workday", EAM: "workday", HCM: "workday", default: "workday" },
        "Cognizant (Workday+Maximo)": { ERP: "workday", EAM: "maximo", HCM: "workday", default: "workday" },
        "Oracle": { ERP: "oracle_cloud", EAM: "oracle_eam", HCM: "oracle_cloud", default: "oracle_cloud" },
        "IBM (Oracle+Maximo)": { ERP: "oracle_cloud", EAM: "maximo", HCM: "oracle_cloud", default: "oracle_cloud" },
        "Strada (Workday+NV5)": { ERP: "workday", EAM: "nv5", HCM: "workday", default: "workday" },
      };

      let totalProcessDetails = 0;
      let totalCapabilities = 0;

      for (const [vendorName, scores] of Object.entries(vendorScores)) {
        const platformMap = VENDOR_PLATFORM_MAP[vendorName];
        if (!platformMap) continue;

        // Group by platform+module
        const grouped: Record<string, { platform: string; module: string; items: { reqRef: string; desc: string; score: string; comments: string }[] }> = {};

        for (const [reqRef, entry] of Object.entries(scores as Record<string, any>)) {
          const req = reqByNumber[reqRef];
          if (!req) continue;
          const system = (entry.system || "").toUpperCase() || "ERP";
          const platform = platformMap[system] || platformMap.default || "unknown";
          const module = req.functionalArea || "General";
          const key = `${platform}::${module}`;

          if (!grouped[key]) grouped[key] = { platform, module, items: [] };
          grouped[key].items.push({
            reqRef,
            desc: req.description || "",
            score: entry.score || "",
            comments: entry.comments || "",
          });
        }

        // For each platform+module group
        for (const { platform, module, items } of Object.values(grouped)) {
          // Create process detail rows
          const processDetailRows = items.map(item => ({
            vendorPlatform: platform,
            module,
            reqReference: item.reqRef,
            capability: item.desc,
            howHandled: item.comments || null,
            score: item.score || null,
            sourceVendor: vendorName,
          }));
          storage.bulkCreateProcessDetails(processDetailRows);
          totalProcessDetails += processDetailRows.length;

          // Build capability summary (no AI)
          const sScored = items.filter(i => i.score === "S").sort((a, b) => (b.comments?.length || 0) - (a.comments?.length || 0));
          const nfScored = items.filter(i => i.score === "N" || i.score === "F");
          const total = items.length;
          const sCount = sScored.length;

          // workflowDescription: top 5 longest S-scored comments
          const workflowDescription = sScored.slice(0, 5).map(i => i.comments).filter(Boolean).join("\n\n");

          // differentiators: first sentences from top 5 S-scored
          const differentiators = sScored.slice(0, 5).map(i => {
            const firstSentence = (i.comments || "").split(/\.\s/)[0];
            return firstSentence ? firstSentence + "." : i.desc;
          });

          // limitations: descriptions of N/F scored items
          const limitations = nfScored.map(i => `${i.reqRef}: ${i.desc}`);

          // maturityRating: round(sCount / total * 5)
          const maturityRating = total > 0 ? Math.round((sCount / total) * 5) : 0;

          storage.createVendorCapability({
            vendorPlatform: platform,
            module,
            processArea: module,
            workflowDescription: workflowDescription || null,
            differentiators: differentiators.length > 0 ? JSON.stringify(differentiators) : null,
            limitations: limitations.length > 0 ? JSON.stringify(limitations) : null,
            automationLevel: "semi_automated",
            maturityRating: Math.max(1, Math.min(5, maturityRating)),
            sourceDocuments: JSON.stringify([`${vendorName} RFP Response`]),
          });
          totalCapabilities++;
        }
      }

      res.json({ success: true, message: `Seeded ${totalCapabilities} capabilities and ${totalProcessDetails} process details` });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to seed knowledge base" });
    }
  });

  app.patch("/api/projects/:id/engagement-mode", (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const { mode } = req.body;
    if (!mode || !["consulting", "self_service"].includes(mode)) {
      return res.status(400).json({ error: "mode must be 'consulting' or 'self_service'" });
    }

    const updated = storage.updateProjectEngagementMode(projectId, mode);
    res.json(updated);
  });

  // ==================== SEED DATA ====================

  app.post("/api/projects/:id/seed-ivv-data", (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const project = storage.getProject(projectId);
      if (!project) return res.status(404).json({ error: "Project not found" });

      // Create contract baseline
      const baseline = storage.createContractBaseline({
        projectId,
        vendorId: null,
        contractName: "Workday ERP Implementation",
        contractDate: "2025-06-15",
        totalValue: "18500000",
        startDate: "2025-07-01",
        endDate: "2027-01-31",
        notes: "Full-scope Workday HCM, Payroll, Financials implementation",
      });
      const bId = baseline.id;

      // 25 Deliverables
      const deliverables = [
        { category: "milestone", name: "Project Charter & Governance Framework", dueDate: "2025-07-15", status: "accepted", priority: "critical" },
        { category: "milestone", name: "Requirements Validation Complete", dueDate: "2025-10-31", status: "accepted", priority: "critical" },
        { category: "milestone", name: "Design Signoff", dueDate: "2025-12-15", status: "delivered", priority: "critical" },
        { category: "milestone", name: "Configuration & Build Complete", dueDate: "2026-03-31", status: "in_progress", priority: "critical" },
        { category: "milestone", name: "SIT Entry", dueDate: "2026-04-15", status: "not_started", priority: "critical" },
        { category: "milestone", name: "SIT Exit", dueDate: "2026-05-31", status: "not_started", priority: "critical" },
        { category: "milestone", name: "UAT Entry", dueDate: "2026-06-15", status: "not_started", priority: "critical" },
        { category: "milestone", name: "UAT Exit", dueDate: "2026-07-31", status: "not_started", priority: "critical" },
        { category: "milestone", name: "Go-Live", dueDate: "2026-09-01", status: "not_started", priority: "critical" },
        { category: "deliverable", name: "Functional Requirements Document", dueDate: "2025-09-30", status: "accepted", priority: "high" },
        { category: "deliverable", name: "Technical Architecture Document", dueDate: "2025-10-15", status: "accepted", priority: "high" },
        { category: "deliverable", name: "Data Migration Strategy", dueDate: "2025-11-30", status: "delivered", priority: "high" },
        { category: "deliverable", name: "Integration Design Specifications", dueDate: "2025-12-30", status: "at_risk", priority: "high" },
        { category: "deliverable", name: "Test Strategy & Plan", dueDate: "2026-01-31", status: "delivered", priority: "high" },
        { category: "deliverable", name: "Training Plan", dueDate: "2026-02-28", status: "at_risk", priority: "standard" },
        { category: "deliverable", name: "Change Management Plan", dueDate: "2026-01-15", status: "non_compliant", priority: "high" },
        { category: "deliverable", name: "Cutover Plan", dueDate: "2026-06-30", status: "not_started", priority: "critical" },
        { category: "deliverable", name: "Security & Access Model", dueDate: "2026-02-15", status: "in_progress", priority: "high" },
        { category: "sla", name: "Weekly Status Report Delivery", dueDate: null, status: "in_progress", priority: "standard" },
        { category: "sla", name: "Defect Resolution - Critical (24hrs)", dueDate: null, status: "at_risk", priority: "critical" },
        { category: "sla", name: "Defect Resolution - High (72hrs)", dueDate: null, status: "in_progress", priority: "high" },
        { category: "sla", name: "Environment Availability (99.5%)", dueDate: null, status: "accepted", priority: "high" },
        { category: "requirement", name: "Payroll Configuration Complete", dueDate: "2026-03-15", status: "in_progress", priority: "critical" },
        { category: "requirement", name: "GL/AP/AR Configuration Complete", dueDate: "2026-02-28", status: "delivered", priority: "critical" },
        { category: "requirement", name: "HCM Core Configuration", dueDate: "2026-03-31", status: "in_progress", priority: "high" },
      ];
      for (const d of deliverables) {
        storage.createDeliverable({ baselineId: bId, category: d.category, name: d.name, dueDate: d.dueDate, status: d.status, priority: d.priority });
      }

      // 5 IV&V Checkpoints
      storage.createCheckpoint({ baselineId: bId, name: "Governance Framework Validation", phase: "planning", scheduledDate: "2025-07-30", completedDate: "2025-07-28", status: "completed", overallAssessment: "passed" });
      storage.createCheckpoint({ baselineId: bId, name: "Requirements Validation Review", phase: "design", scheduledDate: "2025-11-15", completedDate: "2025-11-14", status: "completed", overallAssessment: "passed_with_conditions", findings: "14 requirements lack traceability to design artifacts. Recommended traceability matrix update before design signoff." });
      storage.createCheckpoint({ baselineId: bId, name: "Design Signoff Readiness", phase: "design", scheduledDate: "2025-12-10", completedDate: "2025-12-09", status: "completed", overallAssessment: "passed_with_conditions", findings: "Integration specifications for 3 of 8 interfaces incomplete. Conditional approval granted with 30-day remediation window." });
      storage.createCheckpoint({ baselineId: bId, name: "Build Progress Review", phase: "build", scheduledDate: "2026-03-15", status: "in_progress", overallAssessment: null });
      storage.createCheckpoint({ baselineId: bId, name: "SIT Readiness Assessment", phase: "testing", scheduledDate: "2026-04-10", status: "upcoming", overallAssessment: null });

      // 8 Deviations
      const deviations = [
        { severity: "critical", category: "timeline", title: "Go-Live Date at Risk", description: "Original contract specified July 2026 go-live. SI has revised to September 2026 without formal change order. This represents a 2-month delay with no contractual amendment.", status: "open" },
        { severity: "major", category: "quality", title: "Change Management Plan Non-Compliant", description: "Contract requires Prosci-certified OCM lead. SI assigned junior resource with no OCM certification. Change management plan does not meet contractual deliverable acceptance criteria.", status: "open" },
        { severity: "major", category: "scope", title: "Integration Specs Incomplete", description: "3 of 8 integration interfaces lack finalized specifications 4 months before SIT. Interfaces affected: GL Journal Import, Benefits Carrier Feed, Time Tracking.", status: "under_review" },
        { severity: "major", category: "staffing", title: "Key Resource Departure", description: "Lead payroll architect departed SI team in February. Replacement assigned has no Workday Payroll implementation experience. Knowledge transfer incomplete.", status: "remediation_planned" },
        { severity: "high", category: "functionality", title: "Payroll Parallel Testing Gap", description: "No payroll compare/parallel testing included in current test plan despite contract requirement in SOW Section 4.3. Risk of payroll errors at go-live.", status: "open" },
        { severity: "medium", category: "timeline", title: "Data Migration Behind Schedule", description: "Mock conversion 2 completed with 12% error rate on employee master records. Target was <2%. Root cause analysis pending.", status: "under_review" },
        { severity: "medium", category: "sla", title: "Critical Defect SLA Breach", description: "3 critical defects exceeded 24-hour resolution SLA in February. Average resolution time was 52 hours. Pattern indicates resource constraint.", status: "escalated" },
        { severity: "minor", category: "scope", title: "Report Customization Requests", description: "12 custom reports requested by business stakeholders not included in original scope. SI quoting $180K additional for report development.", status: "accepted" },
      ];
      for (const d of deviations) {
        storage.createDeviation({ baselineId: bId, severity: d.severity, category: d.category, title: d.title, description: d.description, status: d.status });
      }

      // 3 Pulse Reports
      storage.createPulseReport({
        baselineId: bId, weekEnding: "2026-03-07", overallPosture: "YELLOW", postureTrend: "stable",
        narrative: "Build phase continues with 68% of configuration items complete. Payroll and GL modules are tracking to plan. Integration development for 5 of 8 interfaces is progressing, though 3 interfaces remain in design. Key risk: Change Management plan still not meeting contractual requirements after two revision cycles. Staffing remains stable with the exception of the payroll architect departure noted in deviation DEV-004.",
        riskHighlights: JSON.stringify(["Change management plan non-compliant", "3 integration interfaces still in design", "Payroll architect replacement onboarding"]),
        milestoneStatus: JSON.stringify({ onTrack: 3, atRisk: 2, behind: 1, complete: 3 }),
        decisionItems: JSON.stringify(["Approve/reject revised go-live timeline", "Escalate change management staffing to SI leadership"]),
        metrics: JSON.stringify({ configComplete: 68, defectsOpen: 23, testsPlanned: 450, testsExecuted: 0 }),
      });
      storage.createPulseReport({
        baselineId: bId, weekEnding: "2026-03-14", overallPosture: "YELLOW", postureTrend: "declining",
        narrative: "Configuration progress slowed to 72% (+4% WoW). Integration concerns escalating — the 3 incomplete interface specifications are now blocking development activities. New payroll architect onboarding but requires 3-4 weeks to reach full productivity. Critical defect SLA breaches in February raise concerns about SI's defect management capacity as we approach SIT. Recommend formal review of SI resource plan before SIT entry.",
        riskHighlights: JSON.stringify(["Integration specs blocking development", "New payroll architect needs ramp-up time", "Defect resolution capacity concern ahead of SIT"]),
        milestoneStatus: JSON.stringify({ onTrack: 2, atRisk: 3, behind: 1, complete: 3 }),
        decisionItems: JSON.stringify(["Request SI resource plan for SIT phase", "Schedule integration specification review"]),
        metrics: JSON.stringify({ configComplete: 72, defectsOpen: 28, testsPlanned: 450, testsExecuted: 0 }),
      });
      storage.createPulseReport({
        baselineId: bId, weekEnding: "2026-03-21", overallPosture: "RED", postureTrend: "declining",
        narrative: "Posture downgraded to RED. Change management plan rejected for third time — SI has not provided Prosci-certified OCM lead as contractually required. Combined with payroll architect departure and integration specification delays, the project faces compounding risks across multiple workstreams. Data migration mock 2 results (12% error rate vs 2% target) indicate fundamental data quality issues that will require additional remediation cycles. Recommend executive escalation to SI leadership with formal cure notice consideration.",
        riskHighlights: JSON.stringify(["Change management plan rejected 3rd time", "Data migration error rate 6x above target", "Compounding risks across staffing, integrations, and OCM"]),
        milestoneStatus: JSON.stringify({ onTrack: 1, atRisk: 3, behind: 2, complete: 3 }),
        decisionItems: JSON.stringify(["Issue formal cure notice for OCM staffing", "Require SI remediation plan for data migration", "Executive escalation meeting with SI leadership"]),
        metrics: JSON.stringify({ configComplete: 75, defectsOpen: 34, testsPlanned: 450, testsExecuted: 0 }),
      });

      res.json({ success: true, message: `Seeded IV&V data: 1 contract, 25 deliverables, 5 checkpoints, 8 deviations, 3 pulse reports` });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to seed IV&V data" });
    }
  });

  app.post("/api/projects/:id/seed-health-check-data", (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const project = storage.getProject(projectId);
      if (!project) return res.status(404).json({ error: "Project not found" });

      // 4 Health Check Assessments
      storage.createHealthCheckAssessment({
        projectId, domain: "governance", overallRating: "high", assessedBy: "IV&V Assessment Team",
        summary: "Governance structure has significant gaps. Steering committee inactive for 6 weeks with no documented decisions since January. SI functioning as both executor and evaluator.",
        findings: JSON.stringify([
          { severity: "critical", finding: "Steering committee has not met in 6 weeks. No documented governance decisions since January.", evidence: "Reviewed meeting minutes and calendar invites", recommendation: "Reconstitute steering committee with mandatory bi-weekly cadence" },
          { severity: "high", finding: "SI functioning as both executor and evaluator of own performance. No independent oversight structure.", evidence: "PMO reports authored exclusively by SI team", recommendation: "Establish independent oversight immediately" },
          { severity: "medium", finding: "Project manager lacks experience with Oracle Fusion at this scale.", evidence: "Stakeholder interviews", recommendation: "Augment with experienced Oracle program director" },
        ]),
      });
      storage.createHealthCheckAssessment({
        projectId, domain: "raid", overallRating: "critical", assessedBy: "IV&V Assessment Team",
        summary: "RAID management is critically deficient. Log not updated in 45 days with 23 stale open items. SI risk register omits material risks identified independently.",
        findings: JSON.stringify([
          { severity: "critical", finding: "RAID log has not been updated in 45 days. 23 items marked 'open' with no aging analysis.", evidence: "RAID log extract dated Feb 1", recommendation: "Immediate RAID refresh with independent validation" },
          { severity: "high", finding: "SI's risk register omits 4 material risks identified through stakeholder interviews.", evidence: "Compared SI RAID vs. interview findings", recommendation: "Independent risk assessment required" },
          { severity: "high", finding: "No dependency tracking between ERP project and concurrent PLM procurement.", evidence: "No integration planning artifacts found", recommendation: "Dependency mapping workshop within 2 weeks" },
        ]),
      });
      storage.createHealthCheckAssessment({
        projectId, domain: "technical", overallRating: "high", assessedBy: "IV&V Assessment Team",
        summary: "SIT execution critically behind at 34% with 2 weeks remaining. 156 open defects including 12 critical. Integration testing incomplete for 3 of 8 interfaces.",
        findings: JSON.stringify([
          { severity: "critical", finding: "SIT test execution at 34% with 2 weeks remaining. 156 open defects, 12 critical.", evidence: "Test management system extract", recommendation: "Extend SIT by minimum 4 weeks. Do not proceed to UAT." },
          { severity: "high", finding: "3 of 8 integrations untested. PM Web interface has fundamental design flaw.", evidence: "Integration test results and architecture review", recommendation: "Integration redesign for PM Web required before SIT exit" },
          { severity: "medium", finding: "Data migration mock 2 showed 12% error rate on vendor master records.", evidence: "Mock conversion reconciliation report", recommendation: "Root cause analysis and re-migration before mock 3" },
        ]),
      });
      storage.createHealthCheckAssessment({
        projectId, domain: "budget_schedule", overallRating: "critical", assessedBy: "IV&V Assessment Team",
        summary: "SI requesting $5M additional funding plus 3-month extension with no documented justification. Independent analysis suggests total program cost of $28-33M. October go-live not achievable.",
        findings: JSON.stringify([
          { severity: "critical", finding: "SI requesting $5M additional + 3-month extension. No documented basis for the amount.", evidence: "SI change request dated March 1", recommendation: "Independent schedule and cost analysis before approving any additional funding" },
          { severity: "high", finding: "Original $25M contract value may be understated by $3-8M based on remaining work analysis.", evidence: "Independent effort estimation", recommendation: "Board should anticipate total program cost of $28-33M" },
          { severity: "high", finding: "October go-live target is not achievable under current resource plan and defect trajectory.", evidence: "Schedule analysis, defect trend data", recommendation: "Realistic go-live range: Q1-Q2 2027" },
        ]),
      });

      // 20 RAID Items
      const raidItems = [
        { type: "risk", title: "Go-live date unrealistic", severity: "critical", status: "open", owner: "Steering Committee", description: "Current October 2026 go-live target is not achievable given SIT delays, defect trajectory, and incomplete integrations.", siReported: 0, siDiscrepancy: null },
        { type: "risk", title: "Payroll accuracy risk - no parallel testing planned", severity: "critical", status: "open", owner: "SI Project Manager", description: "Payroll parallel testing is contractually required but absent from the current test plan. Risk of payroll errors affecting 8,000+ employees.", siReported: 0, siDiscrepancy: null },
        { type: "risk", title: "Integration redesign may trigger scope change", severity: "high", status: "open", owner: "Technical Lead", description: "PM Web integration fundamental design flaw may require scope change and additional budget.", siReported: 1, siDiscrepancy: "SI reported as medium risk - assessment disagrees given SIT timeline impact" },
        { type: "risk", title: "OCM gap threatens user adoption", severity: "high", status: "open", owner: "Change Management", description: "No Prosci-certified OCM lead as contractually required. Change management plan rejected 3 times. User adoption at significant risk.", siReported: 0, siDiscrepancy: null },
        { type: "risk", title: "Key SME availability during UAT", severity: "medium", status: "open", owner: "Business Leads", description: "Business SMEs have competing priorities. UAT requires dedicated availability for 6 weeks.", siReported: 1, siDiscrepancy: null },
        { type: "assumption", title: "Current chart of accounts structure is final", severity: "high", status: "open", owner: "Finance", description: "GL configuration assumes chart of accounts is finalized. Any changes will trigger significant rework.", siReported: 1, siDiscrepancy: "SI still making changes to CoA structure" },
        { type: "assumption", title: "All legacy data will be cleansed before migration", severity: "medium", status: "open", owner: "Data Team", description: "Migration strategy assumes clean source data. Current mock conversion results suggest otherwise.", siReported: 1, siDiscrepancy: null },
        { type: "assumption", title: "Business process redesign complete before build", severity: "medium", status: "open", owner: "Process Owners", description: "Build assumes all target-state processes are documented and approved.", siReported: 1, siDiscrepancy: "3 processes still under discussion" },
        { type: "assumption", title: "Test environments available on schedule", severity: "low", status: "mitigated", owner: "Infrastructure", description: "Environment provisioning completed ahead of schedule.", siReported: 1, siDiscrepancy: null },
        { type: "issue", title: "SIT execution critically behind - 34% complete", severity: "critical", status: "escalated", owner: "QA Lead", description: "SIT at 34% execution with 2 weeks remaining in the window. 156 open defects, 12 critical. Cannot proceed to UAT on current trajectory.", siReported: 1, siDiscrepancy: null },
        { type: "issue", title: "PM Web integration design flaw identified", severity: "critical", status: "open", owner: "Integration Architect", description: "Fundamental design flaw in PM Web interface discovered during SIT. Requires redesign before SIT exit.", siReported: 1, siDiscrepancy: null },
        { type: "issue", title: "12% data migration error rate exceeds 2% target", severity: "high", status: "open", owner: "Data Migration Lead", description: "Mock conversion 2 showed 12% error rate on vendor master records. Target is <2%. Root cause analysis incomplete.", siReported: 1, siDiscrepancy: null },
        { type: "issue", title: "3 critical defects exceed 24-hr SLA", severity: "high", status: "open", owner: "SI Delivery Manager", description: "Three critical defects exceeded contractual 24-hour resolution SLA in February. Average resolution time 52 hours.", siReported: 1, siDiscrepancy: null },
        { type: "issue", title: "Change management lead lacks certification", severity: "high", status: "open", owner: "SI Project Manager", description: "Contract requires Prosci-certified OCM lead. Assigned resource has no certification. Change management plan rejected 3 times.", siReported: 0, siDiscrepancy: null },
        { type: "issue", title: "Custom report requests expanding scope", severity: "medium", status: "accepted", owner: "Business Analysts", description: "12 custom reports requested by business not in original scope. SI quoting $180K additional.", siReported: 1, siDiscrepancy: null },
        { type: "dependency", title: "PLM (Yardi) procurement timing impacts ERP integrations", severity: "critical", status: "open", owner: "IT Director", description: "ERP-PLM integration design cannot be finalized until PLM vendor is selected. Procurement timeline uncertain.", siReported: 0, siDiscrepancy: null },
        { type: "dependency", title: "G Treasury module requires separate licensing decision", severity: "high", status: "open", owner: "CFO Office", description: "Treasury module licensing decision pending. Affects GL integration scope and timeline.", siReported: 1, siDiscrepancy: null },
        { type: "dependency", title: "Network infrastructure upgrade for cloud connectivity", severity: "medium", status: "mitigated", owner: "Infrastructure", description: "Network upgrade completed. Cloud connectivity tested and validated.", siReported: 1, siDiscrepancy: null },
        { type: "dependency", title: "HR policy decisions needed for Workday HCM config", severity: "medium", status: "open", owner: "CHRO Office", description: "Several HCM configuration decisions depend on HR policy updates that are still in review.", siReported: 1, siDiscrepancy: null },
        { type: "dependency", title: "Printer/forms configuration for AP checks", severity: "low", status: "open", owner: "AP Manager", description: "Check printing requires specific printer/forms setup. Low priority but needs to be addressed before go-live.", siReported: 1, siDiscrepancy: null },
      ];
      for (const r of raidItems) {
        storage.createRaidItem({ projectId, type: r.type, title: r.title, severity: r.severity, status: r.status, owner: r.owner, description: r.description, siReported: r.siReported, siDiscrepancy: r.siDiscrepancy });
      }

      // Budget Entries
      const budgetEntries = [
        { category: "original_contract", description: "Oracle ERP Implementation - Deloitte", amount: 25000000, date: "2025-01-15", notes: null },
        { category: "change_order", description: "G Treasury Module Addition", amount: 1200000, date: "2025-08-20", notes: null },
        { category: "change_order", description: "Extended SIT Environment", amount: 350000, date: "2026-01-10", notes: null },
        { category: "additional_funding", description: "SI Request - Timeline Extension", amount: 5000000, date: "2026-03-01", notes: "Pending board approval - not yet justified" },
        { category: "actual_spend", description: "Invoiced through February 2026", amount: 19750000, date: "2026-02-28", notes: null },
      ];
      for (const b of budgetEntries) {
        storage.createBudgetEntry({ projectId, category: b.category, description: b.description, amount: b.amount, date: b.date, notes: b.notes });
      }

      // Schedule Milestones
      const milestones = [
        { milestone: "Project Kickoff", originalDate: "2025-01-15", currentDate: "2025-01-15", actualDate: "2025-01-15", status: "completed", varianceDays: 0, notes: null },
        { milestone: "Requirements Complete", originalDate: "2025-05-30", currentDate: "2025-07-15", actualDate: "2025-07-15", status: "completed", varianceDays: 46, notes: "+46 days" },
        { milestone: "Design Signoff", originalDate: "2025-08-30", currentDate: "2025-10-15", actualDate: "2025-10-30", status: "completed", varianceDays: 61, notes: "+61 days" },
        { milestone: "Build Complete", originalDate: "2025-12-31", currentDate: "2026-03-15", actualDate: null, status: "delayed", varianceDays: 75, notes: "+75 days (est)" },
        { milestone: "SIT Start", originalDate: "2026-02-01", currentDate: "2026-04-01", actualDate: null, status: "delayed", varianceDays: 59, notes: "+59 days" },
        { milestone: "SIT Exit", originalDate: "2026-03-31", currentDate: "2026-05-31", actualDate: null, status: "at_risk", varianceDays: 61, notes: "+61 days (est)" },
        { milestone: "UAT Start", originalDate: "2026-04-15", currentDate: "2026-06-15", actualDate: null, status: "at_risk", varianceDays: null, notes: null },
        { milestone: "UAT Exit", originalDate: "2026-05-31", currentDate: "2026-08-15", actualDate: null, status: "at_risk", varianceDays: null, notes: null },
        { milestone: "Go-Live", originalDate: "2026-07-01", currentDate: "2026-10-01", actualDate: null, status: "delayed", varianceDays: 92, notes: "+92 days" },
        { milestone: "Hypercare Complete", originalDate: "2026-09-01", currentDate: "2027-01-31", actualDate: null, status: "at_risk", varianceDays: null, notes: null },
      ];
      for (const m of milestones) {
        storage.createScheduleEntry({ projectId, milestone: m.milestone, originalDate: m.originalDate, currentDate: m.currentDate, actualDate: m.actualDate, status: m.status, varianceDays: m.varianceDays, notes: m.notes });
      }

      res.json({ success: true, message: "Seeded health check data: 4 assessments, 20 RAID items, 5 budget entries, 10 schedule milestones" });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to seed health check data" });
    }
  });

  // ==================== ENGAGEMENT MODULES ====================

  app.patch("/api/projects/:id/modules", (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const { modules } = req.body;
    if (!modules || !Array.isArray(modules)) {
      return res.status(400).json({ error: "modules array is required" });
    }

    const updated = storage.updateProjectModules(projectId, modules);
    res.json(updated);
  });

  // ==================== HEALTH CHECK ASSESSMENTS ====================

  app.post("/api/projects/:id/health-check/assessments", (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const { domain, overallRating, findings, summary, assessedBy } = req.body;
    if (!domain) return res.status(400).json({ error: "domain is required" });

    const assessment = storage.createHealthCheckAssessment({
      projectId,
      domain,
      overallRating: overallRating ?? null,
      findings: findings ? (typeof findings === "string" ? findings : JSON.stringify(findings)) : null,
      summary: summary ?? null,
      assessedBy: assessedBy ?? null,
    });
    res.status(201).json(assessment);
  });

  app.get("/api/projects/:id/health-check/assessments", (req, res) => {
    const projectId = parseInt(req.params.id);
    const assessments = storage.getHealthCheckAssessments(projectId);
    res.json(assessments);
  });

  app.patch("/api/health-check/assessments/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const data: any = { ...req.body };
    if (data.findings && typeof data.findings !== "string") {
      data.findings = JSON.stringify(data.findings);
    }
    const updated = storage.updateHealthCheckAssessment(id, data);
    if (!updated) return res.status(404).json({ error: "Assessment not found" });
    res.json(updated);
  });

  app.delete("/api/health-check/assessments/:id", (req, res) => {
    const id = parseInt(req.params.id);
    storage.deleteHealthCheckAssessment(id);
    res.json({ success: true });
  });

  // Generate text health check report from all assessments
  app.get("/api/projects/:id/health-check/report", (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const assessments = storage.getHealthCheckAssessments(projectId);

    const DOMAIN_LABELS: Record<string, string> = {
      governance: "Governance & Oversight",
      raid: "RAID Log Analysis",
      technical: "Technical Architecture & Quality",
      budget_schedule: "Budget & Schedule Performance",
    };

    const RATING_LABELS: Record<string, string> = {
      critical: "CRITICAL",
      high: "HIGH RISK",
      medium: "MEDIUM RISK",
      low: "LOW RISK",
      satisfactory: "SATISFACTORY",
    };

    let report = `PROJECT HEALTH CHECK REPORT\n`;
    report += `Project: ${project.name}\n`;
    report += `Date: ${new Date().toISOString().split("T")[0]}\n\n`;

    if (assessments.length === 0) {
      report += `No assessments have been completed yet.\n`;
    } else {
      // Overall summary
      const ratingOrder = ["critical", "high", "medium", "low", "satisfactory"];
      const worstRating = assessments
        .filter(a => a.overallRating)
        .sort((a, b) => ratingOrder.indexOf(a.overallRating!) - ratingOrder.indexOf(b.overallRating!))[0];

      report += `OVERALL PROJECT HEALTH: ${worstRating ? RATING_LABELS[worstRating.overallRating!] || worstRating.overallRating : "NOT ASSESSED"}\n\n`;
      report += `DOMAIN ASSESSMENTS:\n`;

      for (const a of assessments) {
        const domainLabel = DOMAIN_LABELS[a.domain] || a.domain;
        const ratingLabel = a.overallRating ? (RATING_LABELS[a.overallRating] || a.overallRating) : "Not Rated";
        report += `\n--- ${domainLabel}: ${ratingLabel} ---\n`;
        if (a.assessedBy) report += `Assessed by: ${a.assessedBy}\n`;
        if (a.summary) report += `Summary: ${a.summary}\n`;

        if (a.findings) {
          try {
            const findings = JSON.parse(a.findings);
            if (Array.isArray(findings) && findings.length > 0) {
              report += `\nFindings:\n`;
              for (const f of findings) {
                report += `  [${(f.severity || "info").toUpperCase()}] ${f.finding}\n`;
                if (f.evidence) report += `    Evidence: ${f.evidence}\n`;
                if (f.recommendation) report += `    Recommendation: ${f.recommendation}\n`;
              }
            }
          } catch {
            report += `Findings: ${a.findings}\n`;
          }
        }
      }
    }

    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Content-Disposition", `attachment; filename="health_check_${projectId}.txt"`);
    res.send(report);
  });

  // ==================== RAID LOG ====================

  app.post("/api/projects/:id/raid", (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const { type, title, description, severity, status, owner, dueDate, resolution, siReported, siDiscrepancy } = req.body;
    if (!type || !title) return res.status(400).json({ error: "type and title are required" });

    const item = storage.createRaidItem({
      projectId,
      type,
      title,
      description: description ?? null,
      severity: severity ?? null,
      status: status || "open",
      owner: owner ?? null,
      dueDate: dueDate ?? null,
      resolution: resolution ?? null,
      siReported: siReported ?? 0,
      siDiscrepancy: siDiscrepancy ?? null,
    });
    res.status(201).json(item);
  });

  app.get("/api/projects/:id/raid", (req, res) => {
    const projectId = parseInt(req.params.id);
    const filters: { type?: string; status?: string } = {};
    if (req.query.type) filters.type = req.query.type as string;
    if (req.query.status) filters.status = req.query.status as string;
    const items = storage.getRaidItems(projectId, filters);
    res.json(items);
  });

  app.patch("/api/raid/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const updated = storage.updateRaidItem(id, req.body);
    if (!updated) return res.status(404).json({ error: "RAID item not found" });
    res.json(updated);
  });

  app.delete("/api/raid/:id", (req, res) => {
    const id = parseInt(req.params.id);
    storage.deleteRaidItem(id);
    res.json({ success: true });
  });

  // ==================== BUDGET TRACKING ====================

  app.post("/api/projects/:id/budget", (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const { category, description, amount, date, notes } = req.body;
    if (!category || !description || amount === undefined) {
      return res.status(400).json({ error: "category, description, and amount are required" });
    }

    const entry = storage.createBudgetEntry({
      projectId,
      category,
      description,
      amount,
      date: date ?? null,
      notes: notes ?? null,
    });
    res.status(201).json(entry);
  });

  app.get("/api/projects/:id/budget", (req, res) => {
    const projectId = parseInt(req.params.id);
    const entries = storage.getBudgetEntries(projectId);
    const summary = storage.getBudgetSummary(projectId);
    res.json({ entries, summary });
  });

  app.patch("/api/budget/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const updated = storage.updateBudgetEntry(id, req.body);
    if (!updated) return res.status(404).json({ error: "Budget entry not found" });
    res.json(updated);
  });

  app.delete("/api/budget/:id", (req, res) => {
    const id = parseInt(req.params.id);
    storage.deleteBudgetEntry(id);
    res.json({ success: true });
  });

  // ==================== SCHEDULE TRACKING ====================

  app.post("/api/projects/:id/schedule", (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const { milestone, originalDate, currentDate, actualDate, status, varianceDays, notes } = req.body;
    if (!milestone) return res.status(400).json({ error: "milestone is required" });

    const entry = storage.createScheduleEntry({
      projectId,
      milestone,
      originalDate: originalDate ?? null,
      currentDate: currentDate ?? null,
      actualDate: actualDate ?? null,
      status: status || "on_track",
      varianceDays: varianceDays ?? null,
      notes: notes ?? null,
    });
    res.status(201).json(entry);
  });

  app.get("/api/projects/:id/schedule", (req, res) => {
    const projectId = parseInt(req.params.id);
    const entries = storage.getScheduleEntries(projectId);
    res.json(entries);
  });

  app.patch("/api/schedule/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const updated = storage.updateScheduleEntry(id, req.body);
    if (!updated) return res.status(404).json({ error: "Schedule entry not found" });
    res.json(updated);
  });

  app.delete("/api/schedule/:id", (req, res) => {
    const id = parseInt(req.params.id);
    storage.deleteScheduleEntry(id);
    res.json({ success: true });
  });

  // ==================== FUTURE STATE ANALYSIS ====================

  app.post("/api/projects/:id/future-state/generate", async (req, res) => {
    const projectId = parseInt(req.params.id);
    const { vendorPlatform } = req.body;
    if (!vendorPlatform) return res.status(400).json({ error: "vendorPlatform is required" });

    const project = storage.getProject(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    try {
      // Delete existing transformations for this project+platform
      storage.deleteProcessTransformations(projectId, vendorPlatform);

      const { generateFutureState } = await import("./ai");
      const transformations = await generateFutureState(projectId, vendorPlatform);
      res.json({ success: true, transformations, count: transformations.length });
    } catch (error: any) {
      console.error("Future state generation error:", error);
      res.status(500).json({ error: error.message || "Failed to generate future state analysis" });
    }
  });

  app.get("/api/projects/:id/future-state", (req, res) => {
    const projectId = parseInt(req.params.id);
    const platform = req.query.platform as string | undefined;
    const transformations = storage.getProcessTransformations(projectId, platform);
    res.json(transformations);
  });

  app.delete("/api/projects/:id/future-state", (req, res) => {
    const projectId = parseInt(req.params.id);
    const platform = req.query.platform as string | undefined;
    storage.deleteProcessTransformations(projectId, platform);
    res.json({ success: true });
  });

  // ==================== HEALTH CHECK DOCUMENT UPLOAD & ANALYSIS ====================

  // Get all documents for a project
  app.get("/api/projects/:id/documents", (req, res) => {
    const projectId = parseInt(req.params.id);
    const documentType = req.query.documentType as string | undefined;
    res.json(storage.getProjectDocuments(projectId, documentType));
  });

  // Upload a document (text extracted client-side or from file)
  app.post("/api/projects/:id/documents", (req, res) => {
    const projectId = parseInt(req.params.id);
    const { fileName, fileSize, mimeType, documentType, rawText, period, uploadedBy } = req.body;
    const doc = storage.createProjectDocument({
      projectId, fileName, fileSize, mimeType, documentType, rawText, period, uploadedBy,
      analysisStatus: rawText ? "pending" : "pending",
    });
    res.json(doc);
  });

  // Analyze an uploaded document with AI
  app.post("/api/projects/:id/documents/:docId/analyze", async (req, res) => {
    const docId = parseInt(req.params.docId);
    const doc = storage.getProjectDocument(docId);
    if (!doc) return res.status(404).json({ error: "Document not found" });
    if (!doc.rawText) return res.status(400).json({ error: "No text content to analyze" });

    storage.updateProjectDocument(docId, { analysisStatus: "processing" });

    try {
      const { analyzeHealthCheckDocument, buildProjectContext } = await import("./ai");
      const projectContext = buildProjectContext(parseInt(req.params.id));
      const analysis = await analyzeHealthCheckDocument(doc.documentType, doc.rawText, projectContext);

      storage.updateProjectDocument(docId, {
        aiAnalysis: JSON.stringify(analysis),
        extractedItems: JSON.stringify({
          raids: analysis.raids,
          budgetItems: analysis.budgetItems,
          scheduleItems: analysis.scheduleItems,
          findings: analysis.findings,
          metrics: analysis.metrics,
        }),
        analysisStatus: "completed",
      });

      res.json(analysis);
    } catch (error: any) {
      storage.updateProjectDocument(docId, { analysisStatus: "failed" });
      console.error("Document analysis error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Apply extracted items from a document into health check data
  app.post("/api/projects/:id/documents/:docId/apply", (req, res) => {
    const projectId = parseInt(req.params.id);
    const docId = parseInt(req.params.docId);
    const doc = storage.getProjectDocument(docId);
    if (!doc || !doc.extractedItems) return res.status(400).json({ error: "No extracted items" });

    const items = JSON.parse(doc.extractedItems);
    const applied = { raids: 0, budgetItems: 0, scheduleItems: 0, findings: 0 };

    // Apply RAID items
    for (const raid of (items.raids || [])) {
      storage.createRaidItem({
        projectId,
        type: raid.type || "risk",
        title: raid.title,
        description: raid.description,
        severity: raid.severity || "medium",
        status: raid.status || "open",
        owner: raid.owner || null,
        dueDate: raid.dueDate || null,
      });
      applied.raids++;
    }

    // Apply budget items
    for (const budget of (items.budgetItems || [])) {
      storage.createBudgetItem({
        projectId,
        category: budget.category || "actual_spend",
        description: budget.description,
        amount: budget.amount || 0,
        date: budget.date || null,
        notes: budget.notes || null,
      });
      applied.budgetItems++;
    }

    // Apply schedule items
    for (const sched of (items.scheduleItems || [])) {
      storage.createScheduleItem({
        projectId,
        milestone: sched.milestone,
        originalDate: sched.originalDate || null,
        currentDate: sched.currentDate || null,
        status: sched.status || "on_track",
        varianceDays: sched.varianceDays || null,
        notes: sched.notes || null,
      });
      applied.scheduleItems++;
    }

    // Apply findings as assessments
    const findingsByDomain: Record<string, any[]> = {};
    for (const f of (items.findings || [])) {
      const domain = f.domain || "governance";
      if (!findingsByDomain[domain]) findingsByDomain[domain] = [];
      findingsByDomain[domain].push(f);
    }
    for (const [domain, findings] of Object.entries(findingsByDomain)) {
      const worstSeverity = findings.reduce((worst: string, f: any) => {
        const order = ["critical", "high", "medium", "low", "satisfactory"];
        return order.indexOf(f.severity) < order.indexOf(worst) ? f.severity : worst;
      }, "satisfactory");
      storage.createHealthCheckAssessment({
        projectId,
        domain,
        overallRating: worstSeverity,
        findings: JSON.stringify(findings),
        summary: findings.map((f: any) => f.finding).join(". "),
        assessedBy: `AI Analysis - ${doc.fileName}`,
      });
      applied.findings += findings.length;
    }

    res.json({ success: true, applied });
  });

  // Delete a document
  app.delete("/api/projects/:id/documents/:docId", (req, res) => {
    storage.deleteProjectDocument(parseInt(req.params.docId));
    res.json({ success: true });
  });

  // ==================== VENDOR MONITORING PIPELINE ====================

  // Sources CRUD
  app.get("/api/monitoring/sources", (req, res) => {
    const vendorPlatform = req.query.vendorPlatform as string | undefined;
    res.json(storage.getMonitoringSources(vendorPlatform));
  });

  app.post("/api/monitoring/sources", (req, res) => {
    const source = storage.createMonitoringSource(req.body);
    res.json(source);
  });

  app.patch("/api/monitoring/sources/:id", (req, res) => {
    const updated = storage.updateMonitoringSource(parseInt(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: "Source not found" });
    res.json(updated);
  });

  app.delete("/api/monitoring/sources/:id", (req, res) => {
    storage.deleteMonitoringSource(parseInt(req.params.id));
    res.json({ success: true });
  });

  // Seed default sources for all platforms
  app.post("/api/monitoring/seed-sources", (_req, res) => {
    const defaultSources = [
      // Workday
      { vendorPlatform: "workday", sourceType: "release_notes", name: "Workday Release Notes", url: "https://community.workday.com/release-notes" },
      { vendorPlatform: "workday", sourceType: "blog", name: "Workday Blog", url: "https://blog.workday.com" },
      { vendorPlatform: "workday", sourceType: "press_release", name: "Workday Newsroom", url: "https://newsroom.workday.com" },
      // Oracle Cloud
      { vendorPlatform: "oracle_cloud", sourceType: "release_notes", name: "Oracle Cloud Updates", url: "https://docs.oracle.com/en/cloud/saas/index.html" },
      { vendorPlatform: "oracle_cloud", sourceType: "blog", name: "Oracle Cloud Blog", url: "https://blogs.oracle.com/cloud-infrastructure" },
      { vendorPlatform: "oracle_cloud", sourceType: "press_release", name: "Oracle Newsroom", url: "https://www.oracle.com/news" },
      // Tyler Technologies
      { vendorPlatform: "tyler", sourceType: "press_release", name: "Tyler News", url: "https://www.tylertech.com/about/news-press" },
      { vendorPlatform: "tyler", sourceType: "product_page", name: "Tyler ERP Products", url: "https://www.tylertech.com/products/erp-pro" },
      // Maximo
      { vendorPlatform: "maximo", sourceType: "release_notes", name: "Maximo Application Suite", url: "https://www.ibm.com/docs/en/mas-cd/maximo-manage" },
      { vendorPlatform: "maximo", sourceType: "blog", name: "IBM Sustainability Blog", url: "https://www.ibm.com/blog/category/asset-management" },
      // NV5
      { vendorPlatform: "nv5", sourceType: "press_release", name: "NV5 News", url: "https://www.nv5.com/news" },
      { vendorPlatform: "nv5", sourceType: "product_page", name: "NV5 Technology", url: "https://www.nv5.com/technology" },
      // Oracle EAM
      { vendorPlatform: "oracle_eam", sourceType: "documentation", name: "Oracle EAM Docs", url: "https://docs.oracle.com/en/cloud/saas/enterprise-asset-management" },
      { vendorPlatform: "oracle_eam", sourceType: "release_notes", name: "Oracle SCM Updates", url: "https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing" },
    ];
    const existing = storage.getMonitoringSources();
    let created = 0;
    for (const src of defaultSources) {
      const exists = existing.find(e => e.url === src.url && e.vendorPlatform === src.vendorPlatform);
      if (!exists) {
        storage.createMonitoringSource(src);
        created++;
      }
    }
    res.json({ success: true, created, total: storage.getMonitoringSources().length });
  });

  // Runs
  app.get("/api/monitoring/runs", (req, res) => {
    const sourceId = req.query.sourceId ? parseInt(req.query.sourceId as string) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    res.json(storage.getMonitoringRuns(sourceId, limit));
  });

  // Changes
  app.get("/api/monitoring/changes", (req, res) => {
    const filters: any = {};
    if (req.query.vendorPlatform) filters.vendorPlatform = req.query.vendorPlatform;
    if (req.query.changeType) filters.changeType = req.query.changeType;
    if (req.query.isReviewed !== undefined) filters.isReviewed = parseInt(req.query.isReviewed as string);
    if (req.query.limit) filters.limit = parseInt(req.query.limit as string);
    res.json(storage.getVendorChanges(filters));
  });

  app.patch("/api/monitoring/changes/:id", (req, res) => {
    const updated = storage.updateVendorChange(parseInt(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: "Change not found" });
    res.json(updated);
  });

  // Alerts
  app.get("/api/monitoring/alerts", (req, res) => {
    const filters: any = {};
    if (req.query.priority) filters.priority = req.query.priority;
    if (req.query.isDismissed !== undefined) filters.isDismissed = parseInt(req.query.isDismissed as string);
    res.json(storage.getMonitoringAlerts(filters));
  });

  app.patch("/api/monitoring/alerts/:id", (req, res) => {
    const updated = storage.updateMonitoringAlert(parseInt(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: "Alert not found" });
    res.json(updated);
  });

  // Stats
  app.get("/api/monitoring/stats", (_req, res) => {
    res.json(storage.getMonitoringStats());
  });

  // Scan a single source (manual trigger)
  app.post("/api/monitoring/scan/:sourceId", async (req, res) => {
    const sourceId = parseInt(req.params.sourceId);
    const source = storage.getMonitoringSource(sourceId);
    if (!source) return res.status(404).json({ error: "Source not found" });

    const startTime = Date.now();
    try {
      // Fetch the URL content
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(source.url, {
        signal: controller.signal,
        headers: { "User-Agent": "AveroCaliberMonitor/1.0" },
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const run = storage.createMonitoringRun({
          sourceId: source.id,
          status: "failed",
          errorMessage: `HTTP ${response.status}: ${response.statusText}`,
          durationMs: Date.now() - startTime,
        });
        storage.updateMonitoringSource(source.id, { lastCheckedAt: new Date().toISOString() });
        return res.json({ run, changes: [] });
      }

      const text = await response.text();
      // Simple hash for change detection
      const crypto = await import("crypto");
      const contentHash = crypto.createHash("md5").update(text.substring(0, 10000)).digest("hex");
      const preview = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").substring(0, 500);

      // Check if content changed
      if (contentHash === source.lastContentHash) {
        const run = storage.createMonitoringRun({
          sourceId: source.id,
          status: "no_change",
          contentHash,
          rawContentPreview: preview,
          durationMs: Date.now() - startTime,
        });
        storage.updateMonitoringSource(source.id, { lastCheckedAt: new Date().toISOString() });
        return res.json({ run, changes: [] });
      }

      // Content changed — use AI to analyze
      const { analyzeVendorChanges } = await import("./ai");
      const cleanText = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").substring(0, 8000);
      const aiChanges = await analyzeVendorChanges(source.vendorPlatform, source.sourceType, source.name, cleanText, source.lastContentHash ? "Content has changed since last scan" : "First scan of this source");

      const run = storage.createMonitoringRun({
        sourceId: source.id,
        status: "changes_detected",
        contentHash,
        rawContentPreview: preview,
        changesDetected: aiChanges.length,
        durationMs: Date.now() - startTime,
      });

      // Save changes and generate alerts
      const savedChanges = [];
      for (const change of aiChanges) {
        const saved = storage.createVendorChange({
          runId: run.id,
          vendorPlatform: source.vendorPlatform,
          changeType: change.changeType,
          severity: change.severity,
          title: change.title,
          summary: change.summary,
          details: change.details,
          affectedModules: change.affectedModules,
          sourceUrl: source.url,
          rawExcerpt: change.rawExcerpt,
        });
        savedChanges.push(saved);

        // Auto-generate alert for high/critical changes
        if (change.severity === "critical" || change.severity === "high") {
          storage.createMonitoringAlert({
            changeId: saved.id,
            alertType: change.changeType === "deprecation" ? "deprecation_warning"
              : change.changeType === "pricing_change" ? "pricing_alert"
              : "capability_impact",
            priority: change.severity === "critical" ? "urgent" : "high",
            title: saved.title,
            message: saved.summary,
          });
        }
      }

      // Update source with new hash
      storage.updateMonitoringSource(source.id, {
        lastCheckedAt: new Date().toISOString(),
        lastContentHash: contentHash,
      });

      res.json({ run, changes: savedChanges });
    } catch (error: any) {
      const run = storage.createMonitoringRun({
        sourceId: source.id,
        status: "failed",
        errorMessage: error.message || "Unknown error",
        durationMs: Date.now() - startTime,
      });
      storage.updateMonitoringSource(source.id, { lastCheckedAt: new Date().toISOString() });
      res.json({ run, changes: [] });
    }
  });

  // Scan all active sources
  app.post("/api/monitoring/scan-all", async (_req, res) => {
    const sources = storage.getMonitoringSources().filter(s => s.isActive === 1);
    const results = [];
    for (const source of sources) {
      try {
        const startTime = Date.now();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const response = await fetch(source.url, {
          signal: controller.signal,
          headers: { "User-Agent": "AveroCaliberMonitor/1.0" },
        });
        clearTimeout(timeout);

        if (!response.ok) {
          const run = storage.createMonitoringRun({
            sourceId: source.id,
            status: "failed",
            errorMessage: `HTTP ${response.status}`,
            durationMs: Date.now() - startTime,
          });
          storage.updateMonitoringSource(source.id, { lastCheckedAt: new Date().toISOString() });
          results.push({ sourceId: source.id, name: source.name, status: "failed" });
          continue;
        }

        const text = await response.text();
        const crypto = await import("crypto");
        const contentHash = crypto.createHash("md5").update(text.substring(0, 10000)).digest("hex");
        const preview = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").substring(0, 500);

        if (contentHash === source.lastContentHash) {
          storage.createMonitoringRun({
            sourceId: source.id,
            status: "no_change",
            contentHash,
            rawContentPreview: preview,
            durationMs: Date.now() - startTime,
          });
          storage.updateMonitoringSource(source.id, { lastCheckedAt: new Date().toISOString() });
          results.push({ sourceId: source.id, name: source.name, status: "no_change" });
        } else {
          const { analyzeVendorChanges } = await import("./ai");
          const cleanText = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").substring(0, 8000);
          const aiChanges = await analyzeVendorChanges(source.vendorPlatform, source.sourceType, source.name, cleanText, source.lastContentHash ? "Content has changed since last scan" : "First scan of this source");

          const run = storage.createMonitoringRun({
            sourceId: source.id,
            status: aiChanges.length > 0 ? "changes_detected" : "no_change",
            contentHash,
            rawContentPreview: preview,
            changesDetected: aiChanges.length,
            durationMs: Date.now() - startTime,
          });

          for (const change of aiChanges) {
            const saved = storage.createVendorChange({
              runId: run.id,
              vendorPlatform: source.vendorPlatform,
              changeType: change.changeType,
              severity: change.severity,
              title: change.title,
              summary: change.summary,
              details: change.details,
              affectedModules: change.affectedModules,
              sourceUrl: source.url,
              rawExcerpt: change.rawExcerpt,
            });
            if (change.severity === "critical" || change.severity === "high") {
              storage.createMonitoringAlert({
                changeId: saved.id,
                alertType: change.changeType === "deprecation" ? "deprecation_warning" : "capability_impact",
                priority: change.severity === "critical" ? "urgent" : "high",
                title: saved.title,
                message: saved.summary,
              });
            }
          }

          storage.updateMonitoringSource(source.id, { lastCheckedAt: new Date().toISOString(), lastContentHash: contentHash });
          results.push({ sourceId: source.id, name: source.name, status: "changes_detected", count: aiChanges.length });
        }
      } catch (error: any) {
        storage.createMonitoringRun({
          sourceId: source.id,
          status: "failed",
          errorMessage: error.message,
          durationMs: 0,
        });
        storage.updateMonitoringSource(source.id, { lastCheckedAt: new Date().toISOString() });
        results.push({ sourceId: source.id, name: source.name, status: "failed", error: error.message });
      }
    }
    res.json({ results, scanned: sources.length });
  });

  return httpServer;
}
