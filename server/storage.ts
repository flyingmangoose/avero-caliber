import {
  type Project, type InsertProject, projects,
  type Requirement, type InsertRequirement, requirements,
  type Vendor, type InsertVendor, vendors,
  type ProjectVendorSettings, type InsertProjectVendorSettings, projectVendorSettings,
  type VendorRequirementScore, type InsertVendorRequirementScore, vendorRequirementScores,
  type WorkshopLink, workshopLinks,
  type WorkshopFeedback, workshopFeedback,
  type CustomCriteria, customCriteria,
  type CustomCriteriaScore, customCriteriaScores,
  type ChatMessage, chatMessages,
  type VendorIntelligence, vendorIntelligence,
  type ContractBaseline, contractBaselines,
  type ContractDeliverable, contractDeliverables,
  type ComplianceEvidence, complianceEvidence,
  type IvvCheckpoint, ivvCheckpoints,
  type Deviation, deviations,
  type PulseReport, pulseReports,
  type CheckpointAssessment, checkpointAssessments,
  type GoLiveScorecard, goLiveScorecard,
  type IntegrationConnection, integrationConnections,
  type SyncLog, syncLogs,
  type HealthCheckAssessment, healthCheckAssessments,
  type RaidItem, raidItems,
  type BudgetTracking, budgetTracking,
  type ScheduleTracking, scheduleTracking,
  type VendorCapability, vendorCapabilities,
  type VendorProcessDetail, vendorProcessDetails,
  type OrgProfile, orgProfile,
  type DiscoveryInterview, discoveryInterviews,
  type DiscoveryPainPoint, discoveryPainPoints,
  type ProcessTransformation, processTransformations,
  type Client, clients,
  type ProjectDocument, projectDocuments,
  type MonitoringSource, monitoringSources,
  type MonitoringRun, monitoringRuns,
  type VendorChange, vendorChanges,
  type MonitoringAlert, monitoringAlerts,
  type ProjectBaseline, projectBaselines,
  type AssessmentHistory, assessmentHistory,
  type User, users,
  type ProjectMember, projectMembers,
  type InvitedEmail, invitedEmails,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and, or, like, sql, desc, inArray } from "drizzle-orm";
import { vendorProfiles, defaultModuleWeights, getVendorModuleRating, generateVendorResponse } from "@shared/vendors";
import { templateRequirements } from "@shared/templates";
import { sampleRfpScores } from "@shared/portland-scores";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

