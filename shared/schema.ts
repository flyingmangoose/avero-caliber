import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ==================== USERS ====================

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  googleId: text("google_id").notNull().unique(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  picture: text("picture"),
  role: text("role").default("viewer"), // admin, editor, viewer
  isActive: integer("is_active").default(1),
  lastLoginAt: text("last_login_at"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export type User = typeof users.$inferSelect;

// ==================== CLIENTS ====================

export const clients = sqliteTable("clients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  domain: text("domain"), // website domain for enrichment
  entityType: text("entity_type"), // city, county, utility, transit, port, state_agency, special_district
  state: text("state"),
  population: integer("population"),
  employeeCount: integer("employee_count"),
  annualBudget: text("annual_budget"),
  currentSystems: text("current_systems"), // JSON
  departments: text("departments"), // JSON
  painSummary: text("pain_summary"),
  leadership: text("leadership"), // JSON
  documents: text("documents"), // JSON: uploaded docs
  description: text("description").default(""),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").$defaultFn(() => new Date().toISOString()),
});

export const insertClientSchema = createInsertSchema(clients).omit({ id: true, createdAt: true, updatedAt: true });
export type Client = typeof clients.$inferSelect;
export type InsertClient = z.infer<typeof insertClientSchema>;

// ==================== PROJECTS ====================

export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").references(() => clients.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("draft"),
  engagementModules: text("engagement_modules").default('["selection"]'), // JSON array: selection, ivv, health_check
  engagementMode: text("engagement_mode").default("consulting"), // 'consulting' | 'self_service'
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const requirements = sqliteTable("requirements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  reqNumber: text("req_number").notNull(),
  category: text("category").notNull(),
  functionalArea: text("functional_area").notNull(),
  subCategory: text("sub_category").notNull(),
  description: text("description").notNull(),
  criticality: text("criticality").notNull().default("Critical"),
  vendorResponse: text("vendor_response"),
  comments: text("comments").notNull().default(""),
  createdAt: text("created_at").notNull(),
});

// Vendor profiles (static data, seeded from vendorProfiles)
export const vendors = sqliteTable("vendors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
  description: text("description").notNull(),
  market: text("market").notNull(),
  strengths: text("strengths").notNull(), // JSON array
  weaknesses: text("weaknesses").notNull(), // JSON array
  moduleRatings: text("module_ratings").notNull(), // JSON
  color: text("color").notNull().default("#1a2744"),
  platformType: text("platform_type").notNull().default("erp"), // erp, eam, pms
  coveredModules: text("covered_modules").notNull().default("[]"), // JSON array of module names
});

// Project-level vendor evaluation settings
export const projectVendorSettings = sqliteTable("project_vendor_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  moduleWeights: text("module_weights").notNull(), // JSON: { "General Ledger": 10, ... }
  selectedVendors: text("selected_vendors").notNull(), // JSON array of vendor IDs
});

// Per-requirement vendor scores (overrides for specific project)
export const vendorRequirementScores = sqliteTable("vendor_requirement_scores", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  requirementId: integer("requirement_id").notNull().references(() => requirements.id, { onDelete: "cascade" }),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id),
  score: text("score").notNull(), // S, F, C, T, N
});

// Workshop shareable links
export const workshopLinks = sqliteTable("workshop_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(), // UUID token for URL
  stakeholderName: text("stakeholder_name").notNull(), // e.g., "Finance Department"
  stakeholderEmail: text("stakeholder_email").notNull().default(""),
  modules: text("modules").notNull(), // JSON array of functional area names, empty = all
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at"), // nullable = never expires
  isActive: integer("is_active").notNull().default(1), // 0 = deactivated
});

