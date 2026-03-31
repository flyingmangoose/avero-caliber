import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { templateRequirements, CATEGORIES, MODULE_PREFIXES } from "@shared/templates";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

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

  // ==================== BULK ADD FROM TEMPLATE ====================

  app.post("/api/projects/:id/requirements/bulk", (req, res) => {
    const projectId = parseInt(req.params.id);
    const project = storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const { functionalArea } = req.body;
    if (!functionalArea) {
      return res.status(400).json({ error: "functionalArea is required" });
    }

    // Get template requirements for this module
    const templates = templateRequirements.filter(
      t => t.functionalArea === functionalArea
    );
    if (templates.length === 0) {
      return res.status(404).json({ error: "No templates found for this module" });
    }

    // Get existing requirements for this module to determine next number
    const existingReqs = storage.getRequirements(projectId, { functionalArea });
    const prefix = MODULE_PREFIXES[functionalArea] || "XX";

    // Find highest existing number for this prefix
    let maxNum = 0;
    for (const r of existingReqs) {
      const match = r.reqNumber.match(/[A-Z]{2}(\d+)/);
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
    res.status(201).json(created);
  });

  // ==================== TEMPLATES ====================

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

  return httpServer;
}
