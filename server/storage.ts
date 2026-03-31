import {
  type Project, type InsertProject, projects,
  type Requirement, type InsertRequirement, requirements,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and, like, sql, desc } from "drizzle-orm";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

// Create tables if not exist
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS requirements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    req_number TEXT NOT NULL,
    category TEXT NOT NULL,
    functional_area TEXT NOT NULL,
    sub_category TEXT NOT NULL,
    description TEXT NOT NULL,
    criticality TEXT NOT NULL DEFAULT 'Critical',
    vendor_response TEXT,
    comments TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
`);
// Enable foreign keys
sqlite.pragma("foreign_keys = ON");

export interface IStorage {
  // Projects
  getProjects(): Project[];
  getProject(id: number): Project | undefined;
  createProject(data: InsertProject): Project;
  updateProject(id: number, data: Partial<InsertProject>): Project | undefined;
  deleteProject(id: number): void;

  // Requirements
  getRequirements(projectId: number, filters?: {
    category?: string;
    functionalArea?: string;
    criticality?: string;
    search?: string;
  }): Requirement[];
  getRequirement(id: number): Requirement | undefined;
  createRequirement(data: InsertRequirement): Requirement;
  updateRequirement(id: number, data: Partial<InsertRequirement>): Requirement | undefined;
  deleteRequirement(id: number): void;
  bulkCreateRequirements(reqs: InsertRequirement[]): Requirement[];

  // Stats
  getProjectStats(projectId: number): {
    totalRequirements: number;
    criticalCount: number;
    desiredCount: number;
    moduleCoverage: number;
    responseStats: Record<string, number>;
  };
}

export class DatabaseStorage implements IStorage {
  getProjects(): Project[] {
    return db.select().from(projects).orderBy(desc(projects.updatedAt)).all();
  }

  getProject(id: number): Project | undefined {
    return db.select().from(projects).where(eq(projects.id, id)).get();
  }

  createProject(data: InsertProject): Project {
    const now = new Date().toISOString();
    return db.insert(projects).values({
      ...data,
      createdAt: now,
      updatedAt: now,
    }).returning().get();
  }

  updateProject(id: number, data: Partial<InsertProject>): Project | undefined {
    const now = new Date().toISOString();
    return db.update(projects)
      .set({ ...data, updatedAt: now })
      .where(eq(projects.id, id))
      .returning().get();
  }

  deleteProject(id: number): void {
    // Delete requirements first (cascade doesn't always work with drizzle)
    db.delete(requirements).where(eq(requirements.projectId, id)).run();
    db.delete(projects).where(eq(projects.id, id)).run();
  }

  getRequirements(projectId: number, filters?: {
    category?: string;
    functionalArea?: string;
    criticality?: string;
    search?: string;
  }): Requirement[] {
    const conditions = [eq(requirements.projectId, projectId)];

    if (filters?.category) {
      conditions.push(eq(requirements.category, filters.category));
    }
    if (filters?.functionalArea) {
      conditions.push(eq(requirements.functionalArea, filters.functionalArea));
    }
    if (filters?.criticality) {
      conditions.push(eq(requirements.criticality, filters.criticality));
    }
    if (filters?.search) {
      conditions.push(like(requirements.description, `%${filters.search}%`));
    }

    return db.select().from(requirements)
      .where(and(...conditions))
      .orderBy(requirements.reqNumber)
      .all();
  }

  getRequirement(id: number): Requirement | undefined {
    return db.select().from(requirements).where(eq(requirements.id, id)).get();
  }

  createRequirement(data: InsertRequirement): Requirement {
    const now = new Date().toISOString();
    return db.insert(requirements).values({
      ...data,
      createdAt: now,
    }).returning().get();
  }

  updateRequirement(id: number, data: Partial<InsertRequirement>): Requirement | undefined {
    return db.update(requirements)
      .set(data)
      .where(eq(requirements.id, id))
      .returning().get();
  }

  deleteRequirement(id: number): void {
    db.delete(requirements).where(eq(requirements.id, id)).run();
  }

  bulkCreateRequirements(reqs: InsertRequirement[]): Requirement[] {
    const now = new Date().toISOString();
    const results: Requirement[] = [];
    for (const req of reqs) {
      const created = db.insert(requirements).values({
        ...req,
        createdAt: now,
      }).returning().get();
      results.push(created);
    }
    return results;
  }

  getProjectStats(projectId: number): {
    totalRequirements: number;
    criticalCount: number;
    desiredCount: number;
    moduleCoverage: number;
    responseStats: Record<string, number>;
  } {
    const allReqs = db.select().from(requirements)
      .where(eq(requirements.projectId, projectId)).all();

    const criticalCount = allReqs.filter(r => r.criticality === "Critical").length;
    const modules = new Set(allReqs.map(r => r.functionalArea));

    const responseStats: Record<string, number> = { S: 0, F: 0, C: 0, T: 0, N: 0 };
    for (const req of allReqs) {
      if (req.vendorResponse && responseStats[req.vendorResponse] !== undefined) {
        responseStats[req.vendorResponse]++;
      }
    }

    return {
      totalRequirements: allReqs.length,
      criticalCount,
      desiredCount: allReqs.length - criticalCount,
      moduleCoverage: modules.size,
      responseStats,
    };
  }
}

export const storage = new DatabaseStorage();