// Stakeholder feedback on requirements
export const workshopFeedback = sqliteTable("workshop_feedback", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workshopLinkId: integer("workshop_link_id").notNull().references(() => workshopLinks.id, { onDelete: "cascade" }),
  requirementId: integer("requirement_id").notNull().references(() => requirements.id, { onDelete: "cascade" }),
  criticality: text("criticality"), // stakeholder's opinion: Critical/Desired/Not Required/Not Applicable
  comment: text("comment").notNull().default(""),
  flaggedForDiscussion: integer("flagged_for_discussion").notNull().default(0), // boolean
  status: text("status").notNull().default("pending"), // pending/approved/rejected
  updatedAt: text("updated_at").notNull(),
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRequirementSchema = createInsertSchema(requirements).omit({
  id: true,
  createdAt: true,
});

export const insertVendorSchema = createInsertSchema(vendors).omit({ id: true });
export const insertProjectVendorSettingsSchema = createInsertSchema(projectVendorSettings).omit({ id: true });
export const insertVendorRequirementScoreSchema = createInsertSchema(vendorRequirementScores).omit({ id: true });

export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;
export type InsertRequirement = z.infer<typeof insertRequirementSchema>;
export type Requirement = typeof requirements.$inferSelect;
export type Vendor = typeof vendors.$inferSelect;
export type InsertVendor = z.infer<typeof insertVendorSchema>;
export type ProjectVendorSettings = typeof projectVendorSettings.$inferSelect;
export type InsertProjectVendorSettings = z.infer<typeof insertProjectVendorSettingsSchema>;
export type VendorRequirementScore = typeof vendorRequirementScores.$inferSelect;
export type InsertVendorRequirementScore = z.infer<typeof insertVendorRequirementScoreSchema>;

// Custom scoring criteria
export const customCriteria = sqliteTable("custom_criteria", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  weight: integer("weight").notNull().default(5),
  createdAt: text("created_at").notNull(),
});

export const customCriteriaScores = sqliteTable("custom_criteria_scores", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  criteriaId: integer("criteria_id").notNull().references(() => customCriteria.id, { onDelete: "cascade" }),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id),
  score: integer("score").notNull(),
  notes: text("notes").notNull().default(""),
});

export const insertWorkshopLinkSchema = createInsertSchema(workshopLinks).omit({ id: true });
export const insertWorkshopFeedbackSchema = createInsertSchema(workshopFeedback).omit({ id: true });
export const insertCustomCriteriaSchema = createInsertSchema(customCriteria).omit({ id: true, createdAt: true });
export const insertCustomCriteriaScoreSchema = createInsertSchema(customCriteriaScores).omit({ id: true });

export type WorkshopLink = typeof workshopLinks.$inferSelect;
export type InsertWorkshopLink = z.infer<typeof insertWorkshopLinkSchema>;
export type WorkshopFeedback = typeof workshopFeedback.$inferSelect;
export type InsertWorkshopFeedback = z.infer<typeof insertWorkshopFeedbackSchema>;
export type CustomCriteria = typeof customCriteria.$inferSelect;
export type InsertCustomCriteria = z.infer<typeof insertCustomCriteriaSchema>;
export type CustomCriteriaScore = typeof customCriteriaScores.$inferSelect;
export type InsertCustomCriteriaScore = z.infer<typeof insertCustomCriteriaScoreSchema>;

// AI Chat messages
export const chatMessages = sqliteTable("chat_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // 'user' | 'assistant'
  content: text("content").notNull(),
  createdAt: text("created_at").notNull(),
});

// AI Vendor Intelligence (proposal analysis results)
export const vendorIntelligence = sqliteTable("vendor_intelligence", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id),
  dimension: text("dimension").notNull(),
  score: integer("score"),
  summary: text("summary"),
  evidence: text("evidence"), // JSON array
  concerns: text("concerns"), // JSON array
  sourceDocument: text("source_document"),
  createdAt: text("created_at").notNull(),
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({ id: true, createdAt: true });
export const insertVendorIntelligenceSchema = createInsertSchema(vendorIntelligence).omit({ id: true, createdAt: true });

export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type VendorIntelligence = typeof vendorIntelligence.$inferSelect;
export type InsertVendorIntelligence = z.infer<typeof insertVendorIntelligenceSchema>;