// Create tables if not exist
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    google_id TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    picture TEXT,
    role TEXT DEFAULT 'viewer',
    is_active INTEGER DEFAULT 1,
    last_login_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS invited_emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    invited_by INTEGER,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS project_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'viewer',
    added_by INTEGER,
    created_at TEXT NOT NULL,
    UNIQUE(project_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    domain TEXT,
    entity_type TEXT,
    state TEXT,
    population INTEGER,
    employee_count INTEGER,
    annual_budget TEXT,
    current_systems TEXT,
    departments TEXT,
    pain_summary TEXT,
    leadership TEXT,
    documents TEXT,
    description TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT
  );

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
  CREATE TABLE IF NOT EXISTS vendors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    short_name TEXT NOT NULL,
    description TEXT NOT NULL,
    market TEXT NOT NULL,
    strengths TEXT NOT NULL,
    weaknesses TEXT NOT NULL,
    module_ratings TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#1a2744',
    platform_type TEXT NOT NULL DEFAULT 'erp',
    covered_modules TEXT NOT NULL DEFAULT '[]'
  );
  CREATE TABLE IF NOT EXISTS project_vendor_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    module_weights TEXT NOT NULL,
    selected_vendors TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS vendor_requirement_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    requirement_id INTEGER NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
    vendor_id INTEGER NOT NULL REFERENCES vendors(id),
    score TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS workshop_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    stakeholder_name TEXT NOT NULL,
    stakeholder_email TEXT NOT NULL DEFAULT '',
    modules TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT,
    is_active INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS workshop_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workshop_link_id INTEGER NOT NULL REFERENCES workshop_links(id) ON DELETE CASCADE,
    requirement_id INTEGER NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
    criticality TEXT,
    comment TEXT NOT NULL DEFAULT '',
    flagged_for_discussion INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS custom_criteria (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    weight INTEGER NOT NULL DEFAULT 5,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS custom_criteria_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    criteria_id INTEGER NOT NULL REFERENCES custom_criteria(id) ON DELETE CASCADE,
    vendor_id INTEGER NOT NULL REFERENCES vendors(id),
    score INTEGER NOT NULL,
    notes TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS vendor_intelligence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    vendor_id INTEGER NOT NULL REFERENCES vendors(id),
    dimension TEXT NOT NULL,
    score INTEGER,
    summary TEXT,
    evidence TEXT,
    concerns TEXT,
    source_document TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS contract_baselines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    vendor_id INTEGER,
    contract_name TEXT NOT NULL,
    contract_date TEXT,
    total_value TEXT,
    start_date TEXT,
    end_date TEXT,
    source_document TEXT,
    notes TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS contract_deliverables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    baseline_id INTEGER NOT NULL REFERENCES contract_baselines(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    due_date TEXT,
    status TEXT NOT NULL DEFAULT 'not_started',
    priority TEXT NOT NULL DEFAULT 'standard',
    contract_reference TEXT,
    notes TEXT,
    completed_date TEXT,
    external_id TEXT,
    external_url TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS compliance_evidence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deliverable_id INTEGER NOT NULL REFERENCES contract_deliverables(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    file_name TEXT,
    file_content TEXT,
    assessment_result TEXT,
    assessor_notes TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ivv_checkpoints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    baseline_id INTEGER NOT NULL REFERENCES contract_baselines(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phase TEXT NOT NULL,
    scheduled_date TEXT,
    completed_date TEXT,
    status TEXT NOT NULL DEFAULT 'upcoming',
    overall_assessment TEXT,
    recommendations TEXT,
    findings TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS deviations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    baseline_id INTEGER NOT NULL REFERENCES contract_baselines(id) ON DELETE CASCADE,
    deliverable_id INTEGER,
    severity TEXT NOT NULL,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    contract_reference TEXT,
    actual_delivery TEXT,
    impact TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    resolution TEXT,
    escalation_due TEXT,
    escalation_status TEXT DEFAULT 'pending',
    escalated_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS integration_connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    contract_id INTEGER REFERENCES contract_baselines(id),
    platform TEXT NOT NULL,
    name TEXT NOT NULL,
    config TEXT NOT NULL,
    field_mapping TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    last_sync_at TEXT,
    last_sync_status TEXT,
    last_sync_message TEXT,
    sync_item_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sync_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    connection_id INTEGER NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    items_synced INTEGER DEFAULT 0,
    items_created INTEGER DEFAULT 0,
    items_updated INTEGER DEFAULT 0,
    items_skipped INTEGER DEFAULT 0,
    errors TEXT,
    duration INTEGER,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS pulse_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    baseline_id INTEGER NOT NULL REFERENCES contract_baselines(id) ON DELETE CASCADE,
    overall_posture TEXT NOT NULL,
    posture_trend TEXT,
    narrative TEXT NOT NULL,
    risk_highlights TEXT,
    milestone_status TEXT,
    decision_items TEXT,
    metrics TEXT,
    week_ending TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS checkpoint_assessments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    checkpoint_id INTEGER NOT NULL REFERENCES ivv_checkpoints(id) ON DELETE CASCADE,
    dimension TEXT NOT NULL,
    rating TEXT NOT NULL,
    observation TEXT,
    evidence TEXT,
    recommendation TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS go_live_scorecard (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    baseline_id INTEGER NOT NULL REFERENCES contract_baselines(id) ON DELETE CASCADE,
    criteria TEXT NOT NULL,
    overall_score INTEGER,
    overall_readiness TEXT,
    assessor_notes TEXT,
    assessed_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS health_check_assessments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    domain TEXT NOT NULL,
    overall_rating TEXT,
    findings TEXT,
    summary TEXT,
    assessed_by TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS raid_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    severity TEXT,
    status TEXT DEFAULT 'open',
    owner TEXT,
    due_date TEXT,
    resolution TEXT,
    si_reported INTEGER DEFAULT 0,
    si_discrepancy TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS budget_tracking (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    amount INTEGER NOT NULL,
    date TEXT,
    notes TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS schedule_tracking (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    milestone TEXT NOT NULL,
    original_date TEXT,
    current_date TEXT,
    actual_date TEXT,
    status TEXT DEFAULT 'on_track',
    variance_days INTEGER,
    notes TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS assessment_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    domain TEXT NOT NULL,
    previous_rating TEXT NOT NULL,
    new_rating TEXT NOT NULL,
    changed_by TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS project_baselines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    contracted_amount INTEGER,
    go_live_date TEXT,
    contract_start_date TEXT,
    scope_items TEXT,
    key_milestones TEXT,
    vendor_name TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS vendor_capabilities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor_platform TEXT NOT NULL,
    module TEXT NOT NULL,
    process_area TEXT NOT NULL,
    workflow_description TEXT,
    differentiators TEXT,
    limitations TEXT,
    best_fit_for TEXT,
    integration_notes TEXT,
    automation_level TEXT,
    maturity_rating INTEGER,
    source_documents TEXT,
    last_updated TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS vendor_process_details (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor_platform TEXT NOT NULL,
    module TEXT NOT NULL,
    req_reference TEXT,
    capability TEXT NOT NULL,
    how_handled TEXT,
    score TEXT,
    source_vendor TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS org_profile (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    entity_type TEXT,
    entity_name TEXT,
    state TEXT,
    population INTEGER,
    employee_count INTEGER,
    annual_budget TEXT,
    current_systems TEXT,
    departments TEXT,
    pain_summary TEXT,
    domain TEXT,
    leadership TEXT,
    documents TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS discovery_interviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    functional_area TEXT NOT NULL,
    status TEXT DEFAULT 'not_started',
    interviewee TEXT,
    role TEXT,
    messages TEXT,
    findings TEXT,
    pain_points TEXT,
    process_steps TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS discovery_pain_points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    source_interview_id INTEGER,
    functional_area TEXT NOT NULL,
    description TEXT NOT NULL,
    severity TEXT,
    frequency TEXT,
    impact TEXT,
    current_workaround TEXT,
    stakeholder_priority INTEGER,
    linked_requirements TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS process_transformations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    functional_area TEXT NOT NULL,
    vendor_platform TEXT NOT NULL,
    current_step_count INTEGER,
    current_manual_steps INTEGER,
    current_systems INTEGER,
    current_processing_time TEXT,
    current_pain_points INTEGER,
    current_description TEXT,
    current_steps TEXT,
    future_step_count INTEGER,
    future_manual_steps INTEGER,
    future_systems INTEGER,
    future_processing_time TEXT,
    future_description TEXT,
    future_steps TEXT,
    improvements TEXT,
    eliminated_steps TEXT,
    new_capabilities TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS project_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER,
    client_id INTEGER,
    file_name TEXT NOT NULL,
    file_size INTEGER,
    mime_type TEXT,
    document_type TEXT NOT NULL,
    source TEXT DEFAULT 'upload',
    raw_text TEXT,
    ai_analysis TEXT,
    analysis_status TEXT DEFAULT 'pending',
    extracted_items TEXT,
    applied_at TEXT,
    period TEXT,
    uploaded_by TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS monitoring_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor_platform TEXT NOT NULL,
    source_type TEXT NOT NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    check_frequency TEXT DEFAULT 'daily',
    last_checked_at TEXT,
    last_content_hash TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS monitoring_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    content_hash TEXT,
    raw_content_preview TEXT,
    changes_detected INTEGER DEFAULT 0,
    error_message TEXT,
    duration_ms INTEGER,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS vendor_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL,
    vendor_platform TEXT NOT NULL,
    change_type TEXT NOT NULL,
    severity TEXT DEFAULT 'medium',
    title TEXT NOT NULL,
    summary TEXT,
    details TEXT,
    affected_modules TEXT,
    source_url TEXT,
    raw_excerpt TEXT,
    reviewed INTEGER DEFAULT 0,
    reviewed_by TEXT,
    reviewed_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS monitoring_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    change_id INTEGER NOT NULL,
    alert_type TEXT NOT NULL,
    priority TEXT DEFAULT 'medium',
    title TEXT NOT NULL,
    message TEXT,
    is_dismissed INTEGER DEFAULT 0,
    dismissed_by TEXT,
    dismissed_at TEXT,
    created_at TEXT NOT NULL
  );
`);

// Safe column additions (ignored if already exists)
try { sqlite.exec(`ALTER TABLE projects ADD COLUMN engagement_mode TEXT DEFAULT 'consulting'`); } catch {}
try { sqlite.exec(`ALTER TABLE projects ADD COLUMN created_by INTEGER`); } catch {}

// Enable foreign keys
sqlite.pragma("foreign_keys = ON");

// Seed vendor data if not present
function seedVendors() {
  const existing = db.select().from(vendors).all();
  if (existing.length > 0) return; // already seeded

  for (const vp of vendorProfiles) {
    db.insert(vendors).values({
      name: vp.name,
      shortName: vp.shortName,
      description: vp.description,
      market: vp.market,
      strengths: JSON.stringify(vp.strengths),
      weaknesses: JSON.stringify(vp.weaknesses),
      moduleRatings: JSON.stringify(vp.moduleRatings),
      color: vp.color,
      platformType: vp.platformType,
      coveredModules: JSON.stringify(vp.coveredModules),
    }).run();
  }
}

seedVendors();

// Score conversion: S=5, F=4, C=3, T=2, N=0
export function scoreToNumber(score: string): number {
  switch (score) {
    case "S": return 5;
    case "F": return 4;
    case "C": return 3;
    case "T": return 2;
    case "N": return 0;
    default: return 0;
  }
}

export interface IStorage {
  // Users
  findOrCreateUser(profile: { googleId: string; email: string; name: string; picture?: string }): User;
  getUser(id: number): User | undefined;
  getUserByGoogleId(googleId: string): User | undefined;
  getAllUsers(): User[];

  // Invited Emails
  isEmailAllowed(email: string): boolean;
  getInvitedEmails(): InvitedEmail[];
  addInvitedEmail(email: string, invitedBy?: number): InvitedEmail;
  removeInvitedEmail(id: number): void;

  // Project Members (RBAC)
  addProjectMember(projectId: number, userId: number, role: string, addedBy?: number): ProjectMember;
  getProjectMembers(projectId: number): (ProjectMember & { userName?: string; userEmail?: string; userPicture?: string })[];
  getProjectMemberRole(projectId: number, userId: number): string | null;
  getUserProjects(userId: number): number[];
  updateProjectMemberRole(projectId: number, userId: number, role: string): ProjectMember | undefined;
  removeProjectMember(projectId: number, userId: number): void;

  // Clients
  createClient(data: any): Client;
  getClients(): Client[];
  getClient(id: number): Client | undefined;
  updateClient(id: number, data: any): Client | undefined;
  deleteClient(id: number): void;

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

  // Vendors
  getVendors(): Vendor[];
  getVendor(id: number): Vendor | undefined;
  getVendorByShortName(shortName: string): Vendor | undefined;

  // Project Vendor Settings
  getProjectVendorSettings(projectId: number): ProjectVendorSettings | undefined;
  upsertProjectVendorSettings(projectId: number, moduleWeights: Record<string, number>, selectedVendors: number[]): ProjectVendorSettings;

  // Vendor Requirement Scores
  getVendorScores(projectId: number, vendorId?: number): VendorRequirementScore[];
  upsertVendorScore(projectId: number, requirementId: number, vendorId: number, score: string): VendorRequirementScore;
  bulkUpsertVendorScores(scores: Array<{ projectId: number; requirementId: number; vendorId: number; score: string }>): void;
  generateVendorScores(projectId: number): void;

  // Evaluation calculation
  calculateEvaluation(projectId: number): EvaluationResult;

  // Load sample RFP data with real vendor responses
  loadSampleRfpData(projectId: number): { requirementsCreated: number; scoresCreated: number };

  // Workshop Links
  createWorkshopLink(data: { projectId: number; stakeholderName: string; stakeholderEmail: string; modules: string[] }): WorkshopLink;
  getWorkshopLinks(projectId: number): WorkshopLink[];
  getWorkshopLinkByToken(token: string): WorkshopLink | undefined;
  deactivateWorkshopLink(id: number): void;

  // Workshop Feedback
  getWorkshopFeedback(workshopLinkId: number): WorkshopFeedback[];
  upsertWorkshopFeedback(workshopLinkId: number, requirementId: number, data: { criticality?: string; comment?: string; flaggedForDiscussion?: boolean; status?: string }): WorkshopFeedback;
  getWorkshopSummary(projectId: number): WorkshopSummaryResult;

  // Custom Criteria
  getCustomCriteria(projectId: number): (CustomCriteria & { scores: CustomCriteriaScore[] })[];
  createCustomCriterion(data: { projectId: number; name: string; description: string; weight: number }): CustomCriteria;
  updateCustomCriterion(id: number, data: Partial<{ name: string; description: string; weight: number }>): CustomCriteria | undefined;
  deleteCustomCriterion(id: number): void;
  upsertCustomCriteriaScores(criteriaId: number, scores: Array<{ vendorId: number; score: number; notes: string }>): void;

  // Chat Messages
  addChatMessage(projectId: number, role: string, content: string): ChatMessage;
  getChatMessages(projectId: number): ChatMessage[];
  clearChatMessages(projectId: number): void;

  // Vendor Intelligence
  addVendorIntelligence(data: { projectId: number; vendorId: number; dimension: string; score: number | null; summary: string | null; evidence: string | null; concerns: string | null; sourceDocument: string | null }): VendorIntelligence;
  getVendorIntelligence(projectId: number, vendorId?: number): VendorIntelligence[];
  deleteVendorIntelligence(projectId: number, vendorId: number): void;
  deleteVendorIntelligenceById(id: number): void;

  // Contract Baselines
  createContractBaseline(data: { projectId: number; vendorId?: number | null; contractName: string; contractDate?: string | null; totalValue?: string | null; startDate?: string | null; endDate?: string | null; sourceDocument?: string | null; notes?: string | null }): ContractBaseline;
  getContractBaselines(projectId: number): ContractBaseline[];
  getContractBaseline(id: number): ContractBaseline | undefined;
  updateContractBaseline(id: number, data: Partial<{ vendorId: number | null; contractName: string; contractDate: string | null; totalValue: string | null; startDate: string | null; endDate: string | null; sourceDocument: string | null; notes: string | null }>): ContractBaseline | undefined;
  deleteContractBaseline(id: number): void;

  // Contract Deliverables
  createDeliverable(data: { baselineId: number; category: string; name: string; description?: string | null; dueDate?: string | null; status?: string; priority?: string; contractReference?: string | null; notes?: string | null; externalId?: string | null; externalUrl?: string | null }): ContractDeliverable;
  getDeliverables(baselineId: number): ContractDeliverable[];
  updateDeliverable(id: number, data: Partial<{ category: string; name: string; description: string | null; dueDate: string | null; status: string; priority: string; contractReference: string | null; notes: string | null; completedDate: string | null; externalId: string | null; externalUrl: string | null }>): ContractDeliverable | undefined;
  deleteDeliverable(id: number): void;
  createDeliverablesBulk(items: Array<{ baselineId: number; category: string; name: string; description?: string | null; dueDate?: string | null; status?: string; priority?: string; contractReference?: string | null; notes?: string | null }>): ContractDeliverable[];

  // Compliance Evidence
  addEvidence(data: { deliverableId: number; type: string; title: string; description?: string | null; fileName?: string | null; fileContent?: string | null; assessmentResult?: string | null; assessorNotes?: string | null }): ComplianceEvidence;
  getEvidence(deliverableId: number): ComplianceEvidence[];
  deleteEvidence(id: number): void;

  // IV&V Checkpoints
  createCheckpoint(data: { baselineId: number; name: string; phase: string; scheduledDate?: string | null; status?: string; overallAssessment?: string | null; recommendations?: string | null; findings?: string | null }): IvvCheckpoint;
  getCheckpoints(baselineId: number): IvvCheckpoint[];
  getCheckpoint(id: number): IvvCheckpoint | undefined;
  updateCheckpoint(id: number, data: Partial<{ name: string; phase: string; scheduledDate: string | null; completedDate: string | null; status: string; overallAssessment: string | null; recommendations: string | null; findings: string | null }>): IvvCheckpoint | undefined;
  deleteCheckpoint(id: number): void;

  // Deviations
  createDeviation(data: { baselineId: number; deliverableId?: number | null; severity: string; category: string; title: string; description: string; contractReference?: string | null; actualDelivery?: string | null; impact?: string | null; status?: string; resolution?: string | null }): Deviation;
  getDeviations(baselineId: number): Deviation[];
  updateDeviation(id: number, data: Partial<{ severity: string; category: string; title: string; description: string; contractReference: string | null; actualDelivery: string | null; impact: string | null; status: string; resolution: string | null; deliverableId: number | null; escalationStatus: string; escalatedAt: string | null }>): Deviation | undefined;
  deleteDeviation(id: number): void;
  getDeviation(id: number): Deviation | undefined;

  // Compliance Summary
  getComplianceSummary(projectId: number): any;

  // Pulse Reports
  createPulseReport(data: { baselineId: number; overallPosture: string; postureTrend?: string | null; narrative: string; riskHighlights?: string | null; milestoneStatus?: string | null; decisionItems?: string | null; metrics?: string | null; weekEnding: string }): PulseReport;
  getPulseReports(baselineId: number): PulseReport[];
  getPulseReport(id: number): PulseReport | undefined;

  // Checkpoint Assessments
  saveCheckpointAssessment(checkpointId: number, dimensions: Array<{ dimension: string; rating: string; observation?: string | null; evidence?: string | null; recommendation?: string | null }>): CheckpointAssessment[];
  getCheckpointAssessment(checkpointId: number): CheckpointAssessment[];

  // Go-Live Scorecard
  saveGoLiveScorecard(data: { baselineId: number; criteria: string; overallScore?: number | null; overallReadiness?: string | null; assessorNotes?: string | null; assessedAt: string }): GoLiveScorecard;
  getGoLiveScorecard(baselineId: number): GoLiveScorecard | undefined;

  // Escalation Status
  getEscalationStatus(projectId: number): Deviation[];

  // Integration Connections
  createIntegrationConnection(data: { projectId: number; contractId?: number | null; platform: string; name: string; config: string; fieldMapping?: string | null; status?: string }): IntegrationConnection;
  getIntegrationConnections(projectId: number): IntegrationConnection[];
  getIntegrationConnection(id: number): IntegrationConnection | undefined;
  updateIntegrationConnection(id: number, data: Partial<{ contractId: number | null; platform: string; name: string; config: string; fieldMapping: string | null; status: string; lastSyncAt: string | null; lastSyncStatus: string | null; lastSyncMessage: string | null; syncItemCount: number }>): IntegrationConnection | undefined;
  deleteIntegrationConnection(id: number): void;

  // Sync Logs
  addSyncLog(data: { connectionId: number; status: string; itemsSynced?: number; itemsCreated?: number; itemsUpdated?: number; itemsSkipped?: number; errors?: string | null; duration?: number | null }): SyncLog;
  getSyncLogs(connectionId: number, limit?: number): SyncLog[];

  // Deliverable by external ID (for upsert during sync)
  findDeliverableByExternalId(baselineId: number, externalId: string): ContractDeliverable | undefined;

  // Engagement Modules
  updateProjectModules(projectId: number, modules: string[]): Project | undefined;

  // Health Check Assessments
  createHealthCheckAssessment(data: { projectId: number; domain: string; overallRating?: string | null; findings?: string | null; summary?: string | null; assessedBy?: string | null }): HealthCheckAssessment;
  getHealthCheckAssessments(projectId: number): HealthCheckAssessment[];
  updateHealthCheckAssessment(id: number, data: Partial<{ domain: string; overallRating: string | null; findings: string | null; summary: string | null; assessedBy: string | null }>): HealthCheckAssessment | undefined;
  deleteHealthCheckAssessment(id: number): void;

  // RAID Items
  createRaidItem(data: { projectId: number; type: string; title: string; description?: string | null; severity?: string | null; status?: string; owner?: string | null; dueDate?: string | null; resolution?: string | null; siReported?: number; siDiscrepancy?: string | null }): RaidItem;
  getRaidItems(projectId: number, filters?: { type?: string; status?: string }): RaidItem[];
  updateRaidItem(id: number, data: Partial<{ type: string; title: string; description: string | null; severity: string | null; status: string; owner: string | null; dueDate: string | null; resolution: string | null; siReported: number; siDiscrepancy: string | null }>): RaidItem | undefined;
  deleteRaidItem(id: number): void;

  // Budget Tracking
  createBudgetEntry(data: { projectId: number; category: string; description: string; amount: number; date?: string | null; notes?: string | null }): BudgetTracking;
  getBudgetEntries(projectId: number): BudgetTracking[];
  updateBudgetEntry(id: number, data: Partial<{ category: string; description: string; amount: number; date: string | null; notes: string | null }>): BudgetTracking | undefined;
  deleteBudgetEntry(id: number): void;
  getBudgetSummary(projectId: number): { originalContract: number; totalChangeOrders: number; totalAdditionalFunding: number; totalActualSpend: number; variance: number };

  // Schedule Tracking
  createScheduleEntry(data: { projectId: number; milestone: string; originalDate?: string | null; currentDate?: string | null; actualDate?: string | null; status?: string; varianceDays?: number | null; notes?: string | null }): ScheduleTracking;
  getScheduleEntries(projectId: number): ScheduleTracking[];
  updateScheduleEntry(id: number, data: Partial<{ milestone: string; originalDate: string | null; currentDate: string | null; actualDate: string | null; status: string; varianceDays: number | null; notes: string | null }>): ScheduleTracking | undefined;
  deleteScheduleEntry(id: number): void;

  // Assessment History
  createAssessmentHistory(data: { projectId: number; domain: string; previousRating: string; newRating: string; changedBy?: string }): AssessmentHistory;
  getAssessmentHistory(projectId: number, domain?: string): AssessmentHistory[];

  // Project Baseline (Contract/SOW)
  getProjectBaseline(projectId: number): ProjectBaseline | undefined;
  upsertProjectBaseline(projectId: number, data: Partial<{ contractedAmount: number | null; goLiveDate: string | null; contractStartDate: string | null; scopeItems: string | null; keyMilestones: string | null; vendorName: string | null; notes: string | null }>): ProjectBaseline;

  // Vendor Capabilities (Knowledge Base)
  createVendorCapability(data: { vendorPlatform: string; module: string; processArea: string; workflowDescription?: string | null; differentiators?: string | null; limitations?: string | null; bestFitFor?: string | null; integrationNotes?: string | null; automationLevel?: string | null; maturityRating?: number | null; sourceDocuments?: string | null; lastUpdated?: string | null }): VendorCapability;
  getVendorCapabilities(filters?: { platform?: string; module?: string; search?: string }): VendorCapability[];
  getVendorCapability(id: number): VendorCapability | undefined;
  updateVendorCapability(id: number, data: Partial<{ vendorPlatform: string; module: string; processArea: string; workflowDescription: string | null; differentiators: string | null; limitations: string | null; bestFitFor: string | null; integrationNotes: string | null; automationLevel: string | null; maturityRating: number | null; sourceDocuments: string | null; lastUpdated: string | null }>): VendorCapability | undefined;
  deleteVendorCapability(id: number): void;
  compareCapabilities(module: string, platforms: string[]): VendorCapability[];
  getModuleCoverage(): { vendorPlatform: string; module: string; maturityRating: number | null }[];

  // Vendor Process Details
  bulkCreateProcessDetails(items: { vendorPlatform: string; module: string; reqReference?: string | null; capability: string; howHandled?: string | null; score?: string | null; sourceVendor?: string | null }[]): void;
  getProcessDetails(filters?: { platform?: string; module?: string; search?: string }): VendorProcessDetail[];

  // Engagement Mode
  updateProjectEngagementMode(id: number, mode: string): Project | undefined;

  // Org Profile
  upsertOrgProfile(projectId: number, data: { entityType?: string | null; entityName?: string | null; state?: string | null; population?: number | null; employeeCount?: number | null; annualBudget?: string | null; currentSystems?: string | null; departments?: string | null; painSummary?: string | null; domain?: string | null; leadership?: string | null; documents?: string | null }): OrgProfile;
  getOrgProfile(projectId: number): OrgProfile | undefined;

  // Discovery Interviews
  createDiscoveryInterview(data: { projectId: number; functionalArea: string; interviewee?: string | null; role?: string | null }): DiscoveryInterview;
  getDiscoveryInterviews(projectId: number): DiscoveryInterview[];
  getDiscoveryInterview(id: number): DiscoveryInterview | undefined;
  updateDiscoveryInterview(id: number, data: Partial<{ status: string; interviewee: string | null; role: string | null; messages: string | null; findings: string | null; painPoints: string | null; processSteps: string | null }>): DiscoveryInterview | undefined;
  deleteDiscoveryInterview(id: number): void;

  // Discovery Pain Points
  createPainPoint(data: { projectId: number; sourceInterviewId?: number | null; functionalArea: string; description: string; severity?: string | null; frequency?: string | null; impact?: string | null; currentWorkaround?: string | null; stakeholderPriority?: number | null; linkedRequirements?: string | null }): DiscoveryPainPoint;
  getPainPoints(projectId: number): DiscoveryPainPoint[];
  updatePainPoint(id: number, data: Partial<{ severity: string | null; frequency: string | null; impact: string | null; currentWorkaround: string | null; stakeholderPriority: number | null; linkedRequirements: string | null }>): DiscoveryPainPoint | undefined;
  bulkUpdatePainPointPriorities(updates: { id: number; priority: number }[]): void;

  // Process Transformations
  createProcessTransformation(data: any): ProcessTransformation;
  getProcessTransformations(projectId: number, vendorPlatform?: string): ProcessTransformation[];
  getProcessTransformation(id: number): ProcessTransformation | undefined;
  deleteProcessTransformations(projectId: number, vendorPlatform?: string, functionalArea?: string): void;

  // Project Documents
  createProjectDocument(data: any): ProjectDocument;
  getProjectDocuments(projectId: number, documentType?: string): ProjectDocument[];
  getProjectDocument(id: number): ProjectDocument | undefined;
  updateProjectDocument(id: number, data: any): ProjectDocument | undefined;
  deleteProjectDocument(id: number): void;

  // Monitoring Pipeline
  createMonitoringSource(data: any): MonitoringSource;
  getMonitoringSources(vendorPlatform?: string): MonitoringSource[];
  getMonitoringSource(id: number): MonitoringSource | undefined;
  updateMonitoringSource(id: number, data: any): MonitoringSource | undefined;
  deleteMonitoringSource(id: number): void;
  createMonitoringRun(data: any): MonitoringRun;
  getMonitoringRuns(sourceId?: number, limit?: number): MonitoringRun[];
  createVendorChange(data: any): VendorChange;
  getVendorChanges(filters?: { vendorPlatform?: string; changeType?: string; isReviewed?: number; limit?: number }): VendorChange[];
  updateVendorChange(id: number, data: any): VendorChange | undefined;
  createMonitoringAlert(data: any): MonitoringAlert;
  getMonitoringAlerts(filters?: { priority?: string; isDismissed?: number }): MonitoringAlert[];
  updateMonitoringAlert(id: number, data: any): MonitoringAlert | undefined;
  getMonitoringStats(): { totalSources: number; activeSources: number; totalChanges: number; unreviewedChanges: number; activeAlerts: number; lastScanAt: string | null };
}

export interface WorkshopSummaryResult {
  links: Array<{
    id: number;
    stakeholderName: string;
    stakeholderEmail: string;
    modules: string[];
    createdAt: string;
    expiresAt: string | null;
    isActive: boolean;
    feedbackStats: { total: number; pending: number; approved: number; rejected: number; flagged: number; commented: number };
  }>;
  aggregated: {
    totalFeedback: number;
    approvalRate: number;
    flaggedCount: number;
    criticalityChanges: Array<{ reqId: number; reqNumber: string; module: string; originalCriticality: string; stakeholderCriticality: string; stakeholderName: string }>;
    topConcerns: Array<{ reqId: number; reqNumber: string; module: string; description: string; flagCount: number; commentCount: number; comments: Array<{ stakeholder: string; comment: string }> }>;
    moduleBreakdown: Array<{ module: string; feedbackCount: number; approvedCount: number; rejectedCount: number; flaggedCount: number }>;
    consensusItems: Array<{ reqId: number; reqNumber: string; module: string; description: string; allApproved: boolean; allRejected: boolean; mixed: boolean }>;
  };
  // Legacy fields for backward compat
  totalLinks: number;
  totalFeedback: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  flaggedCount: number;
}

export interface ModuleScore {
  functionalArea: string;
  category: string;
  weight: number;
  score: number; // 0-100%
  requirementCount: number;
  criticalGapCount: number;
}

export interface VendorEvaluationResult {
  vendorId: number;
  vendorName: string;
  vendorShortName: string;
  color: string;
  overallScore: number; // 0-100
  moduleScores: Record<string, ModuleScore>;
}

export interface GapItem {
  requirementId: number;
  reqNumber: string;
  functionalArea: string;
  category: string;
  subCategory: string;
  description: string;
  criticality: string;
  scores: Record<number, string>; // vendorId -> score
}

export interface EvaluationResult {
  vendors: VendorEvaluationResult[];
  gaps: GapItem[];
  moduleWeights: Record<string, number>;
  selectedVendorIds: number[];
}

export class DatabaseStorage implements IStorage {
  // ==================== Users ====================

  findOrCreateUser(profile: { googleId: string; email: string; name: string; picture?: string }): User {
    const existing = this.getUserByGoogleId(profile.googleId);
    if (existing) {
      return db.update(users).set({
        name: profile.name,
        picture: profile.picture || null,
        email: profile.email,
        lastLoginAt: new Date().toISOString(),
      }).where(eq(users.id, existing.id)).returning().get();
    }
    return db.insert(users).values({
      googleId: profile.googleId,
      email: profile.email,
      name: profile.name,
      picture: profile.picture || null,
      role: "editor",
      isActive: 1,
      lastLoginAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    }).returning().get();
  }

  getUser(id: number): User | undefined {
    return db.select().from(users).where(eq(users.id, id)).get();
  }

  getUserByGoogleId(googleId: string): User | undefined {
    return db.select().from(users).where(eq(users.googleId, googleId)).get();
  }

  getAllUsers(): User[] {
    return db.select().from(users).where(eq(users.isActive, 1)).all();
  }

  // ==================== Invited Emails ====================

  isEmailAllowed(email: string): boolean {
    const domain = email.split("@")[1]?.toLowerCase();
    if (domain === "averoadvisors.com") return true;
    const invited = db.select().from(invitedEmails).where(eq(invitedEmails.email, email.toLowerCase())).get();
    return !!invited;
  }

  getInvitedEmails(): InvitedEmail[] {
    return db.select().from(invitedEmails).all();
  }

  addInvitedEmail(email: string, invitedBy?: number): InvitedEmail {
    return db.insert(invitedEmails).values({
      email: email.toLowerCase(),
      invitedBy: invitedBy || null,
      createdAt: new Date().toISOString(),
    }).returning().get();
  }

  removeInvitedEmail(id: number): void {
    db.delete(invitedEmails).where(eq(invitedEmails.id, id)).run();
  }

  // ==================== Project Members (RBAC) ====================

  addProjectMember(projectId: number, userId: number, role: string, addedBy?: number): ProjectMember {
    return db.insert(projectMembers).values({
      projectId,
      userId,
      role,
      addedBy: addedBy || null,
      createdAt: new Date().toISOString(),
    }).returning().get();
  }

  getProjectMembers(projectId: number): (ProjectMember & { userName?: string; userEmail?: string; userPicture?: string })[] {
    const members = db.select().from(projectMembers).where(eq(projectMembers.projectId, projectId)).all();
    return members.map(m => {
      const user = this.getUser(m.userId);
      return { ...m, userName: user?.name, userEmail: user?.email, userPicture: user?.picture };
    });
  }

  getProjectMemberRole(projectId: number, userId: number): string | null {
    const member = db.select().from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
      .get();
    return member?.role || null;
  }

  getUserProjects(userId: number): number[] {
    return db.select({ projectId: projectMembers.projectId }).from(projectMembers)
      .where(eq(projectMembers.userId, userId))
      .all()
      .map(r => r.projectId);
  }

  updateProjectMemberRole(projectId: number, userId: number, role: string): ProjectMember | undefined {
    return db.update(projectMembers).set({ role })
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
      .returning().get();
  }

  removeProjectMember(projectId: number, userId: number): void {
    db.delete(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
      .run();
  }

  // ==================== Clients ====================

  createClient(data: any): Client {
    return db.insert(clients).values({
      name: data.name,
      domain: data.domain ?? null,
      entityType: data.entityType ?? null,
      state: data.state ?? null,
      population: data.population ?? null,
      employeeCount: data.employeeCount ?? null,
      annualBudget: data.annualBudget ?? null,
      currentSystems: typeof data.currentSystems === "string" ? data.currentSystems : JSON.stringify(data.currentSystems || []),
      departments: typeof data.departments === "string" ? data.departments : JSON.stringify(data.departments || []),
      painSummary: data.painSummary ?? null,
      leadership: typeof data.leadership === "string" ? data.leadership : JSON.stringify(data.leadership || []),
      documents: typeof data.documents === "string" ? data.documents : JSON.stringify(data.documents || []),
      description: data.description ?? "",
    }).returning().get();
  }

  getClients(): Client[] {
    return db.select().from(clients).orderBy(clients.name).all();
  }

  getClient(id: number): Client | undefined {
    return db.select().from(clients).where(eq(clients.id, id)).get();
  }

  updateClient(id: number, data: any): Client | undefined {
    const updateData: any = { ...data, updatedAt: new Date().toISOString() };
    if (updateData.currentSystems && typeof updateData.currentSystems !== "string") updateData.currentSystems = JSON.stringify(updateData.currentSystems);
    if (updateData.departments && typeof updateData.departments !== "string") updateData.departments = JSON.stringify(updateData.departments);
    if (updateData.leadership && typeof updateData.leadership !== "string") updateData.leadership = JSON.stringify(updateData.leadership);
    if (updateData.documents && typeof updateData.documents !== "string") updateData.documents = JSON.stringify(updateData.documents);
    return db.update(clients).set(updateData).where(eq(clients.id, id)).returning().get();
  }

  deleteClient(id: number): void {
    db.delete(clients).where(eq(clients.id, id)).run();
  }

  // ==================== Projects ====================

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
    db.delete(vendorRequirementScores).where(eq(vendorRequirementScores.projectId, id)).run();
    db.delete(projectVendorSettings).where(eq(projectVendorSettings.projectId, id)).run();
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
    db.delete(vendorRequirementScores).where(eq(vendorRequirementScores.requirementId, id)).run();
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

  // ==================== VENDORS ====================

  getVendors(): Vendor[] {
    return db.select().from(vendors).all();
  }

  getVendor(id: number): Vendor | undefined {
    return db.select().from(vendors).where(eq(vendors.id, id)).get();
  }

  getVendorByShortName(shortName: string): Vendor | undefined {
    return db.select().from(vendors).where(eq(vendors.shortName, shortName)).get();
  }

  // ==================== PROJECT VENDOR SETTINGS ====================

  getProjectVendorSettings(projectId: number): ProjectVendorSettings | undefined {
    return db.select().from(projectVendorSettings)
      .where(eq(projectVendorSettings.projectId, projectId))
      .get();
  }

  upsertProjectVendorSettings(
    projectId: number,
    moduleWeights: Record<string, number>,
    selectedVendors: number[]
  ): ProjectVendorSettings {
    const existing = this.getProjectVendorSettings(projectId);
    if (existing) {
      return db.update(projectVendorSettings)
        .set({
          moduleWeights: JSON.stringify(moduleWeights),
          selectedVendors: JSON.stringify(selectedVendors),
        })
        .where(eq(projectVendorSettings.projectId, projectId))
        .returning().get();
    } else {
      return db.insert(projectVendorSettings).values({
        projectId,
        moduleWeights: JSON.stringify(moduleWeights),
        selectedVendors: JSON.stringify(selectedVendors),
      }).returning().get();
    }
  }

  // ==================== VENDOR REQUIREMENT SCORES ====================

  getVendorScores(projectId: number, vendorId?: number): VendorRequirementScore[] {
    const conditions = [eq(vendorRequirementScores.projectId, projectId)];
    if (vendorId !== undefined) {
      conditions.push(eq(vendorRequirementScores.vendorId, vendorId));
    }
    return db.select().from(vendorRequirementScores)
      .where(and(...conditions))
      .all();
  }

  upsertVendorScore(projectId: number, requirementId: number, vendorId: number, score: string): VendorRequirementScore {
    const existing = db.select().from(vendorRequirementScores)
      .where(and(
        eq(vendorRequirementScores.projectId, projectId),
        eq(vendorRequirementScores.requirementId, requirementId),
        eq(vendorRequirementScores.vendorId, vendorId),
      )).get();

    if (existing) {
      return db.update(vendorRequirementScores)
        .set({ score })
        .where(eq(vendorRequirementScores.id, existing.id))
        .returning().get();
    } else {
      return db.insert(vendorRequirementScores).values({
        projectId,
        requirementId,
        vendorId,
        score,
      }).returning().get();
    }
  }

  bulkUpsertVendorScores(scores: Array<{ projectId: number; requirementId: number; vendorId: number; score: string }>): void {
    for (const s of scores) {
      this.upsertVendorScore(s.projectId, s.requirementId, s.vendorId, s.score);
    }
  }

  generateVendorScores(projectId: number): void {
    // Get all requirements for this project
    const reqs = this.getRequirements(projectId);
    if (reqs.length === 0) return;

    // Get all vendors
    const allVendors = this.getVendors();

    // Get or create settings
    let settings = this.getProjectVendorSettings(projectId);
    if (!settings) {
      settings = this.upsertProjectVendorSettings(
        projectId,
        defaultModuleWeights,
        allVendors.map(v => v.id)
      );
    }

    // Generate scores for each vendor × requirement
    const scoresToInsert: Array<{ projectId: number; requirementId: number; vendorId: number; score: string }> = [];

    for (const vendor of allVendors) {
      // Find the matching vendor profile
      const profile = vendorProfiles.find(vp => vp.shortName === vendor.shortName);
      if (!profile) continue;

      for (let i = 0; i < reqs.length; i++) {
        const req = reqs[i];
        const moduleRating = getVendorModuleRating(profile, req.functionalArea);
        const score = generateVendorResponse(
          moduleRating,
          req.criticality,
          i
        );
        scoresToInsert.push({
          projectId,
          requirementId: req.id,
          vendorId: vendor.id,
          score,
        });
      }
    }

    this.bulkUpsertVendorScores(scoresToInsert);
  }

  // ==================== LOAD SAMPLE RFP DATA ====================

  loadSampleRfpData(projectId: number): { requirementsCreated: number; scoresCreated: number } {
    // 1. Delete existing requirements & scores for this project
    db.delete(vendorRequirementScores).where(eq(vendorRequirementScores.projectId, projectId)).run();
    db.delete(requirements).where(eq(requirements.projectId, projectId)).run();
    db.delete(projectVendorSettings).where(eq(projectVendorSettings.projectId, projectId)).run();

    // 2. Get all vendors (already seeded)
    const allVendors = this.getVendors();
    const vendorByShortName = new Map(allVendors.map(v => [v.shortName, v]));

    // 3. Bulk insert all 1,260 requirements using real req numbers
    const now = new Date().toISOString();
    const createdReqs: Array<{ id: number; reqNumber: string }> = [];

    // Use sqlite (better-sqlite3) transaction for synchronous batch inserts
    sqlite.transaction(() => {
      for (const tmpl of templateRequirements) {
        const inserted = db.insert(requirements).values({
          projectId,
          reqNumber: tmpl.reqNumber,
          category: tmpl.category,
          functionalArea: tmpl.functionalArea,
          subCategory: tmpl.subCategory,
          description: tmpl.description,
          criticality: tmpl.criticality,
          vendorResponse: null,
          comments: "",
          createdAt: now,
        }).returning().get();
        createdReqs.push({ id: inserted.id, reqNumber: inserted.reqNumber });
      }
    })();

    // 4. Set up vendor evaluation settings with all vendors selected
    this.upsertProjectVendorSettings(
      projectId,
      defaultModuleWeights,
      allVendors.map(v => v.id)
    );

    // 5. Bulk insert real scores from sampleRfpScores
    let scoresCreated = 0;
    sqlite.transaction(() => {
      for (const { id: reqId, reqNumber } of createdReqs) {
        const scoresByVendor = sampleRfpScores[reqNumber];
        if (!scoresByVendor) continue;

        for (const [shortName, score] of Object.entries(scoresByVendor)) {
          const vendor = vendorByShortName.get(shortName);
          if (!vendor) continue;

          db.insert(vendorRequirementScores).values({
            projectId,
            requirementId: reqId,
            vendorId: vendor.id,
            score,
          }).run();
          scoresCreated++;
        }
      }
    })();

    return { requirementsCreated: createdReqs.length, scoresCreated };
  }

  // ==================== EVALUATION CALCULATION ====================

  calculateEvaluation(projectId: number): EvaluationResult {
    const settings = this.getProjectVendorSettings(projectId);
    const allVendors = this.getVendors();
    const reqs = this.getRequirements(projectId);

    // Parse settings
    const moduleWeights: Record<string, number> = settings
      ? JSON.parse(settings.moduleWeights)
      : { ...defaultModuleWeights };
    const selectedVendorIds: number[] = settings
      ? JSON.parse(settings.selectedVendors)
      : allVendors.map(v => v.id);

    const selectedVendors = allVendors.filter(v => selectedVendorIds.includes(v.id));

    // Get all scores for this project
    const allScores = this.getVendorScores(projectId);
    // Build a lookup map: requirementId:vendorId -> score
    const scoreMap = new Map<string, string>();
    for (const s of allScores) {
      scoreMap.set(`${s.requirementId}:${s.vendorId}`, s.score);
    }

    // Group requirements by functional area
    const reqsByModule = new Map<string, Requirement[]>();
    for (const req of reqs) {
      const arr = reqsByModule.get(req.functionalArea) || [];
      arr.push(req);
      reqsByModule.set(req.functionalArea, arr);
    }

    const vendorResults: VendorEvaluationResult[] = [];

    for (const vendor of selectedVendors) {
      const moduleScores: Record<string, ModuleScore> = {};
      let weightedSum = 0;
      let totalWeight = 0;

      for (const [functionalArea, areaReqs] of reqsByModule.entries()) {
        const weight = moduleWeights[functionalArea] ?? 5;
        let numerator = 0;
        let denominator = 0;
        let criticalGapCount = 0;

        for (const req of areaReqs) {
          // Not Required / Not Applicable requirements are excluded from scoring
          if (req.criticality === "Not Required" || req.criticality === "Not Applicable") continue;
          const critMultiplier = req.criticality === "Critical" ? 1.5 : 1.0;
          const maxScore = 5 * critMultiplier;
          const scoreCode = scoreMap.get(`${req.id}:${vendor.id}`) || "N";
          const scoreVal = scoreToNumber(scoreCode) * critMultiplier;

          numerator += scoreVal;
          denominator += maxScore;

          if (req.criticality === "Critical" && (scoreCode === "T" || scoreCode === "N")) {
            criticalGapCount++;
          }
        }

        const moduleScore = denominator > 0 ? (numerator / denominator) * 100 : 0;

        moduleScores[functionalArea] = {
          functionalArea,
          category: areaReqs[0]?.category || "",
          weight,
          score: Math.round(moduleScore * 10) / 10,
          requirementCount: areaReqs.length,
          criticalGapCount,
        };

        weightedSum += moduleScore * weight;
        totalWeight += weight;
      }

      const overallScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

      vendorResults.push({
        vendorId: vendor.id,
        vendorName: vendor.name,
        vendorShortName: vendor.shortName,
        color: vendor.color,
        overallScore: Math.round(overallScore * 10) / 10,
        moduleScores,
      });
    }

    // Sort by overall score descending
    vendorResults.sort((a, b) => b.overallScore - a.overallScore);

    // Gap analysis: requirements where ALL selected vendors score C, T, or N
    const gaps: GapItem[] = [];
    for (const req of reqs) {
      const reqScores: Record<number, string> = {};
      let hasGap = false;

      for (const vendor of selectedVendors) {
        const scoreCode = scoreMap.get(`${req.id}:${vendor.id}`) || "";
        reqScores[vendor.id] = scoreCode;
        if (scoreCode === "C" || scoreCode === "T" || scoreCode === "N") {
          hasGap = true;
        }
      }

      if (hasGap && selectedVendors.length > 0) {
        gaps.push({
          requirementId: req.id,
          reqNumber: req.reqNumber,
          functionalArea: req.functionalArea,
          category: req.category,
          subCategory: req.subCategory,
          description: req.description,
          criticality: req.criticality,
          scores: reqScores,
        });
      }
    }

    return {
      vendors: vendorResults,
      gaps,
      moduleWeights,
      selectedVendorIds,
    };
  }

  // ==================== WORKSHOP LINKS ====================

  createWorkshopLink(data: { projectId: number; stakeholderName: string; stakeholderEmail: string; modules: string[] }): WorkshopLink {
    const token = crypto.randomUUID();
    const now = new Date().toISOString();
    return db.insert(workshopLinks).values({
      projectId: data.projectId,
      token,
      stakeholderName: data.stakeholderName,
      stakeholderEmail: data.stakeholderEmail,
      modules: JSON.stringify(data.modules),
      createdAt: now,
      expiresAt: null,
      isActive: 1,
    }).returning().get();
  }

  getWorkshopLinks(projectId: number): WorkshopLink[] {
    return db.select().from(workshopLinks).where(eq(workshopLinks.projectId, projectId)).all();
  }

  getWorkshopLinkByToken(token: string): WorkshopLink | undefined {
    return db.select().from(workshopLinks).where(eq(workshopLinks.token, token)).get();
  }

  deactivateWorkshopLink(id: number): void {
    db.update(workshopLinks).set({ isActive: 0 }).where(eq(workshopLinks.id, id)).run();
  }

  // ==================== WORKSHOP FEEDBACK ====================

  getWorkshopFeedback(workshopLinkId: number): WorkshopFeedback[] {
    return db.select().from(workshopFeedback).where(eq(workshopFeedback.workshopLinkId, workshopLinkId)).all();
  }

  upsertWorkshopFeedback(workshopLinkId: number, requirementId: number, data: { criticality?: string; comment?: string; flaggedForDiscussion?: boolean; status?: string }): WorkshopFeedback {
    const now = new Date().toISOString();
    const existing = db.select().from(workshopFeedback)
      .where(and(eq(workshopFeedback.workshopLinkId, workshopLinkId), eq(workshopFeedback.requirementId, requirementId)))
      .get();

    if (existing) {
      const updated: Partial<typeof workshopFeedback.$inferInsert> = { updatedAt: now };
      if (data.criticality !== undefined) updated.criticality = data.criticality;
      if (data.comment !== undefined) updated.comment = data.comment;
      if (data.flaggedForDiscussion !== undefined) updated.flaggedForDiscussion = data.flaggedForDiscussion ? 1 : 0;
      if (data.status !== undefined) updated.status = data.status;
      return db.update(workshopFeedback).set(updated)
        .where(eq(workshopFeedback.id, existing.id))
        .returning().get();
    } else {
      return db.insert(workshopFeedback).values({
        workshopLinkId,
        requirementId,
        criticality: data.criticality ?? null,
        comment: data.comment ?? "",
        flaggedForDiscussion: data.flaggedForDiscussion ? 1 : 0,
        status: data.status ?? "pending",
        updatedAt: now,
      }).returning().get();
    }
  }

  getWorkshopSummary(projectId: number): WorkshopSummaryResult {
    const links = db.select().from(workshopLinks).where(eq(workshopLinks.projectId, projectId)).all();
    const linkIds = links.map(l => l.id);

    const emptyResult: WorkshopSummaryResult = {
      links: [],
      aggregated: { totalFeedback: 0, approvalRate: 0, flaggedCount: 0, criticalityChanges: [], topConcerns: [], moduleBreakdown: [], consensusItems: [] },
      totalLinks: 0, totalFeedback: 0, pendingCount: 0, approvedCount: 0, rejectedCount: 0, flaggedCount: 0,
    };

    if (linkIds.length === 0) return emptyResult;

    const allFeedback = db.select().from(workshopFeedback).where(inArray(workshopFeedback.workshopLinkId, linkIds)).all();
    const allReqs = db.select().from(requirements).where(eq(requirements.projectId, projectId)).all();
    const reqMap = new Map(allReqs.map(r => [r.id, r]));

    // Build link-to-name map
    const linkMap = new Map(links.map(l => [l.id, l]));

    // Per-link stats
    const linkResults = links.map(l => {
      const fb = allFeedback.filter(f => f.workshopLinkId === l.id);
      return {
        id: l.id,
        stakeholderName: l.stakeholderName,
        stakeholderEmail: l.stakeholderEmail,
        modules: JSON.parse(l.modules) as string[],
        createdAt: l.createdAt,
        expiresAt: l.expiresAt,
        isActive: l.isActive === 1,
        feedbackStats: {
          total: fb.length,
          pending: fb.filter(f => f.status === "pending").length,
          approved: fb.filter(f => f.status === "approved").length,
          rejected: fb.filter(f => f.status === "rejected").length,
          flagged: fb.filter(f => f.flaggedForDiscussion === 1).length,
          commented: fb.filter(f => f.comment && f.comment.length > 0).length,
        },
      };
    });

    // Legacy counts
    const pendingCount = allFeedback.filter(f => f.status === "pending").length;
    const approvedCount = allFeedback.filter(f => f.status === "approved").length;
    const rejectedCount = allFeedback.filter(f => f.status === "rejected").length;
    const flaggedCount = allFeedback.filter(f => f.flaggedForDiscussion === 1).length;
    const reviewedCount = approvedCount + rejectedCount;
    const approvalRate = reviewedCount > 0 ? Math.round((approvedCount / reviewedCount) * 100) : 0;

    // Criticality changes
    const criticalityChanges: WorkshopSummaryResult["aggregated"]["criticalityChanges"] = [];
    for (const fb of allFeedback) {
      if (!fb.criticality) continue;
      const req = reqMap.get(fb.requirementId);
      if (!req) continue;
      if (fb.criticality !== req.criticality) {
        const link = linkMap.get(fb.workshopLinkId);
        criticalityChanges.push({
          reqId: req.id,
          reqNumber: req.reqNumber,
          module: req.functionalArea,
          originalCriticality: req.criticality,
          stakeholderCriticality: fb.criticality,
          stakeholderName: link?.stakeholderName || "Unknown",
        });
      }
    }

    // Top concerns (flagged or commented)
    const concernMap = new Map<number, { flagCount: number; commentCount: number; comments: Array<{ stakeholder: string; comment: string }> }>();
    for (const fb of allFeedback) {
      if (fb.flaggedForDiscussion !== 1 && (!fb.comment || fb.comment.length === 0)) continue;
      if (!concernMap.has(fb.requirementId)) {
        concernMap.set(fb.requirementId, { flagCount: 0, commentCount: 0, comments: [] });
      }
      const c = concernMap.get(fb.requirementId)!;
      if (fb.flaggedForDiscussion === 1) c.flagCount++;
      if (fb.comment && fb.comment.length > 0) {
        c.commentCount++;
        const link = linkMap.get(fb.workshopLinkId);
        c.comments.push({ stakeholder: link?.stakeholderName || "Unknown", comment: fb.comment });
      }
    }
    const topConcerns = [...concernMap.entries()]
      .map(([reqId, data]) => {
        const req = reqMap.get(reqId);
        return {
          reqId,
          reqNumber: req?.reqNumber || "",
          module: req?.functionalArea || "",
          description: req?.description || "",
          ...data,
        };
      })
      .sort((a, b) => (b.flagCount + b.commentCount) - (a.flagCount + a.commentCount))
      .slice(0, 20);

    // Module breakdown
    const modMap = new Map<string, { feedbackCount: number; approvedCount: number; rejectedCount: number; flaggedCount: number }>();
    for (const fb of allFeedback) {
      const req = reqMap.get(fb.requirementId);
      const mod = req?.functionalArea || "Unknown";
      if (!modMap.has(mod)) modMap.set(mod, { feedbackCount: 0, approvedCount: 0, rejectedCount: 0, flaggedCount: 0 });
      const m = modMap.get(mod)!;
      m.feedbackCount++;
      if (fb.status === "approved") m.approvedCount++;
      if (fb.status === "rejected") m.rejectedCount++;
      if (fb.flaggedForDiscussion === 1) m.flaggedCount++;
    }
    const moduleBreakdown = [...modMap.entries()].map(([module, data]) => ({ module, ...data })).sort((a, b) => b.feedbackCount - a.feedbackCount);

    // Consensus items — requirements with feedback from multiple stakeholders
    const reqFbMap = new Map<number, Array<{ status: string; linkId: number }>>();
    for (const fb of allFeedback) {
      if (!reqFbMap.has(fb.requirementId)) reqFbMap.set(fb.requirementId, []);
      reqFbMap.get(fb.requirementId)!.push({ status: fb.status, linkId: fb.workshopLinkId });
    }
    const consensusItems: WorkshopSummaryResult["aggregated"]["consensusItems"] = [];
    for (const [reqId, fbs] of reqFbMap.entries()) {
      if (fbs.length < 2) continue; // need multiple to have consensus
      const req = reqMap.get(reqId);
      if (!req) continue;
      const allApproved = fbs.every(f => f.status === "approved");
      const allRejected = fbs.every(f => f.status === "rejected");
      const mixed = !allApproved && !allRejected && fbs.some(f => f.status === "approved") && fbs.some(f => f.status === "rejected");
      if (allApproved || allRejected || mixed) {
        consensusItems.push({ reqId: req.id, reqNumber: req.reqNumber, module: req.functionalArea, description: req.description, allApproved, allRejected, mixed });
      }
    }

    return {
      links: linkResults,
      aggregated: { totalFeedback: allFeedback.length, approvalRate, flaggedCount, criticalityChanges, topConcerns, moduleBreakdown, consensusItems },
      totalLinks: links.length,
      totalFeedback: allFeedback.length,
      pendingCount,
      approvedCount,
      rejectedCount,
      flaggedCount,
    };
  }

  // ==================== CUSTOM CRITERIA ====================

  getCustomCriteria(projectId: number): (CustomCriteria & { scores: CustomCriteriaScore[] })[] {
    const criteria = db.select().from(customCriteria).where(eq(customCriteria.projectId, projectId)).all();
    return criteria.map(c => {
      const scores = db.select().from(customCriteriaScores).where(eq(customCriteriaScores.criteriaId, c.id)).all();
      return { ...c, scores };
    });
  }

  createCustomCriterion(data: { projectId: number; name: string; description: string; weight: number }): CustomCriteria {
    const now = new Date().toISOString();
    return db.insert(customCriteria).values({
      projectId: data.projectId,
      name: data.name,
      description: data.description,
      weight: data.weight,
      createdAt: now,
    }).returning().get();
  }

  updateCustomCriterion(id: number, data: Partial<{ name: string; description: string; weight: number }>): CustomCriteria | undefined {
    return db.update(customCriteria).set(data).where(eq(customCriteria.id, id)).returning().get();
  }

  deleteCustomCriterion(id: number): void {
    db.delete(customCriteriaScores).where(eq(customCriteriaScores.criteriaId, id)).run();
    db.delete(customCriteria).where(eq(customCriteria.id, id)).run();
  }

  upsertCustomCriteriaScores(criteriaId: number, scores: Array<{ vendorId: number; score: number; notes: string }>): void {
    for (const s of scores) {
      const existing = db.select().from(customCriteriaScores)
        .where(and(eq(customCriteriaScores.criteriaId, criteriaId), eq(customCriteriaScores.vendorId, s.vendorId)))
        .get();
      if (existing) {
        db.update(customCriteriaScores).set({ score: s.score, notes: s.notes })
          .where(eq(customCriteriaScores.id, existing.id)).run();
      } else {
        db.insert(customCriteriaScores).values({
          criteriaId,
          vendorId: s.vendorId,
          score: s.score,
          notes: s.notes,
        }).run();
      }
    }
  }

  // Chat Messages
  addChatMessage(projectId: number, role: string, content: string): ChatMessage {
    const now = new Date().toISOString();
    return db.insert(chatMessages).values({
      projectId,
      role,
      content,
      createdAt: now,
    }).returning().get();
  }

  getChatMessages(projectId: number): ChatMessage[] {
    return db.select().from(chatMessages)
      .where(eq(chatMessages.projectId, projectId))
      .all();
  }

  clearChatMessages(projectId: number): void {
    db.delete(chatMessages).where(eq(chatMessages.projectId, projectId)).run();
  }

  // Vendor Intelligence
  addVendorIntelligence(data: { projectId: number; vendorId: number; dimension: string; score: number | null; summary: string | null; evidence: string | null; concerns: string | null; sourceDocument: string | null }): VendorIntelligence {
    const now = new Date().toISOString();
    return db.insert(vendorIntelligence).values({
      projectId: data.projectId,
      vendorId: data.vendorId,
      dimension: data.dimension,
      score: data.score,
      summary: data.summary,
      evidence: data.evidence,
      concerns: data.concerns,
      sourceDocument: data.sourceDocument,
      createdAt: now,
    }).returning().get();
  }

  getVendorIntelligence(projectId: number, vendorId?: number): VendorIntelligence[] {
    if (vendorId) {
      return db.select().from(vendorIntelligence)
        .where(and(eq(vendorIntelligence.projectId, projectId), eq(vendorIntelligence.vendorId, vendorId)))
        .all();
    }
    return db.select().from(vendorIntelligence)
      .where(eq(vendorIntelligence.projectId, projectId))
      .all();
  }

  deleteVendorIntelligence(projectId: number, vendorId: number): void {
    db.delete(vendorIntelligence)
      .where(and(eq(vendorIntelligence.projectId, projectId), eq(vendorIntelligence.vendorId, vendorId)))
      .run();
  }

  deleteVendorIntelligenceById(id: number): void {
    db.delete(vendorIntelligence).where(eq(vendorIntelligence.id, id)).run();
  }

  // ==================== CONTRACT BASELINES ====================

  createContractBaseline(data: { projectId: number; vendorId?: number | null; contractName: string; contractDate?: string | null; totalValue?: string | null; startDate?: string | null; endDate?: string | null; sourceDocument?: string | null; notes?: string | null }): ContractBaseline {
    const now = new Date().toISOString();
    return db.insert(contractBaselines).values({
      projectId: data.projectId,
      vendorId: data.vendorId ?? null,
      contractName: data.contractName,
      contractDate: data.contractDate ?? null,
      totalValue: data.totalValue ?? null,
      startDate: data.startDate ?? null,
      endDate: data.endDate ?? null,
      sourceDocument: data.sourceDocument ?? null,
      notes: data.notes ?? null,
      createdAt: now,
    }).returning().get();
  }

  getContractBaselines(projectId: number): ContractBaseline[] {
    return db.select().from(contractBaselines)
      .where(eq(contractBaselines.projectId, projectId))
      .all();
  }

  getContractBaseline(id: number): ContractBaseline | undefined {
    return db.select().from(contractBaselines)
      .where(eq(contractBaselines.id, id))
      .get();
  }

  updateContractBaseline(id: number, data: Partial<{ vendorId: number | null; contractName: string; contractDate: string | null; totalValue: string | null; startDate: string | null; endDate: string | null; sourceDocument: string | null; notes: string | null }>): ContractBaseline | undefined {
    return db.update(contractBaselines).set(data).where(eq(contractBaselines.id, id)).returning().get();
  }

  deleteContractBaseline(id: number): void {
    db.delete(contractBaselines).where(eq(contractBaselines.id, id)).run();
  }

  // ==================== CONTRACT DELIVERABLES ====================

  createDeliverable(data: { baselineId: number; category: string; name: string; description?: string | null; dueDate?: string | null; status?: string; priority?: string; contractReference?: string | null; notes?: string | null; externalId?: string | null; externalUrl?: string | null }): ContractDeliverable {
    const now = new Date().toISOString();
    return db.insert(contractDeliverables).values({
      baselineId: data.baselineId,
      category: data.category,
      name: data.name,
      description: data.description ?? null,
      dueDate: data.dueDate ?? null,
      status: data.status || "not_started",
      priority: data.priority || "standard",
      contractReference: data.contractReference ?? null,
      notes: data.notes ?? null,
      externalId: data.externalId ?? null,
      externalUrl: data.externalUrl ?? null,
      createdAt: now,
    }).returning().get();
  }

  getDeliverables(baselineId: number): ContractDeliverable[] {
    return db.select().from(contractDeliverables)
      .where(eq(contractDeliverables.baselineId, baselineId))
      .all();
  }

  updateDeliverable(id: number, data: Partial<{ category: string; name: string; description: string | null; dueDate: string | null; status: string; priority: string; contractReference: string | null; notes: string | null; completedDate: string | null }>): ContractDeliverable | undefined {
    return db.update(contractDeliverables).set(data).where(eq(contractDeliverables.id, id)).returning().get();
  }

  deleteDeliverable(id: number): void {
    db.delete(contractDeliverables).where(eq(contractDeliverables.id, id)).run();
  }

  createDeliverablesBulk(items: Array<{ baselineId: number; category: string; name: string; description?: string | null; dueDate?: string | null; status?: string; priority?: string; contractReference?: string | null; notes?: string | null }>): ContractDeliverable[] {
    const now = new Date().toISOString();
    const results: ContractDeliverable[] = [];
    for (const item of items) {
      const created = db.insert(contractDeliverables).values({
        baselineId: item.baselineId,
        category: item.category,
        name: item.name,
        description: item.description ?? null,
        dueDate: item.dueDate ?? null,
        status: item.status || "not_started",
        priority: item.priority || "standard",
        contractReference: item.contractReference ?? null,
        notes: item.notes ?? null,
        createdAt: now,
      }).returning().get();
      results.push(created);
    }
    return results;
  }

  // ==================== COMPLIANCE EVIDENCE ====================

  addEvidence(data: { deliverableId: number; type: string; title: string; description?: string | null; fileName?: string | null; fileContent?: string | null; assessmentResult?: string | null; assessorNotes?: string | null }): ComplianceEvidence {
    const now = new Date().toISOString();
    return db.insert(complianceEvidence).values({
      deliverableId: data.deliverableId,
      type: data.type,
      title: data.title,
      description: data.description ?? null,
      fileName: data.fileName ?? null,
      fileContent: data.fileContent ?? null,
      assessmentResult: data.assessmentResult ?? null,
      assessorNotes: data.assessorNotes ?? null,
      createdAt: now,
    }).returning().get();
  }

  getEvidence(deliverableId: number): ComplianceEvidence[] {
    return db.select().from(complianceEvidence)
      .where(eq(complianceEvidence.deliverableId, deliverableId))
      .all();
  }

  deleteEvidence(id: number): void {
    db.delete(complianceEvidence).where(eq(complianceEvidence.id, id)).run();
  }

  // ==================== IV&V CHECKPOINTS ====================

  createCheckpoint(data: { baselineId: number; name: string; phase: string; scheduledDate?: string | null; status?: string; overallAssessment?: string | null; recommendations?: string | null; findings?: string | null }): IvvCheckpoint {
    const now = new Date().toISOString();
    return db.insert(ivvCheckpoints).values({
      baselineId: data.baselineId,
      name: data.name,
      phase: data.phase,
      scheduledDate: data.scheduledDate ?? null,
      status: data.status || "upcoming",
      overallAssessment: data.overallAssessment ?? null,
      recommendations: data.recommendations ?? null,
      findings: data.findings ?? null,
      createdAt: now,
    }).returning().get();
  }

  getCheckpoints(baselineId: number): IvvCheckpoint[] {
    return db.select().from(ivvCheckpoints)
      .where(eq(ivvCheckpoints.baselineId, baselineId))
      .all();
  }

  getCheckpoint(id: number): IvvCheckpoint | undefined {
    return db.select().from(ivvCheckpoints)
      .where(eq(ivvCheckpoints.id, id))
      .get();
  }

  updateCheckpoint(id: number, data: Partial<{ name: string; phase: string; scheduledDate: string | null; completedDate: string | null; status: string; overallAssessment: string | null; recommendations: string | null; findings: string | null }>): IvvCheckpoint | undefined {
    return db.update(ivvCheckpoints).set(data).where(eq(ivvCheckpoints.id, id)).returning().get();
  }

  deleteCheckpoint(id: number): void {
    db.delete(ivvCheckpoints).where(eq(ivvCheckpoints.id, id)).run();
  }

  // ==================== DEVIATIONS ====================

  createDeviation(data: { baselineId: number; deliverableId?: number | null; severity: string; category: string; title: string; description: string; contractReference?: string | null; actualDelivery?: string | null; impact?: string | null; status?: string; resolution?: string | null }): Deviation {
    const now = new Date().toISOString();

    // Calculate escalation due based on severity
    let escalationDue: string | null = null;
    const nowDate = new Date();
    switch (data.severity) {
      case "critical":
        escalationDue = new Date(nowDate.getTime() + 8 * 60 * 60 * 1000).toISOString();
        break;
      case "major":
        escalationDue = new Date(nowDate.getTime() + 24 * 60 * 60 * 1000).toISOString();
        break;
      case "minor": {
        // Next Monday
        const daysUntilMonday = (8 - nowDate.getDay()) % 7 || 7;
        const nextMonday = new Date(nowDate);
        nextMonday.setDate(nextMonday.getDate() + daysUntilMonday);
        nextMonday.setHours(9, 0, 0, 0);
        escalationDue = nextMonday.toISOString();
        break;
      }
      // observation: no SLA
    }

    return db.insert(deviations).values({
      baselineId: data.baselineId,
      deliverableId: data.deliverableId ?? null,
      severity: data.severity,
      category: data.category,
      title: data.title,
      description: data.description,
      contractReference: data.contractReference ?? null,
      actualDelivery: data.actualDelivery ?? null,
      impact: data.impact ?? null,
      status: data.status || "open",
      resolution: data.resolution ?? null,
      escalationDue,
      escalationStatus: escalationDue ? "pending" : null,
      createdAt: now,
    }).returning().get();
  }

  getDeviations(baselineId: number): Deviation[] {
    return db.select().from(deviations)
      .where(eq(deviations.baselineId, baselineId))
      .all();
  }

  getDeviation(id: number): Deviation | undefined {
    return db.select().from(deviations).where(eq(deviations.id, id)).get();
  }

  updateDeviation(id: number, data: Partial<{ severity: string; category: string; title: string; description: string; contractReference: string | null; actualDelivery: string | null; impact: string | null; status: string; resolution: string | null; deliverableId: number | null; escalationStatus: string; escalatedAt: string | null }>): Deviation | undefined {
    return db.update(deviations).set(data).where(eq(deviations.id, id)).returning().get();
  }

  deleteDeviation(id: number): void {
    db.delete(deviations).where(eq(deviations.id, id)).run();
  }

  // ==================== COMPLIANCE SUMMARY ====================

  getComplianceSummary(projectId: number): any {
    const baselines = this.getContractBaselines(projectId);

    let totalDeliverables = 0;
    let acceptedDeliverables = 0;
    const deliverableStats: Record<string, number> = {
      total: 0, accepted: 0, delivered: 0, in_progress: 0, at_risk: 0, non_compliant: 0, not_started: 0, waived: 0,
    };
    const openDeviations: Record<string, number> = { critical: 0, major: 0, minor: 0, observation: 0 };
    const allCheckpoints: IvvCheckpoint[] = [];
    const allActivity: Array<{ type: string; id: number; title: string; createdAt: string }> = [];

    for (const baseline of baselines) {
      const deliverables = this.getDeliverables(baseline.id);
      totalDeliverables += deliverables.length;
      deliverableStats.total += deliverables.length;

      for (const d of deliverables) {
        if (d.status === "accepted") acceptedDeliverables++;
        deliverableStats[d.status] = (deliverableStats[d.status] || 0) + 1;
        allActivity.push({ type: "deliverable", id: d.id, title: d.name, createdAt: d.createdAt });
      }

      const checkpoints = this.getCheckpoints(baseline.id);
      allCheckpoints.push(...checkpoints);
      for (const cp of checkpoints) {
        allActivity.push({ type: "checkpoint", id: cp.id, title: cp.name, createdAt: cp.createdAt });
      }

      const devs = this.getDeviations(baseline.id);
      for (const dev of devs) {
        if (dev.status !== "resolved") {
          openDeviations[dev.severity] = (openDeviations[dev.severity] || 0) + 1;
        }
        allActivity.push({ type: "deviation", id: dev.id, title: dev.title, createdAt: dev.createdAt });
      }
    }

    const overallCompliance = totalDeliverables > 0 ? Math.round((acceptedDeliverables / totalDeliverables) * 100) : 0;

    const upcomingCheckpoints = allCheckpoints
      .filter(cp => cp.status === "upcoming")
      .sort((a, b) => (a.scheduledDate || "").localeCompare(b.scheduledDate || ""));

    const recentActivity = allActivity
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 10);

    return {
      contracts: baselines,
      overallCompliance,
      deliverableStats,
      openDeviations,
      upcomingCheckpoints,
      recentActivity,
    };
  }

  // ==================== PULSE REPORTS ====================

  createPulseReport(data: { baselineId: number; overallPosture: string; postureTrend?: string | null; narrative: string; riskHighlights?: string | null; milestoneStatus?: string | null; decisionItems?: string | null; metrics?: string | null; weekEnding: string }): PulseReport {
    const now = new Date().toISOString();
    return db.insert(pulseReports).values({
      baselineId: data.baselineId,
      overallPosture: data.overallPosture,
      postureTrend: data.postureTrend ?? null,
      narrative: data.narrative,
      riskHighlights: data.riskHighlights ?? null,
      milestoneStatus: data.milestoneStatus ?? null,
      decisionItems: data.decisionItems ?? null,
      metrics: data.metrics ?? null,
      weekEnding: data.weekEnding,
      createdAt: now,
    }).returning().get();
  }

  getPulseReports(baselineId: number): PulseReport[] {
    return db.select().from(pulseReports)
      .where(eq(pulseReports.baselineId, baselineId))
      .orderBy(desc(pulseReports.createdAt))
      .all();
  }

  getPulseReport(id: number): PulseReport | undefined {
    return db.select().from(pulseReports).where(eq(pulseReports.id, id)).get();
  }

  // ==================== CHECKPOINT ASSESSMENTS ====================

  saveCheckpointAssessment(checkpointId: number, dimensions: Array<{ dimension: string; rating: string; observation?: string | null; evidence?: string | null; recommendation?: string | null }>): CheckpointAssessment[] {
    const now = new Date().toISOString();
    // Delete existing assessments for this checkpoint
    db.delete(checkpointAssessments).where(eq(checkpointAssessments.checkpointId, checkpointId)).run();

    const results: CheckpointAssessment[] = [];
    for (const dim of dimensions) {
      const created = db.insert(checkpointAssessments).values({
        checkpointId,
        dimension: dim.dimension,
        rating: dim.rating,
        observation: dim.observation ?? null,
        evidence: dim.evidence ?? null,
        recommendation: dim.recommendation ?? null,
        createdAt: now,
      }).returning().get();
      results.push(created);
    }
    return results;
  }

  getCheckpointAssessment(checkpointId: number): CheckpointAssessment[] {
    return db.select().from(checkpointAssessments)
      .where(eq(checkpointAssessments.checkpointId, checkpointId))
      .all();
  }

  // ==================== GO-LIVE SCORECARD ====================

  saveGoLiveScorecard(data: { baselineId: number; criteria: string; overallScore?: number | null; overallReadiness?: string | null; assessorNotes?: string | null; assessedAt: string }): GoLiveScorecard {
    const now = new Date().toISOString();
    // Upsert: delete existing for this baseline, then insert
    db.delete(goLiveScorecard).where(eq(goLiveScorecard.baselineId, data.baselineId)).run();
    return db.insert(goLiveScorecard).values({
      baselineId: data.baselineId,
      criteria: data.criteria,
      overallScore: data.overallScore ?? null,
      overallReadiness: data.overallReadiness ?? null,
      assessorNotes: data.assessorNotes ?? null,
      assessedAt: data.assessedAt,
      createdAt: now,
    }).returning().get();
  }

  getGoLiveScorecard(baselineId: number): GoLiveScorecard | undefined {
    return db.select().from(goLiveScorecard)
      .where(eq(goLiveScorecard.baselineId, baselineId))
      .orderBy(desc(goLiveScorecard.createdAt))
      .limit(1)
      .get();
  }

  // ==================== ESCALATION STATUS ====================

  getEscalationStatus(projectId: number): Deviation[] {
    const baselines = this.getContractBaselines(projectId);
    const result: Deviation[] = [];
    for (const baseline of baselines) {
      const devs = this.getDeviations(baseline.id);
      for (const dev of devs) {
        if (dev.escalationDue && dev.status !== "resolved" && dev.escalationStatus !== "acknowledged") {
          result.push(dev);
        }
      }
    }
    // Sort by escalation due (soonest first)
    result.sort((a, b) => (a.escalationDue || "").localeCompare(b.escalationDue || ""));
    return result;
  }

  // ==================== INTEGRATION CONNECTIONS ====================

  createIntegrationConnection(data: { projectId: number; contractId?: number | null; platform: string; name: string; config: string; fieldMapping?: string | null; status?: string }): IntegrationConnection {
    const now = new Date().toISOString();
    return db.insert(integrationConnections).values({
      projectId: data.projectId,
      contractId: data.contractId ?? null,
      platform: data.platform,
      name: data.name,
      config: data.config,
      fieldMapping: data.fieldMapping ?? null,
      status: data.status || "active",
      createdAt: now,
    }).returning().get();
  }

  getIntegrationConnections(projectId: number): IntegrationConnection[] {
    return db.select().from(integrationConnections)
      .where(eq(integrationConnections.projectId, projectId))
      .orderBy(desc(integrationConnections.createdAt))
      .all();
  }

  getIntegrationConnection(id: number): IntegrationConnection | undefined {
    return db.select().from(integrationConnections)
      .where(eq(integrationConnections.id, id))
      .get();
  }

  updateIntegrationConnection(id: number, data: Partial<{ contractId: number | null; platform: string; name: string; config: string; fieldMapping: string | null; status: string; lastSyncAt: string | null; lastSyncStatus: string | null; lastSyncMessage: string | null; syncItemCount: number }>): IntegrationConnection | undefined {
    return db.update(integrationConnections).set(data).where(eq(integrationConnections.id, id)).returning().get();
  }

  deleteIntegrationConnection(id: number): void {
    db.delete(integrationConnections).where(eq(integrationConnections.id, id)).run();
  }

  // ==================== SYNC LOGS ====================

  addSyncLog(data: { connectionId: number; status: string; itemsSynced?: number; itemsCreated?: number; itemsUpdated?: number; itemsSkipped?: number; errors?: string | null; duration?: number | null }): SyncLog {
    const now = new Date().toISOString();
    return db.insert(syncLogs).values({
      connectionId: data.connectionId,
      status: data.status,
      itemsSynced: data.itemsSynced ?? 0,
      itemsCreated: data.itemsCreated ?? 0,
      itemsUpdated: data.itemsUpdated ?? 0,
      itemsSkipped: data.itemsSkipped ?? 0,
      errors: data.errors ?? null,
      duration: data.duration ?? null,
      createdAt: now,
    }).returning().get();
  }

  getSyncLogs(connectionId: number, limit: number = 20): SyncLog[] {
    return db.select().from(syncLogs)
      .where(eq(syncLogs.connectionId, connectionId))
      .orderBy(desc(syncLogs.createdAt))
      .limit(limit)
      .all();
  }

  // ==================== DELIVERABLE BY EXTERNAL ID ====================

  findDeliverableByExternalId(baselineId: number, externalId: string): ContractDeliverable | undefined {
    return db.select().from(contractDeliverables)
      .where(and(
        eq(contractDeliverables.baselineId, baselineId),
        eq(contractDeliverables.externalId, externalId),
      ))
      .get();
  }

  // ==================== ENGAGEMENT MODULES ====================

  updateProjectModules(projectId: number, modules: string[]): Project | undefined {
    return db.update(projects)
      .set({ engagementModules: JSON.stringify(modules) })
      .where(eq(projects.id, projectId))
      .returning().get();
  }

  // ==================== HEALTH CHECK ASSESSMENTS ====================

  createHealthCheckAssessment(data: { projectId: number; domain: string; overallRating?: string | null; findings?: string | null; summary?: string | null; assessedBy?: string | null }): HealthCheckAssessment {
    const now = new Date().toISOString();
    return db.insert(healthCheckAssessments).values({
      projectId: data.projectId,
      domain: data.domain,
      overallRating: data.overallRating ?? null,
      findings: data.findings ?? null,
      summary: data.summary ?? null,
      assessedBy: data.assessedBy ?? null,
      createdAt: now,
    }).returning().get();
  }

  getHealthCheckAssessments(projectId: number): HealthCheckAssessment[] {
    return db.select().from(healthCheckAssessments)
      .where(eq(healthCheckAssessments.projectId, projectId))
      .orderBy(desc(healthCheckAssessments.createdAt))
      .all();
  }

  updateHealthCheckAssessment(id: number, data: Partial<{ domain: string; overallRating: string | null; findings: string | null; summary: string | null; assessedBy: string | null }>): HealthCheckAssessment | undefined {
    return db.update(healthCheckAssessments).set(data).where(eq(healthCheckAssessments.id, id)).returning().get();
  }

  deleteHealthCheckAssessment(id: number): void {
    db.delete(healthCheckAssessments).where(eq(healthCheckAssessments.id, id)).run();
  }

  // ==================== RAID ITEMS ====================

  createRaidItem(data: { projectId: number; type: string; title: string; description?: string | null; severity?: string | null; status?: string; owner?: string | null; dueDate?: string | null; resolution?: string | null; siReported?: number; siDiscrepancy?: string | null }): RaidItem {
    const now = new Date().toISOString();
    return db.insert(raidItems).values({
      projectId: data.projectId,
      type: data.type,
      title: data.title,
      description: data.description ?? null,
      severity: data.severity ?? null,
      status: data.status || "open",
      owner: data.owner ?? null,
      dueDate: data.dueDate ?? null,
      resolution: data.resolution ?? null,
      siReported: data.siReported ?? 0,
      siDiscrepancy: data.siDiscrepancy ?? null,
      createdAt: now,
    }).returning().get();
  }

  getRaidItems(projectId: number, filters?: { type?: string; status?: string }): RaidItem[] {
    const conditions = [eq(raidItems.projectId, projectId)];
    if (filters?.type) conditions.push(eq(raidItems.type, filters.type));
    if (filters?.status) conditions.push(eq(raidItems.status, filters.status));
    return db.select().from(raidItems)
      .where(and(...conditions))
      .orderBy(desc(raidItems.createdAt))
      .all();
  }

  updateRaidItem(id: number, data: Partial<{ type: string; title: string; description: string | null; severity: string | null; status: string; owner: string | null; dueDate: string | null; resolution: string | null; siReported: number; siDiscrepancy: string | null }>): RaidItem | undefined {
    return db.update(raidItems).set(data).where(eq(raidItems.id, id)).returning().get();
  }

  deleteRaidItem(id: number): void {
    db.delete(raidItems).where(eq(raidItems.id, id)).run();
  }

  // ==================== BUDGET TRACKING ====================

  createBudgetEntry(data: { projectId: number; category: string; description: string; amount: number; date?: string | null; notes?: string | null }): BudgetTracking {
    const now = new Date().toISOString();
    return db.insert(budgetTracking).values({
      projectId: data.projectId,
      category: data.category,
      description: data.description,
      amount: data.amount,
      date: data.date ?? null,
      notes: data.notes ?? null,
      createdAt: now,
    }).returning().get();
  }

  getBudgetEntries(projectId: number): BudgetTracking[] {
    return db.select().from(budgetTracking)
      .where(eq(budgetTracking.projectId, projectId))
      .orderBy(desc(budgetTracking.createdAt))
      .all();
  }

  updateBudgetEntry(id: number, data: Partial<{ category: string; description: string; amount: number; date: string | null; notes: string | null }>): BudgetTracking | undefined {
    return db.update(budgetTracking).set(data).where(eq(budgetTracking.id, id)).returning().get();
  }

  deleteBudgetEntry(id: number): void {
    db.delete(budgetTracking).where(eq(budgetTracking.id, id)).run();
  }

  getBudgetSummary(projectId: number): { originalContract: number; totalChangeOrders: number; totalAdditionalFunding: number; totalActualSpend: number; variance: number } {
    const entries = this.getBudgetEntries(projectId);
    let originalContract = 0;
    let totalChangeOrders = 0;
    let totalAdditionalFunding = 0;
    let totalActualSpend = 0;
    for (const e of entries) {
      switch (e.category) {
        case "original_contract": originalContract += e.amount; break;
        case "change_order": totalChangeOrders += e.amount; break;
        case "additional_funding": totalAdditionalFunding += e.amount; break;
        case "actual_spend": totalActualSpend += e.amount; break;
      }
    }
    const totalBudget = originalContract + totalChangeOrders + totalAdditionalFunding;
    const variance = totalBudget - totalActualSpend;
    return { originalContract, totalChangeOrders, totalAdditionalFunding, totalActualSpend, variance };
  }

  // ==================== SCHEDULE TRACKING ====================

  createScheduleEntry(data: { projectId: number; milestone: string; originalDate?: string | null; currentDate?: string | null; actualDate?: string | null; status?: string; varianceDays?: number | null; notes?: string | null }): ScheduleTracking {
    const now = new Date().toISOString();
    return db.insert(scheduleTracking).values({
      projectId: data.projectId,
      milestone: data.milestone,
      originalDate: data.originalDate ?? null,
      currentDate: data.currentDate ?? null,
      actualDate: data.actualDate ?? null,
      status: data.status || "on_track",
      varianceDays: data.varianceDays ?? null,
      notes: data.notes ?? null,
      createdAt: now,
    }).returning().get();
  }

  getScheduleEntries(projectId: number): ScheduleTracking[] {
    return db.select().from(scheduleTracking)
      .where(eq(scheduleTracking.projectId, projectId))
      .orderBy(scheduleTracking.originalDate)
      .all();
  }

  updateScheduleEntry(id: number, data: Partial<{ milestone: string; originalDate: string | null; currentDate: string | null; actualDate: string | null; status: string; varianceDays: number | null; notes: string | null }>): ScheduleTracking | undefined {
    return db.update(scheduleTracking).set(data).where(eq(scheduleTracking.id, id)).returning().get();
  }

  deleteScheduleEntry(id: number): void {
    db.delete(scheduleTracking).where(eq(scheduleTracking.id, id)).run();
  }

  // ==================== ASSESSMENT HISTORY ====================

  createAssessmentHistory(data: { projectId: number; domain: string; previousRating: string; newRating: string; changedBy?: string }): AssessmentHistory {
    return db.insert(assessmentHistory).values({
      projectId: data.projectId,
      domain: data.domain,
      previousRating: data.previousRating,
      newRating: data.newRating,
      changedBy: data.changedBy || null,
      createdAt: new Date().toISOString(),
    }).returning().get();
  }

  getAssessmentHistory(projectId: number, domain?: string): AssessmentHistory[] {
    if (domain) {
      return db.select().from(assessmentHistory)
        .where(and(eq(assessmentHistory.projectId, projectId), eq(assessmentHistory.domain, domain)))
        .orderBy(desc(assessmentHistory.createdAt))
        .all();
    }
    return db.select().from(assessmentHistory)
      .where(eq(assessmentHistory.projectId, projectId))
      .orderBy(desc(assessmentHistory.createdAt))
      .all();
  }

  // ==================== PROJECT BASELINE (CONTRACT/SOW) ====================

  getProjectBaseline(projectId: number): ProjectBaseline | undefined {
    return db.select().from(projectBaselines)
      .where(eq(projectBaselines.projectId, projectId))
      .get();
  }

  upsertProjectBaseline(projectId: number, data: Partial<{ contractedAmount: number | null; goLiveDate: string | null; contractStartDate: string | null; scopeItems: string | null; keyMilestones: string | null; vendorName: string | null; notes: string | null }>): ProjectBaseline {
    const existing = this.getProjectBaseline(projectId);
    const now = new Date().toISOString();
    if (existing) {
      return db.update(projectBaselines).set({ ...data, updatedAt: now }).where(eq(projectBaselines.id, existing.id)).returning().get();
    }
    return db.insert(projectBaselines).values({
      projectId,
      contractedAmount: data.contractedAmount ?? null,
      goLiveDate: data.goLiveDate ?? null,
      contractStartDate: data.contractStartDate ?? null,
      scopeItems: data.scopeItems ?? null,
      keyMilestones: data.keyMilestones ?? null,
      vendorName: data.vendorName ?? null,
      notes: data.notes ?? null,
      createdAt: now,
    }).returning().get();
  }

  // ==================== VENDOR CAPABILITIES (KNOWLEDGE BASE) ====================

  createVendorCapability(data: { vendorPlatform: string; module: string; processArea: string; workflowDescription?: string | null; differentiators?: string | null; limitations?: string | null; bestFitFor?: string | null; integrationNotes?: string | null; automationLevel?: string | null; maturityRating?: number | null; sourceDocuments?: string | null; lastUpdated?: string | null }): VendorCapability {
    return db.insert(vendorCapabilities).values({
      vendorPlatform: data.vendorPlatform,
      module: data.module,
      processArea: data.processArea,
      workflowDescription: data.workflowDescription ?? null,
      differentiators: data.differentiators ?? null,
      limitations: data.limitations ?? null,
      bestFitFor: data.bestFitFor ?? null,
      integrationNotes: data.integrationNotes ?? null,
      automationLevel: data.automationLevel ?? null,
      maturityRating: data.maturityRating ?? null,
      sourceDocuments: data.sourceDocuments ?? null,
      lastUpdated: data.lastUpdated ?? new Date().toISOString(),
      createdAt: new Date().toISOString(),
    }).returning().get();
  }

  getVendorCapabilities(filters?: { platform?: string; module?: string; search?: string }): VendorCapability[] {
    const conditions = [];
    if (filters?.platform) conditions.push(eq(vendorCapabilities.vendorPlatform, filters.platform));
    if (filters?.module) conditions.push(eq(vendorCapabilities.module, filters.module));
    if (filters?.search) {
      const pattern = `%${filters.search}%`;
      conditions.push(
        or(
          like(vendorCapabilities.workflowDescription, pattern),
          like(vendorCapabilities.differentiators, pattern),
          like(vendorCapabilities.limitations, pattern),
          like(vendorCapabilities.processArea, pattern),
        )!
      );
    }
    if (conditions.length === 0) {
      return db.select().from(vendorCapabilities).orderBy(vendorCapabilities.module, vendorCapabilities.vendorPlatform).all();
    }
    return db.select().from(vendorCapabilities)
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .orderBy(vendorCapabilities.module, vendorCapabilities.vendorPlatform)
      .all();
  }

  getVendorCapability(id: number): VendorCapability | undefined {
    return db.select().from(vendorCapabilities).where(eq(vendorCapabilities.id, id)).get();
  }

  updateVendorCapability(id: number, data: Partial<{ vendorPlatform: string; module: string; processArea: string; workflowDescription: string | null; differentiators: string | null; limitations: string | null; bestFitFor: string | null; integrationNotes: string | null; automationLevel: string | null; maturityRating: number | null; sourceDocuments: string | null; lastUpdated: string | null }>): VendorCapability | undefined {
    return db.update(vendorCapabilities).set({ ...data, lastUpdated: new Date().toISOString() }).where(eq(vendorCapabilities.id, id)).returning().get();
  }

  deleteVendorCapability(id: number): void {
    db.delete(vendorCapabilities).where(eq(vendorCapabilities.id, id)).run();
  }

  compareCapabilities(module: string, platforms: string[]): VendorCapability[] {
    return db.select().from(vendorCapabilities)
      .where(and(eq(vendorCapabilities.module, module), inArray(vendorCapabilities.vendorPlatform, platforms)))
      .orderBy(vendorCapabilities.vendorPlatform)
      .all();
  }

  getModuleCoverage(): { vendorPlatform: string; module: string; maturityRating: number | null }[] {
    return db.select({
      vendorPlatform: vendorCapabilities.vendorPlatform,
      module: vendorCapabilities.module,
      maturityRating: vendorCapabilities.maturityRating,
    }).from(vendorCapabilities)
      .orderBy(vendorCapabilities.module, vendorCapabilities.vendorPlatform)
      .all();
  }

  // ==================== VENDOR PROCESS DETAILS ====================

  bulkCreateProcessDetails(items: { vendorPlatform: string; module: string; reqReference?: string | null; capability: string; howHandled?: string | null; score?: string | null; sourceVendor?: string | null }[]): void {
    const now = new Date().toISOString();
    for (const item of items) {
      db.insert(vendorProcessDetails).values({
        vendorPlatform: item.vendorPlatform,
        module: item.module,
        reqReference: item.reqReference ?? null,
        capability: item.capability,
        howHandled: item.howHandled ?? null,
        score: item.score ?? null,
        sourceVendor: item.sourceVendor ?? null,
        createdAt: now,
      }).run();
    }
  }

  getProcessDetails(filters?: { platform?: string; module?: string; search?: string }): VendorProcessDetail[] {
    const conditions = [];
    if (filters?.platform) conditions.push(eq(vendorProcessDetails.vendorPlatform, filters.platform));
    if (filters?.module) conditions.push(eq(vendorProcessDetails.module, filters.module));
    if (filters?.search) {
      const pattern = `%${filters.search}%`;
      conditions.push(
        or(
          like(vendorProcessDetails.capability, pattern),
          like(vendorProcessDetails.howHandled, pattern),
        )!
      );
    }
    if (conditions.length === 0) {
      return db.select().from(vendorProcessDetails).orderBy(vendorProcessDetails.module).all();
    }
    return db.select().from(vendorProcessDetails)
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .orderBy(vendorProcessDetails.module)
      .all();
  }

  // ==================== ENGAGEMENT MODE ====================

  updateProjectEngagementMode(id: number, mode: string): Project | undefined {
    return db.update(projects)
      .set({ engagementMode: mode })
      .where(eq(projects.id, id))
      .returning().get();
  }

  // ==================== ORG PROFILE ====================

  upsertOrgProfile(projectId: number, data: { entityType?: string | null; entityName?: string | null; state?: string | null; population?: number | null; employeeCount?: number | null; annualBudget?: string | null; currentSystems?: string | null; departments?: string | null; painSummary?: string | null; domain?: string | null; leadership?: string | null; documents?: string | null }): OrgProfile {
    const existing = db.select().from(orgProfile).where(eq(orgProfile.projectId, projectId)).get();
    if (existing) {
      return db.update(orgProfile).set(data).where(eq(orgProfile.id, existing.id)).returning().get()!;
    }
    return db.insert(orgProfile).values({
      projectId,
      entityType: data.entityType ?? null,
      entityName: data.entityName ?? null,
      state: data.state ?? null,
      population: data.population ?? null,
      employeeCount: data.employeeCount ?? null,
      annualBudget: data.annualBudget ?? null,
      currentSystems: data.currentSystems ?? null,
      departments: data.departments ?? null,
      painSummary: data.painSummary ?? null,
      domain: data.domain ?? null,
      leadership: data.leadership ?? null,
      documents: data.documents ?? null,
      createdAt: new Date().toISOString(),
    }).returning().get();
  }

  getOrgProfile(projectId: number): OrgProfile | undefined {
    return db.select().from(orgProfile).where(eq(orgProfile.projectId, projectId)).get();
  }

  // ==================== DISCOVERY INTERVIEWS ====================

  createDiscoveryInterview(data: { projectId: number; functionalArea: string; interviewee?: string | null; role?: string | null }): DiscoveryInterview {
    return db.insert(discoveryInterviews).values({
      projectId: data.projectId,
      functionalArea: data.functionalArea,
      status: "not_started",
      interviewee: data.interviewee ?? null,
      role: data.role ?? null,
      messages: "[]",
      createdAt: new Date().toISOString(),
    }).returning().get();
  }

  getDiscoveryInterviews(projectId: number): DiscoveryInterview[] {
    return db.select().from(discoveryInterviews)
      .where(eq(discoveryInterviews.projectId, projectId))
      .orderBy(discoveryInterviews.createdAt)
      .all();
  }

  getDiscoveryInterview(id: number): DiscoveryInterview | undefined {
    return db.select().from(discoveryInterviews).where(eq(discoveryInterviews.id, id)).get();
  }

  updateDiscoveryInterview(id: number, data: Partial<{ status: string; interviewee: string | null; role: string | null; messages: string | null; findings: string | null; painPoints: string | null; processSteps: string | null }>): DiscoveryInterview | undefined {
    return db.update(discoveryInterviews).set(data).where(eq(discoveryInterviews.id, id)).returning().get();
  }

  deleteDiscoveryInterview(id: number): void {
    db.delete(discoveryInterviews).where(eq(discoveryInterviews.id, id)).run();
  }

  // ==================== DISCOVERY PAIN POINTS ====================

  createPainPoint(data: { projectId: number; sourceInterviewId?: number | null; functionalArea: string; description: string; severity?: string | null; frequency?: string | null; impact?: string | null; currentWorkaround?: string | null; stakeholderPriority?: number | null; linkedRequirements?: string | null }): DiscoveryPainPoint {
    return db.insert(discoveryPainPoints).values({
      projectId: data.projectId,
      sourceInterviewId: data.sourceInterviewId ?? null,
      functionalArea: data.functionalArea,
      description: data.description,
      severity: data.severity ?? null,
      frequency: data.frequency ?? null,
      impact: data.impact ?? null,
      currentWorkaround: data.currentWorkaround ?? null,
      stakeholderPriority: data.stakeholderPriority ?? null,
      linkedRequirements: data.linkedRequirements ?? null,
      createdAt: new Date().toISOString(),
    }).returning().get();
  }

  getPainPoints(projectId: number): DiscoveryPainPoint[] {
    return db.select().from(discoveryPainPoints)
      .where(eq(discoveryPainPoints.projectId, projectId))
      .orderBy(desc(discoveryPainPoints.stakeholderPriority))
      .all();
  }

  updatePainPoint(id: number, data: Partial<{ severity: string | null; frequency: string | null; impact: string | null; currentWorkaround: string | null; stakeholderPriority: number | null; linkedRequirements: string | null }>): DiscoveryPainPoint | undefined {
    return db.update(discoveryPainPoints).set(data).where(eq(discoveryPainPoints.id, id)).returning().get();
  }

  bulkUpdatePainPointPriorities(updates: { id: number; priority: number }[]): void {
    for (const u of updates) {
      db.update(discoveryPainPoints).set({ stakeholderPriority: u.priority }).where(eq(discoveryPainPoints.id, u.id)).run();
    }
  }

  // Process Transformations
  createProcessTransformation(data: any): ProcessTransformation {
    return db.insert(processTransformations).values({
      projectId: data.projectId,
      functionalArea: data.functionalArea,
      vendorPlatform: data.vendorPlatform,
      currentStepCount: data.currentStepCount,
      currentManualSteps: data.currentManualSteps,
      currentSystems: data.currentSystems,
      currentProcessingTime: data.currentProcessingTime,
      currentPainPoints: data.currentPainPoints,
      currentDescription: data.currentDescription,
      currentSteps: typeof data.currentSteps === "string" ? data.currentSteps : JSON.stringify(data.currentSteps),
      futureStepCount: data.futureStepCount,
      futureManualSteps: data.futureManualSteps,
      futureSystems: data.futureSystems,
      futureProcessingTime: data.futureProcessingTime,
      futureDescription: data.futureDescription,
      futureSteps: typeof data.futureSteps === "string" ? data.futureSteps : JSON.stringify(data.futureSteps),
      improvements: typeof data.improvements === "string" ? data.improvements : JSON.stringify(data.improvements),
      eliminatedSteps: typeof data.eliminatedSteps === "string" ? data.eliminatedSteps : JSON.stringify(data.eliminatedSteps),
      newCapabilities: typeof data.newCapabilities === "string" ? data.newCapabilities : JSON.stringify(data.newCapabilities),
    }).returning().get();
  }

  getProcessTransformations(projectId: number, vendorPlatform?: string): ProcessTransformation[] {
    if (vendorPlatform) {
      return db.select().from(processTransformations)
        .where(and(eq(processTransformations.projectId, projectId), eq(processTransformations.vendorPlatform, vendorPlatform)))
        .all();
    }
    return db.select().from(processTransformations)
      .where(eq(processTransformations.projectId, projectId))
      .all();
  }

  getProcessTransformation(id: number): ProcessTransformation | undefined {
    return db.select().from(processTransformations).where(eq(processTransformations.id, id)).get();
  }

  deleteProcessTransformations(projectId: number, vendorPlatform?: string, functionalArea?: string): void {
    const conditions = [eq(processTransformations.projectId, projectId)];
    if (vendorPlatform) conditions.push(eq(processTransformations.vendorPlatform, vendorPlatform));
    if (functionalArea) conditions.push(eq(processTransformations.functionalArea, functionalArea));
    db.delete(processTransformations).where(and(...conditions)).run();
  }

  // ==================== PROJECT DOCUMENTS ====================

  createProjectDocument(data: any): ProjectDocument {
    return db.insert(projectDocuments).values({
      projectId: data.projectId ?? null,
      clientId: data.clientId ?? null,
      fileName: data.fileName,
      fileSize: data.fileSize ?? null,
      mimeType: data.mimeType ?? null,
      documentType: data.documentType,
      source: data.source || "upload",
      rawText: data.rawText ?? null,
      aiAnalysis: data.aiAnalysis ?? null,
      analysisStatus: data.analysisStatus || "pending",
      extractedItems: data.extractedItems ?? null,
      period: data.period ?? null,
      uploadedBy: data.uploadedBy ?? null,
    }).returning().get();
  }

  getProjectDocuments(projectId: number, documentType?: string): ProjectDocument[] {
    // Get project's own documents + client-level documents
    const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
    const clientId = project?.clientId;
    const conditions: any[] = [eq(projectDocuments.projectId, projectId)];
    if (clientId) {
      conditions.push(eq(projectDocuments.clientId, clientId));
    }
    let query;
    if (documentType) {
      query = db.select().from(projectDocuments)
        .where(and(or(...conditions), eq(projectDocuments.documentType, documentType)));
    } else {
      query = db.select().from(projectDocuments)
        .where(or(...conditions));
    }
    return query.orderBy(desc(projectDocuments.createdAt)).all();
  }

  getClientDocuments(clientId: number, documentType?: string): ProjectDocument[] {
    if (documentType) {
      return db.select().from(projectDocuments)
        .where(and(eq(projectDocuments.clientId, clientId), eq(projectDocuments.documentType, documentType)))
        .orderBy(desc(projectDocuments.createdAt)).all();
    }
    return db.select().from(projectDocuments)
      .where(eq(projectDocuments.clientId, clientId))
      .orderBy(desc(projectDocuments.createdAt)).all();
  }

  getProjectDocument(id: number): ProjectDocument | undefined {
    return db.select().from(projectDocuments).where(eq(projectDocuments.id, id)).get();
  }

  updateProjectDocument(id: number, data: any): ProjectDocument | undefined {
    return db.update(projectDocuments).set(data).where(eq(projectDocuments.id, id)).returning().get();
  }

  deleteProjectDocument(id: number): void {
    db.delete(projectDocuments).where(eq(projectDocuments.id, id)).run();
  }

  // ==================== MONITORING PIPELINE ====================

  createMonitoringSource(data: any): MonitoringSource {
    return db.insert(monitoringSources).values({
      vendorPlatform: data.vendorPlatform,
      sourceType: data.sourceType,
      name: data.name,
      url: data.url,
      checkFrequency: data.checkFrequency || "weekly",
      isActive: data.isActive ?? 1,
    }).returning().get();
  }

  getMonitoringSources(vendorPlatform?: string): MonitoringSource[] {
    if (vendorPlatform) {
      return db.select().from(monitoringSources)
        .where(eq(monitoringSources.vendorPlatform, vendorPlatform))
        .orderBy(monitoringSources.vendorPlatform, monitoringSources.name)
        .all();
    }
    return db.select().from(monitoringSources)
      .orderBy(monitoringSources.vendorPlatform, monitoringSources.name)
      .all();
  }

  getMonitoringSource(id: number): MonitoringSource | undefined {
    return db.select().from(monitoringSources).where(eq(monitoringSources.id, id)).get();
  }

  updateMonitoringSource(id: number, data: any): MonitoringSource | undefined {
    return db.update(monitoringSources).set(data).where(eq(monitoringSources.id, id)).returning().get();
  }

  deleteMonitoringSource(id: number): void {
    db.delete(monitoringSources).where(eq(monitoringSources.id, id)).run();
  }

  createMonitoringRun(data: any): MonitoringRun {
    return db.insert(monitoringRuns).values({
      sourceId: data.sourceId,
      status: data.status,
      contentHash: data.contentHash ?? null,
      rawContentPreview: data.rawContentPreview ?? null,
      changesDetected: data.changesDetected ?? 0,
      errorMessage: data.errorMessage ?? null,
      durationMs: data.durationMs ?? null,
    }).returning().get();
  }

  getMonitoringRuns(sourceId?: number, limit?: number): MonitoringRun[] {
    const lim = limit || 50;
    if (sourceId) {
      return db.select().from(monitoringRuns)
        .where(eq(monitoringRuns.sourceId, sourceId))
        .orderBy(desc(monitoringRuns.createdAt))
        .limit(lim)
        .all();
    }
    return db.select().from(monitoringRuns)
      .orderBy(desc(monitoringRuns.createdAt))
      .limit(lim)
      .all();
  }

  createVendorChange(data: any): VendorChange {
    return db.insert(vendorChanges).values({
      runId: data.runId,
      vendorPlatform: data.vendorPlatform,
      changeType: data.changeType,
      severity: data.severity || "info",
      title: data.title,
      summary: data.summary,
      details: data.details ?? null,
      affectedModules: typeof data.affectedModules === "string" ? data.affectedModules : JSON.stringify(data.affectedModules || []),
      affectedCapabilities: typeof data.affectedCapabilities === "string" ? data.affectedCapabilities : JSON.stringify(data.affectedCapabilities || []),
      sourceUrl: data.sourceUrl ?? null,
      rawExcerpt: data.rawExcerpt ?? null,
    }).returning().get();
  }

  getVendorChanges(filters?: { vendorPlatform?: string; changeType?: string; isReviewed?: number; limit?: number }): VendorChange[] {
    const conditions: any[] = [];
    if (filters?.vendorPlatform) conditions.push(eq(vendorChanges.vendorPlatform, filters.vendorPlatform));
    if (filters?.changeType) conditions.push(eq(vendorChanges.changeType, filters.changeType));
    if (filters?.isReviewed !== undefined) conditions.push(eq(vendorChanges.isReviewed, filters.isReviewed));
    const query = conditions.length > 0
      ? db.select().from(vendorChanges).where(and(...conditions))
      : db.select().from(vendorChanges);
    return query.orderBy(desc(vendorChanges.createdAt)).limit(filters?.limit || 100).all();
  }

  updateVendorChange(id: number, data: any): VendorChange | undefined {
    return db.update(vendorChanges).set(data).where(eq(vendorChanges.id, id)).returning().get();
  }

  createMonitoringAlert(data: any): MonitoringAlert {
    return db.insert(monitoringAlerts).values({
      changeId: data.changeId,
      alertType: data.alertType,
      priority: data.priority || "medium",
      title: data.title,
      message: data.message,
      affectedProjects: typeof data.affectedProjects === "string" ? data.affectedProjects : JSON.stringify(data.affectedProjects || []),
    }).returning().get();
  }

  getMonitoringAlerts(filters?: { priority?: string; isDismissed?: number }): MonitoringAlert[] {
    const conditions: any[] = [];
    if (filters?.priority) conditions.push(eq(monitoringAlerts.priority, filters.priority));
    if (filters?.isDismissed !== undefined) conditions.push(eq(monitoringAlerts.isDismissed, filters.isDismissed));
    const query = conditions.length > 0
      ? db.select().from(monitoringAlerts).where(and(...conditions))
      : db.select().from(monitoringAlerts);
    return query.orderBy(desc(monitoringAlerts.createdAt)).all();
  }

  updateMonitoringAlert(id: number, data: any): MonitoringAlert | undefined {
    return db.update(monitoringAlerts).set(data).where(eq(monitoringAlerts.id, id)).returning().get();
  }

  getMonitoringStats(): { totalSources: number; activeSources: number; totalChanges: number; unreviewedChanges: number; activeAlerts: number; lastScanAt: string | null } {
    const allSources = db.select().from(monitoringSources).all();
    const activeSources = allSources.filter(s => s.isActive === 1);
    const allChanges = db.select().from(vendorChanges).all();
    const unreviewedChanges = allChanges.filter(c => c.isReviewed === 0);
    const activeAlerts = db.select().from(monitoringAlerts).where(eq(monitoringAlerts.isDismissed, 0)).all();
    const lastRun = db.select().from(monitoringRuns).orderBy(desc(monitoringRuns.createdAt)).limit(1).get();
    return {
      totalSources: allSources.length,
      activeSources: activeSources.length,
      totalChanges: allChanges.length,
      unreviewedChanges: unreviewedChanges.length,
      activeAlerts: activeAlerts.length,
      lastScanAt: lastRun?.createdAt || null,
    };
  }
}

export const storage = new DatabaseStorage();
