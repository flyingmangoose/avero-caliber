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

  // ==================== AUTHORIZATION HELPERS ====================

  function getUserFromReq(req: any): { id: number; role: string } | null {
    if (!req.isAuthenticated || !req.isAuthenticated()) return null;
    return req.user as any;
  }

  function canAccessProject(req: any, projectId: number): boolean {
    const user = getUserFromReq(req);
    if (!user) return true; // No auth configured — allow all
    if (user.role === "admin") return true;
    const memberRole = storage.getProjectMemberRole(projectId, user.id);
    if (memberRole) return true;
    // Also allow if user created the project (legacy projects without members)
    const project = storage.getProject(projectId);
    if (project?.createdBy === user.id) return true;
    // Allow access if no members exist yet (legacy/unassigned projects)
    const members = storage.getProjectMembers(projectId);
    if (members.length === 0) return true;
    return false;
  }

  function canEditProject(req: any, projectId: number): boolean {
    const user = getUserFromReq(req);
    if (!user) return true; // No auth configured
    if (user.role === "admin") return true;
    const memberRole = storage.getProjectMemberRole(projectId, user.id);
    if (memberRole === "owner" || memberRole === "editor") return true;
    const project = storage.getProject(projectId);
    if (project?.createdBy === user.id) return true;
    // Allow edit if no members exist yet (legacy)
    const members = storage.getProjectMembers(projectId);
    if (members.length === 0) return true;
    return false;
  }

  function isProjectOwner(req: any, projectId: number): boolean {
    const user = getUserFromReq(req);
    if (!user) return true;
    if (user.role === "admin") return true;
    const memberRole = storage.getProjectMemberRole(projectId, user.id);
    return memberRole === "owner";
  }

  // ==================== ACTIVITY LOG ====================

  function logAction(req: any, action: string, projectId?: number | null, details?: string) {
    const user = getUserFromReq(req);
    storage.logActivity({
      projectId: projectId || null,
      userId: user?.id || null,
      userName: user?.name || null,
      action,
      details: details || null,
    });
  }

  app.get("/api/activity", (req, res) => {
    const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const log = storage.getActivityLog(projectId, limit);
    res.json(log);
  });

  // ==================== PROJECT MEMBERS ====================

  app.get("/api/projects/:id/members", (req, res) => {
    const projectId = parseInt(req.params.id);
    if (!canAccessProject(req, projectId)) return res.status(403).json({ error: "Access denied" });
    const members = storage.getProjectMembers(projectId);
    res.json(members);
  });

  app.post("/api/projects/:id/members", (req, res) => {
    const projectId = parseInt(req.params.id);
    if (!isProjectOwner(req, projectId)) return res.status(403).json({ error: "Only project owners can add members" });
    const { userId, role } = req.body;
    if (!userId) return res.status(400).json({ error: "userId required" });
    const user = getUserFromReq(req);
    const member = storage.addProjectMember(projectId, userId, role || "viewer", user?.id);
    const addedUser = storage.getUser(userId);
    logAction(req, "added_member", projectId, `${addedUser?.name || userId} as ${role || "viewer"}`);
    res.json(member);
  });

  app.patch("/api/projects/:id/members/:userId", (req, res) => {
    const projectId = parseInt(req.params.id);
    if (!isProjectOwner(req, projectId)) return res.status(403).json({ error: "Only project owners can change roles" });
    const userId = parseInt(req.params.userId);
    const { role } = req.body;
    const updated = storage.updateProjectMemberRole(projectId, userId, role);
    res.json(updated);
  });

  app.delete("/api/projects/:id/members/:userId", (req, res) => {
    const projectId = parseInt(req.params.id);
    if (!isProjectOwner(req, projectId)) return res.status(403).json({ error: "Only project owners can remove members" });
    storage.removeProjectMember(projectId, parseInt(req.params.userId));
    res.json({ success: true });
  });

  // Users list (for adding members)
  app.get("/api/users", (req, res) => {
    const users = storage.getAllUsers();
    res.json(users.map(u => ({ id: u.id, name: u.name, email: u.email, picture: u.picture, role: u.role })));
  });

  // Admin: update user system role
  app.patch("/api/users/:id/role", (req, res) => {
    const user = getUserFromReq(req);
    if (!user || user.role !== "admin") return res.status(403).json({ error: "Admin access required" });
    const { role } = req.body;
    if (!["admin", "editor", "viewer"].includes(role)) return res.status(400).json({ error: "Invalid role" });
    const targetUser = storage.getUser(parseInt(req.params.id));
    if (!targetUser) return res.status(404).json({ error: "User not found" });
    // Use raw SQL since we don't have a dedicated updateUser method
    const db = require("better-sqlite3")("data.db");
    db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, targetUser.id);
    db.close();
    res.json({ ...targetUser, role });
  });

  // Admin: invited emails management
  app.get("/api/admin/invited-emails", (req, res) => {
    const user = getUserFromReq(req);
    if (!user || user.role !== "admin") return res.status(403).json({ error: "Admin access required" });
    res.json(storage.getInvitedEmails());
  });

  app.post("/api/admin/invited-emails", (req, res) => {
    const user = getUserFromReq(req);
    if (!user || user.role !== "admin") return res.status(403).json({ error: "Admin access required" });
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });
    try {
      const invited = storage.addInvitedEmail(email, user.id);
      res.json(invited);
    } catch (e: any) {
      res.status(409).json({ error: "Email already invited" });
    }
  });

  app.delete("/api/admin/invited-emails/:id", (req, res) => {
    const user = getUserFromReq(req);
    if (!user || user.role !== "admin") return res.status(403).json({ error: "Admin access required" });
    storage.removeInvitedEmail(parseInt(req.params.id));
    res.json({ success: true });
  });

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
        const { PDFParse } = require("pdf-parse");
        const pdfParser = new PDFParse(new Uint8Array(fileBuffer));
        const pdfResult = await pdfParser.getText();
        docText = pdfResult.pages ? pdfResult.pages.map((p: any) => p.text).join("\n\n") : "";
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

  // ==================== CLIENTS ====================

  app.get("/api/clients", (req, res) => {
    const clientsList = storage.getClients();
    const allProjects = storage.getProjects();

    // Filter projects by user access
    const user = getUserFromReq(req);
    const isAdmin = !user || user.role === "admin"; // no auth or admin = see all
    const userProjectIds = user ? storage.getUserProjects(user.id) : [];

    const filterProject = (p: any) => {
      if (isAdmin) return true;
      if (userProjectIds.includes(p.id)) return true;
      if (p.createdBy === user?.id) return true;
      // Allow access to projects with no members (legacy)
      const members = storage.getProjectMembers(p.id);
      return members.length === 0;
    };

    const enriched = clientsList.map(c => {
      const clientProjects = allProjects.filter(p => p.clientId === c.id && filterProject(p));
      return {
        ...c,
        projects: clientProjects.map(p => ({
          id: p.id, name: p.name, status: p.status, engagementModules: p.engagementModules,
        })),
        projectCount: clientProjects.length,
      };
    }); // Show all clients to all authenticated users

    // Also include orphan projects (no client) as a virtual "Unassigned" group
    const orphans = allProjects.filter(p => !p.clientId && filterProject(p));
    if (orphans.length > 0) {
      enriched.push({
        id: 0, name: "Unassigned Projects", domain: null, entityType: null, state: null,
        population: null, employeeCount: null, annualBudget: null, currentSystems: null,
        departments: null, painSummary: null, leadership: null, documents: null,
        description: "", createdAt: "", updatedAt: null,
        projects: orphans.map(p => ({ id: p.id, name: p.name, status: p.status, engagementModules: p.engagementModules })),
        projectCount: orphans.length,
      } as any);
    }
    res.json(enriched);
  });

  app.get("/api/clients/:id", (req, res) => {
    const client = storage.getClient(parseInt(req.params.id));
    if (!client) return res.status(404).json({ error: "Client not found" });
    res.json(client);
  });

  app.post("/api/clients", (req, res) => {
    const client = storage.createClient(req.body);
    res.json(client);
  });

  app.patch("/api/clients/:id", (req, res) => {
    const updated = storage.updateClient(parseInt(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: "Client not found" });
    res.json(updated);
  });

  // Upload client logo
  const logoUpload = multer({ dest: os.tmpdir(), limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files allowed"));
  }});

  app.post("/api/clients/:id/logo", logoUpload.single("logo"), (req, res) => {
    const clientId = parseInt(req.params.id);
    const client = storage.getClient(clientId);
    if (!client) return res.status(404).json({ error: "Client not found" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const ext = req.file.originalname.split(".").pop()?.toLowerCase() || "png";
    const destDir = path.resolve("dist/public/logos");
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    const destPath = path.join(destDir, `client-${clientId}.${ext}`);
    fs.copyFileSync(req.file.path, destPath);
    try { fs.unlinkSync(req.file.path); } catch {}

    const logoUrl = `/logos/client-${clientId}.${ext}`;
    storage.updateClient(clientId, { logoPath: logoUrl });
    res.json({ logoPath: logoUrl });
  });

  app.delete("/api/clients/:id", (req, res) => {
    storage.deleteClient(parseInt(req.params.id));
    res.json({ success: true });
  });

  app.post("/api/clients/:id/enrich", async (req, res) => {
    const clientId = parseInt(req.params.id);
    const client = storage.getClient(clientId);
    if (!client) return res.status(404).json({ error: "Client not found" });
    const { domain } = req.body;
    if (!domain) return res.status(400).json({ error: "Domain required" });
    try {
      let websiteText = "";
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(`https://${domain}`, { signal: controller.signal, headers: { "User-Agent": "AveroCaliberBot/1.0" } });
        clearTimeout(timeout);
        if (response.ok) {
          const html = await response.text();
          websiteText = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").substring(0, 8000);
        }
      } catch {}
      const { llmCall } = await import("./ai");
      const prompt = `Analyze this government entity's website and your knowledge to create a comprehensive profile.\n\nDomain: ${domain}\nWebsite content: ${websiteText || "(unable to fetch)"}\n\nReturn JSON with: entityType, entityName, state, population, employeeCount, annualBudget, description, painSummary, currentSystems (array of {name, module, vendor, yearsInUse}), departments (array of {name, headcount, keyProcesses}), leadership (array of {name, title}).\n\nReturn ONLY valid JSON.`;
      const text = await llmCall(prompt);
      const jsonStr = text.replace(/\`\`\`json\n?/g, "").replace(/\`\`\`\n?/g, "").trim();
      const raw = JSON.parse(jsonStr);
      // Map and sanitize to valid client columns only
      const data: any = { domain };
      if (raw.entityName) data.name = raw.entityName;
      if (raw.entityType) data.entityType = raw.entityType;
      if (raw.state) data.state = raw.state;
      if (raw.population) data.population = typeof raw.population === "number" ? raw.population : parseInt(String(raw.population).replace(/\D/g, "")) || null;
      if (raw.employeeCount) data.employeeCount = typeof raw.employeeCount === "number" ? raw.employeeCount : parseInt(String(raw.employeeCount).replace(/\D/g, "")) || null;
      if (raw.annualBudget) data.annualBudget = String(raw.annualBudget);
      if (raw.description) data.description = raw.description;
      if (raw.painSummary) data.painSummary = raw.painSummary;
      if (raw.currentSystems) data.currentSystems = raw.currentSystems;
      if (raw.departments) data.departments = raw.departments;
      if (raw.leadership) data.leadership = raw.leadership;
      // Try to fetch the client logo from their domain
      try {
        const logoUrl = `https://logo.clearbit.com/${domain}`;
        const logoController = new AbortController();
        const logoTimeout = setTimeout(() => logoController.abort(), 8000);
        const logoRes = await fetch(logoUrl, { signal: logoController.signal });
        clearTimeout(logoTimeout);
        if (logoRes.ok) {
          const logoBuffer = Buffer.from(await logoRes.arrayBuffer());
          const destDir = path.resolve("dist/public/logos");
          if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
          const destPath = path.join(destDir, `client-${clientId}.png`);
          fs.writeFileSync(destPath, logoBuffer);
          data.logoPath = `/logos/client-${clientId}.png`;
        }
      } catch {}

      const updated = storage.updateClient(clientId, data);
      res.json({ success: true, data: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Upload and extract document for client (stores in project_documents + enriches client profile)
  app.post("/api/clients/:id/extract-document", async (req, res) => {
    const clientId = parseInt(req.params.id);
    const client = storage.getClient(clientId);
    if (!client) return res.status(404).json({ error: "Client not found" });
    const { fileName, documentText, documentType } = req.body;
    if (!documentText) return res.status(400).json({ error: "Document text required" });

    // Store the document in project_documents at the client level
    const doc = storage.createProjectDocument({
      clientId,
      projectId: null,
      fileName: fileName || "uploaded-document.txt",
      fileSize: documentText.length,
      mimeType: "text/plain",
      documentType: documentType || "sow_contract",
      source: "upload",
      rawText: documentText.substring(0, 50000),
      analysisStatus: "processing",
    });

    try {
      const { llmCall } = await import("./ai");
      const prompt = `Extract government entity profile information from this document. The document is "${fileName || "uploaded document"}".

Existing client data (fill gaps only):
- Name: ${client.name}
- Type: ${client.entityType || "unknown"}
- State: ${client.state || "unknown"}

Document text:
${documentText.substring(0, 20000)}

Return JSON with any fields you can extract: entityType, entityName, state, population, employeeCount, annualBudget, description, painSummary, currentSystems (array of {name, module, vendor, yearsInUse}), departments (array of {name, headcount, keyProcesses}), leadership (array of {name, title}), challenges.

Only include fields that are clearly present in the document. Return ONLY valid JSON.`;
      const text = await llmCall(prompt);
      const jsonStr = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const data = JSON.parse(jsonStr);
      if (data.entityName) { data.name = data.entityName; delete data.entityName; }
      const updates: any = {};
      for (const [key, val] of Object.entries(data)) {
        if (val != null && val !== "" && ((client as any)[key] == null || (client as any)[key] === "")) {
          updates[key] = val;
        }
      }
      const updated = storage.updateClient(clientId, updates);
      // Mark document as analyzed
      storage.updateProjectDocument(doc.id, {
        analysisStatus: "completed",
        aiAnalysis: JSON.stringify(data),
      });
      res.json({ success: true, data: updated, extractedFields: Object.keys(updates).length, documentId: doc.id });
    } catch (err: any) {
      storage.updateProjectDocument(doc.id, { analysisStatus: "failed" });
      res.status(500).json({ error: err.message });
    }
  });

  // Get client-level documents
  app.get("/api/clients/:id/documents", (req, res) => {
    const clientId = parseInt(req.params.id);
    const documentType = req.query.documentType as string | undefined;
    res.json(storage.getClientDocuments(clientId, documentType));
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
    const { name, description, status, clientId, engagementModules, engagementMode } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Project name is required" });
    }
    const user = getUserFromReq(req);
    const project = storage.createProject({
      name,
      description: description || "",
      status: status || "draft",
      clientId: clientId || null,
      engagementModules: engagementModules || '["selection"]',
      engagementMode: engagementMode || "consulting",
      createdBy: user?.id || null,
    });
    // Auto-assign creator as project owner
    if (user) {
      try { storage.addProjectMember(project.id, user.id, "owner", user.id); } catch {}
    }
    logAction(req, "created_project", project.id, project.name);
    res.status(201).json(project);
  });

  app.get("/api/projects/:id", (req, res) => {
    const id = parseInt(req.params.id);
    if (!canAccessProject(req, id)) return res.status(403).json({ error: "Access denied" });
    const project = storage.getProject(id);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }
    const stats = storage.getProjectStats(id);
    res.json({ ...project, stats });
  });

  app.patch("/api/projects/:id", (req, res) => {
    const id = parseInt(req.params.id);
    if (!canEditProject(req, id)) return res.status(403).json({ error: "Edit access denied" });
    const project = storage.updateProject(id, req.body);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }
    res.json(project);
  });

  app.delete("/api/projects/:id", (req, res) => {
    const id = parseInt(req.params.id);
    if (!isProjectOwner(req, id)) return res.status(403).json({ error: "Only project owners can delete projects" });
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

  // POST /api/projects/:id/requirements/auto-prioritize — AI assigns criticality based on outcomes & discovery
  app.post("/api/projects/:id/requirements/auto-prioritize", async (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    try {
      const requirements = storage.getRequirements(projectId);
      if (requirements.length === 0) return res.json({ updated: 0 });

      const painPoints = storage.getPainPoints(projectId);
      const outcomes = storage.getOutcomes(projectId);
      const interviews = storage.getDiscoveryInterviews(projectId).filter(i => i.status === "completed");

      const reqList = requirements.map(r => `[${r.id}] ${r.functionalArea} / ${r.description}`).join("\n");
      const painList = painPoints.map(p => `[${p.severity}] ${p.functionalArea}: ${p.description}`).join("\n");
      const outcomeList = outcomes.map((o: any) => `[${o.priority}] ${o.title}: ${o.description || ""}`).join("\n");
      const interviewSummary = interviews.map(i => {
        let findings: any = {};
        try { findings = i.findings ? JSON.parse(i.findings) : {}; } catch {}
        return `${i.functionalArea}: ${findings.keyThemes?.join(", ") || "no themes"}`;
      }).join("\n");

      const { llmCall } = await import("./ai");
      const text = await llmCall(`You are prioritizing ERP requirements for a government organization.

REQUIREMENTS:
${reqList}

PAIN POINTS (from discovery):
${painList || "None documented"}

DESIRED OUTCOMES:
${outcomeList || "None defined"}

DISCOVERY THEMES:
${interviewSummary || "No interviews"}

For each requirement, assign a criticality:
- "Critical" = directly addresses a critical/high pain point or is essential for a high-priority outcome
- "Desired" = addresses a medium pain point or supports a medium-priority outcome
- "Not Required" = nice-to-have, not directly tied to any pain point or outcome

Return a JSON array: [{"id": <requirement id>, "criticality": "Critical"|"Desired"|"Not Required", "reason": "brief justification"}]
Return ONLY valid JSON.`, undefined, 4096);

      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return res.json({ updated: 0 });

      const assignments = JSON.parse(jsonMatch[0]);
      let updated = 0;
      for (const a of assignments) {
        if (a.id && a.criticality) {
          const result = storage.updateRequirement(a.id, {
            criticality: a.criticality,
            comments: a.reason ? `Auto-prioritized: ${a.reason}` : undefined,
          });
          if (result) updated++;
        }
      }

      logAction(req, "auto_prioritized_requirements", projectId, `${updated}/${requirements.length} requirements`);
      res.json({ updated, total: requirements.length, assignments });
    } catch (err: any) {
      console.error("Auto-prioritize error:", err);
      res.status(500).json({ error: err.message });
    }
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

  // Program management portfolio view
  app.get("/api/analytics/program-dashboard", (req, res) => {
    const allProjectsRaw = storage.getProjects();
    const user = getUserFromReq(req);
    const isAdmin = !user || user.role === "admin";
    const userProjectIds = user ? storage.getUserProjects(user.id) : [];
    const allProjects = allProjectsRaw.filter(p => {
      if (isAdmin) return true;
      if (userProjectIds.includes(p.id)) return true;
      if ((p as any).createdBy === user?.id) return true;
      const members = storage.getProjectMembers(p.id);
      return members.length === 0;
    });

    const projects = allProjects.map(p => {
      const client = p.clientId ? storage.getClient(p.clientId) : undefined;
      const assessments = storage.getHealthCheckAssessments(p.id);
      const raidItems = storage.getRaidItems(p.id);
      const budgetSummary = storage.getBudgetSummary(p.id);
      const scheduleItems = storage.getScheduleEntries(p.id);
      const baseline = storage.getProjectBaseline(p.id);
      const outcomes = storage.getOutcomes(p.id);
      const reqs = storage.getRequirements(p.id);

      // Overall health from assessments
      const ratingOrder = ["critical", "high", "medium", "low", "satisfactory"];
      const ratings = assessments.filter(a => a.overallRating).map(a => a.overallRating!);
      const worstRating = ratings.sort((a, b) => ratingOrder.indexOf(a) - ratingOrder.indexOf(b))[0] || null;

      // RAID summary
      const openCritical = raidItems.filter(r => r.status === "open" && r.severity === "critical").length;
      const openHigh = raidItems.filter(r => r.status === "open" && r.severity === "high").length;
      const openRisks = raidItems.filter(r => r.status === "open" && r.type === "risk").length;
      const openIssues = raidItems.filter(r => r.status === "open" && r.type === "issue").length;

      // Budget
      const totalAuth = (budgetSummary.originalContract || 0) + (budgetSummary.totalChangeOrders || 0) + (budgetSummary.totalAdditionalFunding || 0);
      const spendPct = totalAuth > 0 ? Math.round((budgetSummary.totalActualSpend || 0) / totalAuth * 100) : null;

      // Schedule
      const delayedMilestones = scheduleItems.filter(s => s.status === "delayed").length;
      const totalMilestones = scheduleItems.length;

      // Go-live
      let goLiveDate = baseline?.goLiveDate || null;
      let daysToGoLive = goLiveDate ? Math.ceil((new Date(goLiveDate).getTime() - Date.now()) / 86400000) : null;

      // Modules
      let modules: string[] = [];
      try { modules = JSON.parse(p.engagementModules || "[]"); } catch {}

      return {
        id: p.id, name: p.name, status: p.status,
        clientName: client?.name || null,
        modules,
        healthRating: worstRating,
        openCritical, openHigh, openRisks, openIssues,
        totalRaidItems: raidItems.length,
        budgetSpendPct: spendPct,
        budgetTotal: totalAuth,
        budgetSpent: budgetSummary.totalActualSpend || 0,
        delayedMilestones, totalMilestones,
        goLiveDate, daysToGoLive,
        outcomeCount: outcomes.length,
        requirementCount: reqs.length,
        assessmentCount: assessments.length,
        // Domain assessments for tiles
        domains: assessments.map(a => ({ domain: a.domain, rating: a.overallRating, summary: a.summary?.substring(0, 120) })),
        // Top critical/high RAID items
        topRisks: raidItems.filter(r => r.status === "open" && (r.severity === "critical" || r.severity === "high")).slice(0, 3).map(r => ({ type: r.type, severity: r.severity, title: r.title })),
        // Vendor if baseline has one
        vendorName: baseline?.vendorName || null,
      };
    });

    // Aggregates
    const totalCritical = projects.reduce((s, p) => s + p.openCritical, 0);
    const totalHighRisks = projects.reduce((s, p) => s + p.openHigh, 0);
    const projectsAtRisk = projects.filter(p => p.healthRating === "critical" || p.healthRating === "high").length;

    res.json({ projects, aggregates: { totalCritical, totalHighRisks, projectsAtRisk, totalProjects: projects.length } });
  });

  app.get("/api/analytics/portfolio", (req, res) => {
    const allProjectsRaw = storage.getProjects();
    // Filter by user access (same as dashboard)
    const user = getUserFromReq(req);
    const isAdmin = !user || user.role === "admin";
    const userProjectIds = user ? storage.getUserProjects(user.id) : [];
    const allProjects = allProjectsRaw.filter(p => {
      if (isAdmin) return true;
      if (userProjectIds.includes(p.id)) return true;
      if ((p as any).createdBy === user?.id) return true;
      const members = storage.getProjectMembers(p.id);
      return members.length === 0;
    });
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

  const STATUS_ORDER = ["setup", "discovery", "requirements", "evaluation", "award"];
  const STATUS_LABELS: Record<string, string> = {
    setup: "Setup",
    discovery: "Discovery",
    requirements: "Requirements",
    evaluation: "Evaluation",
    award: "Award",
  };

  // Get project status info — automatically computed from actual data
  app.get("/api/projects/:id/status-info", (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const requirements = storage.getRequirements(projectId);
    const interviews = storage.getDiscoveryInterviews(projectId);
    const completedInterviews = interviews.filter(i => i.status === "completed");
    const painPoints = storage.getPainPoints(projectId);
    const processDescs = storage.getProcessDescriptions(projectId);
    const outcomes = storage.getOutcomes(projectId);
    const settings = storage.getProjectVendorSettings(projectId);
    const scores = storage.getVendorScores(projectId);
    const hasEvaluation = scores.length > 0;

    // Check modules
    let modules: string[] = [];
    try { modules = project.engagementModules ? JSON.parse(project.engagementModules) : []; } catch {}
    const isHealthCheck = modules.includes("health_check");
    const isSelection = modules.includes("selection");

    // Health check specific
    const assessments = isHealthCheck ? storage.getHealthCheckAssessments(projectId) : [];
    const documents = isHealthCheck ? storage.getProjectDocuments(projectId) : [];

    const stageChecks: Record<string, Array<{ label: string; done: boolean }>> = {
      setup: [
        { label: "Project created", done: true },
        { label: "Client profile set", done: !!project.clientId },
      ],
      discovery: isHealthCheck ? [
        { label: "Documents uploaded", done: documents.length >= 1 },
        { label: "Health check synthesized", done: assessments.length >= 1 },
      ] : [
        { label: "Interviews completed", done: completedInterviews.length >= 1 },
        { label: "Pain points identified", done: painPoints.length >= 1 },
        { label: "Processes documented", done: processDescs.length >= 1 },
      ],
      requirements: isHealthCheck ? [
        { label: "Assessments complete", done: assessments.length >= 3 },
      ] : [
        { label: "Requirements generated", done: requirements.length >= 1 },
        { label: "Outcomes defined", done: outcomes.length >= 1 },
      ],
      evaluation: isSelection ? [
        { label: "Vendors selected", done: (settings?.selectedVendors ? JSON.parse(settings.selectedVendors).length : 0) >= 1 },
        { label: "Scores loaded", done: hasEvaluation },
      ] : [
        { label: "Analysis complete", done: assessments.length >= 3 || hasEvaluation },
      ],
      award: [
        { label: "Evaluation finalized", done: hasEvaluation && requirements.length > 0 },
      ],
    };

    // Manual completions (PM override)
    let manualCompletions: Record<string, boolean> = {};
    try { manualCompletions = project.stageCompletions ? JSON.parse(project.stageCompletions) : {}; } catch {}

    // Stage completion = manual override OR (auto-complete AND all prior complete)
    const rawStages = STATUS_ORDER.map((key) => {
      const checklist = stageChecks[key] || [];
      const autoComplete = checklist.length > 0 && checklist.every(c => c.done);
      const progress = checklist.length > 0 ? checklist.filter(c => c.done).length / checklist.length : 0;
      const manualComplete = !!manualCompletions[key];
      return { key, label: STATUS_LABELS[key], autoComplete, manualComplete, active: false, checklist, completed: false, progress };
    });

    const stages = rawStages.map((stage, i) => {
      const priorAllDone = rawStages.slice(0, i).every(s => s.autoComplete || s.manualComplete);
      const completed = stage.manualComplete || (stage.autoComplete && priorAllDone);
      const active = stage.progress > 0 && !completed;
      return { ...stage, completed, active };
    });

    const currentStatus = project.status || "draft";
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

  // Toggle stage completion (PM manual override)
  app.patch("/api/projects/:id/stage-status", (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const { stage, complete } = req.body;
    if (!stage) return res.status(400).json({ error: "stage is required" });

    let completions: Record<string, boolean> = {};
    try { completions = project.stageCompletions ? JSON.parse(project.stageCompletions) : {}; } catch {}

    if (complete) {
      completions[stage] = true;
    } else {
      delete completions[stage];
    }

    const updated = storage.updateProject(projectId, { stageCompletions: JSON.stringify(completions) });
    logAction(req, "stage_status_changed", projectId, `${stage}: ${complete ? "complete" : "incomplete"}`);
    res.json(updated);
  });

  // ==================== AI CHAT (SSE STREAMING) ====================

  app.post("/api/projects/:id/chat", async (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = projectId > 0 ? storage.getProject(projectId) : null;

    const { message, history } = req.body as {
      message: string;
      history?: { role: string; content: string }[];
    };
    if (!message) return res.status(400).json({ error: "message is required" });

    // Save user message to DB (only for real projects)
    if (project) storage.addChatMessage(projectId, "user", message);

    // Build project context
    const { buildProjectContext, llmCall, llmStream, CHAT_SYSTEM_PROMPT } = await import("./ai");
    const projectContext = project ? buildProjectContext(projectId) : "No project selected. User is on the dashboard. Help them understand Caliber's capabilities and guide them to create or select a project.";
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

      // Save assistant message to DB (only for real projects)
      if (project) storage.addChatMessage(projectId, "assistant", fullResponse);
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
    if (projectId <= 0) return res.json([]);
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
      const { PDFParse } = require("pdf-parse");
      const pdfParser = new PDFParse(new Uint8Array(fileBuffer));
      const pdfResult = await pdfParser.getText();
      const pdfText = pdfResult.pages ? pdfResult.pages.map((p: any) => p.text).join("\n\n") : "";

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

  // ==================== CONTRACT EXTRACTION FROM DOCUMENTS ====================

  app.post("/api/projects/:id/extract-contract", async (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const { documentId } = req.body;
    if (!documentId) return res.status(400).json({ error: "documentId required" });

    const doc = storage.getProjectDocument(documentId);
    if (!doc || !doc.rawText) return res.status(400).json({ error: "Document not found or has no text" });

    try {
      const { extractContractData } = await import("./ai");
      const contractData = await extractContractData(doc.rawText);

      // Create contract baseline
      const baseline = storage.createContractBaseline({
        projectId,
        vendorId: null,
        contractName: contractData.contractName || doc.fileName,
        contractDate: contractData.contractDate,
        totalValue: contractData.totalValue,
        startDate: contractData.startDate,
        endDate: contractData.endDate,
        sourceDocument: doc.fileName,
        notes: [contractData.vendorName ? `Vendor: ${contractData.vendorName}` : "", contractData.notes || ""].filter(Boolean).join("\n"),
      });

      // Create deliverables
      let deliverableCount = 0;
      if (contractData.deliverables?.length > 0) {
        const deliverables = storage.createDeliverablesBulk(
          contractData.deliverables.map(d => ({
            baselineId: baseline.id,
            category: d.category || "documentation",
            name: d.name,
            description: d.description || null,
            dueDate: d.dueDate || null,
            status: "pending",
            priority: d.priority || "medium",
            contractReference: d.contractReference || null,
          }))
        );
        deliverableCount = deliverables.length;
      }

      // Create checkpoints from milestones
      let checkpointCount = 0;
      if (contractData.milestones?.length > 0) {
        for (const m of contractData.milestones) {
          storage.createCheckpoint({
            baselineId: baseline.id,
            name: m.name,
            phase: m.phase || "planning",
            scheduledDate: m.scheduledDate || null,
            status: "pending",
          });
          checkpointCount++;
        }
      }

      // Also update the health check baseline if one exists
      const existingBaseline = storage.getProjectBaseline(projectId);
      if (!existingBaseline && contractData.totalValue) {
        storage.upsertProjectBaseline({
          projectId,
          contractedAmount: parseInt(String(contractData.totalValue).replace(/\D/g, "")) || 0,
          goLiveDate: contractData.endDate || "",
          contractStartDate: contractData.startDate || "",
          vendorName: contractData.vendorName || "",
          notes: `Auto-extracted from ${doc.fileName}`,
        });
      }

      res.json({
        success: true,
        contractId: baseline.id,
        contractName: baseline.contractName,
        deliverableCount,
        checkpointCount,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
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

  // AI: Auto-assess checkpoint dimensions
  app.post("/api/checkpoints/:id/auto-assess", async (req, res) => {
    const checkpointId = parseInt(req.params.id);
    const cp = storage.getCheckpoint(checkpointId);
    if (!cp) return res.status(404).json({ error: "Checkpoint not found" });

    // Find the project from the baseline
    const baseline = storage.getContractBaseline(cp.baselineId);
    if (!baseline) return res.status(400).json({ error: "No contract baseline found" });
    const projectId = baseline.projectId;

    try {
      const { assessCheckpoint, buildProjectContext } = await import("./ai");
      const projectContext = buildProjectContext(projectId);
      const hcAssessments = storage.getHealthCheckAssessments(projectId);
      const raidItems = storage.getRaidItems(projectId);
      const scheduleItems = storage.getScheduleEntries(projectId);
      const documents = storage.getProjectDocuments(projectId);

      const result = await assessCheckpoint({
        checkpointName: cp.name, checkpointPhase: cp.phase,
        projectContext, assessments: hcAssessments, raidItems, scheduleItems, documents,
      });

      // Save dimensions
      if (result.dimensions.length > 0) {
        storage.saveCheckpointAssessment(checkpointId, result.dimensions);
      }

      // Update checkpoint with overall assessment
      storage.updateCheckpoint(checkpointId, {
        overallAssessment: result.overallAssessment,
        recommendations: result.recommendations,
        findings: result.findings,
        status: "completed",
      });

      logAction(req, "auto_assessed_checkpoint", projectId, `${cp.name}: ${result.dimensions.length} dimensions`);
      res.json(result);
    } catch (err: any) {
      console.error("Checkpoint auto-assess error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Assess all checkpoints for a contract
  app.post("/api/contracts/:id/assess-all-checkpoints", async (req, res) => {
    const baselineId = parseInt(req.params.id);
    const baseline = storage.getContractBaseline(baselineId);
    if (!baseline) return res.status(404).json({ error: "Contract not found" });
    const projectId = baseline.projectId;

    try {
      const checkpoints = storage.getCheckpoints(baselineId);
      if (checkpoints.length === 0) return res.json({ assessed: 0 });

      const { assessCheckpoint, buildProjectContext } = await import("./ai");
      const projectContext = buildProjectContext(projectId);
      const hcAssessments = storage.getHealthCheckAssessments(projectId);
      const raidItems = storage.getRaidItems(projectId);
      const scheduleItems = storage.getScheduleEntries(projectId);
      const documents = storage.getProjectDocuments(projectId);

      let assessed = 0;
      for (const cp of checkpoints) {
        try {
          const result = await assessCheckpoint({
            checkpointName: cp.name, checkpointPhase: cp.phase,
            projectContext, assessments: hcAssessments, raidItems, scheduleItems, documents,
          });
          if (result.dimensions.length > 0) {
            storage.saveCheckpointAssessment(cp.id, result.dimensions);
          }
          storage.updateCheckpoint(cp.id, {
            overallAssessment: result.overallAssessment,
            recommendations: result.recommendations,
            findings: result.findings,
            status: "completed",
          });
          assessed++;
        } catch (cpErr: any) {
          console.error(`Assess checkpoint ${cp.name} error:`, cpErr.message);
        }
      }
      logAction(req, "auto_assessed_checkpoints", projectId, `${assessed}/${checkpoints.length} checkpoints`);
      res.json({ assessed, total: checkpoints.length });
    } catch (err: any) {
      console.error("Assess all checkpoints error:", err);
      res.status(500).json({ error: err.message });
    }
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

  // Go-Live PDF Report
  app.get("/api/projects/:id/go-live/report-pdf", async (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const client = project.clientId ? storage.getClient(project.clientId) : undefined;
    const baseline = storage.getProjectBaseline(projectId);

    // Try to get scorecard from compliance contract or from query params
    const summary = storage.getContractBaselines(projectId);
    let criteriaData: any[] = [];
    let assessorNotes = "";
    let overallScore = 0;
    let readiness = "not_ready";

    if (summary.length > 0) {
      const scorecard = storage.getGoLiveScorecard(summary[0].id);
      if (scorecard) {
        try { criteriaData = typeof scorecard.criteria === "string" ? JSON.parse(scorecard.criteria) : scorecard.criteria; } catch {}
        assessorNotes = scorecard.assessorNotes || "";
        overallScore = scorecard.overallScore || 0;
        readiness = scorecard.overallReadiness || "not_ready";
      }
    }

    try {
      const PDFDocument = (await import("pdfkit")).default;
      const doc = new PDFDocument({ size: "LETTER", margins: { top: 72, bottom: 72, left: 72, right: 72 }, autoFirstPage: false });

      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => {
        const pdf = Buffer.concat(chunks);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="go_live_readiness_${project.name.replace(/[^a-zA-Z0-9]/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf"`);
        res.send(pdf);
      });

      const blue = "#203f90";
      const orange = "#c45819";
      const darkText = "#1a1a2e";
      const gray = "#5a6478";
      const lightGray = "#e8eaed";
      let pageNum = 0;

      // Helper: add a new page with header/footer built in
      function newPage() {
        doc.addPage();
        pageNum++;
        const pw = doc.page.width;
        const ph = doc.page.height;
        const cw = pw - 144;
        if (pageNum > 1) {
          doc.save();
          doc.moveTo(72, 56).lineTo(pw - 72, 56).lineWidth(0.5).strokeColor(lightGray).stroke();
          doc.fontSize(7).font("Helvetica").fillColor(gray);
          doc.text("Avero Advisors", 72, 44, { lineBreak: false });
          doc.text("Go-Live Readiness Report", pw - 72 - 150, 44, { width: 150, align: "right", lineBreak: false });
          doc.restore();
        }
        // Footer
        doc.save();
        doc.moveTo(72, ph - 56).lineTo(pw - 72, ph - 56).lineWidth(0.5).strokeColor(lightGray).stroke();
        doc.fontSize(7).fillColor(gray);
        if (pageNum === 1) {
          doc.text("CONFIDENTIAL", 72, ph - 48, { width: cw, align: "center", lineBreak: false });
        } else {
          doc.text(project.name, 72, ph - 48, { lineBreak: false });
          doc.text(`Page ${pageNum}`, pw - 72 - 60, ph - 48, { width: 60, align: "right", lineBreak: false });
        }
        doc.restore();
        // Reset cursor for content area
        doc.y = pageNum === 1 ? 72 : 72;
      }

      // Logos
      let logoPath = path.resolve("client/public/avero-logo.png");
      if (!fs.existsSync(logoPath)) logoPath = path.resolve("dist/public/avero-logo.png");
      const hasLogo = fs.existsSync(logoPath);
      let clientLogoPath = client?.logoPath ? path.resolve("dist/public" + client.logoPath) : "";
      const hasClientLogo = clientLogoPath && fs.existsSync(clientLogoPath);

      // ========== COVER PAGE ==========
      newPage();
      const pageW = doc.page.width;
      const pageH = doc.page.height;
      const contentW = pageW - 144;
      doc.rect(0, 0, pageW, 280).fill(blue);
      if (hasLogo) { try { doc.image(logoPath, 72, 60, { height: 50 }); } catch {} }
      if (hasClientLogo) { try { doc.image(clientLogoPath, pageW - 72 - 80, 60, { height: 50 }); } catch {} }
      doc.fill("#ffffff").fontSize(32).font("Helvetica-Bold").text("Go-Live Readiness\nAssessment", 72, 140, { width: contentW, lineBreak: true });
      doc.rect(72, 300, 80, 4).fill(orange);
      doc.fill(darkText).fontSize(16).font("Helvetica-Bold").text(project.name, 72, 330, { lineBreak: false });
      if (client) doc.fontSize(13).font("Helvetica").fillColor(gray).text(client.name, 72, 355, { lineBreak: false });
      doc.fontSize(10).font("Helvetica").fillColor(gray).text("Prepared by Avero Advisors", 72, 400, { lineBreak: false });
      doc.text(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), 72, 415, { lineBreak: false });
      if (baseline?.goLiveDate) {
        const days = Math.ceil((new Date(baseline.goLiveDate).getTime() - Date.now()) / 86400000);
        doc.text(`Go-Live: ${baseline.goLiveDate} (${days > 0 ? days + " days" : Math.abs(days) + " days past"})`, 72, 445, { lineBreak: false });
      }

      // ========== READINESS SUMMARY ==========
      newPage();
      doc.fontSize(20).font("Helvetica-Bold").fillColor(blue).text("Readiness Assessment", 72, 72, { lineBreak: false });
      doc.rect(72, 100, 50, 3).fill(orange);

      const scoreColor = overallScore >= 85 ? "#16a34a" : overallScore >= 70 ? "#d97706" : "#dc2626";
      const readinessLabels: Record<string, string> = { ready: "READY", ready_with_conditions: "READY WITH CONDITIONS", not_ready: "NOT READY", critical_hold: "CRITICAL HOLD" };

      doc.fontSize(11).fillColor(gray).text("Overall Readiness:", 72, 120, { lineBreak: false });
      doc.rect(72, 138, 220, 28).fill(scoreColor);
      doc.fontSize(14).font("Helvetica-Bold").fillColor("#ffffff").text(`${readinessLabels[readiness] || readiness} — ${overallScore}/100`, 82, 145, { lineBreak: false });

      let curY = 180;
      if (assessorNotes) {
        doc.fontSize(9).font("Helvetica").fillColor(gray);
        const notesH = doc.heightOfString(assessorNotes, { width: contentW, fontSize: 9 });
        doc.text(assessorNotes, 72, curY, { width: contentW });
        curY += notesH + 20;
      }

      // ========== CRITERIA TABLE ==========
      curY += 10;
      doc.fontSize(14).font("Helvetica-Bold").fillColor(blue).text("Detailed Criteria Scores", 72, curY, { lineBreak: false });
      curY += 20;
      doc.rect(72, curY, 40, 2.5).fill(orange);
      curY += 15;

      // Table header
      function drawTableHeader(y: number) {
        doc.rect(72, y, contentW, 18).fill("#f1f3f5");
        doc.fontSize(8).font("Helvetica-Bold").fillColor(gray);
        doc.text("Criterion", 82, y + 4, { lineBreak: false });
        doc.text("Wt", 245, y + 4, { lineBreak: false });
        doc.text("Score", 275, y + 4, { lineBreak: false });
        doc.text("Evidence & Recommendation", 315, y + 4, { lineBreak: false });
        return y + 22;
      }

      curY = drawTableHeader(curY);
      const maxY = pageH - 90; // leave room for footer

      let lastCategory = "";
      for (const c of criteriaData) {
        // Estimate row height
        let estH = 18;
        if (c.evidence) estH += doc.heightOfString(c.evidence, { width: 220, fontSize: 7 }) + 2;
        if (c.recommendation) estH += doc.heightOfString(`Rec: ${c.recommendation}`, { width: 220, fontSize: 7 }) + 2;
        if (c.notes) estH += doc.heightOfString(`Note: ${c.notes}`, { width: 220, fontSize: 7 }) + 2;
        if (c.category !== lastCategory) estH += 18;

        if (curY + estH > maxY) {
          newPage();
          curY = 72;
          curY = drawTableHeader(curY);
        }

        if (c.category !== lastCategory) {
          lastCategory = c.category;
          doc.rect(72, curY, contentW, 15).fill("#f8f9fa");
          doc.fontSize(8).font("Helvetica-Bold").fillColor(darkText).text(c.category, 82, curY + 3, { lineBreak: false });
          curY += 18;
        }

        const rowY = curY;
        const sc = c.score || 0;
        const scColor2 = sc <= 3 ? "#dc2626" : sc <= 6 ? "#d97706" : "#16a34a";

        doc.fontSize(8).font("Helvetica").fillColor(darkText).text(c.name, 82, rowY + 2, { width: 155, lineBreak: false });
        doc.fontSize(8).fillColor(gray).text(String(c.weight), 245, rowY + 2, { lineBreak: false });
        doc.fontSize(9).font("Helvetica-Bold").fillColor(scColor2).text(String(sc), 275, rowY + 1, { lineBreak: false });

        let detailY = rowY + 1;
        if (c.evidence) {
          doc.fontSize(7).font("Helvetica").fillColor(gray).text(c.evidence, 315, detailY, { width: 220 });
          detailY += doc.heightOfString(c.evidence, { width: 220, fontSize: 7 }) + 2;
        }
        if (c.recommendation) {
          doc.fontSize(7).font("Helvetica").fillColor(orange).text(`Rec: ${c.recommendation}`, 315, detailY, { width: 220 });
          detailY += doc.heightOfString(`Rec: ${c.recommendation}`, { width: 220, fontSize: 7 }) + 2;
        }
        if (c.notes) {
          doc.fontSize(7).font("Helvetica-Oblique").fillColor(gray).text(`Note: ${c.notes}`, 315, detailY, { width: 220 });
          detailY += doc.heightOfString(`Note: ${c.notes}`, { width: 220, fontSize: 7 }) + 2;
        }

        curY = Math.max(rowY + 16, detailY + 2);
        doc.moveTo(82, curY).lineTo(72 + contentW, curY).lineWidth(0.3).strokeColor(lightGray).stroke();
        curY += 4;
      }

      doc.end();
    } catch (err: any) {
      console.error("Go-Live PDF error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // AI: Auto-assess go-live readiness from project data
  app.post("/api/projects/:id/go-live/auto-assess", async (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    try {
      const { assessGoLiveReadiness, buildProjectContext } = await import("./ai");
      const projectContext = buildProjectContext(projectId);
      const assessments = storage.getHealthCheckAssessments(projectId);
      const raidItems = storage.getRaidItems(projectId);
      const budgetSummary = storage.getBudgetSummary(projectId);
      const scheduleItems = storage.getScheduleEntries(projectId);
      const documents = storage.getProjectDocuments(projectId);
      const baseline = storage.getProjectBaseline(projectId);

      const result = await assessGoLiveReadiness({
        projectContext, assessments, raidItems, budgetSummary, scheduleItems, documents, baseline,
      });

      // Calculate weighted score
      let weightedSum = 0, totalWeight = 0;
      for (const c of result.criteria) {
        weightedSum += (c.score || 0) * (c.weight || 1);
        totalWeight += c.weight || 1;
      }
      const overallScore = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 10) : 0;
      const readiness = overallScore >= 85 ? "ready" : overallScore >= 70 ? "ready_with_conditions" : overallScore >= 50 ? "not_ready" : "critical_hold";

      logAction(req, "auto_assessed_golive", projectId, `Score: ${overallScore}, Readiness: ${readiness}`);
      res.json({
        criteria: result.criteria,
        overallScore,
        overallReadiness: readiness,
        overallNotes: result.overallNotes,
        assessedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error("Go-live auto-assess error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Go-live readiness trend (history of all assessments)
  app.get("/api/projects/:id/go-live/history", (req, res) => {
    const projectId = parseInt(req.params.id);
    const contracts = storage.getContractBaselines(projectId);
    if (contracts.length === 0) return res.json([]);
    const history = storage.getGoLiveScorecardHistory(contracts[0].id);
    res.json(history);
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

    // If no org profile exists, auto-populate from client profile
    if (!profile) {
      const project = storage.getProject(projectId);
      if (project?.clientId) {
        const client = storage.getClient(project.clientId);
        if (client) {
          const clientProfile = {
            projectId,
            entityName: client.name,
            entityType: client.entityType,
            state: client.state,
            population: client.population,
            employeeCount: client.employeeCount,
            annualBudget: client.annualBudget,
            painSummary: client.painSummary,
            currentSystems: client.currentSystems,
            departments: client.departments,
            leadership: client.leadership,
            domain: client.domain,
            _fromClient: true,
          };
          return res.json(clientProfile);
        }
      }
    }

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
      const result = storage.updateDiscoveryInterview(id, {
        messages: jsonStr,
        status: "in_progress",
      });
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
    const user = getUserFromReq(req); if (user && user.role === "viewer") return res.status(403).json({ error: "Edit access required" });
    const { vendorPlatform, module, processArea } = req.body;
    if (!vendorPlatform || !module || !processArea) {
      return res.status(400).json({ error: "vendorPlatform, module, and processArea are required" });
    }
    const cap = storage.createVendorCapability(req.body);
    res.status(201).json(cap);
  });

  app.patch("/api/knowledge-base/capabilities/:id", (req, res) => {
    const user = getUserFromReq(req); if (user && user.role === "viewer") return res.status(403).json({ error: "Edit access required" });
    const id = parseInt(req.params.id);
    const updated = storage.updateVendorCapability(id, req.body);
    if (!updated) return res.status(404).json({ error: "Capability not found" });
    res.json(updated);
  });

  app.delete("/api/knowledge-base/capabilities/:id", (req, res) => {
    const user = getUserFromReq(req); if (user && user.role === "viewer") return res.status(403).json({ error: "Edit access required" });
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

  app.post("/api/knowledge-base/seed", (req: any, res) => {
    const user = getUserFromReq(req); if (user && user.role !== "admin") return res.status(403).json({ error: "Admin access required" });
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

      // Guard against duplicate seeding
      const existingBaselines = storage.getContractBaselines(projectId);
      if (existingBaselines.length > 0) {
        return res.status(409).json({ error: "IV&V data already exists for this project." });
      }

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

      // Guard against duplicate seeding
      const existingAssessments = storage.getHealthCheckAssessments(projectId);
      const existingRaid = storage.getRaidItems(projectId);
      if (existingAssessments.length > 0 || existingRaid.length > 0) {
        return res.status(409).json({ error: "Health check data already exists for this project. Delete existing data before re-seeding." });
      }

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

      storage.createHealthCheckAssessment({
        projectId, domain: "change_management", overallRating: "critical", assessedBy: "IV&V Assessment Team",
        summary: "Change management is critically deficient. No Prosci-certified OCM lead despite contractual requirement. Training plan rejected 3 times. No organizational readiness assessment completed.",
        findings: JSON.stringify([
          { severity: "critical", finding: "No OCM lead assigned despite contractual requirement for Prosci-certified resource.", evidence: "Contract deliverable tracking log", recommendation: "Require SI to staff qualified OCM lead within 2 weeks or escalate as contract breach" },
          { severity: "critical", finding: "Training plan rejected 3 times by client. No approved plan exists with UAT 6 weeks away.", evidence: "PMO document review log", recommendation: "Emergency training plan development with client SME co-authorship" },
          { severity: "high", finding: "No organizational readiness assessment performed. Department-level adoption risks unknown.", evidence: "Stakeholder interviews revealed no readiness activities", recommendation: "Conduct rapid readiness assessment across all impacted departments" },
        ]),
      });
      storage.createHealthCheckAssessment({
        projectId, domain: "data_migration", overallRating: "high", assessedBy: "IV&V Assessment Team",
        summary: "Data migration shows significant risk. Mock 2 conversion had 12% error rate on vendor master records. Legacy data quality issues unresolved. No cutover rehearsal scheduled.",
        findings: JSON.stringify([
          { severity: "critical", finding: "Mock 2 data conversion showed 12% error rate on vendor master records vs. 2% target.", evidence: "Mock conversion reconciliation report", recommendation: "Root cause analysis required before Mock 3. Do not proceed without <5% error rate." },
          { severity: "high", finding: "Legacy AP data has 15,000 duplicate vendor records. No cleansing plan in place.", evidence: "Data profiling analysis", recommendation: "Data cleansing sprint needed before next mock conversion" },
          { severity: "medium", finding: "No cutover rehearsal scheduled. Go-live cutover plan has not been drafted.", evidence: "Project schedule review", recommendation: "Schedule cutover rehearsal minimum 8 weeks before go-live" },
        ]),
      });
      storage.createHealthCheckAssessment({
        projectId, domain: "testing_quality", overallRating: "critical", assessedBy: "IV&V Assessment Team",
        summary: "Testing is critically behind. SIT at 34% completion with 2 weeks remaining. 156 open defects with 12 critical. UAT entry criteria cannot be met at current trajectory.",
        findings: JSON.stringify([
          { severity: "critical", finding: "SIT execution at 34% with 2 weeks remaining. Current burn rate projects 55% at SIT end.", evidence: "Test management system metrics", recommendation: "Extend SIT by minimum 4 weeks. Establish daily defect triage." },
          { severity: "critical", finding: "12 critical defects open including payroll calculation errors and GL posting failures.", evidence: "Defect tracker extract", recommendation: "All critical defects must be resolved before UAT entry. No exceptions." },
          { severity: "high", finding: "No regression test automation. Each fix cycle requires full manual re-test.", evidence: "Test strategy document review", recommendation: "Invest in regression automation for core financial processes" },
        ]),
      });
      storage.createHealthCheckAssessment({
        projectId, domain: "vendor_performance", overallRating: "high", assessedBy: "IV&V Assessment Team",
        summary: "SI performance raises concerns. Key resources rotated without notice. Deliverable quality requires multiple revision cycles. SI self-reporting omits material issues.",
        findings: JSON.stringify([
          { severity: "high", finding: "SI rotated 3 key technical resources in past 60 days without client notification or transition.", evidence: "Resource tracking and stakeholder interviews", recommendation: "Enforce contract clause requiring 30-day notice for key resource changes" },
          { severity: "high", finding: "Average deliverable requires 2.8 revision cycles before acceptance. Industry norm is 1.5.", evidence: "Deliverable acceptance log analysis", recommendation: "Implement deliverable quality gates with draft review before formal submission" },
          { severity: "medium", finding: "SI status reports consistently omit or downgrade material risks identified independently.", evidence: "Compared SI reports to independent findings", recommendation: "Require joint status reporting with IV&V validation" },
        ]),
      });
      storage.createHealthCheckAssessment({
        projectId, domain: "compliance_security", overallRating: "medium", assessedBy: "IV&V Assessment Team",
        summary: "Compliance posture is moderate. SOC 2 audit readiness not yet assessed. Data privacy impact assessment pending. Security architecture review shows adequate controls for phase 1.",
        findings: JSON.stringify([
          { severity: "high", finding: "No SOC 2 readiness assessment performed despite requirement for post-go-live audit.", evidence: "Compliance requirements matrix", recommendation: "Engage compliance team for SOC 2 gap assessment within 30 days" },
          { severity: "medium", finding: "Data privacy impact assessment not yet completed for PII handling in new system.", evidence: "Privacy compliance checklist", recommendation: "Complete DPIA before UAT begins to avoid late-stage redesign" },
          { severity: "low", finding: "Security architecture review shows adequate access controls and encryption for Phase 1 scope.", evidence: "Security architecture review document", recommendation: "Continue monitoring. Plan Phase 2 security enhancements." },
        ]),
      });
      storage.createHealthCheckAssessment({
        projectId, domain: "scope_requirements", overallRating: "high", assessedBy: "IV&V Assessment Team",
        summary: "Scope management at risk. 47 change requests submitted, 12 approved without documented impact analysis. Requirements traceability matrix incomplete for 3 modules.",
        findings: JSON.stringify([
          { severity: "high", finding: "47 change requests submitted. 12 approved without documented schedule/budget impact analysis.", evidence: "Change request log review", recommendation: "Freeze non-critical CRs. Require impact analysis for all pending requests." },
          { severity: "high", finding: "Requirements traceability matrix incomplete for Procurement, Inventory, and Asset Management modules.", evidence: "RTM coverage analysis", recommendation: "Complete RTM before UAT entry to ensure all requirements are testable" },
          { severity: "medium", finding: "3 customizations approved that could have been handled with configuration. Increases long-term maintenance cost.", evidence: "Technical design review", recommendation: "Re-evaluate customizations for configuration alternatives during UAT" },
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

  // ==================== SEED SAMPLE CLIENTS & PROJECTS ====================

  app.post("/api/seed-sample-data", (req, res) => {
    try {
      const userId = (req as any).user?.id || 1;
      const samples = [
        {
          client: {
            name: "SAMPLE City of Denver",
            domain: "denvergov.org",
            entityType: "city",
            state: "CO",
            population: 715522,
            employeeCount: 11500,
            annualBudget: "$1.8B",
            description: "Capital city of Colorado, undergoing ERP modernization from legacy PeopleSoft to Oracle Cloud.",
            painSummary: "Aging PeopleSoft system reaching end of life. Manual processes across finance and HR. Difficulty recruiting IT talent to maintain legacy systems.",
            departments: [{ name: "Finance", headcount: 180 }, { name: "Human Resources", headcount: 95 }, { name: "IT", headcount: 120 }, { name: "Public Works", headcount: 850 }, { name: "Parks & Recreation", headcount: 420 }],
            currentSystems: [{ name: "PeopleSoft", module: "Finance & HR", vendor: "Oracle", yearsInUse: 18 }, { name: "Kronos", module: "Time & Attendance", vendor: "UKG", yearsInUse: 12 }],
            leadership: [{ name: "Mike Johnston", title: "Mayor" }, { name: "Sarah Mitchell", title: "CFO" }],
          },
          project: {
            name: "Oracle Cloud ERP Implementation",
            description: "Full lifecycle Oracle Cloud ERP and HCM implementation replacing PeopleSoft",
            engagementModules: JSON.stringify(["health_check", "selection"]),
            engagementMode: "consulting",
          },
          healthCheck: true,
        },
        {
          client: {
            name: "SAMPLE Metro Transit Authority of Houston",
            domain: "ridemetro.org",
            entityType: "transit",
            state: "TX",
            population: 3500000,
            employeeCount: 4200,
            annualBudget: "$950M",
            description: "Regional transit authority serving the greater Houston metropolitan area with bus, rail, and paratransit services.",
            painSummary: "Fragmented systems across fleet management, finance, and operations. No single source of truth for asset data. Compliance reporting is manual and error-prone.",
            departments: [{ name: "Operations", headcount: 2800 }, { name: "Maintenance", headcount: 650 }, { name: "Finance", headcount: 120 }, { name: "IT", headcount: 85 }],
            currentSystems: [{ name: "SAP R/3", module: "Finance", vendor: "SAP", yearsInUse: 22 }, { name: "Trapeze", module: "Fleet Management", vendor: "Modaxo", yearsInUse: 15 }],
            leadership: [{ name: "Thomas Lambert", title: "President & CEO" }, { name: "Angela Rodriguez", title: "VP of Finance" }],
          },
          project: {
            name: "EAM/ERP Vendor Selection",
            description: "Evaluating enterprise asset management and ERP platforms for fleet, facilities, and finance",
            engagementModules: JSON.stringify(["selection"]),
            engagementMode: "consulting",
          },
          healthCheck: false,
        },
        {
          client: {
            name: "SAMPLE Clark County Water Reclamation District",
            domain: "cleanwaterteam.com",
            entityType: "utility",
            state: "NV",
            population: 2300000,
            employeeCount: 1800,
            annualBudget: "$620M",
            description: "Wastewater treatment and water reclamation utility serving the Las Vegas metropolitan area.",
            painSummary: "Current Infor system is heavily customized and difficult to upgrade. Regulatory compliance tracking is manual. Need better work order and asset lifecycle management.",
            departments: [{ name: "Operations", headcount: 900 }, { name: "Engineering", headcount: 200 }, { name: "Finance", headcount: 80 }, { name: "IT", headcount: 65 }, { name: "Compliance", headcount: 45 }],
            currentSystems: [{ name: "Infor EAM", module: "Asset Management", vendor: "Infor", yearsInUse: 14 }, { name: "Tyler Munis", module: "Finance", vendor: "Tyler Technologies", yearsInUse: 10 }],
            leadership: [{ name: "Robert Dotson", title: "General Manager" }, { name: "Lisa Chen", title: "Director of IT" }],
          },
          project: {
            name: "Workday Implementation Health Check",
            description: "Independent health check of in-progress Workday Finance and HCM implementation",
            engagementModules: JSON.stringify(["health_check"]),
            engagementMode: "consulting",
          },
          healthCheck: true,
        },
        {
          client: {
            name: "SAMPLE Port of Long Beach",
            domain: "polb.com",
            entityType: "port",
            state: "CA",
            population: null,
            employeeCount: 950,
            annualBudget: "$1.1B",
            description: "Second-busiest container port in the US, handling over 9 million TEUs annually.",
            painSummary: "Disparate systems across terminal operations, finance, and capital projects. Need unified platform for capital program management and grant tracking.",
            departments: [{ name: "Operations", headcount: 350 }, { name: "Engineering", headcount: 180 }, { name: "Finance", headcount: 75 }, { name: "Environmental", headcount: 60 }, { name: "IT", headcount: 55 }],
            currentSystems: [{ name: "Oracle E-Business Suite", module: "Finance", vendor: "Oracle", yearsInUse: 16 }, { name: "Maximo", module: "Asset Management", vendor: "IBM", yearsInUse: 12 }],
            leadership: [{ name: "Mario Cordero", title: "Executive Director" }, { name: "Sam Joumblat", title: "CFO" }],
          },
          project: {
            name: "SAP S/4HANA Migration Assessment",
            description: "Pre-implementation assessment and vendor selection for SAP S/4HANA migration from Oracle EBS",
            engagementModules: JSON.stringify(["selection", "health_check"]),
            engagementMode: "consulting",
          },
          healthCheck: true,
        },
      ];

      const created: any[] = [];
      for (const s of samples) {
        const client = storage.createClient(s.client);
        const project = storage.createProject({
          ...s.project,
          clientId: client.id,
          createdBy: userId,
          status: "draft",
        } as any);

        // Seed health check data for HC projects
        if (s.healthCheck) {
          const domains = ["governance", "technical", "budget_schedule", "change_management", "testing_quality", "vendor_performance"];
          const ratings = ["medium", "high", "low", "medium", "high", "medium"];
          const summaries = [
            "Governance structure exists but steering committee meetings are inconsistent. Decision-making authority is unclear for scope changes.",
            "Technical architecture is sound but integration testing has been deferred. Performance testing has not begun.",
            "Project is 15% over original budget due to two change orders. Schedule has slipped 3 months from original go-live.",
            "Training plan exists but end-user adoption is a concern. Only 30% of super users have been identified.",
            "SIT1 complete with 65% pass rate. Critical defect backlog of 45 items remains open. UAT has not started.",
            "SI vendor staffing has been inconsistent. Key technical lead was replaced mid-project. Knowledge transfer gaps exist.",
          ];
          domains.forEach((domain, i) => {
            storage.createHealthCheckAssessment({
              projectId: project.id,
              domain,
              overallRating: ratings[i],
              summary: summaries[i],
              findings: JSON.stringify([
                { severity: ratings[i], finding: summaries[i], evidence: "Based on document review and stakeholder interviews", recommendation: "Immediate attention required" },
              ]),
              assessedBy: "AI Synthesis (Sample)",
            });
          });

          // Sample RAID items
          const raidSamples = [
            { type: "risk", title: "Go-live date at risk", description: "Current trajectory suggests 2-3 month delay", severity: "high", status: "open" },
            { type: "issue", title: "Data migration quality below threshold", description: "Only 78% of converted records pass validation", severity: "critical", status: "open" },
            { type: "risk", title: "Key resource departure", description: "Lead functional consultant leaving in 6 weeks", severity: "high", status: "open" },
            { type: "dependency", title: "Third-party API availability", description: "Payroll integration depends on vendor releasing updated API", severity: "medium", status: "open" },
            { type: "issue", title: "Scope creep in reporting module", description: "15 additional custom reports added without change order", severity: "medium", status: "open" },
          ];
          for (const r of raidSamples) {
            storage.createRaidItem({ projectId: project.id, ...r } as any);
          }

          // Sample interviews with findings, pain points, and process steps
          const interviewData = [
            {
              functionalArea: "Finance",
              interviewee: "Sarah Mitchell",
              role: "Controller",
              messages: [
                { role: "assistant", content: "Tell me about your current accounts payable process.", timestamp: new Date().toISOString() },
                { role: "user", content: "We process about 3,000 invoices per month. Everything starts with a paper invoice that gets scanned and manually keyed into PeopleSoft. We have 4 AP clerks doing data entry. The approval routing is done via email — we print the invoice, get a wet signature, then scan it back in. It takes 15-20 days on average to process a single invoice from receipt to payment. We miss early payment discounts constantly.", timestamp: new Date().toISOString() },
                { role: "assistant", content: "What about your month-end close process?", timestamp: new Date().toISOString() },
                { role: "user", content: "Month-end close takes us 12-15 business days. The biggest bottleneck is intercompany reconciliations — we have 6 funds and the journal entries between them are all manual. Our team works overtime every month-end. We also struggle with bank reconciliations because the data export from PeopleSoft doesn't match the bank format, so there's a manual mapping step in Excel.", timestamp: new Date().toISOString() },
              ],
              findings: {
                keyThemes: ["Manual invoice processing", "Slow month-end close", "Lack of automation"],
                systemGaps: ["No electronic invoice capture", "No automated approval workflow", "Manual intercompany reconciliation"],
                processMaturity: "Low — heavily manual with paper-based approvals",
              },
              painPoints: [
                { description: "Invoice processing takes 15-20 days due to paper-based workflow", severity: "high", frequency: "daily", impact: "Missing early payment discounts worth ~$200K/year" },
                { description: "Month-end close takes 12-15 business days", severity: "high", frequency: "monthly", impact: "Delays financial reporting and decision-making" },
                { description: "Manual intercompany reconciliation across 6 funds", severity: "medium", frequency: "monthly", impact: "Staff overtime, error-prone process" },
              ],
              processSteps: [
                { step: "Receive paper invoice", actor: "Mailroom", system: "None", isManual: true },
                { step: "Scan and key invoice data into PeopleSoft", actor: "AP Clerk", system: "PeopleSoft", isManual: true },
                { step: "Print invoice for approval signature", actor: "AP Clerk", system: "None", isManual: true },
                { step: "Route for department approval via email", actor: "AP Clerk", system: "Email", isManual: true },
                { step: "Obtain wet signature from approver", actor: "Department Manager", system: "None", isManual: true },
                { step: "Scan signed invoice back into system", actor: "AP Clerk", system: "PeopleSoft", isManual: true },
                { step: "Schedule payment batch", actor: "AP Supervisor", system: "PeopleSoft", isManual: false },
                { step: "Process payment", actor: "Treasury", system: "PeopleSoft/Bank", isManual: false },
              ],
            },
            {
              functionalArea: "Human Resources",
              interviewee: "David Kim",
              role: "HR Director",
              messages: [
                { role: "assistant", content: "Walk me through your hiring process from requisition to onboarding.", timestamp: new Date().toISOString() },
                { role: "user", content: "It's painful. A hiring manager fills out a paper requisition form, routes it through 3 levels of approval. Then HR posts the job manually on our website and job boards. Applications come in via email. We track candidates in a shared Excel spreadsheet. Background checks are initiated by fax. The whole process from req to start date averages 90 days. We lose good candidates because we're too slow.", timestamp: new Date().toISOString() },
                { role: "assistant", content: "How do you handle employee self-service and benefits enrollment?", timestamp: new Date().toISOString() },
                { role: "user", content: "We don't really have self-service. Employees fill out paper forms for address changes, W-4 updates, benefits changes. HR staff manually keys everything into PeopleSoft. Open enrollment is a nightmare — we print packets for all 11,500 employees. Benefits reconciliation with carriers is a monthly manual process that takes 3 staff members a full week.", timestamp: new Date().toISOString() },
              ],
              findings: {
                keyThemes: ["No applicant tracking system", "Paper-based HR processes", "No employee self-service"],
                systemGaps: ["No ATS integration", "No employee self-service portal", "Manual benefits administration"],
                processMaturity: "Very low — almost entirely paper-based",
              },
              painPoints: [
                { description: "90-day average time-to-hire due to paper requisitions and manual tracking", severity: "critical", frequency: "ongoing", impact: "Losing qualified candidates to faster-moving employers" },
                { description: "No employee self-service for HR transactions", severity: "high", frequency: "daily", impact: "HR staff spends 60% of time on data entry instead of strategic work" },
                { description: "Paper-based benefits enrollment for 11,500 employees", severity: "high", frequency: "annually", impact: "3 weeks of staff time, high error rate, employee dissatisfaction" },
              ],
              processSteps: [
                { step: "Manager submits paper requisition", actor: "Hiring Manager", system: "None", isManual: true },
                { step: "Route through 3 approval levels", actor: "HR/Budget/Executive", system: "Email", isManual: true },
                { step: "Post job on website and boards", actor: "HR Recruiter", system: "Website CMS", isManual: true },
                { step: "Collect applications via email", actor: "HR Recruiter", system: "Email/Excel", isManual: true },
                { step: "Screen candidates in spreadsheet", actor: "HR Recruiter", system: "Excel", isManual: true },
                { step: "Schedule interviews via email", actor: "HR Recruiter", system: "Email/Calendar", isManual: true },
                { step: "Initiate background check by fax", actor: "HR Staff", system: "Fax", isManual: true },
                { step: "Generate offer letter", actor: "HR Staff", system: "Word", isManual: true },
                { step: "Manual onboarding paperwork", actor: "HR Staff", system: "Paper forms", isManual: true },
                { step: "Key new hire data into PeopleSoft", actor: "HR Staff", system: "PeopleSoft", isManual: true },
              ],
            },
            {
              functionalArea: "Procurement",
              interviewee: "Maria Gonzalez",
              role: "Procurement Manager",
              messages: [
                { role: "assistant", content: "Describe your procurement workflow from requisition to purchase order.", timestamp: new Date().toISOString() },
                { role: "user", content: "Departments submit purchase requisitions through PeopleSoft but the approval routing is broken — it was customized years ago and nobody understands the code. So we export reqs to Excel, manually route for approvals via email, then go back into PeopleSoft to create the PO. For contracts over $50K we need board approval which adds 4-6 weeks. We have no visibility into spending by vendor or commodity code without running manual reports.", timestamp: new Date().toISOString() },
                { role: "assistant", content: "How do you manage vendor relationships and contracts?", timestamp: new Date().toISOString() },
                { role: "user", content: "We have about 2,500 active vendors. Contract management is done in a shared drive with Word documents and Excel trackers. There's no automated alerting for contract expirations — last year we had 3 contracts lapse without renewal, causing service disruptions. We also can't easily track insurance certificate compliance. Vendor performance evaluation is ad hoc at best.", timestamp: new Date().toISOString() },
              ],
              findings: {
                keyThemes: ["Broken PeopleSoft customizations", "No contract lifecycle management", "Poor spend visibility"],
                systemGaps: ["Broken approval routing in PeopleSoft", "No CLM system", "No spend analytics"],
                processMaturity: "Low — workarounds for broken system customizations",
              },
              painPoints: [
                { description: "PeopleSoft approval routing broken, requiring manual Excel workaround", severity: "critical", frequency: "daily", impact: "Adds 5-7 days to every purchase requisition" },
                { description: "No contract lifecycle management — 3 contracts lapsed last year", severity: "high", frequency: "ongoing", impact: "Service disruptions and compliance risk" },
                { description: "No spend visibility by vendor or commodity without manual reporting", severity: "medium", frequency: "weekly", impact: "Cannot identify savings opportunities or maverick spending" },
              ],
              processSteps: [
                { step: "Department creates requisition in PeopleSoft", actor: "Department Staff", system: "PeopleSoft", isManual: false },
                { step: "Export requisition to Excel (broken routing)", actor: "Procurement", system: "Excel", isManual: true },
                { step: "Route approval via email with attached Excel", actor: "Procurement", system: "Email", isManual: true },
                { step: "Collect approvals and update Excel tracker", actor: "Procurement", system: "Excel", isManual: true },
                { step: "Create PO in PeopleSoft from approved req", actor: "Buyer", system: "PeopleSoft", isManual: true },
                { step: "Email PO to vendor", actor: "Buyer", system: "Email", isManual: true },
                { step: "Receive goods/services and match to PO", actor: "Department", system: "PeopleSoft", isManual: true },
              ],
            },
          ];

          for (const iv of interviewData) {
            const interview = storage.createDiscoveryInterview({
              projectId: project.id,
              functionalArea: iv.functionalArea,
              interviewee: iv.interviewee,
              role: iv.role,
            });
            storage.updateDiscoveryInterview(interview.id, {
              status: "completed",
              messages: JSON.stringify(iv.messages),
              findings: JSON.stringify(iv.findings),
              painPoints: JSON.stringify(iv.painPoints),
              processSteps: JSON.stringify(iv.processSteps),
            });

            // Also create pain points as standalone records
            for (const pp of iv.painPoints) {
              storage.createPainPoint({
                projectId: project.id,
                sourceInterviewId: interview.id,
                functionalArea: iv.functionalArea,
                description: pp.description,
                severity: pp.severity,
                frequency: pp.frequency,
                impact: pp.impact,
              });
            }
          }
        }

        created.push({ client: client.name, project: project.name, id: project.id });
      }

      logAction(req, "seeded_sample_data", 0, `${created.length} sample clients and projects`);
      res.json({ success: true, created });
    } catch (err: any) {
      console.error("Seed sample data error:", err);
      res.status(500).json({ error: err.message });
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
      change_management: "Change Management & Adoption",
      data_migration: "Data Migration & Conversion",
      testing_quality: "Testing & Quality",
      vendor_performance: "Vendor/SI Performance",
      compliance_security: "Compliance & Security",
      scope_requirements: "Scope & Requirements",
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

  // Generate PDF health check report
  app.get("/api/projects/:id/health-check/report-pdf", async (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const assessments = storage.getHealthCheckAssessments(projectId);
    const raidItems = storage.getRaidItems(projectId);
    const budgetSummary = storage.getBudgetSummary(projectId);
    const scheduleItems = storage.getScheduleEntries(projectId);
    const baseline = storage.getProjectBaseline(projectId);
    const client = project.clientId ? storage.getClient(project.clientId) : undefined;

    const DOMAIN_LABELS: Record<string, string> = {
      governance: "Governance & Oversight", raid: "RAID Log Analysis",
      technical: "Technical Architecture & Quality", budget_schedule: "Budget & Schedule Performance",
      change_management: "Change Management & Adoption", data_migration: "Data Migration & Conversion",
      testing_quality: "Testing & Quality", vendor_performance: "Vendor/SI Performance",
      compliance_security: "Compliance & Security", scope_requirements: "Scope & Requirements",
    };
    const RATING_LABELS: Record<string, string> = {
      critical: "CRITICAL", high: "HIGH RISK", medium: "MEDIUM RISK", low: "LOW RISK", satisfactory: "SATISFACTORY",
    };
    const ratingOrder = ["critical", "high", "medium", "low", "satisfactory"];

    try {
      const PDFDocument = (await import("pdfkit")).default;
      const doc = new PDFDocument({ size: "LETTER", margins: { top: 72, bottom: 72, left: 72, right: 72 }, autoFirstPage: false });

      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => {
        const pdf = Buffer.concat(chunks);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="health_check_${project.name.replace(/[^a-zA-Z0-9]/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf"`);
        res.send(pdf);
      });

      const blue = "#203f90";
      const orange = "#c45819";
      const darkText = "#1a1a2e";
      const gray = "#5a6478";
      const lightGray = "#e8eaed";
      let pageNum = 0;
      let pageW = 612; let pageH = 792; let contentW = 468;

      function newPage() {
        doc.addPage();
        pageNum++;
        pageW = doc.page.width; pageH = doc.page.height; contentW = pageW - 144;
        if (pageNum > 1) {
          doc.save();
          doc.moveTo(72, 56).lineTo(pageW - 72, 56).lineWidth(0.5).strokeColor(lightGray).stroke();
          doc.fontSize(7).font("Helvetica").fillColor(gray);
          doc.text("Avero Advisors", 72, 44, { lineBreak: false });
          doc.text("Health Check Report", pageW - 72 - 150, 44, { width: 150, align: "right", lineBreak: false });
          doc.restore();
        }
        doc.save();
        doc.moveTo(72, pageH - 56).lineTo(pageW - 72, pageH - 56).lineWidth(0.5).strokeColor(lightGray).stroke();
        doc.fontSize(7).fillColor(gray);
        if (pageNum === 1) {
          doc.text("CONFIDENTIAL", 72, pageH - 48, { width: contentW, align: "center", lineBreak: false });
        } else {
          doc.text(project.name, 72, pageH - 48, { lineBreak: false });
          doc.text(`Page ${pageNum}`, pageW - 72 - 60, pageH - 48, { width: 60, align: "right", lineBreak: false });
        }
        doc.restore();
        doc.y = 72;
      }

      const maxY = () => pageH - 90;

      // Ensure enough space, add page if needed. Returns current Y.
      function ensureSpace(needed: number): number {
        if (doc.y + needed > maxY()) { newPage(); doc.y = 72; }
        return doc.y;
      }

      let logoPath = path.resolve("client/public/avero-logo.png");
      if (!fs.existsSync(logoPath)) logoPath = path.resolve("dist/public/avero-logo.png");
      const hasLogo = fs.existsSync(logoPath);
      let clientLogoPath = client?.logoPath ? path.resolve("dist/public" + client.logoPath) : "";
      const hasClientLogo = clientLogoPath && fs.existsSync(clientLogoPath);

      // ========== COVER PAGE ==========
      newPage();
      doc.rect(0, 0, pageW, 280).fill(blue);
      if (hasLogo) { try { doc.image(logoPath, 72, 60, { height: 50 }); } catch {} }
      if (hasClientLogo) { try { doc.image(clientLogoPath, pageW - 72 - 80, 60, { height: 50 }); } catch {} }
      doc.fill("#ffffff").fontSize(32).font("Helvetica-Bold").text("Project Health\nCheck Report", 72, 140, { width: contentW });
      doc.rect(72, 300, 80, 4).fill(orange);
      doc.fill(darkText).fontSize(16).font("Helvetica-Bold").text(project.name, 72, 330, { lineBreak: false });
      if (client) doc.fontSize(13).font("Helvetica").fillColor(gray).text(client.name, 72, 355, { lineBreak: false });
      doc.fontSize(10).font("Helvetica").fillColor(gray);
      doc.text("Prepared by Avero Advisors", 72, 400, { lineBreak: false });
      doc.text(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), 72, 415, { lineBreak: false });
      let coverY = 440;
      if (baseline) {
        if (baseline.contractedAmount) { doc.text(`Contract Value: $${baseline.contractedAmount.toLocaleString()}`, 72, coverY, { lineBreak: false }); coverY += 15; }
        if (baseline.vendorName) { doc.text(`Implementation Vendor: ${baseline.vendorName}`, 72, coverY, { lineBreak: false }); coverY += 15; }
        if (baseline.goLiveDate) {
          const days = Math.ceil((new Date(baseline.goLiveDate).getTime() - Date.now()) / 86400000);
          doc.text(`Go-Live: ${baseline.goLiveDate} (${days > 0 ? days + " days" : Math.abs(days) + " days past"})`, 72, coverY, { lineBreak: false });
        }
      }

      // ========== TABLE OF CONTENTS ==========
      newPage();
      doc.fontSize(20).font("Helvetica-Bold").fillColor(blue).text("Contents", 72, 72, { lineBreak: false });
      doc.rect(72, 100, 50, 3).fill(orange);
      const tocItems = ["Executive Summary", ...assessments.map(a => DOMAIN_LABELS[a.domain] || a.domain), "Top Risks & Issues"];
      let tocY = 120;
      tocItems.forEach((item, i) => {
        doc.fontSize(11).font("Helvetica-Bold").fillColor(darkText).text(`${String(i + 1).padStart(2, "0")}`, 72, tocY, { lineBreak: false });
        doc.fontSize(11).font("Helvetica").fillColor(gray).text(item, 110, tocY, { lineBreak: false });
        tocY += 22;
      });

      // ========== EXECUTIVE SUMMARY ==========
      newPage();
      doc.fontSize(16).font("Helvetica-Bold").fillColor(blue).text("Executive Summary", 72, 72, { lineBreak: false });
      doc.rect(72, 94, 40, 2.5).fill(orange);

      const worstAssessment = assessments.filter(a => a.overallRating).sort((a, b) => ratingOrder.indexOf(a.overallRating!) - ratingOrder.indexOf(b.overallRating!))[0];
      const overallRating = worstAssessment?.overallRating || "not assessed";
      const ratingColor = overallRating === "critical" || overallRating === "high" ? "#dc2626" : overallRating === "medium" ? "#d97706" : overallRating === "satisfactory" ? "#16a34a" : blue;
      const badgeText = (RATING_LABELS[overallRating] || overallRating).toUpperCase();

      doc.fontSize(11).font("Helvetica").fillColor(gray).text("Overall Project Health:", 72, 112, { lineBreak: false });
      doc.rect(72, 130, 150, 26).fill(ratingColor);
      doc.fontSize(13).font("Helvetica-Bold").fillColor("#ffffff").text(badgeText, 82, 136, { lineBreak: false });

      // Quick stats
      const openRisks = raidItems.filter(r => r.status === "open" && r.type === "risk").length;
      const openIssues = raidItems.filter(r => r.status === "open" && r.type === "issue").length;
      const criticalItems = raidItems.filter(r => r.status === "open" && r.severity === "critical").length;
      const delayedMilestones = scheduleItems.filter(s => s.status === "delayed").length;
      const totalAuthorized = (budgetSummary.originalContract || 0) + (budgetSummary.totalChangeOrders || 0) + (budgetSummary.totalAdditionalFunding || 0);
      const spendPct = totalAuthorized > 0 ? Math.round((budgetSummary.totalActualSpend || 0) / totalAuthorized * 100) : 0;

      const statsY = 175;
      const statBox = (x: number, label: string, value: string, sub?: string) => {
        doc.rect(x, statsY, 110, 50).lineWidth(0.5).strokeColor(lightGray).stroke();
        doc.fontSize(18).font("Helvetica-Bold").fillColor(darkText).text(value, x + 10, statsY + 8, { lineBreak: false });
        doc.fontSize(8).font("Helvetica").fillColor(gray).text(label, x + 10, statsY + 30, { lineBreak: false });
        if (sub) doc.fontSize(7).fillColor(orange).text(sub, x + 10, statsY + 40, { lineBreak: false });
      };
      statBox(72, "Open Risks", String(openRisks), criticalItems > 0 ? `${criticalItems} critical` : undefined);
      statBox(192, "Open Issues", String(openIssues));
      statBox(312, "Budget Spent", `${spendPct}%`, `$${(budgetSummary.totalActualSpend || 0).toLocaleString()}`);
      statBox(432, "Milestones", String(scheduleItems.length), delayedMilestones > 0 ? `${delayedMilestones} delayed` : "on track");

      // Domain summary table
      doc.y = statsY + 75;
      doc.fontSize(12).font("Helvetica-Bold").fillColor(darkText).text("Domain Assessment Summary", 72, doc.y, { lineBreak: false });
      doc.y += 25;

      const thY = doc.y;
      doc.rect(72, thY, contentW, 18).fill("#f1f3f5");
      doc.fontSize(8).font("Helvetica-Bold").fillColor(gray);
      doc.text("Domain", 82, thY + 4, { lineBreak: false });
      doc.text("Rating", 270, thY + 4, { lineBreak: false });
      doc.text("Summary", 345, thY + 4, { lineBreak: false });
      doc.y = thY + 22;

      for (const a of assessments) {
        const label = DOMAIN_LABELS[a.domain] || a.domain;
        const rating = a.overallRating || "not rated";
        const rc = rating === "critical" || rating === "high" ? "#dc2626" : rating === "medium" ? "#d97706" : rating === "satisfactory" ? "#16a34a" : blue;

        const summaryText = a.summary || "";
        const summaryH = summaryText ? doc.heightOfString(summaryText, { width: 195, fontSize: 7 }) : 12;
        ensureSpace(Math.max(18, summaryH + 6));

        const rowY = doc.y;
        doc.rect(72, rowY, 4, 12).fill(rc);
        doc.fontSize(9).font("Helvetica").fillColor(darkText).text(label, 82, rowY + 1, { width: 180, lineBreak: false });
        doc.fontSize(8).font("Helvetica-Bold").fillColor(rc).text(rating.toUpperCase(), 270, rowY + 2, { lineBreak: false });
        if (summaryText) doc.fontSize(7).font("Helvetica").fillColor(gray).text(summaryText, 345, rowY + 1, { width: 195 });
        doc.y = rowY + Math.max(18, summaryH + 6);
        doc.moveTo(82, doc.y).lineTo(72 + contentW, doc.y).lineWidth(0.3).strokeColor(lightGray).stroke();
        doc.y += 4;
      }

      // ========== DOMAIN DETAILS ==========
      newPage();
      for (const a of assessments) {
        const label = DOMAIN_LABELS[a.domain] || a.domain;
        const rating = a.overallRating ? (RATING_LABELS[a.overallRating] || a.overallRating) : "Not Rated";
        const rc = a.overallRating === "critical" || a.overallRating === "high" ? "#dc2626" : a.overallRating === "medium" ? "#d97706" : a.overallRating === "satisfactory" ? "#16a34a" : blue;

        ensureSpace(60);

        const hdrY = doc.y;
        doc.rect(72, hdrY, 4, 24).fill(blue);
        doc.fontSize(14).font("Helvetica-Bold").fillColor(darkText).text(label, 84, hdrY + 1, { width: contentW - 100, lineBreak: false });
        doc.fontSize(10).font("Helvetica-Bold").fillColor(rc).text(rating, 72 + contentW - 80, hdrY + 3, { width: 80, align: "right", lineBreak: false });
        doc.y = hdrY + 30;

        if (a.summary) {
          const sumH = doc.heightOfString(a.summary, { width: contentW, fontSize: 9 });
          ensureSpace(sumH + 10);
          doc.fontSize(9).font("Helvetica").fillColor(gray).text(a.summary, 72, doc.y, { width: contentW });
          doc.y += sumH + 8;
        }

        if (a.findings) {
          try {
            const findings = JSON.parse(a.findings);
            if (Array.isArray(findings) && findings.length > 0) {
              ensureSpace(25);
              doc.fontSize(11).font("Helvetica-Bold").fillColor(darkText).text("Findings", 72, doc.y, { lineBreak: false });
              doc.y += 18;

              for (const f of findings) {
                // Pre-calc height
                let estH = 22;
                if (f.finding) estH += doc.heightOfString(f.finding, { width: contentW, fontSize: 9 }) + 4;
                if (f.evidence) estH += doc.heightOfString(`Evidence: ${f.evidence}`, { width: contentW, fontSize: 8 }) + 3;
                if (f.recommendation) estH += doc.heightOfString(`Rec: ${f.recommendation}`, { width: contentW, fontSize: 8 }) + 3;
                ensureSpace(estH);

                const sevColor = f.severity === "critical" ? "#dc2626" : f.severity === "high" ? "#ea580c" : f.severity === "medium" ? "#d97706" : blue;
                doc.rect(72, doc.y, 60, 14).fill(sevColor);
                doc.fontSize(7).font("Helvetica-Bold").fillColor("#ffffff").text((f.severity || "info").toUpperCase(), 76, doc.y + 3, { width: 52, lineBreak: false });
                doc.y += 18;

                if (f.finding) {
                  const fH = doc.heightOfString(f.finding, { width: contentW, fontSize: 9 });
                  doc.fontSize(9).font("Helvetica-Bold").fillColor(darkText).text(f.finding, 72, doc.y, { width: contentW });
                  doc.y += fH + 3;
                }
                if (f.evidence) {
                  const eH = doc.heightOfString(`Evidence: ${f.evidence}`, { width: contentW, fontSize: 8 });
                  doc.fontSize(8).font("Helvetica").fillColor(gray).text(`Evidence: ${f.evidence}`, 72, doc.y, { width: contentW });
                  doc.y += eH + 3;
                }
                if (f.recommendation) {
                  const rH = doc.heightOfString(`Rec: ${f.recommendation}`, { width: contentW, fontSize: 8 });
                  doc.fontSize(8).font("Helvetica").fillColor(orange).text(`Rec: ${f.recommendation}`, 72, doc.y, { width: contentW });
                  doc.y += rH + 3;
                }
                doc.y += 6;
              }
            }
          } catch {}
        }

        doc.y += 5;
        doc.moveTo(72, doc.y).lineTo(72 + contentW, doc.y).lineWidth(0.5).strokeColor(lightGray).stroke();
        doc.y += 15;
      }

      // ========== TOP RISKS & ISSUES ==========
      const topRaids = raidItems.filter(r => r.status === "open" && (r.severity === "critical" || r.severity === "high")).slice(0, 15);
      if (topRaids.length > 0) {
        newPage();
        doc.fontSize(16).font("Helvetica-Bold").fillColor(blue).text("Top Open Risks & Issues", 72, 72, { lineBreak: false });
        doc.rect(72, 94, 40, 2.5).fill(orange);
        doc.y = 110;

        for (const r of topRaids) {
          const descH = r.description ? doc.heightOfString(r.description, { width: contentW - 12, fontSize: 8 }) : 0;
          ensureSpace(22 + descH + 20);

          const sevColor = r.severity === "critical" ? "#dc2626" : "#ea580c";
          const rowY = doc.y;
          doc.rect(72, rowY, 4, 14).fill(sevColor);
          doc.fontSize(8).font("Helvetica-Bold").fillColor(sevColor).text(`${r.type?.toUpperCase()} / ${r.severity?.toUpperCase()}`, 84, rowY + 2, { lineBreak: false });
          doc.fontSize(9).font("Helvetica-Bold").fillColor(darkText).text(r.title || "", 190, rowY + 1, { width: contentW - 118, lineBreak: false });
          doc.y = rowY + 18;

          if (r.description) {
            doc.fontSize(8).font("Helvetica").fillColor(gray).text(r.description, 84, doc.y, { width: contentW - 12 });
            doc.y += descH + 3;
          }
          if (r.owner) { doc.fontSize(8).fillColor(gray).text(`Owner: ${r.owner}`, 84, doc.y, { lineBreak: false }); doc.y += 12; }
          doc.y += 8;
        }
      }

      doc.end();
    } catch (err: any) {
      console.error("PDF generation error:", err);
      res.status(500).json({ error: "Failed to generate PDF: " + err.message });
    }
  });

  // Synthesize unified health assessment from all project data
  app.post("/api/projects/:id/health-check/synthesize", async (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    try {
      const { synthesizeHealthCheck, buildProjectContext } = await import("./ai");
      const projectContext = buildProjectContext(projectId);

      const raidItems = storage.getRaidItems(projectId);
      const budgetEntries = storage.getBudgetEntries(projectId);
      const budgetSummary = storage.getBudgetSummary(projectId);
      const scheduleItems = storage.getScheduleEntries(projectId);
      const documents = storage.getProjectDocuments(projectId);
      const existingAssessments = storage.getHealthCheckAssessments(projectId);

      const result = await synthesizeHealthCheck({
        projectContext,
        raidItems,
        budgetEntries,
        budgetSummary,
        scheduleItems,
        documents,
        existingAssessments,
      });

      // Upsert assessments per domain from synthesis results
      for (const domainResult of (result.domains || [])) {
        const existing = existingAssessments.find(a => a.domain === domainResult.domain);
        const assessmentData = {
          domain: domainResult.domain,
          overallRating: domainResult.rating,
          findings: JSON.stringify(domainResult.findings || []),
          summary: domainResult.summary,
          assessedBy: "AI Synthesis",
        };
        if (existing) {
          if (existing.overallRating && existing.overallRating !== domainResult.rating) {
            storage.createAssessmentHistory({ projectId, domain: domainResult.domain, previousRating: existing.overallRating, newRating: domainResult.rating, changedBy: "AI Synthesis" });
          }
          storage.updateHealthCheckAssessment(existing.id, assessmentData);
        } else {
          storage.createHealthCheckAssessment({ projectId, ...assessmentData });
        }
      }

      logAction(req, "ran_synthesis", projectId, `Overall: ${result.overallHealth}`);
      res.json(result);
    } catch (err: any) {
      console.error("Health check synthesis error:", err);
      res.status(500).json({ error: "Synthesis failed: " + (err.message || "Unknown error") });
    }
  });

  // ==================== ASSESSMENT HISTORY ====================

  app.get("/api/projects/:id/health-check/history", (req, res) => {
    const projectId = parseInt(req.params.id);
    const domain = req.query.domain as string | undefined;
    const history = storage.getAssessmentHistory(projectId, domain);
    res.json(history);
  });

  // ==================== PROJECT BASELINE (CONTRACT/SOW) ====================

  app.get("/api/projects/:id/baseline", (req, res) => {
    const projectId = parseInt(req.params.id);
    const baseline = storage.getProjectBaseline(projectId);
    res.json(baseline || null);
  });

  app.post("/api/projects/:id/baseline", (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const { contractedAmount, goLiveDate, contractStartDate, scopeItems, keyMilestones, vendorName, notes } = req.body;
    const baseline = storage.upsertProjectBaseline(projectId, {
      contractedAmount: contractedAmount ?? null,
      goLiveDate: goLiveDate ?? null,
      contractStartDate: contractStartDate ?? null,
      scopeItems: scopeItems ? (typeof scopeItems === "string" ? scopeItems : JSON.stringify(scopeItems)) : null,
      keyMilestones: keyMilestones ? (typeof keyMilestones === "string" ? keyMilestones : JSON.stringify(keyMilestones)) : null,
      vendorName: vendorName ?? null,
      notes: notes ?? null,
    });
    res.json(baseline);
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

  // Outcomes/Scorecard PDF Report
  app.get("/api/projects/:id/scorecard/report-pdf", async (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const client = project.clientId ? storage.getClient(project.clientId) : undefined;
    const allOutcomes = storage.getOutcomes(projectId);
    const allScenarios = storage.getDemoScenariosByProject(projectId);
    const allScores = storage.getScenarioScores(projectId);
    const settings = storage.getProjectVendorSettings(projectId);
    const selectedVendorIds: number[] = settings ? JSON.parse(settings.selectedVendors) : [];
    const vendors = storage.getVendors().filter(v => selectedVendorIds.includes(v.id));

    try {
      const PDFDocument = (await import("pdfkit")).default;
      const doc = new PDFDocument({ size: "LETTER", margins: { top: 72, bottom: 72, left: 72, right: 72 }, bufferPages: true });

      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => {
        const pdf = Buffer.concat(chunks);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="vendor_scorecard_${project.name.replace(/[^a-zA-Z0-9]/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf"`);
        res.send(pdf);
      });

      const blue = "#203f90";
      const orange = "#c45819";
      const darkText = "#1a1a2e";
      const gray = "#5a6478";
      const lightGray = "#e8eaed";
      const pageW = doc.page.width;
      const pageH = doc.page.height;
      const contentW = pageW - 144;

      let logoPath = path.resolve("client/public/avero-logo.png");
      if (!fs.existsSync(logoPath)) logoPath = path.resolve("dist/public/avero-logo.png");
      const hasLogo = fs.existsSync(logoPath);
      let clientLogoPath = client?.logoPath ? path.resolve("dist/public" + client.logoPath) : "";
      const hasClientLogo = clientLogoPath && fs.existsSync(clientLogoPath);

      // ========== COVER ==========
      doc.rect(0, 0, pageW, 280).fill(blue);
      if (hasLogo) { try { doc.image(logoPath, 72, 60, { height: 50 }); } catch {} }
      if (hasClientLogo) { try { doc.image(clientLogoPath, pageW - 72 - 80, 60, { height: 50 }); } catch {} }
      doc.fill("#ffffff").fontSize(32).font("Helvetica-Bold").text("Vendor Evaluation\nScorecard", 72, 140, { width: contentW });
      doc.rect(72, 300, 80, 4).fill(orange);
      doc.fill(darkText).fontSize(16).font("Helvetica-Bold").text(project.name, 72, 330, { width: contentW });
      if (client) doc.fontSize(13).font("Helvetica").fillColor(gray).text(client.name, 72, 355);
      doc.fontSize(10).font("Helvetica").fillColor(gray).text("Prepared by Avero Advisors", 72, 400);
      doc.text(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), 72, 415);
      doc.fontSize(8).fillColor(gray).text("CONFIDENTIAL", 72, pageH - 80, { width: contentW, align: "center" });

      // ========== OUTCOMES OVERVIEW ==========
      doc.addPage();
      doc.fontSize(20).font("Helvetica-Bold").fillColor(blue).text("Strategic Outcomes", 72, 72);
      doc.rect(72, 100, 50, 3).fill(orange);
      doc.y = 115;

      for (const o of allOutcomes) {
        if (doc.y > 650) doc.addPage();
        const oY = doc.y;
        doc.rect(72, oY, 4, 14).fill(o.priority === "critical" ? "#dc2626" : o.priority === "high" ? "#ea580c" : o.priority === "medium" ? "#d97706" : blue);
        doc.fontSize(10).font("Helvetica-Bold").fillColor(darkText).text(o.title, 84, oY + 1, { width: contentW - 80 });
        doc.fontSize(8).font("Helvetica-Bold").fillColor(o.priority === "critical" ? "#dc2626" : orange).text(o.priority.toUpperCase(), 72 + contentW - 60, oY + 2, { width: 60, align: "right" });
        doc.y = oY + 18;
        if (o.description) {
          doc.fontSize(8).font("Helvetica").fillColor(gray).text(o.description, 84, doc.y, { width: contentW - 12 });
          doc.moveDown(0.2);
        }
        if (o.currentKpi && o.targetKpi) {
          doc.fontSize(8).fillColor(gray).text(`KPI: ${o.currentKpi} → ${o.targetKpi} ${o.kpiUnit || ""}`, 84);
        }
        doc.moveDown(0.8);
      }

      // ========== SCORECARD MATRIX ==========
      if (vendors.length > 0 && allOutcomes.length > 0) {
        doc.addPage();
        doc.fontSize(20).font("Helvetica-Bold").fillColor(blue).text("Vendor Scorecard", 72, 72);
        doc.rect(72, 100, 50, 3).fill(orange);
        doc.y = 115;

        const priorityWeight: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
        const colW = Math.min(70, (contentW - 200) / vendors.length);

        // Header
        const hY = doc.y;
        doc.rect(72, hY, contentW, 20).fill("#f1f3f5");
        doc.fontSize(8).font("Helvetica-Bold").fillColor(gray).text("Outcome", 82, hY + 5, { width: 150 });
        doc.text("Pri", 235, hY + 5, { width: 30 });
        vendors.forEach((v, i) => {
          doc.text(v.shortName || v.name.substring(0, 8), 270 + i * colW, hY + 5, { width: colW, align: "center" });
        });
        doc.y = hY + 24;

        const vendorTotals: Record<number, { sum: number; weight: number }> = {};
        vendors.forEach(v => { vendorTotals[v.id] = { sum: 0, weight: 0 }; });

        for (const o of allOutcomes) {
          if (doc.y > 700) doc.addPage();
          const rY = doc.y;
          doc.fontSize(8).font("Helvetica").fillColor(darkText).text(o.title.substring(0, 40), 82, rY + 2, { width: 150 });
          doc.fontSize(7).fillColor(gray).text(o.priority.substring(0, 4), 235, rY + 3, { width: 30 });

          const scenarios = allScenarios.filter(s => s.outcomeId === o.id);
          vendors.forEach((v, i) => {
            const scores = allScores.filter(s => scenarios.some(sc => sc.id === s.scenarioId) && s.vendorId === v.id);
            const avg = scores.length > 0 ? scores.reduce((s, sc) => s + (sc.overallScore || 0), 0) / scores.length : 0;
            const color = avg >= 4 ? "#16a34a" : avg >= 3 ? "#d97706" : avg > 0 ? "#dc2626" : gray;
            doc.fontSize(9).font("Helvetica-Bold").fillColor(avg > 0 ? color : gray).text(avg > 0 ? avg.toFixed(1) : "—", 270 + i * colW, rY + 2, { width: colW, align: "center" });
            if (avg > 0) {
              const w = priorityWeight[o.priority] || 2;
              vendorTotals[v.id].sum += avg * w;
              vendorTotals[v.id].weight += w;
            }
          });

          doc.y = rY + 16;
          doc.moveTo(82, doc.y).lineTo(72 + contentW, doc.y).lineWidth(0.3).strokeColor(lightGray).stroke();
          doc.y += 3;
        }

        // Totals row
        doc.moveDown(0.5);
        const tY = doc.y;
        doc.rect(72, tY, contentW, 22).fill("#f1f3f5");
        doc.fontSize(9).font("Helvetica-Bold").fillColor(darkText).text("Weighted Total", 82, tY + 5);
        vendors.forEach((v, i) => {
          const t = vendorTotals[v.id];
          const avg = t.weight > 0 ? t.sum / t.weight : 0;
          const color = avg >= 4 ? "#16a34a" : avg >= 3 ? "#d97706" : avg > 0 ? "#dc2626" : gray;
          doc.fontSize(11).font("Helvetica-Bold").fillColor(color).text(avg > 0 ? avg.toFixed(1) : "—", 270 + i * colW, tY + 4, { width: colW, align: "center" });
        });
        doc.y = tY + 30;

        doc.fontSize(8).fillColor(gray).text("Priority weighting: Critical (4x) | High (3x) | Medium (2x) | Low (1x)", 72);
      }

      // ========== VENDOR RANKING ==========
      // Compute unified evaluation inline
      const evaluation = storage.calculateEvaluation(projectId);
      if (vendors.length > 0) {
        if (doc.y > 550) doc.addPage();
        doc.moveDown(2);
        doc.fontSize(16).font("Helvetica-Bold").fillColor(blue).text("Unified Vendor Ranking");
        doc.rect(72, doc.y + 4, 40, 2.5).fill(orange);
        doc.moveDown(1);
        doc.fontSize(8).fillColor(gray).text("Combined: 60% requirements matrix + 40% outcome evaluation");
        doc.moveDown(0.8);

        const ranked = vendors.map(v => {
          const ev = evaluation.vendors.find((e: any) => e.vendorId === v.id);
          const reqPct = ev ? Math.round((ev.weightedScore / (ev.maxPossibleScore || 1)) * 100) : 0;
          let outWeightedSum = 0, outWeightTotal = 0;
          for (const o of allOutcomes) {
            const scenarios = allScenarios.filter(s => s.outcomeId === o.id);
            const scores = allScores.filter(s => scenarios.some(sc => sc.id === s.scenarioId) && s.vendorId === v.id);
            const avg = scores.length > 0 ? scores.reduce((s, sc) => s + (sc.overallScore || 0), 0) / scores.length : 0;
            if (avg > 0) { const w = ({ critical: 4, high: 3, medium: 2, low: 1 } as any)[o.priority] || 2; outWeightedSum += avg * w; outWeightTotal += w; }
          }
          const outPct = outWeightTotal > 0 ? Math.round((outWeightedSum / outWeightTotal / 5) * 100) : null;
          const combined = outPct !== null ? Math.round(reqPct * 0.6 + outPct * 0.4) : reqPct;
          return { name: v.name, reqPct, outPct, combined };
        }).sort((a, b) => b.combined - a.combined);

        ranked.forEach((v, i) => {
          if (doc.y > 700) doc.addPage();
          const rY = doc.y;
          const color = v.combined >= 80 ? "#16a34a" : v.combined >= 60 ? "#d97706" : "#dc2626";
          // Rank circle
          doc.circle(84, rY + 8, 10).fill(i === 0 ? orange : lightGray);
          doc.fontSize(10).font("Helvetica-Bold").fillColor(i === 0 ? "#ffffff" : darkText).text(String(i + 1), 78, rY + 3, { width: 12, align: "center" });
          doc.fontSize(11).font("Helvetica-Bold").fillColor(darkText).text(v.name, 102, rY + 2, { width: 200 });
          doc.fontSize(8).font("Helvetica").fillColor(gray).text(`Req: ${v.reqPct}%${v.outPct !== null ? `  |  Out: ${v.outPct}%` : ""}`, 102, rY + 16);
          doc.fontSize(16).font("Helvetica-Bold").fillColor(color).text(`${v.combined}%`, 72 + contentW - 60, rY + 4, { width: 60, align: "right" });
          doc.y = rY + 32;
        });
      }

      // ========== HEADERS & FOOTERS ==========
      const pageCount = doc.bufferedPageRange().count;
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        if (i > 0) {
          doc.moveTo(72, 56).lineTo(pageW - 72, 56).lineWidth(0.5).strokeColor(lightGray).stroke();
          doc.fontSize(7).font("Helvetica").fillColor(gray);
          doc.text("Avero Advisors", 72, 44, { width: contentW / 2 });
          doc.text("Vendor Scorecard", pageW / 2, 44, { width: contentW / 2, align: "right" });
        }
        doc.moveTo(72, pageH - 56).lineTo(pageW - 72, pageH - 56).lineWidth(0.5).strokeColor(lightGray).stroke();
        doc.fontSize(7).fillColor(gray);
        if (i === 0) doc.text("CONFIDENTIAL", 72, pageH - 48, { width: contentW, align: "center" });
        else { doc.text(project.name, 72, pageH - 48); doc.text(`Page ${i + 1} of ${pageCount}`, 72, pageH - 48, { width: contentW, align: "right" }); }
      }

      doc.end();
    } catch (err: any) {
      console.error("Scorecard PDF error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ==================== PROCESS DESCRIPTIONS ====================

  app.get("/api/projects/:id/processes", (req, res) => {
    res.json(storage.getProcessDescriptions(parseInt(req.params.id)));
  });

  app.post("/api/projects/:id/processes", (req, res) => {
    const process = storage.createProcessDescription({ projectId: parseInt(req.params.id), ...req.body });
    res.json(process);
  });

  app.post("/api/projects/:id/processes/generate", async (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const interviews = storage.getDiscoveryInterviews(projectId);
    const completedInterviews = interviews.filter(i => i.status === "completed" || i.status === "in_progress");
    if (completedInterviews.length === 0) return res.status(400).json({ error: "No completed interviews found." });

    const painPoints = storage.getPainPoints(projectId);
    const orgProfile = storage.getOrgProfile(projectId) || (project.clientId ? storage.getClient(project.clientId) : null);

    try {
      const { generateProcessDescriptions } = await import("./ai");
      const result = await generateProcessDescriptions(completedInterviews, painPoints, orgProfile);

      const created = [];
      for (const p of result.processes) {
        // Find source interview IDs by functional area
        const sourceIds = completedInterviews.filter(i => i.functionalArea === p.functionalArea).map(i => i.id);
        const proc = storage.createProcessDescription({
          projectId, functionalArea: p.functionalArea, processName: p.processName,
          description: p.description, currentSteps: p.currentSteps,
          currentSystems: p.currentSystems, currentActors: p.currentActors,
          avgDuration: p.avgDuration, frequency: p.frequency,
          mermaidDiagram: p.mermaidDiagram, swimlaneDiagram: p.swimlaneDiagram,
          sourceInterviewIds: sourceIds,
        });
        created.push(proc);

        // Auto-create pain points from process steps
        if (Array.isArray(p.currentSteps)) {
          for (const step of p.currentSteps) {
            if (step.painPoints && Array.isArray(step.painPoints)) {
              for (const pp of step.painPoints) {
                if (pp && typeof pp === "string" && pp.trim()) {
                  // Check if similar pain point already exists
                  const existing = painPoints.find(ep => ep.description?.toLowerCase().includes(pp.toLowerCase().substring(0, 20)));
                  if (!existing) {
                    storage.createPainPoint({
                      projectId, functionalArea: p.functionalArea,
                      description: pp, severity: "medium",
                      sourceInterviewId: sourceIds[0] || null,
                    });
                  }
                }
              }
            }
          }
        }
      }

      logAction(req, "generated_processes", projectId, `${created.length} processes from ${completedInterviews.length} interviews`);
      res.json({ processes: created, count: created.length });
    } catch (err: any) {
      console.error("Process generation error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/processes/:id", (req, res) => {
    const updated = storage.updateProcessDescription(parseInt(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: "Process not found" });
    res.json(updated);
  });

  app.delete("/api/processes/:id", (req, res) => {
    storage.deleteProcessDescription(parseInt(req.params.id));
    res.json({ success: true });
  });

  // ==================== OUTCOMES & SCENARIOS ====================

  app.get("/api/projects/:id/outcomes", (req, res) => {
    res.json(storage.getOutcomes(parseInt(req.params.id)));
  });

  app.post("/api/projects/:id/outcomes", (req, res) => {
    const outcome = storage.createOutcome({ projectId: parseInt(req.params.id), ...req.body });
    res.json(outcome);
  });

  app.patch("/api/outcomes/:outcomeId", (req, res) => {
    const updated = storage.updateOutcome(parseInt(req.params.outcomeId), req.body);
    if (!updated) return res.status(404).json({ error: "Outcome not found" });
    res.json(updated);
  });

  app.delete("/api/outcomes/:outcomeId", (req, res) => {
    storage.deleteOutcome(parseInt(req.params.outcomeId));
    res.json({ success: true });
  });

  // AI: Generate outcomes from pain points
  app.post("/api/projects/:id/outcomes/generate", async (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const painPoints = storage.getPainPoints(projectId);
    if (painPoints.length === 0) return res.status(400).json({ error: "No pain points found. Complete discovery interviews first." });

    const orgProfile = storage.getOrgProfile(projectId) || (project.clientId ? storage.getClient(project.clientId) : null);

    try {
      const { generateOutcomes } = await import("./ai");
      const result = await generateOutcomes(painPoints, orgProfile);

      const created = [];
      for (const o of result.outcomes) {
        // Map source indexes to actual pain point IDs
        const ppIds = (o.sourcePainPointIndexes || []).map((idx: number) => painPoints[idx - 1]?.id).filter(Boolean);
        const outcome = storage.createOutcome({
          projectId, title: o.title, description: o.description, category: o.category || "general",
          sourcePainPointIds: JSON.stringify(ppIds),
          currentState: o.currentState, targetState: o.targetState,
          currentKpi: o.currentKpi, targetKpi: o.targetKpi, kpiUnit: o.kpiUnit,
          priority: o.priority || "high",
        });
        created.push(outcome);
      }
      // Auto-map outcomes to requirements
      const requirements = storage.getRequirements(projectId);
      if (requirements.length > 0 && created.length > 0) {
        try {
          const { mapOutcomesToRequirements } = await import("./ai");
          const mapping = await mapOutcomesToRequirements(
            created.map(o => ({ id: o.id, title: o.title, description: o.description, category: o.category })),
            requirements.map(r => ({ id: r.id, reqNumber: r.reqNumber, functionalArea: r.functionalArea, description: r.description, category: r.category }))
          );
          for (const [outcomeId, reqIds] of Object.entries(mapping)) {
            if (reqIds.length > 0) {
              storage.updateOutcome(parseInt(outcomeId as string), { linkedRequirementIds: JSON.stringify(reqIds) });
            }
          }
        } catch (mapErr: any) {
          console.error("Outcome-requirement mapping error:", mapErr.message);
        }
      }

      logAction(req, "generated_outcomes", projectId, `${created.length} outcomes from ${painPoints.length} pain points`);
      // Re-fetch to include linked requirements
      const final = storage.getOutcomes(projectId);
      res.json({ outcomes: final, count: created.length });
    } catch (err: any) {
      console.error("Outcome generation error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Scenarios CRUD
  app.get("/api/outcomes/:outcomeId/scenarios", (req, res) => {
    res.json(storage.getDemoScenarios(parseInt(req.params.outcomeId)));
  });

  app.get("/api/projects/:id/scenarios", (req, res) => {
    res.json(storage.getDemoScenariosByProject(parseInt(req.params.id)));
  });

  app.post("/api/outcomes/:outcomeId/scenarios", (req, res) => {
    const outcome = storage.getOutcome(parseInt(req.params.outcomeId));
    if (!outcome) return res.status(404).json({ error: "Outcome not found" });
    const scenario = storage.createDemoScenario({ projectId: outcome.projectId, outcomeId: outcome.id, ...req.body });
    res.json(scenario);
  });

  app.patch("/api/scenarios/:scenarioId", (req, res) => {
    const updated = storage.updateDemoScenario(parseInt(req.params.scenarioId), req.body);
    if (!updated) return res.status(404).json({ error: "Scenario not found" });
    res.json(updated);
  });

  app.delete("/api/scenarios/:scenarioId", (req, res) => {
    storage.deleteDemoScenario(parseInt(req.params.scenarioId));
    res.json({ success: true });
  });

  // AI: Generate scenarios for an outcome
  app.post("/api/outcomes/:outcomeId/scenarios/generate", async (req, res) => {
    const outcome = storage.getOutcome(parseInt(req.params.outcomeId));
    if (!outcome) return res.status(404).json({ error: "Outcome not found" });

    const project = storage.getProject(outcome.projectId);
    const orgProfile = storage.getOrgProfile(outcome.projectId) || (project?.clientId ? storage.getClient(project.clientId) : null);

    try {
      const { generateDemoScenarios } = await import("./ai");
      const result = await generateDemoScenarios(outcome, orgProfile);

      const created = [];
      for (const s of result.scenarios) {
        const scenario = storage.createDemoScenario({
          projectId: outcome.projectId, outcomeId: outcome.id, title: s.title,
          narrative: s.narrative, setupInstructions: s.setupInstructions,
          walkthrough: s.walkthrough, successCriteria: s.successCriteria,
          estimatedMinutes: s.estimatedMinutes || 15, functionalArea: s.functionalArea || outcome.category,
        });
        created.push(scenario);
      }
      logAction(req, "generated_scenarios", outcome.projectId, `${created.length} scenarios for "${outcome.title}"`);
      res.json({ scenarios: created, count: created.length });
    } catch (err: any) {
      console.error("Scenario generation error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Scenario Scores
  app.get("/api/projects/:id/scenario-scores", (req, res) => {
    const vendorId = req.query.vendorId ? parseInt(req.query.vendorId as string) : undefined;
    res.json(storage.getScenarioScores(parseInt(req.params.id), vendorId));
  });

  app.post("/api/scenario-scores", (req, res) => {
    // Upsert
    const existing = storage.getScenarioScore(req.body.scenarioId, req.body.vendorId);
    if (existing) {
      const updated = storage.updateScenarioScore(existing.id, req.body);
      return res.json(updated);
    }
    const score = storage.createScenarioScore(req.body);
    res.json(score);
  });

  app.patch("/api/scenario-scores/:id", (req, res) => {
    const updated = storage.updateScenarioScore(parseInt(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: "Score not found" });
    res.json(updated);
  });

  app.delete("/api/scenario-scores/:id", (req, res) => {
    storage.deleteScenarioScore(parseInt(req.params.id));
    res.json({ success: true });
  });

  // Vendor KB context for a scenario
  app.get("/api/scenarios/:scenarioId/vendor-context/:vendorId", (req, res) => {
    const scenario = storage.getDemoScenario(parseInt(req.params.scenarioId));
    if (!scenario) return res.status(404).json({ error: "Scenario not found" });
    const outcome = storage.getOutcome(scenario.outcomeId);
    const vendor = storage.getVendors().find(v => v.id === parseInt(req.params.vendorId));
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    const capabilities = storage.getVendorCapabilities({ platform: vendor.shortName?.toLowerCase() });
    const processDetails = storage.getProcessDetails({ platform: vendor.shortName?.toLowerCase(), module: scenario.functionalArea || outcome?.category });

    // Build context
    const capSummary = capabilities.filter(c =>
      c.module?.toLowerCase().includes((scenario.functionalArea || outcome?.category || "").toLowerCase()) ||
      c.processArea?.toLowerCase().includes((scenario.functionalArea || outcome?.category || "").toLowerCase())
    ).map(c => {
      let s = `${c.processArea || c.module}: ${c.workflowDescription || ""}`;
      if (c.maturityRating) s += ` (Maturity: ${c.maturityRating}/5)`;
      if (c.automationLevel) s += ` [${c.automationLevel}]`;
      try { const d = JSON.parse(c.differentiators || "[]"); if (d.length) s += ` | Strengths: ${d.join(", ")}`; } catch {}
      try { const l = JSON.parse(c.limitations || "[]"); if (l.length) s += ` | Limitations: ${l.join(", ")}`; } catch {}
      return s;
    });

    const detailSummary = processDetails.map(d =>
      `${d.reqReference || ""}: ${d.capability} [${d.score || "?"}] — ${d.howHandled || ""}`
    );

    res.json({
      vendorName: vendor.name,
      vendorPlatform: vendor.shortName,
      capabilities: capSummary,
      processDetails: detailSummary,
      hasData: capSummary.length > 0 || detailSummary.length > 0,
    });
  });

  // Auto-suggest scores from Knowledge Base
  app.post("/api/projects/:id/scenario-scores/auto-suggest", async (req, res) => {
    const projectId = parseInt(req.params.id);
    const { vendorId } = req.body;
    if (!vendorId) return res.status(400).json({ error: "vendorId required" });

    const vendor = storage.getVendors().find(v => v.id === vendorId);
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    const allScenarios = storage.getDemoScenariosByProject(projectId);
    const allOutcomes = storage.getOutcomes(projectId);
    const capabilities = storage.getVendorCapabilities({ platform: vendor.shortName?.toLowerCase() });
    const processDetails = storage.getProcessDetails({ platform: vendor.shortName?.toLowerCase() });

    const suggested: any[] = [];

    for (const scenario of allScenarios) {
      // Check if already scored
      const existing = storage.getScenarioScore(scenario.id, vendorId);
      if (existing) continue; // Don't overwrite manual scores

      const outcome = allOutcomes.find(o => o.id === scenario.outcomeId);
      const area = (scenario.functionalArea || outcome?.category || "").toLowerCase();

      // Find relevant capabilities
      const relevantCaps = capabilities.filter(c =>
        c.module?.toLowerCase().includes(area) ||
        c.processArea?.toLowerCase().includes(area)
      );

      // Find relevant process details with scores
      const relevantDetails = processDetails.filter(d =>
        d.module?.toLowerCase().includes(area)
      );

      // Calculate suggested scores from KB data
      let processFit = 3, automationLevel = 3, configComplexity = 3, userExperience = 3, dataVisibility = 3;

      if (relevantCaps.length > 0) {
        // Use average maturity rating as base
        const avgMaturity = relevantCaps.filter(c => c.maturityRating).reduce((s, c) => s + (c.maturityRating || 3), 0) / Math.max(relevantCaps.filter(c => c.maturityRating).length, 1);
        processFit = Math.round(avgMaturity);
        userExperience = Math.round(avgMaturity);
        dataVisibility = Math.round(avgMaturity);

        // Check automation levels
        const autoLevels = relevantCaps.map(c => c.automationLevel).filter(Boolean);
        if (autoLevels.includes("fully_automated")) automationLevel = 5;
        else if (autoLevels.includes("semi_automated")) automationLevel = 4;
        else if (autoLevels.includes("configurable")) automationLevel = 3;
        else if (autoLevels.includes("manual")) automationLevel = 2;

        // Config complexity from bestFitFor/limitations
        const hasLimitations = relevantCaps.some(c => {
          try { return JSON.parse(c.limitations || "[]").length > 2; } catch { return false; }
        });
        configComplexity = hasLimitations ? 3 : 4;
      }

      if (relevantDetails.length > 0) {
        // Use S/F/C/T/N scores to adjust
        const scoreMap: Record<string, number> = { S: 5, F: 4, C: 3, T: 2, N: 1 };
        const detailScores = relevantDetails.map(d => scoreMap[d.score || "C"] || 3);
        const avgDetail = Math.round(detailScores.reduce((a, b) => a + b, 0) / detailScores.length);
        processFit = Math.round((processFit + avgDetail) / 2);
        configComplexity = Math.round((configComplexity + avgDetail) / 2);
      }

      // Clamp all values 1-5
      const clamp = (v: number) => Math.max(1, Math.min(5, v));
      const dims = { processFit: clamp(processFit), automationLevel: clamp(automationLevel), configComplexity: clamp(configComplexity), userExperience: clamp(userExperience), dataVisibility: clamp(dataVisibility) };
      const overall = Math.round(Object.values(dims).reduce((a, b) => a + b, 0) / 5);

      const score = storage.createScenarioScore({
        projectId, scenarioId: scenario.id, vendorId,
        ...dims, overallScore: overall,
        evaluatedBy: "KB Auto-Suggest",
      });
      suggested.push(score);
    }

    logAction(req, "auto_suggested_scores", projectId, `${suggested.length} scores for ${vendor.name} from KB`);
    res.json({ suggested: suggested.length, vendorName: vendor.name });
  });

  // Outcome Scorecard (computed)
  app.get("/api/projects/:id/outcome-scorecard", (req, res) => {
    const projectId = parseInt(req.params.id);
    const allOutcomes = storage.getOutcomes(projectId);
    const allScenarios = storage.getDemoScenariosByProject(projectId);
    const allScores = storage.getScenarioScores(projectId);
    const allVendors = storage.getVendors();
    const settings = storage.getProjectVendorSettings(projectId);
    const selectedVendorIds: number[] = settings ? JSON.parse(settings.selectedVendors) : [];
    const vendors = allVendors.filter(v => selectedVendorIds.includes(v.id));

    const priorityWeight: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

    const outcomeResults = allOutcomes.map(o => {
      const scenarios = allScenarios.filter(s => s.outcomeId === o.id);
      const vendorResults = vendors.map(v => {
        const scores = allScores.filter(s => scenarios.some(sc => sc.id === s.scenarioId) && s.vendorId === v.id);
        const avg = (field: string) => {
          const vals = scores.map(s => (s as any)[field]).filter(Boolean);
          return vals.length > 0 ? Math.round(vals.reduce((a: number, b: number) => a + b, 0) / vals.length * 10) / 10 : null;
        };
        return {
          vendorId: v.id, vendorName: v.name,
          avgProcessFit: avg("processFit"), avgAutomation: avg("automationLevel"),
          avgConfigComplexity: avg("configComplexity"), avgUX: avg("userExperience"),
          avgDataVisibility: avg("dataVisibility"), avgOverall: avg("overallScore"),
          scenariosScored: scores.length,
        };
      });
      return {
        id: o.id, title: o.title, category: o.category, priority: o.priority,
        targetKpi: o.targetKpi, currentKpi: o.currentKpi, kpiUnit: o.kpiUnit,
        scenarioCount: scenarios.length, vendors: vendorResults,
      };
    });

    const vendorTotals = vendors.map(v => {
      let weightedSum = 0, weightTotal = 0, scored = 0, total = 0;
      for (const o of outcomeResults) {
        const vr = o.vendors.find(vv => vv.vendorId === v.id);
        if (vr?.avgOverall) {
          const w = priorityWeight[o.priority] || 2;
          weightedSum += vr.avgOverall * w;
          weightTotal += w;
        }
        scored += vr?.scenariosScored || 0;
        total += o.scenarioCount;
      }
      return {
        vendorId: v.id, vendorName: v.name,
        weightedAvg: weightTotal > 0 ? Math.round(weightedSum / weightTotal * 10) / 10 : null,
        totalScenariosScored: scored, totalScenarios: total,
      };
    });

    res.json({ outcomes: outcomeResults, vendorTotals });
  });

  // Unified evaluation: combines requirements matrix + outcome scores
  app.get("/api/projects/:id/unified-evaluation", (req, res) => {
    const projectId = parseInt(req.params.id);
    const evaluation = storage.calculateEvaluation(projectId);
    const allOutcomes = storage.getOutcomes(projectId);
    const allScenarios = storage.getDemoScenariosByProject(projectId);
    const allScores = storage.getScenarioScores(projectId);
    const settings = storage.getProjectVendorSettings(projectId);
    const selectedVendorIds: number[] = settings ? JSON.parse(settings.selectedVendors) : [];
    const allVendors = storage.getVendors().filter(v => selectedVendorIds.includes(v.id));

    const priorityWeight: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

    const vendorResults = allVendors.map(v => {
      // Requirements matrix score (from existing evaluation)
      const evalVendor = evaluation.vendors.find((ev: any) => ev.vendorId === v.id);
      const reqScore = evalVendor?.weightedScore || 0;
      const reqMaxScore = evalVendor?.maxPossibleScore || 1;
      const reqPct = Math.round((reqScore / reqMaxScore) * 100);

      // Outcome score
      let outcomeWeightedSum = 0, outcomeWeightTotal = 0;
      for (const o of allOutcomes) {
        const scenarios = allScenarios.filter(s => s.outcomeId === o.id);
        const scores = allScores.filter(s => scenarios.some(sc => sc.id === s.scenarioId) && s.vendorId === v.id);
        const avgOverall = scores.length > 0
          ? scores.reduce((sum, s) => sum + (s.overallScore || 0), 0) / scores.length
          : 0;
        if (avgOverall > 0) {
          const w = priorityWeight[o.priority] || 2;
          outcomeWeightedSum += avgOverall * w;
          outcomeWeightTotal += w;
        }
      }
      const outcomePct = outcomeWeightTotal > 0 ? Math.round((outcomeWeightedSum / outcomeWeightTotal / 5) * 100) : null;

      // Combined score (60% requirements, 40% outcomes — if outcomes exist)
      let combinedPct = reqPct;
      if (outcomePct !== null) {
        combinedPct = Math.round(reqPct * 0.6 + outcomePct * 0.4);
      }

      return {
        vendorId: v.id, vendorName: v.name, vendorShortName: v.shortName,
        requirementScore: reqPct,
        outcomeScore: outcomePct,
        combinedScore: combinedPct,
        reqDetails: { score: reqScore, maxScore: reqMaxScore, responseBreakdown: evalVendor?.responseBreakdown },
        outcomeDetails: {
          totalOutcomes: allOutcomes.length,
          scoredOutcomes: allOutcomes.filter(o => {
            const scenarios = allScenarios.filter(s => s.outcomeId === o.id);
            return allScores.some(s => scenarios.some(sc => sc.id === s.scenarioId) && s.vendorId === v.id);
          }).length,
        },
      };
    }).sort((a, b) => b.combinedScore - a.combinedScore);

    res.json({
      vendors: vendorResults,
      weights: { requirements: 60, outcomes: 40 },
      hasOutcomeScores: allScores.length > 0,
    });
  });

  // ==================== HEALTH CHECK DOCUMENT UPLOAD & ANALYSIS ====================

  const docUploadMulter = multer({ dest: os.tmpdir(), limits: { fileSize: 50 * 1024 * 1024 } });

  // Get all documents for a project
  app.get("/api/projects/:id/documents", (req, res) => {
    const projectId = parseInt(req.params.id);
    const documentType = req.query.documentType as string | undefined;
    res.json(storage.getProjectDocuments(projectId, documentType));
  });

  // Upload a document with server-side text extraction (supports PDF, DOCX, XLSX, PPTX, CSV, TXT)
  app.post("/api/projects/:id/documents/upload", docUploadMulter.single("file"), async (req, res) => {
    const projectId = parseInt(req.params.id);
    const file = req.file;
    const documentType = req.body.documentType || "other";
    const period = req.body.period || null;

    if (!file) return res.status(400).json({ error: "No file uploaded" });

    let rawText = "";
    const ext = file.originalname.split(".").pop()?.toLowerCase();

    try {
      const filePath = file.path;
      const fileBuffer = fs.readFileSync(filePath);

      if (ext === "txt" || ext === "csv" || ext === "md" || ext === "json") {
        rawText = fileBuffer.toString("utf-8");
      } else if (ext === "pdf") {
        const { PDFParse } = require("pdf-parse");
        const pdfParser = new PDFParse(new Uint8Array(fileBuffer));
        const pdfResult = await pdfParser.getText();
        rawText = pdfResult.pages ? pdfResult.pages.map((p: any) => p.text).join("\n\n") : "";
      } else if (ext === "docx" || ext === "doc") {
        const mammoth = require("mammoth");
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        rawText = result.value;
      } else if (ext === "xlsx" || ext === "xls") {
        const workbook = XLSX.read(fileBuffer, { type: "buffer" });
        const sheets: string[] = [];
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          sheets.push(`=== Sheet: ${sheetName} ===\n` + XLSX.utils.sheet_to_csv(sheet));
        }
        rawText = sheets.join("\n\n");
      } else if (ext === "pptx" || ext === "ppt") {
        try {
          const jszipMod = require("jszip");
          const JSZip = typeof jszipMod === "function" ? jszipMod : jszipMod.default;
          const zip = await JSZip.loadAsync(fileBuffer);
          const slideTexts: string[] = [];
          const slideFiles = Object.keys(zip.files).filter(f => f.match(/ppt\/slides\/slide\d+\.xml/)).sort();
          for (const slidePath of slideFiles) {
            const xml = await zip.files[slidePath].async("text");
            const textMatches = xml.match(/<a:t>([^<]*)<\/a:t>/g) || [];
            const slideText = textMatches.map(m => m.replace(/<[^>]+>/g, "")).join(" ");
            if (slideText.trim()) slideTexts.push(slideText);
          }
          rawText = slideTexts.join("\n\n");
        } catch {
          rawText = "Unable to parse PPTX content";
        }
      } else {
        rawText = fileBuffer.toString("utf-8").substring(0, 50000);
      }

      // Clean up temp file
      try { fs.unlinkSync(filePath); } catch {}

      const doc = storage.createProjectDocument({
        projectId,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        documentType,
        rawText: rawText.substring(0, 100000),
        period,
        source: "upload",
        analysisStatus: "pending",
      });

      logAction(req, "uploaded_document", parseInt(req.params.id), doc.fileName);
      res.json(doc);
    } catch (err: any) {
      console.error("File extraction error:", err);
      try { if (file?.path) fs.unlinkSync(file.path); } catch {}
      res.status(500).json({ error: `Failed to extract text from ${ext} file: ${err.message}` });
    }
  });

  // Upload a document (text provided directly — for pasted content)
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

      // Auto-apply extracted items if not already applied
      const projectId = parseInt(req.params.id);
      if (!doc.appliedAt) {
        try {
          const items = { raids: analysis.raids, budgetItems: analysis.budgetItems, scheduleItems: analysis.scheduleItems, findings: analysis.findings };
          const applied = { raids: 0, budgetItems: 0, scheduleItems: 0, findings: 0 };

          for (const raid of (items.raids || [])) {
            storage.createRaidItem({ projectId, type: raid.type || "risk", title: raid.title, description: raid.description || null, severity: raid.severity || "medium", status: raid.status || "open", owner: raid.owner || null, dueDate: raid.dueDate || null, sourceDocId: docId });
            applied.raids++;
          }
          // Only apply actual_spend and change_order from documents — original_contract comes from contract baseline
          for (const budget of (items.budgetItems || [])) {
            const cat = budget.category || "actual_spend";
            if (cat === "original_contract" || cat === "additional_funding") continue;
            storage.createBudgetEntry({ projectId, category: cat, description: budget.description, amount: budget.amount || 0, date: budget.date || null, notes: budget.notes || null, sourceDocId: docId });
            applied.budgetItems++;
          }
          for (const sched of (items.scheduleItems || [])) {
            storage.createScheduleEntry({ projectId, milestone: sched.milestone, originalDate: sched.originalDate || null, currentDate: sched.currentDate || null, status: sched.status || "on_track", varianceDays: sched.varianceDays || null, notes: sched.notes || null, sourceDocId: docId });
            applied.scheduleItems++;
          }

          // Upsert assessments from findings
          const existingAssessments = storage.getHealthCheckAssessments(projectId);
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
            const existing = existingAssessments.find(a => a.domain === domain);
            if (existing && !(existing as any).isManual) {
              let existingFindings: any[] = [];
              try { existingFindings = existing.findings ? JSON.parse(existing.findings) : []; } catch {}
              const mergedFindings = [...existingFindings, ...findings];
              storage.updateHealthCheckAssessment(existing.id, {
                overallRating: worstSeverity,
                findings: JSON.stringify(mergedFindings),
                summary: mergedFindings.map((f: any) => f.finding).join(". "),
                assessedBy: `AI Analysis - ${doc.fileName}`,
              });
            } else if (!existing) {
              storage.createHealthCheckAssessment({
                projectId, domain, overallRating: worstSeverity,
                findings: JSON.stringify(findings),
                summary: findings.map((f: any) => f.finding).join(". "),
                assessedBy: `AI Analysis - ${doc.fileName}`,
              });
            }
            applied.findings += findings.length;
          }

          storage.updateProjectDocument(docId, { appliedAt: new Date().toISOString() });
          logAction(req, "auto_applied_document", projectId, `${doc.fileName}: ${applied.raids} RAID, ${applied.budgetItems} budget, ${applied.scheduleItems} schedule, ${applied.findings} findings`);
        } catch (applyErr: any) {
          console.error("Auto-apply error:", applyErr.message);
        }

        // Auto-extract contract data for SOW/contract documents
        if (doc.documentType === "sow_contract") {
          try {
            const { extractContractData } = await import("./ai");
            const contractData = await extractContractData(doc.rawText!);
            console.log("Contract data extracted:", JSON.stringify(contractData).substring(0, 500));
            const existingContracts = storage.getContractBaselines(projectId);
            if (existingContracts.length === 0) {
              let baseline: any;
              try {
                baseline = storage.createContractBaseline({
                  projectId, vendorId: null,
                  contractName: contractData.contractName || doc.fileName,
                  contractDate: contractData.contractDate || null, totalValue: contractData.totalValue || null,
                  startDate: contractData.startDate || null, endDate: contractData.endDate || null,
                  sourceDocument: doc.fileName,
                  notes: [contractData.vendorName ? `Vendor: ${contractData.vendorName}` : "", contractData.notes || ""].filter(Boolean).join("\n") || null,
                });
                console.log("Contract baseline created:", baseline.id);
              } catch (blErr: any) {
                console.error("createContractBaseline error:", blErr.message);
                throw blErr;
              }
              if (contractData.deliverables?.length > 0) {
                try {
                  storage.createDeliverablesBulk(contractData.deliverables.map((d: any) => ({
                    baselineId: baseline.id, category: d.category || "documentation", name: d.name || "Unnamed deliverable",
                    description: d.description || null, dueDate: d.dueDate || null,
                    status: "pending", priority: d.priority || "medium", contractReference: d.contractReference || null,
                  })));
                  console.log("Created", contractData.deliverables.length, "deliverables");
                } catch (delErr: any) {
                  console.error("createDeliverablesBulk error:", delErr.message);
                }
              }
              if (contractData.milestones?.length > 0) {
                try {
                  for (const m of contractData.milestones) {
                    storage.createCheckpoint({ baselineId: baseline.id, name: m.name || "Unnamed milestone", phase: m.phase || "planning", scheduledDate: m.scheduledDate || null, status: "pending" });
                  }
                  console.log("Created", contractData.milestones.length, "milestones");
                } catch (cpErr: any) {
                  console.error("createCheckpoint error:", cpErr.message);
                }
              }
              // Also set health check baseline
              try {
                const existingHcBaseline = storage.getProjectBaseline(projectId);
                if (!existingHcBaseline && contractData.totalValue) {
                  storage.upsertProjectBaseline(projectId, {
                    contractedAmount: parseInt(String(contractData.totalValue).replace(/\D/g, "")) || 0,
                    goLiveDate: contractData.endDate || null,
                    contractStartDate: contractData.startDate || null,
                    vendorName: contractData.vendorName || null,
                    notes: `Auto-extracted from ${doc.fileName}`,
                  });
                  console.log("Project baseline created");
                }
              } catch (pbErr: any) {
                console.error("upsertProjectBaseline error:", pbErr.message);
              }
              logAction(req, "auto_extracted_contract", projectId, `${baseline.contractName}: ${contractData.deliverables?.length || 0} deliverables, ${contractData.milestones?.length || 0} milestones`);
            }
          } catch (contractErr: any) {
            console.error("Auto-contract extraction error:", contractErr.message);
          }
        }

        // Auto-synthesize
        try {
          const { synthesizeHealthCheck, buildProjectContext: bpc } = await import("./ai");
          const ctx = bpc(projectId);
          const raidItems = storage.getRaidItems(projectId);
          const budgetEntries = storage.getBudgetEntries(projectId);
          const budgetSummaryData = storage.getBudgetSummary(projectId);
          const scheduleItemsData = storage.getScheduleEntries(projectId);
          const documents = storage.getProjectDocuments(projectId);
          const existingAssessments2 = storage.getHealthCheckAssessments(projectId);

          const result = await synthesizeHealthCheck({
            projectContext: ctx, raidItems, budgetEntries, budgetSummary: budgetSummaryData,
            scheduleItems: scheduleItemsData, documents, existingAssessments: existingAssessments2,
          });

          for (const domainResult of (result.domains || [])) {
            const existing = existingAssessments2.find(a => a.domain === domainResult.domain);
            if (existing && !(existing as any).isManual) {
              storage.updateHealthCheckAssessment(existing.id, {
                domain: domainResult.domain, overallRating: domainResult.rating,
                findings: JSON.stringify(domainResult.findings || []),
                summary: domainResult.summary, assessedBy: "AI Synthesis",
              });
            } else if (!existing) {
              storage.createHealthCheckAssessment({ projectId, domain: domainResult.domain, overallRating: domainResult.rating, findings: JSON.stringify(domainResult.findings || []), summary: domainResult.summary, assessedBy: "AI Synthesis" });
            }
          }
          logAction(req, "auto_synthesized", projectId, `Overall: ${result.overallHealth}`);
        } catch (synthErr: any) {
          console.error("Auto-synthesize error:", synthErr.message);
        }

        // Auto-assess IVV checkpoints if contract exists
        try {
          const contracts = storage.getContractBaselines(projectId);
          if (contracts.length > 0) {
            const checkpoints = storage.getCheckpoints(contracts[0].id);
            const pendingCheckpoints = checkpoints.filter(cp => cp.status !== "completed");
            if (pendingCheckpoints.length > 0) {
              const { assessCheckpoint, buildProjectContext: bpc2 } = await import("./ai");
              const projectContext2 = bpc2(projectId);
              const hcAssessments2 = storage.getHealthCheckAssessments(projectId);
              const raidItems2 = storage.getRaidItems(projectId);
              const scheduleItems2 = storage.getScheduleEntries(projectId);
              const documents2 = storage.getProjectDocuments(projectId);

              for (const cp of pendingCheckpoints) {
                try {
                  const cpResult = await assessCheckpoint({
                    checkpointName: cp.name, checkpointPhase: cp.phase,
                    projectContext: projectContext2, assessments: hcAssessments2,
                    raidItems: raidItems2, scheduleItems: scheduleItems2, documents: documents2,
                  });
                  if (cpResult.dimensions.length > 0) {
                    storage.saveCheckpointAssessment(cp.id, cpResult.dimensions);
                  }
                  storage.updateCheckpoint(cp.id, {
                    overallAssessment: cpResult.overallAssessment,
                    recommendations: cpResult.recommendations,
                    findings: cpResult.findings,
                    status: "completed",
                  });
                  console.log(`Auto-assessed checkpoint: ${cp.name}`);
                } catch (cpErr: any) {
                  console.error(`Auto-assess checkpoint ${cp.name} error:`, cpErr.message);
                }
              }
              logAction(req, "auto_assessed_checkpoints", projectId, `${pendingCheckpoints.length} checkpoints assessed`);
            }
          }
        } catch (ivvErr: any) {
          console.error("Auto-assess IVV error:", ivvErr.message);
        }
      }

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
    if (doc.appliedAt) return res.status(409).json({ error: "Items from this document have already been applied", appliedAt: doc.appliedAt });

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

    // Only apply actual_spend and change_order — original_contract comes from contract baseline
    for (const budget of (items.budgetItems || [])) {
      const cat = budget.category || "actual_spend";
      if (cat === "original_contract" || cat === "additional_funding") continue;
      storage.createBudgetEntry({
        projectId,
        category: cat,
        description: budget.description,
        amount: budget.amount || 0,
        date: budget.date || null,
        notes: budget.notes || null,
      });
      applied.budgetItems++;
    }

    // Apply schedule items
    for (const sched of (items.scheduleItems || [])) {
      storage.createScheduleEntry({
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

    // Apply findings as assessments (upsert — append to existing, don't create duplicates)
    const existingAssessments = storage.getHealthCheckAssessments(projectId);
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

      const existing = existingAssessments.find(a => a.domain === domain);
      if (existing) {
        // Append new findings to existing ones
        let existingFindings: any[] = [];
        try { existingFindings = existing.findings ? JSON.parse(existing.findings) : []; } catch {}
        const mergedFindings = [...existingFindings, ...findings];
        // Recalculate worst severity across all findings
        const mergedWorst = mergedFindings.reduce((worst: string, f: any) => {
          const order = ["critical", "high", "medium", "low", "satisfactory"];
          return order.indexOf(f.severity) < order.indexOf(worst) ? f.severity : worst;
        }, "satisfactory");
        const previousRating = existing.overallRating;
        storage.updateHealthCheckAssessment(existing.id, {
          overallRating: mergedWorst,
          findings: JSON.stringify(mergedFindings),
          summary: mergedFindings.map((f: any) => f.finding).join(". "),
          assessedBy: `AI Analysis - ${doc.fileName}`,
        });
        // Record history if rating changed
        if (previousRating && previousRating !== mergedWorst) {
          storage.createAssessmentHistory({ projectId, domain, previousRating, newRating: mergedWorst, changedBy: `Apply - ${doc.fileName}` });
        }
      } else {
        storage.createHealthCheckAssessment({
          projectId,
          domain,
          overallRating: worstSeverity,
          findings: JSON.stringify(findings),
          summary: findings.map((f: any) => f.finding).join(". "),
          assessedBy: `AI Analysis - ${doc.fileName}`,
        });
      }
      applied.findings += findings.length;
    }

    // Mark document as applied to prevent duplicate applies
    storage.updateProjectDocument(docId, { appliedAt: new Date().toISOString() });

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
    const user = getUserFromReq(req); if (user && user.role === "viewer") return res.status(403).json({ error: "Edit access required" });
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
      { vendorPlatform: "workday", sourceType: "press_release", name: "Workday Newsroom", url: "https://newsroom.workday.com" },
      { vendorPlatform: "workday", sourceType: "roadmap", name: "Workday Product Roadmap", url: "https://community.workday.com/products" },
      { vendorPlatform: "workday", sourceType: "blog", name: "Workday Blog", url: "https://blog.workday.com" },
      // Oracle Cloud ERP
      { vendorPlatform: "oracle_cloud", sourceType: "release_notes", name: "Oracle Cloud Release Readiness", url: "https://www.oracle.com/webfolder/technetwork/tutorials/tutorial/cloud/r13/wn/erp/releases/erp-wn.htm" },
      { vendorPlatform: "oracle_cloud", sourceType: "press_release", name: "Oracle Newsroom", url: "https://www.oracle.com/news" },
      { vendorPlatform: "oracle_cloud", sourceType: "roadmap", name: "Oracle Cloud Roadmap", url: "https://www.oracle.com/erp/cloud-roadmap/" },
      { vendorPlatform: "oracle_cloud", sourceType: "blog", name: "Oracle Applications Blog", url: "https://blogs.oracle.com/applications" },
      // Tyler Technologies
      { vendorPlatform: "tyler", sourceType: "press_release", name: "Tyler Press Releases", url: "https://www.tylertech.com/about/news-press" },
      { vendorPlatform: "tyler", sourceType: "product_page", name: "Tyler Munis ERP", url: "https://www.tylertech.com/products/munis" },
      { vendorPlatform: "tyler", sourceType: "blog", name: "Tyler Blog", url: "https://www.tylertech.com/resources/blog" },
      // IBM Maximo
      { vendorPlatform: "maximo", sourceType: "release_notes", name: "Maximo What's New", url: "https://www.ibm.com/docs/en/mas-cd/maximo-manage/continuous-delivery?topic=new" },
      { vendorPlatform: "maximo", sourceType: "press_release", name: "IBM Newsroom", url: "https://newsroom.ibm.com/search?q=maximo" },
      { vendorPlatform: "maximo", sourceType: "roadmap", name: "Maximo Roadmap", url: "https://www.ibm.com/products/maximo/roadmap" },
      // NV5 / Cityworks
      { vendorPlatform: "nv5", sourceType: "press_release", name: "NV5 Press Releases", url: "https://www.nv5.com/news" },
      { vendorPlatform: "nv5", sourceType: "product_page", name: "Cityworks Product Updates", url: "https://www.cityworks.com/products" },
      // SAP
      { vendorPlatform: "sap", sourceType: "release_notes", name: "SAP S/4HANA What's New", url: "https://help.sap.com/whats-new/cf0cb2cb149647329b5d02aa96303f56" },
      { vendorPlatform: "sap", sourceType: "press_release", name: "SAP News Center", url: "https://news.sap.com" },
      { vendorPlatform: "sap", sourceType: "roadmap", name: "SAP Product Roadmap", url: "https://roadmaps.sap.com/board?PRODUCT=42F2E964FAAF1EDA9FF753E1C5D5028E" },
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

      // Save changes with deduplication
      const existingChanges = storage.getVendorChanges({ vendorPlatform: source.vendorPlatform, limit: 100 });
      const savedChanges = [];
      for (const change of aiChanges) {
        // Skip duplicates — check if same title or very similar summary already exists
        const isDuplicate = existingChanges.some((ec: any) =>
          ec.title?.toLowerCase() === change.title?.toLowerCase() ||
          (ec.summary && change.summary && ec.summary.substring(0, 80).toLowerCase() === change.summary.substring(0, 80).toLowerCase())
        );
        if (isDuplicate) continue;

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