// ==================== IV&V CONTRACT COMPLIANCE ====================

export const contractBaselines = sqliteTable("contract_baselines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  vendorId: integer("vendor_id"),
  contractName: text("contract_name").notNull(),
  contractDate: text("contract_date"),
  totalValue: text("total_value"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  sourceDocument: text("source_document"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
});

export const contractDeliverables = sqliteTable("contract_deliverables", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  baselineId: integer("baseline_id").notNull().references(() => contractBaselines.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  dueDate: text("due_date"),
  status: text("status").notNull().default("not_started"),
  priority: text("priority").notNull().default("standard"),
  contractReference: text("contract_reference"),
  notes: text("notes"),
  completedDate: text("completed_date"),
  externalId: text("external_id"),
  externalUrl: text("external_url"),
  createdAt: text("created_at").notNull(),
});

export const complianceEvidence = sqliteTable("compliance_evidence", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  deliverableId: integer("deliverable_id").notNull().references(() => contractDeliverables.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  fileName: text("file_name"),
  fileContent: text("file_content"),
  assessmentResult: text("assessment_result"),
  assessorNotes: text("assessor_notes"),
  createdAt: text("created_at").notNull(),
});

export const ivvCheckpoints = sqliteTable("ivv_checkpoints", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  baselineId: integer("baseline_id").notNull().references(() => contractBaselines.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  phase: text("phase").notNull(),
  scheduledDate: text("scheduled_date"),
  completedDate: text("completed_date"),
  status: text("status").notNull().default("upcoming"),
  overallAssessment: text("overall_assessment"),
  recommendations: text("recommendations"),
  findings: text("findings"),
  createdAt: text("created_at").notNull(),
});

export const deviations = sqliteTable("deviations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  baselineId: integer("baseline_id").notNull().references(() => contractBaselines.id, { onDelete: "cascade" }),
  deliverableId: integer("deliverable_id"),
  severity: text("severity").notNull(),
  category: text("category").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  contractReference: text("contract_reference"),
  actualDelivery: text("actual_delivery"),
  impact: text("impact"),
  status: text("status").notNull().default("open"),
  resolution: text("resolution"),
  escalationDue: text("escalation_due"),
  escalationStatus: text("escalation_status").default("pending"),
  escalatedAt: text("escalated_at"),
  createdAt: text("created_at").notNull(),
});

export const insertContractBaselineSchema = createInsertSchema(contractBaselines).omit({ id: true, createdAt: true });
export const insertContractDeliverableSchema = createInsertSchema(contractDeliverables).omit({ id: true, createdAt: true });
export const insertComplianceEvidenceSchema = createInsertSchema(complianceEvidence).omit({ id: true, createdAt: true });
export const insertIvvCheckpointSchema = createInsertSchema(ivvCheckpoints).omit({ id: true, createdAt: true });
export const insertDeviationSchema = createInsertSchema(deviations).omit({ id: true, createdAt: true });

export type ContractBaseline = typeof contractBaselines.$inferSelect;
export type InsertContractBaseline = z.infer<typeof insertContractBaselineSchema>;
export type ContractDeliverable = typeof contractDeliverables.$inferSelect;
export type InsertContractDeliverable = z.infer<typeof insertContractDeliverableSchema>;
export type ComplianceEvidence = typeof complianceEvidence.$inferSelect;
export type InsertComplianceEvidence = z.infer<typeof insertComplianceEvidenceSchema>;
export type IvvCheckpoint = typeof ivvCheckpoints.$inferSelect;
export type InsertIvvCheckpoint = z.infer<typeof insertIvvCheckpointSchema>;
export type Deviation = typeof deviations.$inferSelect;
export type InsertDeviation = z.infer<typeof insertDeviationSchema>;

// ==================== IV&V ENHANCEMENTS ====================

