import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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

export type OrgProfile = typeof orgProfile.$inferSelect;
export type InsertOrgProfile = z.infer<typeof insertOrgProfileSchema>;
export type DiscoveryInterview = typeof discoveryInterviews.$inferSelect;
export type InsertDiscoveryInterview = z.infer<typeof insertDiscoveryInterviewSchema>;
export type DiscoveryPainPoint = typeof discoveryPainPoints.$inferSelect;
export type InsertDiscoveryPainPoint = z.infer<typeof insertDiscoveryPainPointSchema>;