export const pulseReports = sqliteTable("pulse_reports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  baselineId: integer("baseline_id").notNull().references(() => contractBaselines.id, { onDelete: "cascade" }),
  overallPosture: text("overall_posture").notNull(),
  postureTrend: text("posture_trend"),
  narrative: text("narrative").notNull(),
  riskHighlights: text("risk_highlights"),
  milestoneStatus: text("milestone_status"),
  decisionItems: text("decision_items"),
  metrics: text("metrics"),
  weekEnding: text("week_ending").notNull(),
  createdAt: text("created_at").notNull(),
});

export const checkpointAssessments = sqliteTable("checkpoint_assessments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  checkpointId: integer("checkpoint_id").notNull().references(() => ivvCheckpoints.id, { onDelete: "cascade" }),
  dimension: text("dimension").notNull(),
  rating: text("rating").notNull(),
  observation: text("observation"),
  evidence: text("evidence"),
  recommendation: text("recommendation"),
  createdAt: text("created_at").notNull(),
});

export const goLiveScorecard = sqliteTable("go_live_scorecard", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  baselineId: integer("baseline_id").notNull().references(() => contractBaselines.id, { onDelete: "cascade" }),
  criteria: text("criteria").notNull(),
  overallScore: integer("overall_score"),
  overallReadiness: text("overall_readiness"),
  assessorNotes: text("assessor_notes"),
  assessedAt: text("assessed_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const insertPulseReportSchema = createInsertSchema(pulseReports).omit({ id: true, createdAt: true });
export const insertCheckpointAssessmentSchema = createInsertSchema(checkpointAssessments).omit({ id: true, createdAt: true });
export const insertGoLiveScorecardSchema = createInsertSchema(goLiveScorecard).omit({ id: true, createdAt: true });

export type PulseReport = typeof pulseReports.$inferSelect;
export type InsertPulseReport = z.infer<typeof insertPulseReportSchema>;
export type CheckpointAssessment = typeof checkpointAssessments.$inferSelect;
export type InsertCheckpointAssessment = z.infer<typeof insertCheckpointAssessmentSchema>;
export type GoLiveScorecard = typeof goLiveScorecard.$inferSelect;
export type InsertGoLiveScorecard = z.infer<typeof insertGoLiveScorecardSchema>;

// ==================== PM TOOL INTEGRATIONS ====================

export const integrationConnections = sqliteTable("integration_connections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  contractId: integer("contract_id").references(() => contractBaselines.id),
  platform: text("platform").notNull(),
  name: text("name").notNull(),
  config: text("config").notNull(),
  fieldMapping: text("field_mapping"),
  status: text("status").notNull().default("active"),
  lastSyncAt: text("last_sync_at"),
  lastSyncStatus: text("last_sync_status"),
  lastSyncMessage: text("last_sync_message"),
  syncItemCount: integer("sync_item_count").default(0),
  createdAt: text("created_at").notNull(),
});

export const syncLogs = sqliteTable("sync_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  connectionId: integer("connection_id").notNull().references(() => integrationConnections.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  itemsSynced: integer("items_synced").default(0),
  itemsCreated: integer("items_created").default(0),
  itemsUpdated: integer("items_updated").default(0),
  itemsSkipped: integer("items_skipped").default(0),
  errors: text("errors"),
  duration: integer("duration"),
  createdAt: text("created_at").notNull(),
});

export const insertIntegrationConnectionSchema = createInsertSchema(integrationConnections).omit({ id: true, createdAt: true });
export const insertSyncLogSchema = createInsertSchema(syncLogs).omit({ id: true, createdAt: true });

export type IntegrationConnection = typeof integrationConnections.$inferSelect;
export type InsertIntegrationConnection = z.infer<typeof insertIntegrationConnectionSchema>;
export type SyncLog = typeof syncLogs.$inferSelect;
export type InsertSyncLog = z.infer<typeof insertSyncLogSchema>;

// ==================== HEALTH CHECK MODULE ====================

export const healthCheckAssessments = sqliteTable("health_check_assessments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  domain: text("domain").notNull(), // governance, raid, technical, budget_schedule
  overallRating: text("overall_rating"), // critical, high, medium, low, satisfactory
  findings: text("findings"), // JSON array of {severity, finding, evidence, recommendation}
  summary: text("summary"),
  assessedBy: text("assessed_by"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const raidItems = sqliteTable("raid_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // risk, assumption, issue, dependency
  title: text("title").notNull(),
  description: text("description"),
  severity: text("severity"), // critical, high, medium, low
  status: text("status").default("open"), // open, mitigated, closed, escalated, accepted
  owner: text("owner"),
  dueDate: text("due_date"),
  resolution: text("resolution"),
  siReported: integer("si_reported").default(0), // 1 if SI has this in their RAID, 0 if only IV&V found it
  siDiscrepancy: text("si_discrepancy"), // note about gap between SI's version and reality
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const budgetTracking = sqliteTable("budget_tracking", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  category: text("category").notNull(), // original_contract, change_order, additional_funding, actual_spend
  description: text("description").notNull(),
  amount: integer("amount").notNull(), // in cents
  date: text("date"),
  notes: text("notes"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const scheduleTracking = sqliteTable("schedule_tracking", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  milestone: text("milestone").notNull(),
  originalDate: text("original_date"),
  currentDate: text("current_date"),
  actualDate: text("actual_date"),
  status: text("status").default("on_track"), // on_track, at_risk, delayed, completed
  varianceDays: integer("variance_days"),
  notes: text("notes"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const insertHealthCheckAssessmentSchema = createInsertSchema(healthCheckAssessments).omit({ id: true, createdAt: true });
export const insertRaidItemSchema = createInsertSchema(raidItems).omit({ id: true, createdAt: true });
export const insertBudgetTrackingSchema = createInsertSchema(budgetTracking).omit({ id: true, createdAt: true });
export const insertScheduleTrackingSchema = createInsertSchema(scheduleTracking).omit({ id: true, createdAt: true });

export type HealthCheckAssessment = typeof healthCheckAssessments.$inferSelect;
export type InsertHealthCheckAssessment = z.infer<typeof insertHealthCheckAssessmentSchema>;
export type RaidItem = typeof raidItems.$inferSelect;
export type InsertRaidItem = z.infer<typeof insertRaidItemSchema>;
export type BudgetTracking = typeof budgetTracking.$inferSelect;
export type InsertBudgetTracking = z.infer<typeof insertBudgetTrackingSchema>;
export type ScheduleTracking = typeof scheduleTracking.$inferSelect;
export type InsertScheduleTracking = z.infer<typeof insertScheduleTrackingSchema>;

// Assessment history (rating changes over time)
export const assessmentHistory = sqliteTable("assessment_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull().references(() => projects.id),
  domain: text("domain").notNull(),
  previousRating: text("previous_rating").notNull(),
  newRating: text("new_rating").notNull(),
  changedBy: text("changed_by"),
  createdAt: text("created_at").notNull(),
});

export type AssessmentHistory = typeof assessmentHistory.$inferSelect;

// ==================== PROJECT BASELINE (CONTRACT/SOW) ====================

export const projectBaselines = sqliteTable("project_baselines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull().references(() => projects.id),
  contractedAmount: integer("contracted_amount"),          // Total contract value in dollars
  goLiveDate: text("go_live_date"),                        // Contracted go-live date (ISO date)
  contractStartDate: text("contract_start_date"),          // Contract start date
  scopeItems: text("scope_items"),                         // JSON array of {name, description, status}
  keyMilestones: text("key_milestones"),                   // JSON array of {name, date, description}
  vendorName: text("vendor_name"),                         // Primary implementation vendor
  notes: text("notes"),                                    // Additional contract notes
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at"),
});

export const insertProjectBaselineSchema = createInsertSchema(projectBaselines).omit({ id: true, createdAt: true, updatedAt: true });
export type ProjectBaseline = typeof projectBaselines.$inferSelect;
export type InsertProjectBaseline = z.infer<typeof insertProjectBaselineSchema>;

// ==================== VENDOR KNOWLEDGE BASE ====================

export const vendorCapabilities = sqliteTable("vendor_capabilities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  vendorPlatform: text("vendor_platform").notNull(), // workday, oracle_cloud, tyler, maximo, nv5, oracle_eam
  module: text("module").notNull(),                   // e.g., "Accounts Payable", "Payroll"
  processArea: text("process_area").notNull(),        // e.g., "Invoice Processing"
  workflowDescription: text("workflow_description"),
  differentiators: text("differentiators"),            // JSON array of strings
  limitations: text("limitations"),                    // JSON array of strings
  bestFitFor: text("best_fit_for"),                   // JSON array
  integrationNotes: text("integration_notes"),
  automationLevel: text("automation_level"),           // fully_automated, semi_automated, manual, configurable
  maturityRating: integer("maturity_rating"),          // 1-5
  sourceDocuments: text("source_documents"),           // JSON array
  lastUpdated: text("last_updated"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const vendorProcessDetails = sqliteTable("vendor_process_details", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  vendorPlatform: text("vendor_platform").notNull(),
  module: text("module").notNull(),
  reqReference: text("req_reference"),      // e.g., "AP01", "HR15"
  capability: text("capability").notNull(), // what the requirement asks for
  howHandled: text("how_handled"),          // vendor's description of how they handle it
  score: text("score"),                     // S/F/C/T/N
  sourceVendor: text("source_vendor"),      // which SI's proposal
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const insertVendorCapabilitySchema = createInsertSchema(vendorCapabilities).omit({ id: true, createdAt: true });
export const insertVendorProcessDetailSchema = createInsertSchema(vendorProcessDetails).omit({ id: true, createdAt: true });

export type VendorCapability = typeof vendorCapabilities.$inferSelect;
export type InsertVendorCapability = z.infer<typeof insertVendorCapabilitySchema>;
export type VendorProcessDetail = typeof vendorProcessDetails.$inferSelect;
export type InsertVendorProcessDetail = z.infer<typeof insertVendorProcessDetailSchema>;

// ==================== DISCOVERY WIZARD ====================

export const orgProfile = sqliteTable("org_profile", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  entityType: text("entity_type"),           // city, county, utility, transit, port, state_agency, special_district
  entityName: text("entity_name"),
  state: text("state"),
  population: integer("population"),
  employeeCount: integer("employee_count"),
  annualBudget: text("annual_budget"),
  currentSystems: text("current_systems"),   // JSON: [{ name, module, yearsInUse, vendor }]
  departments: text("departments"),          // JSON: [{ name, headcount, keyProcesses }]
  painSummary: text("pain_summary"),
  domain: text("domain"),                    // client's website domain
  leadership: text("leadership"),            // JSON: [{name, title}]
  documents: text("documents"),              // JSON: [{filename, uploadedAt, extractedFields}]
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const discoveryInterviews = sqliteTable("discovery_interviews", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  functionalArea: text("functional_area").notNull(),
  status: text("status").default("not_started"), // not_started, in_progress, completed
  interviewee: text("interviewee"),
  role: text("role"),
  messages: text("messages"),                // JSON: [{role, content, timestamp}]
  findings: text("findings"),                // JSON: AI-extracted structured findings
  painPoints: text("pain_points"),           // JSON: extracted pain points
  processSteps: text("process_steps"),       // JSON: extracted process steps
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const discoveryPainPoints = sqliteTable("discovery_pain_points", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  sourceInterviewId: integer("source_interview_id"),
  functionalArea: text("functional_area").notNull(),
  description: text("description").notNull(),
  severity: text("severity"),                // critical, high, medium, low
  frequency: text("frequency"),              // daily, weekly, monthly, quarterly, annual
  impact: text("impact"),
  currentWorkaround: text("current_workaround"),
  stakeholderPriority: integer("stakeholder_priority"),
  linkedRequirements: text("linked_requirements"), // JSON array
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const insertOrgProfileSchema = createInsertSchema(orgProfile).omit({ id: true, createdAt: true });
export const insertDiscoveryInterviewSchema = createInsertSchema(discoveryInterviews).omit({ id: true, createdAt: true });
export const insertDiscoveryPainPointSchema = createInsertSchema(discoveryPainPoints).omit({ id: true, createdAt: true });

export const processTransformations = sqliteTable("process_transformations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull(),
  functionalArea: text("functional_area").notNull(),
  vendorPlatform: text("vendor_platform").notNull(),

  // Current State
  currentStepCount: integer("current_step_count"),
  currentManualSteps: integer("current_manual_steps"),
  currentSystems: integer("current_systems"),
  currentProcessingTime: text("current_processing_time"),
  currentPainPoints: integer("current_pain_points"),
  currentDescription: text("current_description"),
  currentSteps: text("current_steps"),           // JSON: [{step, description, manual, system}]

  // Future State
  futureStepCount: integer("future_step_count"),
  futureManualSteps: integer("future_manual_steps"),
  futureSystems: integer("future_systems"),
  futureProcessingTime: text("future_processing_time"),
  futureDescription: text("future_description"),
  futureSteps: text("future_steps"),             // JSON: [{step, description, automated, feature}]

  // Improvements
  improvements: text("improvements"),            // JSON: [{area, before, after, impact}]
  eliminatedSteps: text("eliminated_steps"),     // JSON: array of step descriptions
  newCapabilities: text("new_capabilities"),     // JSON: array of new capabilities

  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const insertProcessTransformationSchema = createInsertSchema(processTransformations).omit({ id: true, createdAt: true });

export type OrgProfile = typeof orgProfile.$inferSelect;
export type InsertOrgProfile = z.infer<typeof insertOrgProfileSchema>;
export type DiscoveryInterview = typeof discoveryInterviews.$inferSelect;
export type InsertDiscoveryInterview = z.infer<typeof insertDiscoveryInterviewSchema>;
export type DiscoveryPainPoint = typeof discoveryPainPoints.$inferSelect;
export type InsertDiscoveryPainPoint = z.infer<typeof insertDiscoveryPainPointSchema>;
export type ProcessTransformation = typeof processTransformations.$inferSelect;
export type InsertProcessTransformation = z.infer<typeof insertProcessTransformationSchema>;

// ==================== PROJECT DOCUMENTS ====================

export const projectDocuments = sqliteTable("project_documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").references(() => projects.id, { onDelete: "cascade" }),
  clientId: integer("client_id").references(() => clients.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  documentType: text("document_type").notNull(), // status_report, raid_log, risk_register, test_results, budget_report, schedule_update, change_request, meeting_minutes, sow_contract, other
  source: text("source").default("upload"), // upload, jira, smartsheet, azure_devops
  rawText: text("raw_text"), // extracted text content
  aiAnalysis: text("ai_analysis"), // JSON: structured extraction results
  analysisStatus: text("analysis_status").default("pending"), // pending, processing, completed, failed
  extractedItems: text("extracted_items"), // JSON: { raids: [], budgetItems: [], scheduleItems: [], findings: [], metrics: {} }
  appliedAt: text("applied_at"), // ISO timestamp when items were applied to health check; null = not yet applied
  period: text("period"), // e.g. "Week ending 2026-03-28" or "Q1 2026"
  uploadedBy: text("uploaded_by"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const insertProjectDocumentSchema = createInsertSchema(projectDocuments).omit({ id: true, createdAt: true });
export type ProjectDocument = typeof projectDocuments.$inferSelect;
export type InsertProjectDocument = z.infer<typeof insertProjectDocumentSchema>;

// ==================== VENDOR MONITORING PIPELINE ====================

// Sources to monitor for each vendor platform (release notes URLs, press pages, etc.)
export const monitoringSources = sqliteTable("monitoring_sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  vendorPlatform: text("vendor_platform").notNull(), // workday, oracle_cloud, tyler, maximo, nv5, oracle_eam
  sourceType: text("source_type").notNull(), // release_notes, press_release, product_page, changelog, blog, documentation
  name: text("name").notNull(),
  url: text("url").notNull(),
  checkFrequency: text("check_frequency").notNull().default("weekly"), // daily, weekly, monthly
  isActive: integer("is_active").notNull().default(1),
  lastCheckedAt: text("last_checked_at"),
  lastContentHash: text("last_content_hash"), // hash of content at last check for diff detection
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// Log of each monitoring scan run
export const monitoringRuns = sqliteTable("monitoring_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sourceId: integer("source_id").notNull().references(() => monitoringSources.id, { onDelete: "cascade" }),
  status: text("status").notNull(), // success, failed, no_change, changes_detected
  contentHash: text("content_hash"),
  rawContentPreview: text("raw_content_preview"), // first 500 chars for debugging
  changesDetected: integer("changes_detected").notNull().default(0),
  errorMessage: text("error_message"),
  durationMs: integer("duration_ms"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// Detected changes with AI analysis
export const vendorChanges = sqliteTable("vendor_changes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: integer("run_id").notNull().references(() => monitoringRuns.id, { onDelete: "cascade" }),
  vendorPlatform: text("vendor_platform").notNull(),
  changeType: text("change_type").notNull(), // new_feature, deprecation, pricing_change, acquisition, partnership, certification, bug_fix, roadmap_update
  severity: text("severity").notNull().default("info"), // critical, high, medium, low, info
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  details: text("details"), // longer AI analysis
  affectedModules: text("affected_modules"), // JSON array of module names
  affectedCapabilities: text("affected_capabilities"), // JSON array of capability IDs
  sourceUrl: text("source_url"),
  rawExcerpt: text("raw_excerpt"), // relevant text snippet from source
  isReviewed: integer("is_reviewed").notNull().default(0),
  reviewedBy: text("reviewed_by"),
  reviewNotes: text("review_notes"),
  isApplied: integer("is_applied").notNull().default(0), // whether KB was updated based on this
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// Alerts generated from changes
export const monitoringAlerts = sqliteTable("monitoring_alerts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  changeId: integer("change_id").notNull().references(() => vendorChanges.id, { onDelete: "cascade" }),
  alertType: text("alert_type").notNull(), // capability_impact, pricing_alert, competitive_shift, deprecation_warning
  priority: text("priority").notNull().default("medium"), // urgent, high, medium, low
  title: text("title").notNull(),
  message: text("message").notNull(),
  affectedProjects: text("affected_projects"), // JSON array of project IDs where this vendor is being evaluated
  isDismissed: integer("is_dismissed").notNull().default(0),
  dismissedBy: text("dismissed_by"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const insertMonitoringSourceSchema = createInsertSchema(monitoringSources).omit({ id: true, createdAt: true });
export const insertMonitoringRunSchema = createInsertSchema(monitoringRuns).omit({ id: true, createdAt: true });
export const insertVendorChangeSchema = createInsertSchema(vendorChanges).omit({ id: true, createdAt: true });
export const insertMonitoringAlertSchema = createInsertSchema(monitoringAlerts).omit({ id: true, createdAt: true });

export type MonitoringSource = typeof monitoringSources.$inferSelect;
export type InsertMonitoringSource = z.infer<typeof insertMonitoringSourceSchema>;
export type MonitoringRun = typeof monitoringRuns.$inferSelect;
export type InsertMonitoringRun = z.infer<typeof insertMonitoringRunSchema>;
export type VendorChange = typeof vendorChanges.$inferSelect;
export type InsertVendorChange = z.infer<typeof insertVendorChangeSchema>;
export type MonitoringAlert = typeof monitoringAlerts.$inferSelect;
export type InsertMonitoringAlert = z.infer<typeof insertMonitoringAlertSchema>;
