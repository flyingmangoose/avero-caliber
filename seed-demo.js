#!/usr/bin/env node
/**
 * Avero Caliber — Comprehensive Demo Data Seed Script
 * Populates 3 projects with realistic government ERP demo data via HTTP API.
 *
 * NOTE: There is no PATCH /api/discovery/interviews/:id endpoint in the server.
 * Interview status, findings, and pain points are updated directly via SQLite
 * using better-sqlite3 (available in the erp-agent node_modules).
 */

import http from 'http';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const DB_PATH = new URL('./data.db', import.meta.url).pathname;

// ─── Color helpers ───────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  bold:  '\x1b[1m',
  green: '\x1b[32m',
  yellow:'\x1b[33m',
  red:   '\x1b[31m',
  cyan:  '\x1b[36m',
  gray:  '\x1b[90m',
  blue:  '\x1b[34m',
  magenta: '\x1b[35m',
};
const log = {
  info:    (msg) => console.log(`${C.cyan}ℹ${C.reset}  ${msg}`),
  ok:      (msg) => console.log(`${C.green}✓${C.reset}  ${msg}`),
  warn:    (msg) => console.log(`${C.yellow}⚠${C.reset}  ${msg}`),
  err:     (msg) => console.log(`${C.red}✗${C.reset}  ${msg}`),
  section: (msg) => console.log(`\n${C.bold}${C.blue}▶ ${msg}${C.reset}`),
  sub:     (msg) => console.log(`  ${C.gray}→${C.reset} ${msg}`),
};

// ─── HTTP helper ─────────────────────────────────────────────────────────────
function apiCall(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost',
      port: 5000,
      path,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function api(method, path, body = null, label = '') {
  try {
    const { status, body: resp } = await apiCall(method, path, body);
    if (status >= 400) {
      log.warn(`${method} ${path}${label ? ' ['+label+']' : ''} → ${status}: ${JSON.stringify(resp).substring(0, 120)}`);
      return null;
    }
    return resp;
  } catch (err) {
    log.err(`${method} ${path} failed: ${err.message}`);
    return null;
  }
}

// ─── SQLite direct update helper (for tables with no API PATCH endpoint) ────
function dbUpdateInterview(id, { status, findings, painPoints, processSteps, messages }) {
  try {
    const db = new Database(DB_PATH);
    const stmt = db.prepare(
      `UPDATE discovery_interviews SET status = ?, findings = ?, pain_points = ?, process_steps = ?, messages = ? WHERE id = ?`
    );
    const result = stmt.run(
      status ?? null,
      findings ? (typeof findings === 'string' ? findings : JSON.stringify(findings)) : null,
      painPoints ? (typeof painPoints === 'string' ? painPoints : JSON.stringify(painPoints)) : null,
      processSteps ? (typeof processSteps === 'string' ? processSteps : JSON.stringify(processSteps)) : null,
      messages ? (typeof messages === 'string' ? messages : JSON.stringify(messages)) : null,
      id
    );
    db.close();
    return result.changes > 0;
  } catch (err) {
    log.err(`DB update interview ${id} failed: ${err.message}`);
    return false;
  }
}

function dbInsertPainPoint({ projectId, sourceInterviewId, functionalArea, description, severity, frequency, impact, currentWorkaround }) {
  try {
    const db = new Database(DB_PATH);
    const stmt = db.prepare(
      `INSERT OR IGNORE INTO discovery_pain_points (project_id, source_interview_id, functional_area, description, severity, frequency, impact, current_workaround, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const now = new Date().toISOString();
    stmt.run(projectId, sourceInterviewId ?? null, functionalArea, description, severity ?? null, frequency ?? null, impact ?? null, currentWorkaround ?? null, now);
    db.close();
    return true;
  } catch (err) {
    log.err(`DB insert pain point failed: ${err.message}`);
    return false;
  }
}

// ─── Score distribution helper ───────────────────────────────────────────────
function pickScore(dist) {
  // dist: array of [score, weight] pairs
  const total = dist.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [score, weight] of dist) {
    r -= weight;
    if (r <= 0) return score;
  }
  return dist[dist.length - 1][0];
}

// ─── Sleep helper for rate limiting ──────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ═══════════════════════════════════════════════════════════════════════════════
// PROJECT 1: City of Springfield — ERP Modernization
// Modules: selection + ivv
// ═══════════════════════════════════════════════════════════════════════════════

async function seedProject1() {
  log.section('PROJECT 1: City of Springfield — ERP Modernization (Selection + IV&V)');

  // 1. Update project status and modules
  log.info('Updating project status and engagement modules...');
  const proj = await api('PATCH', '/api/projects/1', {
    status: 'active',
    description: 'Full ERP modernization replacing 18-year-old SAP R/3 with a modern cloud platform covering Finance, HR, Payroll, Procurement, and Utility Billing. Budget: $480M city. ~2,200 employees.',
    engagementModules: JSON.stringify(['selection', 'ivv']),
  }, 'update project');
  if (proj) log.ok(`Project 1 updated → status: ${proj.status}, modules: ${proj.engagementModules}`);

  // 2. Org Profile
  log.info('Creating org profile...');
  const orgProfile = await api('POST', '/api/projects/1/org-profile', {
    entityType: 'city',
    entityName: 'City of Springfield',
    state: 'OR',
    population: 175000,
    employeeCount: 2200,
    annualBudget: '$480M',
    domain: 'springfield-or.gov',
    currentSystems: [
      { name: 'SAP R/3', module: 'Finance/HR', yearsInUse: 18, vendor: 'SAP' },
      { name: 'Kronos Workforce Central', module: 'Time & Attendance', yearsInUse: 12, vendor: 'UKG' },
      { name: 'Cityworks', module: 'Asset Management / Work Orders', yearsInUse: 8, vendor: 'Trimble' },
      { name: 'Springbrook', module: 'Utility Billing', yearsInUse: 14, vendor: 'NorthStar' },
      { name: 'Laserfiche', module: 'Document Management', yearsInUse: 6, vendor: 'Laserfiche' },
    ],
    departments: [
      { name: 'Finance', headcount: 45, keyProcesses: ['AP', 'AR', 'GL', 'Budget', 'Financial Reporting'] },
      { name: 'Human Resources', headcount: 28, keyProcesses: ['Payroll', 'Benefits Administration', 'Recruiting', 'Employee Relations'] },
      { name: 'Public Works', headcount: 380, keyProcesses: ['Work Orders', 'Asset Tracking', 'Fleet Management', 'Infrastructure Maintenance'] },
      { name: 'IT', headcount: 32, keyProcesses: ['Infrastructure', 'Applications', 'Cybersecurity', 'Help Desk'] },
      { name: 'Utilities', headcount: 120, keyProcesses: ['Utility Billing', 'Meter Reading', 'Service Orders', 'Customer Accounts'] },
      { name: 'City Manager Office', headcount: 12, keyProcesses: ['Executive Oversight', 'Strategic Planning', 'Public Communications'] },
      { name: 'Planning & Development', headcount: 38, keyProcesses: ['Permits & Licensing', 'Land Use', 'Inspections', 'Zoning'] },
      { name: 'Police Department', headcount: 245, keyProcesses: ['Patrol', 'Investigations', 'Records Management', 'Fleet'] },
      { name: 'Fire Department', headcount: 190, keyProcesses: ['Emergency Response', 'Fire Prevention', 'Training', 'Fleet'] },
      { name: 'Parks & Recreation', headcount: 85, keyProcesses: ['Facility Management', 'Program Registration', 'Grounds Maintenance'] },
    ],
    leadership: [
      { name: 'Maria Torres', title: 'City Manager' },
      { name: 'David Chen', title: 'Chief Information Officer' },
      { name: 'Sarah Williams', title: 'Chief Financial Officer' },
      { name: 'James Okonkwo', title: 'HR Director' },
      { name: 'Patricia Nguyen', title: 'Procurement Manager' },
    ],
    painSummary: 'City of Springfield operates on 18-year-old SAP R/3 with extensive customizations that make upgrades prohibitively expensive. Month-end close takes 12 business days. Payroll processing is manual and error-prone. No real-time budget visibility for department directors. Data silos across Finance, HR, and Public Works prevent integrated reporting.',
  }, 'org profile');
  if (orgProfile) log.ok('Org profile created');

  // 3. Discovery Interviews
  log.info('Creating discovery interviews...');
  // Check if interviews already exist for this project
  const existingInterviews1 = await api('GET', '/api/projects/1/discovery/interviews', null, 'check existing interviews p1');
  let financeInterview = null, hrInterview = null, procInterview = null, itInterview = null;

  if (existingInterviews1 && existingInterviews1.length >= 4) {
    log.warn(`${existingInterviews1.length} interviews already exist for Project 1 — skipping interview creation`);
    // Assign existing interview refs for pain point mapping
    financeInterview = existingInterviews1.find(i => i.functionalArea === 'Finance') || null;
    hrInterview = existingInterviews1.find(i => i.functionalArea === 'Human Resources') || null;
    procInterview = existingInterviews1.find(i => i.functionalArea === 'Procurement') || null;
    itInterview = existingInterviews1.find(i => i.functionalArea === 'IT Infrastructure') || null;
  } else {

  // Finance interview (completed, with full findings)
  financeInterview = await api('POST', '/api/projects/1/discovery/interviews', {
    functionalArea: 'Finance',
    interviewee: 'Jennifer Park',
    role: 'City Controller',
  }, 'finance interview');

  if (financeInterview) {
    log.sub(`Finance interview created (id=${financeInterview.id})`);
    // Update with completed status and findings
    const financeFindings = {
      keyFindings: [
        { finding: 'Month-end close averages 12 business days due to manual reconciliation across 14 cost centers and triple-entry journal adjustments between SAP, Excel, and departmental shadow systems.', severity: 'critical' },
        { finding: 'AP processing requires manual invoice matching with printed POs; ~340 invoices per week processed by 4 staff with no automated 3-way match.', severity: 'high' },
        { finding: 'No real-time budget visibility — department directors must submit requests to Finance for custom reports, creating a 24–48hr lag that hampers operational decisions.', severity: 'high' },
        { finding: 'Year-end audit preparation requires 6 weeks of manual data extraction and formatting from SAP into 47 Excel-based audit schedules.', severity: 'medium' },
        { finding: 'Fixed asset module in SAP R/3 has not been reconciled to physical inventory in 3 years; estimated 20–30% of assets are mis-classified or obsolete.', severity: 'high' },
      ],
      painPoints: [
        { description: 'Manual triple-entry journal entries between SAP, Excel, and departmental systems', severity: 'critical', frequency: 'daily', impact: 'Finance staff spend 40% of time on reconciliation instead of analysis', currentWorkaround: 'Dedicated reconciliation team of 3 FTEs performs weekly sweep' },
        { description: 'Month-end close takes 12 business days due to multi-system reconciliation', severity: 'high', frequency: 'monthly', impact: 'Financial reports delivered 12+ days after period end, limiting council decisions', currentWorkaround: 'Overtime staffing in first two weeks of each month' },
        { description: 'No real-time budget visibility for department directors', severity: 'high', frequency: 'daily', impact: 'Departments make spending decisions without current encumbrance data', currentWorkaround: 'Finance emails weekly budget snapshots to each department director' },
        { description: 'AP invoices require manual 3-way match and physical routing', severity: 'critical', frequency: 'daily', impact: 'Average invoice cycle time is 23 days vs. industry standard of 5-7 days', currentWorkaround: 'Vendors submit invoices directly to department managers who physically route to Finance' },
      ],
      processSteps: {
        'Accounts Payable': [
          { step: 1, description: 'Vendor submits paper invoice to department manager', type: 'manual' },
          { step: 2, description: 'Department manager reviews and physically signs', type: 'manual' },
          { step: 3, description: 'Invoice physically routed to Finance via interoffice mail', type: 'manual' },
          { step: 4, description: 'AP clerk manually enters invoice into SAP R/3', type: 'manual' },
          { step: 5, description: 'AP clerk manually retrieves paper PO from filing cabinet for 3-way match', type: 'manual' },
          { step: 6, description: 'If match fails, AP clerk contacts department for resolution (3-5 day delay)', type: 'manual' },
          { step: 7, description: 'Finance director approves invoices >$10,000 via wet signature on paper batch list', type: 'manual' },
          { step: 8, description: 'AP clerk processes payment run in SAP and prints checks', type: 'semi-automated' },
          { step: 9, description: 'Checks stuffed and mailed by AP clerk', type: 'manual' },
        ],
        'General Ledger': [
          { step: 1, description: 'Department admins export transactions from shadow Excel files', type: 'manual' },
          { step: 2, description: 'Finance analyst manually rekeyes entries into SAP journal template', type: 'manual' },
          { step: 3, description: 'Controller reviews and approves journal entries in SAP', type: 'semi-automated' },
          { step: 4, description: 'Month-end accruals calculated manually in Excel by each department', type: 'manual' },
          { step: 5, description: 'Reconciliation analyst compares SAP balances to departmental sub-ledgers', type: 'manual' },
          { step: 6, description: 'Variance investigation requires pulling paper source documents from 3+ filing locations', type: 'manual' },
          { step: 7, description: 'Trial balance extracted from SAP and formatted in Excel for management review', type: 'manual' },
          { step: 8, description: 'Final close approved by CFO after Controller sign-off — typically Day 12', type: 'manual' },
        ],
      },
    };
    // Use direct DB update since no PATCH API endpoint exists for interviews
    const finUpdated = dbUpdateInterview(financeInterview.id, {
      status: 'completed',
      findings: financeFindings,
      painPoints: financeFindings.painPoints,
      processSteps: financeFindings.processSteps,
    });
    if (finUpdated) log.ok('Finance interview completed with findings');
    else log.warn('Finance interview DB update failed');
  }

  // HR interview (completed)
  hrInterview = await api('POST', '/api/projects/1/discovery/interviews', {
    functionalArea: 'Human Resources',
    interviewee: 'Marcus Johnson',
    role: 'HR Director',
  }, 'HR interview');

  if (hrInterview) {
    log.sub(`HR interview created (id=${hrInterview.id})`);
    const hrFindings = {
      keyFindings: [
        { finding: 'Biweekly payroll processing requires 3 FTEs working 4 full days each cycle, with data manually pulled from 5 separate systems including Kronos, SAP, benefits carriers, and departmental Excel files.', severity: 'critical' },
        { finding: 'New employee onboarding takes 3 weeks average due to manual IT account provisioning, paper I-9 processing, and sequential approval workflows.', severity: 'high' },
        { finding: 'Open position management tracked in spreadsheets; no integration between recruiting, budgeted positions, and payroll setup.', severity: 'medium' },
        { finding: 'Benefits open enrollment processed by mailing paper forms to 2,200 employees, then manual keying of elections — takes 6 weeks with 8–12% error rate.', severity: 'high' },
      ],
      painPoints: [
        { description: 'Payroll processing requires 3 staff members working 4 full days each biweekly cycle', severity: 'high', frequency: 'bi-weekly', impact: 'High labor cost and risk of errors; 3–5 manual corrections per cycle', currentWorkaround: 'Dedicated payroll team works overtime the week before pay date' },
        { description: 'New employee onboarding takes 3 weeks due to manual IT provisioning and sequential approvals', severity: 'medium', frequency: 'weekly', impact: 'New hires unable to access systems for first 1–3 weeks; productivity loss', currentWorkaround: 'HR coordinator personally follows up with IT on each new hire' },
        { description: 'No integration between job applicant tracking, budgeted FTE count, and active employees', severity: 'medium', frequency: 'daily', impact: 'Risk of overhiring against budget; positions filled without budget confirmation', currentWorkaround: 'Weekly budget reconciliation meeting between HR and Finance' },
        { description: 'Benefits enrollment done via paper forms with high error rate', severity: 'high', frequency: 'annual', impact: '8–12% of elections entered incorrectly, resulting in plan adjustments and employee complaints', currentWorkaround: 'Second staff member validates all entries before carrier submission' },
      ],
      processSteps: {
        'Payroll Processing': [
          { step: 1, description: 'Payroll clerk downloads timesheet export from Kronos (2 hrs)', type: 'manual' },
          { step: 2, description: 'Manually cross-reference Kronos data against SAP employee master for changes', type: 'manual' },
          { step: 3, description: 'Collect paper leave requests from supervisors and enter adjustments', type: 'manual' },
          { step: 4, description: 'Download benefits deduction file from each carrier portal (5 carriers)', type: 'manual' },
          { step: 5, description: 'Manually merge all data files in Excel master payroll worksheet', type: 'manual' },
          { step: 6, description: 'Run SAP payroll calculation and review exception report', type: 'semi-automated' },
          { step: 7, description: 'HR Director reviews and approves payroll register (wet signature)', type: 'manual' },
          { step: 8, description: 'CFO countersigns payroll authorization form', type: 'manual' },
          { step: 9, description: 'Payroll ACH file transmitted to bank', type: 'semi-automated' },
          { step: 10, description: 'Post payroll journal entries to SAP GL manually', type: 'manual' },
          { step: 11, description: 'Generate W-2s and file quarterly 941s using separate third-party service', type: 'manual' },
        ],
      },
    };
    const hrUpdated = dbUpdateInterview(hrInterview.id, {
      status: 'completed',
      findings: hrFindings,
      painPoints: hrFindings.painPoints,
      processSteps: hrFindings.processSteps,
    });
    if (hrUpdated) log.ok('HR interview completed with findings');
    else log.warn('HR interview DB update failed');
  }

  // Procurement interview (completed)
  procInterview = await api('POST', '/api/projects/1/discovery/interviews', {
    functionalArea: 'Procurement',
    interviewee: 'Lisa Chang',
    role: 'Procurement Manager',
  }, 'procurement interview');

  if (procInterview) {
    log.sub(`Procurement interview created (id=${procInterview.id})`);
    const procFindings = {
      keyFindings: [
        { finding: 'Purchase requisitions are paper-based, requiring physical routing for up to 6 sequential approvals depending on dollar value; average PR-to-PO cycle time is 18 business days.', severity: 'critical' },
        { finding: 'Vendor master has an estimated 40% duplicate records accumulated over 18 years; no automated deduplication or vendor portal for self-service updates.', severity: 'high' },
        { finding: 'Sole-source justifications and contract amendments tracked in shared network drives with no version control; compliance risk for state audits.', severity: 'medium' },
        { finding: 'No spend analytics capability; procurement staff manually compile quarterly spend reports from SAP extracts taking 3 days each quarter.', severity: 'medium' },
      ],
      painPoints: [
        { description: 'Paper-based purchase requisitions require physical routing for up to 6 sequential approvals', severity: 'critical', frequency: 'daily', impact: 'Average 18-day PR-to-PO cycle vs. 3-day industry benchmark; ~85 active PRs in physical routing at any time', currentWorkaround: 'Urgent PRs hand-delivered by department admin to each approver' },
        { description: 'Vendor master has 40% duplicate records with no deduplication tooling', severity: 'high', frequency: 'daily', impact: 'Split vendor payments, 1099 compliance errors, inability to accurately report spend by vendor', currentWorkaround: 'AP clerk manually checks for duplicates before creating new vendors' },
        { description: 'No automated contract expiration alerts or renewal tracking', severity: 'medium', frequency: 'monthly', impact: 'Service disruptions and unauthorized vendor payments after contract expiration', currentWorkaround: 'Procurement manager maintains personal calendar reminders for ~120 active contracts' },
      ],
      processSteps: {
        'Purchase Requisition to PO': [
          { step: 1, description: 'Department staff completes paper PR form with account coding', type: 'manual' },
          { step: 2, description: 'Division supervisor reviews and signs paper PR', type: 'manual' },
          { step: 3, description: 'Department director reviews and signs (if >$5K)', type: 'manual' },
          { step: 4, description: 'Finance budget analyst verifies available appropriation by account code', type: 'manual' },
          { step: 5, description: 'Procurement reviews for compliance with purchasing thresholds', type: 'manual' },
          { step: 6, description: 'City Manager approval required for non-routine purchases >$25K', type: 'manual' },
          { step: 7, description: 'Procurement clerk enters approved PR into SAP as purchase order', type: 'manual' },
          { step: 8, description: 'Paper PO printed and mailed or faxed to vendor', type: 'manual' },
          { step: 9, description: 'Receiving department completes paper goods receipt form', type: 'manual' },
          { step: 10, description: 'Finance matches PO, goods receipt, and invoice manually', type: 'manual' },
        ],
      },
    };
    const procUpdated = dbUpdateInterview(procInterview.id, {
      status: 'completed',
      findings: procFindings,
      painPoints: procFindings.painPoints,
      processSteps: procFindings.processSteps,
    });
    if (procUpdated) log.ok('Procurement interview completed with findings');
    else log.warn('Procurement interview DB update failed');
  }

  // IT interview (in progress)
  itInterview = await api('POST', '/api/projects/1/discovery/interviews', {
    functionalArea: 'IT Infrastructure',
    interviewee: 'David Chen',
    role: 'Chief Information Officer',
  }, 'IT interview');

  if (itInterview) {
    log.sub(`IT interview created (id=${itInterview.id})`);
    const itMessages = [
      { role: 'user', content: 'We are looking to understand your current IT infrastructure and cloud readiness.', timestamp: new Date('2026-03-20T09:00:00').toISOString() },
      { role: 'assistant', content: 'Happy to discuss this. Our current environment is primarily on-premises — we run SAP on aging IBM servers that are 7 years out of warranty. We have about 180 physical servers in our two data centers plus a small VMware cluster. Cloud adoption has been limited mostly to Microsoft 365, but we are open to SaaS for the ERP replacement.', timestamp: new Date('2026-03-20T09:02:00').toISOString() },
      { role: 'user', content: 'What are your biggest concerns about moving to a cloud ERP?', timestamp: new Date('2026-03-20T09:05:00').toISOString() },
      { role: 'assistant', content: 'Three main areas: security and data sovereignty, network bandwidth to handle the load (our current WAN infrastructure was sized for on-prem), and the skillset gap on the IT side. We have strong SAP Basis skills but no cloud architects. We would need significant training or partner support.', timestamp: new Date('2026-03-20T09:08:00').toISOString() },
    ];
    const itUpdated = dbUpdateInterview(itInterview.id, { status: 'in_progress', messages: itMessages });
    if (itUpdated) log.ok('IT interview set to in_progress with conversation');
    else log.warn('IT interview DB update failed');
  }

  } // end else (interview creation block)

  // 4. Pain Points (direct creation)
  log.info('Creating discovery pain points...');
  const painPoints = [
    {
      functionalArea: 'Finance',
      description: 'Manual triple-entry of journal entries across SAP, Excel, and departmental systems creates reconciliation burden consuming 40% of Finance staff time',
      severity: 'critical',
      frequency: 'daily',
      impact: 'Finance staff cannot focus on analysis or strategic work; errors introduced at each re-entry point',
      currentWorkaround: 'Dedicated 3-person reconciliation team performs weekly sweep across all systems',
    },
    {
      functionalArea: 'Finance',
      description: 'Month-end close takes 12 business days due to sequential reconciliation bottlenecks across 14 cost centers and 5 systems',
      severity: 'high',
      frequency: 'monthly',
      impact: 'Council and executive management receive financial reports nearly 2 weeks after period end, preventing timely decision-making',
      currentWorkaround: 'Finance staff works mandatory overtime during first two weeks of each month',
    },
    {
      functionalArea: 'Finance',
      description: 'No real-time budget visibility forces all department directors to submit manual report requests to Finance for any budget inquiry',
      severity: 'high',
      frequency: 'daily',
      impact: 'Departments routinely overspend accounts or delay purchases due to budget uncertainty; Finance handles 35+ report requests per week',
      currentWorkaround: 'Weekly budget snapshot email distributed to all department heads by Finance analyst',
    },
    {
      functionalArea: 'Procurement',
      description: 'Paper-based purchase requisitions require physical routing to up to 6 sequential approvers, averaging 18 business days from PR submission to PO issuance',
      severity: 'critical',
      frequency: 'daily',
      impact: 'Operational delays when departments cannot procure needed goods/services; vendors frustrated by slow response',
      currentWorkaround: 'High-urgency items hand-carried by administrative staff to each approver location',
    },
    {
      functionalArea: 'Human Resources',
      description: 'Biweekly payroll processing requires 3 FTEs working 4 full days each cycle to reconcile data across 5 source systems',
      severity: 'high',
      frequency: 'bi-weekly',
      impact: 'High labor cost; payroll errors average 3–5 manual corrections per cycle creating employee dissatisfaction',
      currentWorkaround: 'Dedicated payroll team with overtime authorization during processing windows',
    },
    {
      functionalArea: 'Asset Management',
      description: 'Asset lifecycle data is split between SAP (financial records) and Cityworks (maintenance history) with no integration, creating duplicate records and discrepancies',
      severity: 'medium',
      frequency: 'weekly',
      impact: 'Inability to perform true total cost of ownership analysis; assets reported as active in finance but decommissioned in maintenance system',
      currentWorkaround: 'Annual manual reconciliation exercise that takes 3 weeks and is only 80% accurate',
    },
    {
      functionalArea: 'Human Resources',
      description: 'New employee onboarding takes an average of 3 weeks due to manual IT account provisioning and sequential approval workflows across 8 separate forms',
      severity: 'medium',
      frequency: 'weekly',
      impact: 'New hires sit idle for 1–3 weeks without system access; negative first impression; productivity loss',
      currentWorkaround: 'HR coordinator manually follows up with IT and each department on every new hire',
    },
    {
      functionalArea: 'Procurement',
      description: 'Vendor master contains approximately 40% duplicate records accumulated over 18 years with no automated deduplication capability',
      severity: 'high',
      frequency: 'daily',
      impact: 'Split vendor payments, 1099 compliance errors, inaccurate spend analytics, vendor confusion about payment status',
      currentWorkaround: 'AP clerk manually checks for duplicates before creating any new vendor record',
    },
  ];

  // Insert pain points directly via DB (no direct POST API endpoint exists)
  const db1 = new Database(DB_PATH);
  const existingPPCount = db1.prepare('SELECT COUNT(*) as cnt FROM discovery_pain_points WHERE project_id = 1').get();
  db1.close();

  if (existingPPCount.cnt > 0) {
    log.warn(`${existingPPCount.cnt} pain points already exist for Project 1 — skipping`);
  } else {
    // Map each pain point to its source interview id
    const interviewIdMap = {
      Finance: financeInterview ? financeInterview.id : null,
      'Human Resources': hrInterview ? hrInterview.id : null,
      Procurement: procInterview ? procInterview.id : null,
      'Asset Management': null,
    };

    let ppCount = 0;
    for (const pp of painPoints) {
      log.sub(`Pain point: ${pp.description.substring(0, 60)}...`);
      const ok = dbInsertPainPoint({
        projectId: 1,
        sourceInterviewId: interviewIdMap[pp.functionalArea] ?? null,
        ...pp,
      });
      if (ok) ppCount++;
      await sleep(30);
    }
    log.ok(`${ppCount} pain points inserted`);
  }

  // 5. Vendor Settings
  log.info('Setting vendor evaluation settings (Tyler=1, Workday=2, Oracle=3)...');
  const settings = await api('POST', '/api/projects/1/evaluation/settings', {
    selectedVendors: [1, 2, 3],
    moduleWeights: {
      'General Ledger': 10,
      'Accounts Payable': 9,
      'Accounts Receivable': 8,
      'Budget Management': 9,
      'Purchasing': 8,
      'Human Resources': 7,
      'Payroll': 9,
      'Asset Management': 7,
      'Utility Billing': 8,
      'Permits & Licensing': 6,
      'Project Accounting': 7,
      'Grants Management': 8,
      'Time & Attendance': 7,
      'Employee Self-Service': 6,
    },
  }, 'vendor settings');
  if (settings) log.ok(`Vendor settings saved — vendors: [1,2,3]`);

  // 6. Generate vendor scores using the auto-generate endpoint
  log.info('Generating vendor evaluation scores...');
  const scores = await api('POST', '/api/projects/1/evaluation/generate-scores', {}, 'generate scores');
  if (scores) {
    log.ok(`Scores generated — overall scores computed`);
  }

  // 7. Custom Criteria
  log.info('Creating custom evaluation criteria...');
  const existingCriteria = await api('GET', '/api/projects/1/custom-criteria', null, 'check existing criteria');
  if (existingCriteria && existingCriteria.length >= 5) {
    log.warn(`${existingCriteria.length} custom criteria already exist for Project 1 — skipping`);
  } else {
  const criteriaData = [
    {
      name: 'Government Sector Experience',
      description: 'Depth and breadth of experience with similarly-sized US municipal/county government implementations',
      weight: 9,
      scores: [
        { vendorId: 1, score: 9, notes: 'Tyler Technologies is exclusively focused on government; 3,000+ government clients' },
        { vendorId: 2, score: 7, notes: 'Workday has growing government presence but leans toward higher education and large enterprises' },
        { vendorId: 3, score: 8, notes: 'Oracle has strong federal and state government experience; growing local government practice' },
      ],
    },
    {
      name: 'Implementation Timeline',
      description: 'Ability to deliver a complete implementation within 24 months from contract execution',
      weight: 8,
      scores: [
        { vendorId: 1, score: 8, notes: 'Tyler MUNIS typically 18–24 months for cities of this size with standard scope' },
        { vendorId: 2, score: 6, notes: 'Workday implementations for full HCM+Finance historically run 24–30 months' },
        { vendorId: 3, score: 7, notes: 'Oracle Cloud mid-market implementations typically 20–26 months' },
      ],
    },
    {
      name: 'Total Cost of Ownership (5-Year)',
      description: 'Estimated 5-year TCO including licensing, implementation, training, and ongoing support',
      weight: 10,
      scores: [
        { vendorId: 1, score: 9, notes: 'Tyler MUNIS SaaS pricing structured for government budgets; estimated $8.2M TCO' },
        { vendorId: 2, score: 6, notes: 'Workday PEPM pricing results in higher ongoing cost; estimated $12.4M TCO' },
        { vendorId: 3, score: 7, notes: 'Oracle Cloud competitive on license but higher SI costs; estimated $11.1M TCO' },
      ],
    },
    {
      name: 'Cloud Architecture & Security',
      description: 'Maturity of cloud-native architecture, FedRAMP authorization, and data security controls',
      weight: 7,
      scores: [
        { vendorId: 1, score: 7, notes: 'Tyler hosts on Azure with government-focused data centers; SOC2 Type II' },
        { vendorId: 2, score: 9, notes: 'Workday is cloud-native, multi-tenant, with strong security certifications' },
        { vendorId: 3, score: 8, notes: 'Oracle Cloud Infrastructure FedRAMP authorized; strong security posture' },
      ],
    },
    {
      name: 'Data Migration Approach',
      description: 'Methodology, tooling, and proven success for migrating 18+ years of SAP data',
      weight: 8,
      scores: [
        { vendorId: 1, score: 8, notes: 'Tyler has specialized SAP-to-MUNIS migration tools and documented playbook' },
        { vendorId: 2, score: 7, notes: 'Workday partner ecosystem has SAP migration toolkits; methodology is solid' },
        { vendorId: 3, score: 7, notes: 'Oracle offers data migration services with ETL tooling; SAP experience available through SI partners' },
      ],
    },
  ];

  for (const criterion of criteriaData) {
    const created = await api('POST', '/api/projects/1/custom-criteria', {
      name: criterion.name,
      description: criterion.description,
      weight: criterion.weight,
    }, `criteria: ${criterion.name}`);

    if (created) {
      log.sub(`Created criteria: ${criterion.name} (weight: ${criterion.weight})`);
      // Score each vendor on this criterion
      const scoreResult = await api('PUT', `/api/custom-criteria/${created.id}/scores`, {
        scores: criterion.scores,
      }, `scores for ${criterion.name}`);
      if (scoreResult) log.sub(`  → Scored vendors: Tyler=${criterion.scores[0].score}, Workday=${criterion.scores[1].score}, Oracle=${criterion.scores[2].score}`);
    }
    await sleep(100);
  }
  } // end else (criteria creation block)

  // 8. IV&V Contract Baseline
  log.info('Creating IV&V contract baseline...');

  // Check if contract already exists
  const existingContracts = await api('GET', '/api/projects/1/contracts', null, 'get contracts');
  let contractId;

  if (existingContracts && existingContracts.length > 0) {
    contractId = existingContracts[0].id;
    log.warn(`Contract already exists (id=${contractId}), using existing`);
  } else {
    const contract = await api('POST', '/api/projects/1/contracts', {
      contractName: 'ERP Implementation Services — Tyler Technologies MUNIS',
      vendorId: 1,
      contractDate: '2025-05-15',
      totalValue: '$12,400,000',
      startDate: '2025-06-01',
      endDate: '2027-12-31',
      notes: 'Full-scope Tyler MUNIS implementation covering Finance, HR, Payroll, Procurement, Utility Billing, and Permits & Licensing. Fixed-price with milestone-based payment schedule.',
    }, 'create contract');
    contractId = contract ? contract.id : null;
    if (contract) log.ok(`Contract created (id=${contractId})`);
  }

  if (!contractId) {
    log.err('Failed to create contract — skipping deliverables, checkpoints, deviations, pulse reports');
    return;
  }

  // 9. Deliverables
  log.info('Creating contract deliverables...');
  const deliverables = [
    { category: 'milestone', name: 'Project Charter & Governance Framework', dueDate: '2025-07-01', status: 'accepted', priority: 'critical', description: 'Formal project charter defining scope, governance structure, roles/responsibilities, and decision-making authority. Required per SOW Section 2.1.' },
    { category: 'deliverable', name: 'Requirements Validation Report', dueDate: '2025-09-30', status: 'accepted', priority: 'critical', description: 'Documented validation of all 1,432 requirements against Tyler MUNIS standard functionality, identifying gaps and customization needs.' },
    { category: 'deliverable', name: 'Fit-Gap Analysis & Resolution Plan', dueDate: '2025-10-31', status: 'in_progress', priority: 'critical', description: 'Comprehensive fit-gap analysis with vendor resolution for each gap (configuration, customization, process change, or third-party integration).' },
    { category: 'deliverable', name: 'System Design Document', dueDate: '2025-12-15', status: 'in_progress', priority: 'high', description: 'Detailed system design documenting all configuration decisions, custom reports, integrations, and workflow configurations.' },
    { category: 'deliverable', name: 'Data Migration Strategy & Plan', dueDate: '2025-11-15', status: 'not_started', priority: 'critical', description: 'End-to-end data migration strategy covering source system analysis, cleansing rules, transformation logic, validation criteria, and mock conversion schedule.' },
    { category: 'deliverable', name: 'Test Strategy & Master Test Plan', dueDate: '2026-01-15', status: 'not_started', priority: 'high', description: 'Comprehensive test strategy covering unit testing, integration testing, UAT, parallel payroll testing, and performance testing.' },
    { category: 'deliverable', name: 'Configuration Workbook — Finance Modules', dueDate: '2025-12-31', status: 'in_progress', priority: 'critical', description: 'Completed configuration workbooks for GL, AP, AR, Budget, Purchasing, and Project Accounting with sign-off from Finance SMEs.' },
    { category: 'deliverable', name: 'Configuration Workbook — HR/Payroll Modules', dueDate: '2026-01-31', status: 'not_started', priority: 'critical', description: 'Completed configuration workbooks for HR Core, Payroll, Benefits, Time & Attendance, and Employee Self-Service with sign-off from HR SMEs.' },
    { category: 'deliverable', name: 'Integration Architecture & Design Specifications', dueDate: '2026-01-31', status: 'in_progress', priority: 'high', description: 'Technical specifications for all integrations including Kronos time export, Cityworks asset sync, banking/ACH, and benefits carrier EDI feeds.' },
    { category: 'deliverable', name: 'Training Plan & Training Materials', dueDate: '2026-03-31', status: 'not_started', priority: 'standard', description: 'Role-based training curriculum, materials, and schedule for all 2,200 employees covering end-user, power user, and administrator training.' },
    { category: 'deliverable', name: 'UAT Test Scripts & Scenario Library', dueDate: '2026-04-30', status: 'not_started', priority: 'high', description: 'Business-process based UAT test scripts covering all major workflows, edge cases, and integration scenarios.' },
    { category: 'milestone', name: 'Go-Live Readiness Assessment', dueDate: '2027-08-01', status: 'not_started', priority: 'critical', description: 'Independent assessment confirming system readiness, data migration validation, training completion, and operational cutover checklist completion.' },
  ];

  // Check if deliverables already exist
  const contractDetail = await api('GET', `/api/contracts/${contractId}`, null, 'get contract detail');
  if (contractDetail && contractDetail.deliverables && contractDetail.deliverables.length > 0) {
    log.warn(`${contractDetail.deliverables.length} deliverables already exist — skipping`);
  } else {
    const bulkResult = await api('POST', `/api/contracts/${contractId}/deliverables/bulk`, {
      items: deliverables,
    }, 'bulk deliverables');
    if (bulkResult) log.ok(`${bulkResult.length} deliverables created`);
  }

  // 10. IV&V Checkpoints
  log.info('Creating IV&V checkpoints...');
  const checkpointsExist = contractDetail && contractDetail.checkpoints && contractDetail.checkpoints.length > 0;

  if (checkpointsExist) {
    log.warn('Checkpoints already exist — skipping');
  } else {
    const checkpoints = [
      {
        name: 'Phase Gate 1 — Initiation & Project Setup Review',
        phase: 'planning',
        scheduledDate: '2025-07-15',
        status: 'completed',
        overallAssessment: 'satisfactory',
        findings: JSON.stringify([
          { severity: 'low', finding: 'Project charter approved with minor revisions to governance escalation path', recommendation: 'Monitor steering committee meeting cadence to ensure bi-weekly schedule is maintained' },
          { severity: 'medium', finding: 'Project manager does not have prior Tyler MUNIS experience', recommendation: 'Tyler to provide MUNIS-experienced PM co-lead for first 90 days; knowledge transfer plan required' },
        ]),
        recommendations: JSON.stringify([
          'Confirm Tyler PM credentials and MUNIS implementation experience within 30 days',
          'Establish project risk register with City ownership within 2 weeks',
          'Schedule introductory stakeholder briefings with all department heads',
        ]),
      },
      {
        name: 'Phase Gate 2 — Requirements & Design Readiness',
        phase: 'design',
        scheduledDate: '2025-10-01',
        status: 'completed',
        overallAssessment: 'concerns',
        findings: JSON.stringify([
          { severity: 'high', finding: 'Requirements Validation Report delivered 3 weeks late without formal change request or written notice to City', recommendation: 'Formal deviation notice issued; Tyler to provide root cause analysis and corrective action plan' },
          { severity: 'high', finding: 'Fit-Gap analysis incomplete — 47 requirements in Finance modules lack resolution status', recommendation: 'All gaps must be resolved before Design phase gate can be achieved; 30-day remediation deadline' },
          { severity: 'medium', finding: 'Finance department SME (Budget Analyst) reassigned to city-wide tax revenue initiative without replacement identified', recommendation: 'HR Director to designate replacement Finance SME within 10 business days' },
        ]),
        recommendations: JSON.stringify([
          'Issue formal written notice to Tyler regarding schedule deviation per contract Section 7.3',
          'Require completion of all 47 unresolved fit-gap items before proceeding to configuration',
          'City to identify backup Finance SME within 10 business days',
          'Add design phase deliverables to project RAID log',
        ]),
      },
      {
        name: 'Phase Gate 3 — Build & Configuration Progress Review',
        phase: 'build',
        scheduledDate: '2026-02-15',
        status: 'in_progress',
        overallAssessment: 'at_risk',
        findings: JSON.stringify([
          { severity: 'critical', finding: 'Finance Configuration Workbook only 65% complete as of review date; contractual completion date was January 31', recommendation: 'Require Tyler to submit weekly configuration completion metrics; escalate to executive sponsor if below 80% by February 28' },
          { severity: 'high', finding: 'Integration specifications for Utility Billing and Cityworks interfaces have not been drafted 4 months before SIT window opens', recommendation: 'Integration architecture workshop required within 2 weeks; third-party system owners must be engaged' },
          { severity: 'medium', finding: 'Data conversion mock 1 yielded 18% error rate on AR open items (target: <5%)', recommendation: 'Root cause analysis required; additional mock conversion cycle may be needed' },
        ]),
        recommendations: JSON.stringify([
          'Executive sponsor meeting with Tyler leadership to address configuration pace',
          'Integration architecture workshop to be scheduled within 2 weeks',
          'Data migration remediation plan required within 15 business days',
          'Consider adding 4-week buffer to SIT window given current trajectory',
        ]),
      },
      {
        name: 'Phase Gate 4 — SIT Readiness Assessment',
        phase: 'testing',
        scheduledDate: '2026-06-01',
        status: 'upcoming',
        overallAssessment: null,
        findings: null,
        recommendations: null,
      },
    ];

    let checkpointCount = 0;
    for (const cp of checkpoints) {
      const created = await api('POST', `/api/contracts/${contractId}/checkpoints`, cp, `checkpoint: ${cp.name}`);
      if (created) checkpointCount++;
      await sleep(100);
    }
    log.ok(`${checkpointCount} checkpoints created`);
  }

  // 11. Deviations
  log.info('Creating contract deviations...');
  const deviationsExist = contractDetail && contractDetail.deviations && contractDetail.deviations.length > 0;

  if (deviationsExist) {
    log.warn('Deviations already exist — skipping');
  } else {
    const deviations = [
      {
        severity: 'high',
        category: 'schedule',
        title: 'Requirements Validation Deliverable Delivered 3 Weeks Late',
        description: 'Per SOW Section 3.2, Requirements Validation Report was due September 30, 2025. Tyler delivered on October 21, 2025 — 21 calendar days late. No formal advance notice was provided as required by Contract Section 7.3. This delay cascaded to push the Fit-Gap Analysis start date.',
        impact: 'Design phase start delayed by approximately 2 weeks; finance SME time already committed for October has partial availability conflict',
        status: 'open',
      },
      {
        severity: 'critical',
        category: 'resource',
        title: 'Finance SME Reassigned Without Replacement or Prior Notification',
        description: 'City\'s designated Finance SME (Budget Analyst, Jennifer Park) was reassigned to a city-wide revenue initiative without advance notice to the project or identification of a replacement. Contract Section 5.4 requires 15-day written notice for any key personnel changes on either side. This affects completion of Finance configuration workbooks.',
        impact: 'Finance Configuration Workbook currently 65% complete; 35% of work requires SME review and sign-off that cannot proceed without designated Finance SME',
        status: 'open',
      },
      {
        severity: 'medium',
        category: 'scope',
        title: 'Data Migration Tool License Not Procured Per Implementation Timeline',
        description: 'Tyler\'s data conversion toolkit requires purchase of third-party ETL tool license ($28,000 one-time). Contract Schedule B assumes City will procure this license by project month 2. License was not procured; Tyler has been working around limitations using manual extraction scripts, contributing to mock conversion error rates.',
        impact: 'Contributing factor to 18% mock 1 error rate; will require retroactive license procurement and re-run of data profiling work',
        status: 'open',
      },
      {
        severity: 'high',
        category: 'quality',
        title: 'Integration Specifications Incomplete for Utility Billing and Cityworks',
        description: 'System Design Document was submitted without completed interface control documents (ICDs) for the Utility Billing (Springbrook) and Cityworks integrations. These two interfaces were identified as critical in SOW Section 4.7. Tyler has not engaged the third-party system owners, which is a prerequisite for ICD completion.',
        impact: 'SIT window cannot begin until integrations are built and unit-tested; incomplete ICDs block development work estimated at 160 hours',
        status: 'open',
      },
      {
        severity: 'low',
        category: 'process',
        title: 'Weekly Status Reports Not Delivered on Required Schedule',
        description: 'SOW Section 6.1 requires Tyler to submit weekly status reports to the City\'s project manager every Friday by 5:00 PM. In a 12-week review period, 4 of 12 status reports were submitted late (Monday–Wednesday of following week). While content quality has been acceptable, the pattern of late delivery creates project management risk.',
        impact: 'Minor — primarily a process compliance issue; weekend exception and escalation decisions may be delayed by late reporting',
        status: 'open',
      },
    ];

    let devCount = 0;
    for (const dev of deviations) {
      const created = await api('POST', `/api/contracts/${contractId}/deviations`, dev, `deviation: ${dev.title}`);
      if (created) devCount++;
      await sleep(100);
    }
    log.ok(`${devCount} deviations created`);
  }

  // 12. Pulse Reports — generate from the API (auto-generates based on contract data)
  log.info('Generating pulse report...');
  const pulseReport = await api('POST', `/api/contracts/${contractId}/pulse-report/generate`, {}, 'pulse report');
  if (pulseReport) log.ok(`Pulse report generated — posture: ${pulseReport.overallPosture}`);

  log.ok(`${C.bold}Project 1 (City of Springfield) seeding complete${C.reset}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROJECT 3: County Public Safety Upgrade — Health Check
// ═══════════════════════════════════════════════════════════════════════════════

async function seedProject3() {
  log.section('PROJECT 3: County Public Safety Upgrade (Health Check)');

  // 1. Update project
  log.info('Updating project status and modules...');
  const proj = await api('PATCH', '/api/projects/3', {
    status: 'active',
    description: 'County of Fairfield ERP/CAD/RMS modernization replacing 14-year-old Tyler New World with Oracle Cloud ERP and Motorola PremierOne CAD for a 4,800-employee county organization with $1.2B annual budget.',
    engagementModules: JSON.stringify(['health_check']),
  }, 'update project 3');
  if (proj) log.ok(`Project 3 updated → status: ${proj.status}, modules: ${proj.engagementModules}`);

  // 2. Org Profile
  log.info('Creating org profile...');
  const orgProfile = await api('POST', '/api/projects/3/org-profile', {
    entityType: 'county',
    entityName: 'County of Fairfield',
    state: 'CA',
    population: 450000,
    employeeCount: 4800,
    annualBudget: '$1.2B',
    currentSystems: [
      { name: 'Tyler New World', module: 'ERP/Finance/HR', yearsInUse: 14, vendor: 'Tyler Technologies' },
      { name: 'Motorola PremierOne (legacy)', module: 'CAD / Public Safety Dispatch', yearsInUse: 11, vendor: 'Motorola Solutions' },
      { name: 'Microsoft Dynamics GP', module: 'Budget/Supplemental Finance', yearsInUse: 8, vendor: 'Microsoft' },
      { name: 'Ceridian Dayforce', module: 'Time & Attendance', yearsInUse: 4, vendor: 'Ceridian' },
      { name: 'Esri ArcGIS', module: 'GIS / Mapping', yearsInUse: 12, vendor: 'Esri' },
    ],
    departments: [
      { name: 'County Administrator', headcount: 45, keyProcesses: ['Executive Oversight', 'Policy', 'Public Affairs'] },
      { name: 'Finance', headcount: 120, keyProcesses: ['GL', 'AP', 'AR', 'Budget', 'Debt Management', 'Treasury'] },
      { name: 'Human Resources', headcount: 65, keyProcesses: ['Payroll', 'Benefits', 'Classification', 'Labor Relations'] },
      { name: 'Sheriff Department', headcount: 1200, keyProcesses: ['Patrol', 'Corrections', 'Investigations', 'Emergency Services'] },
      { name: 'Fire Department', headcount: 480, keyProcesses: ['Suppression', 'EMS', 'Prevention', 'Training'] },
      { name: 'Health & Human Services', headcount: 980, keyProcesses: ['Social Services', 'Public Health', 'Behavioral Health', 'Child Services'] },
      { name: 'Public Works', headcount: 620, keyProcesses: ['Roads', 'Bridges', 'Facilities', 'Fleet', 'Solid Waste'] },
      { name: 'IT Services', headcount: 95, keyProcesses: ['Infrastructure', 'Applications', 'GIS', 'Cybersecurity'] },
      { name: 'Assessor', headcount: 85, keyProcesses: ['Property Assessment', 'Tax Roll', 'Appeals'] },
      { name: 'Planning', headcount: 72, keyProcesses: ['Land Use', 'Permits', 'Environmental Review'] },
    ],
    leadership: [
      { name: 'Robert Alvarez', title: 'County Administrator' },
      { name: 'Angela Mbeki', title: 'Chief Financial Officer' },
      { name: 'Kevin Tran', title: 'CIO / IT Services Director' },
      { name: 'Sheriff Lisa Okafor', title: 'Sheriff' },
      { name: 'Fire Chief Thomas Granger', title: 'Fire Chief' },
    ],
    painSummary: 'County is mid-implementation of Oracle Cloud ERP (18 months in, 12 months remaining) implemented by Deloitte. The project is showing significant signs of distress: SIT testing is critically behind (34% complete), data migration error rates are 6x above target, change management plan has been rejected 3 times, and the vendor is requesting $5M in additional funding and a 3-month extension without documented justification. IV&V engagement initiated by County Administrator following concerns raised by Finance and HR departments.',
  }, 'org profile p3');
  if (orgProfile) log.ok('Org profile created');

  // 3. Health Check Assessments
  log.info('Creating health check assessments...');

  const assessments = await api('GET', '/api/projects/3/health-check/assessments', null, 'check existing assessments');
  if (assessments && assessments.length > 0) {
    log.warn(`${assessments.length} assessments already exist — skipping`);
  } else {
    const healthCheckAssessments = [
      {
        domain: 'governance',
        overallRating: 'high',
        assessedBy: 'Avero IV&V Assessment Team',
        summary: 'Governance structure has critical gaps that are enabling project risk to accumulate without escalation. Steering committee has been inactive for 6 weeks. The SI is functioning as both executor and evaluator of its own performance, creating a significant oversight vacuum. County leadership is not receiving accurate project status information.',
        findings: JSON.stringify([
          {
            severity: 'critical',
            finding: 'County Steering Committee has not convened in 6 weeks with no documented governance decisions since January 15. Three unresolved issues requiring executive direction have been sitting in the RAID log since January.',
            evidence: 'Reviewed steering committee meeting minutes archive and calendar invitations. Last meeting documented: January 15. Confirmed with County PM who stated the January 29 meeting was cancelled and not rescheduled.',
            recommendation: 'Immediately reconstitute Steering Committee with mandatory bi-weekly cadence. County Administrator should chair first reconvened meeting. All open RAID items requiring executive decision must be reviewed within 10 days.',
          },
          {
            severity: 'high',
            finding: 'Deloitte is authoring all project status reports, managing the RAID log, and serving as the primary source of project performance information to County leadership — creating a fundamental conflict of interest in project oversight.',
            evidence: 'All 12 weekly status reports reviewed were authored exclusively by Deloitte PMO. County PM acknowledged they review but rarely revise Deloitte-prepared reports.',
            recommendation: 'County PM to author independent project status narrative each week. Establish separate IV&V status report channel directly to County Administrator bypassing SI.',
          },
          {
            severity: 'high',
            finding: 'County Project Manager lacks authority to direct Deloitte to resolve issues; all contractual enforcement decisions require CFO approval, creating a 3–5 day escalation lag on time-sensitive issues.',
            evidence: 'Stakeholder interviews with County PM, CFO office, and Department directors confirmed escalation path is unclear and slow.',
            recommendation: 'Clarify County PM authority in writing. Grant County PM authority to issue formal deviation notices without prior CFO approval for issues below $100K impact threshold.',
          },
          {
            severity: 'medium',
            finding: 'Project charter has not been updated since project kickoff despite 4 material scope changes, 2 resource changes, and 2 timeline revisions.',
            evidence: 'Reviewed project charter dated February 2025. Charter does not reflect October scope addition of Treasury module or February resource changes.',
            recommendation: 'Update project charter within 30 days to reflect current scope, timeline, and governance structure. Require Steering Committee approval of revised charter.',
          },
        ]),
      },
      {
        domain: 'technical',
        overallRating: 'critical',
        assessedBy: 'Avero IV&V Assessment Team',
        summary: 'Technical posture is critical. SIT execution is at 34% completion with only 2 weeks remaining in the testing window, making SIT exit impossible on the current schedule. A fundamental design flaw has been identified in the PM Web integration that requires redesign. Data migration mock conversion 2 produced a 12% error rate on vendor master records against a 2% target. Proceeding to UAT on current schedule would be inadvisable and is not recommended.',
        findings: JSON.stringify([
          {
            severity: 'critical',
            finding: 'System Integration Testing (SIT) is at 34% execution completion with 2 weeks remaining in the contracted SIT window. There are 156 open defects including 12 critical-severity defects, none of which have been resolved within the contractual 24-hour SLA.',
            evidence: 'Test management system (Jira) extract dated March 18, 2026. Test execution dashboard reviewed with QA Lead. Defect aging report shows 3 critical defects open for 4+ days.',
            recommendation: 'Do NOT proceed to UAT on current schedule. Extend SIT window by minimum 4 weeks (to approximately May 15). All 12 critical defects must be resolved before SIT exit can be declared. Weekly defect burn-down report required.',
          },
          {
            severity: 'critical',
            finding: 'A fundamental design flaw was identified in the PM Web (Project Management Web) integration during SIT. The integration attempts to pass project accounting transactions in real-time but the Oracle API endpoint does not support the transaction volume, causing timeouts and data loss. This requires architectural redesign.',
            evidence: 'SIT defect DEF-2047 and DEF-2112 reviewed. Integration architecture documentation reviewed. Technical interview with Oracle Fusion architect confirmed the root cause.',
            recommendation: 'Mandatory integration redesign workshop within 2 weeks. Consider asynchronous batch processing architecture as alternative. Redesign must be completed and retested before SIT exit. This item alone could add 6–8 weeks to the SIT timeline.',
          },
          {
            severity: 'high',
            finding: 'Three of 8 planned system integrations (PM Web, Assessor Tax Roll Export, and Benefits Carrier EDI) remain untested as of the SIT review. These integrations were scheduled to complete testing by February 28.',
            evidence: 'SIT test execution dashboard. Integration test matrix provided by Deloitte QA team. Confirmed 3 integrations have zero test execution recorded.',
            recommendation: 'Separate integration testing track with dedicated resources. Weekly integration test status report from Deloitte integration architect required.',
          },
          {
            severity: 'high',
            finding: 'Data migration mock conversion 2 produced a 12% error rate on vendor master records (6,400 errors out of 53,000 records). The contractual target is 2%. Root cause analysis has not been completed 3 weeks after mock run completion.',
            evidence: 'Mock conversion 2 reconciliation report dated February 14, 2026. Data quality dashboard reviewed. Confirmed no root cause analysis has been initiated.',
            recommendation: 'Immediate root cause analysis required within 5 business days. An additional mock conversion cycle (mock 3) will be needed before production migration. Advise that additional mock conversion will likely push data migration completion to August at earliest.',
          },
          {
            severity: 'medium',
            finding: 'Performance testing has not been initiated despite the fact that performance test environment setup was due January 31. Oracle Cloud performance has not been validated for peak payroll processing or month-end GL closing workloads.',
            evidence: 'Project schedule reviewed. Performance test environment setup ticket not yet assigned in Jira. County IT confirmed environment has not been provisioned.',
            recommendation: 'Performance test environment setup to be completed within 2 weeks. Performance testing to be incorporated into extended SIT window.',
          },
        ]),
      },
      {
        domain: 'raid',
        overallRating: 'medium',
        assessedBy: 'Avero IV&V Assessment Team',
        summary: 'RAID log management is significantly deficient. The project RAID log has not been updated in 45 days. Deloitte\'s risk register omits 4 material risks identified through independent stakeholder interviews. There is no dependency tracking between this project and the concurrent Assessor system procurement, which shares IT resources and has an integration dependency.',
        findings: JSON.stringify([
          {
            severity: 'critical',
            finding: 'Project RAID log was last updated on February 1, 2026. As of the assessment date (March 18, 2026), 23 items are marked "open" with no aging analysis, no escalation review, and no evidence of weekly RAID review meetings occurring.',
            evidence: 'RAID log extract from SharePoint dated February 1. Calendar review shows no RAID meetings scheduled or occurring since February 3.',
            recommendation: 'Immediate RAID refresh session to be conducted by County PM with Deloitte PMO within 5 business days. Weekly RAID reviews to resume with county-authored meeting minutes. IV&V team to receive weekly RAID log update.',
          },
          {
            severity: 'high',
            finding: 'Deloitte\'s risk register omits the following material risks that were identified through stakeholder interviews: (1) County Budget Analyst retirement in Q3 creating payroll SME gap, (2) SCIF security requirement for Sheriff integration not in scope, (3) Charter school district payroll complexity not scoped, (4) Assessor concurrent procurement creating resource conflict.',
            evidence: 'Deloitte RAID log dated Feb 1 compared against IV&V stakeholder interview notes from March 11-14.',
            recommendation: 'Add all 4 identified risks to RAID log with County-owned mitigation plans. County PM to review all RAID items with department heads quarterly rather than relying solely on Deloitte identification.',
          },
          {
            severity: 'medium',
            finding: 'No dependency mapping exists between the Oracle ERP project and the concurrent Assessor Property Tax system procurement (separate vendor selection underway). These two systems require a bidirectional tax roll integration that has not been scoped or designed.',
            evidence: 'Assessor Director interview March 14. Confirmed no joint planning meeting has occurred between the two project teams.',
            recommendation: 'Joint planning session between ERP PM and Assessor project team within 3 weeks. Integration architecture for tax roll exchange must be defined and added to ERP project scope before SIT exit.',
          },
        ]),
      },
      {
        domain: 'budget_schedule',
        overallRating: 'critical',
        assessedBy: 'Avero IV&V Assessment Team',
        summary: 'Budget and schedule are in critical condition. Deloitte has submitted a change request for $5M additional funding and a 3-month timeline extension without adequate documentation or justification. Independent schedule analysis indicates the current October 2026 go-live date is not achievable under any realistic scenario. Total program cost is likely $28–33M, significantly above the $25M contract value. The Board of Supervisors has not been briefed on the true scope of project risk.',
        findings: JSON.stringify([
          {
            severity: 'critical',
            finding: 'Deloitte submitted Change Request CR-007 on March 1 requesting $5,000,000 in additional funding plus a 3-month schedule extension. The change request does not contain a work breakdown structure, earned value analysis, or cost basis for the requested amount. It was submitted without the 30-day advance notice required by contract Section 8.2.',
            evidence: 'Change Request CR-007 reviewed. Contract Section 8.2 reviewed. CFO office confirmed change request was received without advance notice.',
            recommendation: 'Do not approve CR-007 as submitted. Require Deloitte to submit a fully documented change request with: (1) WBS-level cost breakdown, (2) schedule recovery plan, (3) root cause analysis for why additional funding is needed, and (4) statement of what deliverables are included in additional cost. County should commission independent cost estimate before negotiating.',
          },
          {
            severity: 'critical',
            finding: 'The current contracted go-live date of October 1, 2026 is not achievable given the current state of SIT (34% complete), 156 open defects, PM Web integration redesign needed, data migration requiring at least one additional mock cycle, and no change management plan approved. Independent schedule analysis puts realistic go-live at Q1–Q2 2027 under an optimistic scenario.',
            evidence: 'IV&V independent schedule analysis completed March 15-17. Based on SIT completion trajectory, defect resolution rate, and remaining build/test work.',
            recommendation: 'Board of Supervisors should be briefed on realistic go-live timeline of Q1–Q2 2027. Budget planning should assume go-live no earlier than April 1, 2027. Hyper-care and parallel run periods to be budgeted accordingly.',
          },
          {
            severity: 'high',
            finding: 'Based on remaining work analysis, total program cost is likely $28–33M, representing an overrun of $3–8M above the $25M contract value (not including the unapproved $5M change request). The $25M contract may have been understated at award, or scope has grown without formal change control.',
            evidence: 'IV&V independent cost analysis March 2026. Reviewed invoices through February 2026 ($19.75M incurred). Estimated remaining work valued at $8–13M.',
            recommendation: 'Board should plan for total program investment of $28–33M. Finance should reserve contingency funds accordingly. Request scope reconciliation analysis from Deloitte.',
          },
          {
            severity: 'high',
            finding: 'Monthly invoice amounts have been increasing month-over-month, suggesting Deloitte resource ramp-up without formal scope authorization. February invoicing ($2.4M) was 37% higher than January ($1.75M) with no corresponding scope change documentation.',
            evidence: 'Invoice history reviewed: Q1 2025 average $1.1M/month, Q3 2025 average $1.7M/month, Q1 2026 average $2.2M/month.',
            recommendation: 'Require detailed resource cost breakdown on all future invoices. Invoice disputes to be documented and withheld pending justification.',
          },
        ]),
      },
    ];

    let assessmentCount = 0;
    for (const assessment of healthCheckAssessments) {
      const created = await api('POST', '/api/projects/3/health-check/assessments', assessment, `assessment: ${assessment.domain}`);
      if (created) assessmentCount++;
      await sleep(100);
    }
    log.ok(`${assessmentCount} health check assessments created`);
  }

  // 4. RAID Items
  log.info('Creating RAID log items...');
  const existingRaid = await api('GET', '/api/projects/3/raid', null, 'check existing RAID');
  if (existingRaid && existingRaid.length > 0) {
    log.warn(`${existingRaid.length} RAID items already exist — skipping`);
  } else {
    const raidItems = [
      // Risks
      {
        type: 'risk',
        title: 'Vendor (Deloitte) may not meet go-live readiness by contracted date',
        description: 'Based on current SIT completion rate (34%) and defect trajectory, it is mathematically impossible to complete SIT and UAT within the contracted timeline. Go-live on October 1, 2026 is not achievable.',
        severity: 'critical',
        status: 'escalated',
        owner: 'County Administrator',
        siReported: 0,
        siDiscrepancy: 'Deloitte is still reporting October 2026 go-live as achievable in their status reports',
      },
      {
        type: 'risk',
        title: 'Key DBA (Oracle Database Administrator) retiring in Q3 2026',
        description: 'County\'s sole Oracle DBA has announced retirement effective August 1, 2026. This individual is the primary technical resource for Oracle Cloud administration and has institutional knowledge of all custom configurations. No succession plan or knowledge transfer has been initiated.',
        severity: 'high',
        status: 'open',
        owner: 'Kevin Tran (CIO)',
        siReported: 0,
        siDiscrepancy: null,
      },
      {
        type: 'risk',
        title: 'Third-party interface vendor (Kronos) undergoing acquisition — support uncertainty',
        description: 'UKG (Ultimate Kronos Group), which provides the County\'s time and attendance system, is reportedly undergoing a major strategic restructuring. Time-to-cash integration between Kronos and Oracle Cloud may be impacted by changing API support policies.',
        severity: 'medium',
        status: 'open',
        owner: 'Kevin Tran (CIO)',
        siReported: 1,
        siDiscrepancy: null,
      },
      {
        type: 'risk',
        title: 'Sheriff Department SCIF security requirement not in project scope',
        description: 'The Sheriff\'s criminal records management (RMS) integration requires data to pass through CJIS-compliant (SCIF) infrastructure. This requirement was raised during an interview with the Sheriff IT team but is not reflected in the current integration design.',
        severity: 'critical',
        status: 'open',
        owner: 'Sheriff IT Director',
        siReported: 0,
        siDiscrepancy: null,
      },
      // Assumptions
      {
        type: 'assumption',
        title: 'Current server hardware can support staging and UAT environments simultaneously',
        description: 'Project assumes existing on-premises servers can host a parallel staging environment during UAT while maintaining production Tyler New World for parallel operations. Hardware capacity has not been independently validated.',
        severity: 'medium',
        status: 'open',
        owner: 'Kevin Tran (CIO)',
        siReported: 1,
        siDiscrepancy: 'CIO indicated existing hardware may not be sufficient without additional procurement',
      },
      {
        type: 'assumption',
        title: 'SEIU Local 1021 (union) will accept new electronic time-tracking system',
        description: 'Oracle Cloud time-tracking module introduces biometric clock-in for non-exempt employees. Labor-management discussions about this change have not occurred. SEIU contract is up for renewal in October 2026.',
        severity: 'high',
        status: 'open',
        owner: 'HR Director',
        siReported: 1,
        siDiscrepancy: 'HR Director notes this is a significant assumption that needs union pre-approval',
      },
      // Issues
      {
        type: 'issue',
        title: 'Data conversion scripts producing 12% error rate on vendor master records',
        description: 'Mock conversion 2 (completed February 14) produced 6,400 errors out of 53,000 vendor master records. The contractual target is 2% (<1,060 errors). Root cause analysis has not been completed. Deloitte data migration lead is attributing errors to source data quality, but IV&V assessment indicates data mapping logic issues in the ETL scripts.',
        severity: 'critical',
        status: 'open',
        owner: 'Deloitte Data Migration Lead',
        siReported: 1,
        siDiscrepancy: 'Deloitte RCA not completed 3 weeks post-mock; County requested RCA on February 21 with no response',
      },
      {
        type: 'issue',
        title: 'SIT UAT environment unavailable for 3 weeks due to infrastructure issues',
        description: 'Oracle Cloud UAT tenant experienced performance degradation and was taken offline from February 20 to March 12 due to a database tablespace issue. 3 weeks of planned SIT testing could not proceed, contributing to the current 34% completion rate.',
        severity: 'high',
        status: 'open',
        owner: 'Oracle Cloud Support',
        siReported: 1,
        siDiscrepancy: null,
      },
      {
        type: 'issue',
        title: 'Budget approval for Phase 2 (Sheriff RMS modernization) delayed',
        description: 'Phase 2 of the public safety modernization (Sheriff RMS replacement, estimated $4.2M) was contingent on Phase 1 ERP showing positive progress. Given Phase 1 distress, the Board of Supervisors has deferred Phase 2 budget approval, creating uncertainty about the integration scope.',
        severity: 'high',
        status: 'open',
        owner: 'County Administrator',
        siReported: 0,
        siDiscrepancy: null,
      },
      // Dependencies
      {
        type: 'dependency',
        title: 'California State Controller SCO/CALSTARS reporting API v3 availability',
        description: 'County files quarterly financial reports with the California State Controller using CALSTARS format. Oracle Cloud integration requires the SCO\'s API v3, which the State is scheduled to deploy in Q4 2026. If the API is delayed, County will need to maintain manual reporting processes post-go-live.',
        severity: 'medium',
        status: 'open',
        owner: 'Finance Director',
        siReported: 1,
        siDiscrepancy: null,
      },
      {
        type: 'dependency',
        title: 'Network infrastructure WAN upgrade completion required before go-live',
        description: 'County\'s WAN connecting 22 remote offices to the main data center must be upgraded from 10Mbps to 100Mbps circuits before Oracle Cloud can be deployed for end users at remote locations. Network upgrade RFP was issued in January 2026; contract award expected April 2026; installation completion expected September 2026.',
        severity: 'high',
        status: 'open',
        owner: 'Kevin Tran (CIO)',
        siReported: 1,
        siDiscrepancy: null,
      },
    ];

    let raidCount = 0;
    for (const item of raidItems) {
      const created = await api('POST', '/api/projects/3/raid', item, `RAID: ${item.title}`);
      if (created) raidCount++;
      await sleep(80);
    }
    log.ok(`${raidCount} RAID items created`);
  }

  // 5. Budget Tracking
  log.info('Creating budget tracking entries...');
  const existingBudget = await api('GET', '/api/projects/3/budget', null, 'check existing budget');
  if (existingBudget && existingBudget.entries && existingBudget.entries.length > 0) {
    log.warn(`${existingBudget.entries.length} budget entries already exist — skipping`);
  } else {
    const budgetEntries = [
      { category: 'original_contract', description: 'Base ERP Implementation — Deloitte (Oracle Cloud)', amount: 25000000, date: '2025-01-15', notes: 'Fixed-price contract covering Finance, HR, Payroll, Procurement, and Budget modules' },
      { category: 'original_contract', description: 'Annual Maintenance & Support (Year 1)', amount: 850000, date: '2025-01-15', notes: 'Oracle Cloud SaaS annual subscription Year 1' },
      { category: 'change_order', description: 'CR-003: Additional Data Migration Complexity (Assessor Sub-Ledger)', amount: 420000, date: '2025-08-20', notes: 'Approved change order for Assessor property tax sub-ledger data migration not in original scope' },
      { category: 'change_order', description: 'CR-005: Custom Reports Package — Finance & HR', amount: 180000, date: '2025-11-10', notes: '12 custom reports requested by Finance and HR not included in original scope' },
      { category: 'additional_funding', description: 'CR-007: Deloitte Extension Request (PENDING — NOT APPROVED)', amount: 5000000, date: '2026-03-01', notes: 'Deloitte request for $5M additional + 3-month extension. Pending Board approval. No supporting documentation provided as of assessment date.' },
      { category: 'actual_spend', description: 'Q1 2025 Invoices (Jan–Mar 2025)', amount: 2100000, date: '2025-03-31', notes: 'Project initiation, kickoff, requirements gathering phase' },
      { category: 'actual_spend', description: 'Q2 2025 Invoices (Apr–Jun 2025)', amount: 3850000, date: '2025-06-30', notes: 'Requirements validation, fit-gap analysis, design workshops' },
      { category: 'actual_spend', description: 'Q3 2025 Invoices (Jul–Sep 2025)', amount: 4200000, date: '2025-09-30', notes: 'System design, configuration workbooks, integration design' },
      { category: 'actual_spend', description: 'Q4 2025 Invoices (Oct–Dec 2025)', amount: 4950000, date: '2025-12-31', notes: 'Build phase — configuration, integration development, data migration mock 1' },
      { category: 'actual_spend', description: 'Q1 2026 Invoices through Feb (Jan–Feb 2026)', amount: 4650000, date: '2026-02-28', notes: 'SIT preparation, build completion, data migration mock 2' },
    ];

    let budgetCount = 0;
    for (const entry of budgetEntries) {
      const created = await api('POST', '/api/projects/3/budget', entry, `budget: ${entry.description}`);
      if (created) budgetCount++;
      await sleep(80);
    }
    log.ok(`${budgetCount} budget entries created`);
  }

  // 6. Schedule Tracking
  log.info('Creating schedule milestone tracking...');
  const existingSchedule = await api('GET', '/api/projects/3/schedule', null, 'check existing schedule');
  if (existingSchedule && existingSchedule.length > 0) {
    log.warn(`${existingSchedule.length} schedule entries already exist — skipping`);
  } else {
    const milestones = [
      { milestone: 'Project Kickoff', originalDate: '2025-01-20', currentDate: '2025-01-20', actualDate: '2025-01-20', status: 'completed', varianceDays: 0, notes: 'On time' },
      { milestone: 'Requirements Validation Complete', originalDate: '2025-05-31', currentDate: '2025-07-15', actualDate: '2025-07-15', status: 'completed', varianceDays: 45, notes: '+45 days — delayed due to Finance and HR SME availability and scope clarifications for Assessor module' },
      { milestone: 'Design Complete & Signed Off', originalDate: '2025-08-31', currentDate: '2025-10-30', actualDate: '2025-11-14', status: 'completed', varianceDays: 75, notes: '+75 days — design approval delayed by unresolved fit-gap items in Finance module' },
      { milestone: 'Build Phase 1 Complete (Finance & HR)', originalDate: '2026-01-15', currentDate: '2026-03-01', actualDate: null, status: 'at_risk', varianceDays: 45, notes: 'Finance config workbook at 65%; HR config not started. Revised estimate March 1 is also at risk.' },
      { milestone: 'System Integration Testing (SIT) Start', originalDate: '2026-02-01', currentDate: '2026-03-15', actualDate: '2026-03-01', status: 'delayed', varianceDays: 28, notes: 'SIT started March 1 but environment issues halted testing from Feb 20 – Mar 12' },
      { milestone: 'System Integration Testing (SIT) Exit', originalDate: '2026-03-31', currentDate: '2026-05-15', actualDate: null, status: 'delayed', varianceDays: 45, notes: 'SIT at 34% with 12 critical defects open. PM Web integration redesign needed. Realistic exit date is May 15 at earliest.' },
      { milestone: 'User Acceptance Testing (UAT) Start', originalDate: '2026-04-15', currentDate: '2026-06-15', actualDate: null, status: 'at_risk', varianceDays: 61, notes: 'Dependent on SIT exit; payroll parallel testing to be incorporated' },
      { milestone: 'Data Migration Final Mock (Mock 3)', originalDate: '2026-05-01', currentDate: '2026-07-01', actualDate: null, status: 'delayed', varianceDays: 61, notes: 'Mock 2 error rate (12%) requires additional root cause analysis and remediation before Mock 3 can be scheduled' },
      { milestone: 'User Acceptance Testing (UAT) Exit', originalDate: '2026-06-01', currentDate: '2026-08-31', actualDate: null, status: 'delayed', varianceDays: 91, notes: 'Contingent on SIT exit and UAT start date; estimate based on standard 8-week UAT window' },
      { milestone: 'Go-Live — Oracle Cloud ERP', originalDate: '2026-10-01', currentDate: '2027-03-01', actualDate: null, status: 'delayed', varianceDays: 151, notes: 'CONTRACT DATE: Oct 1, 2026. IV&V ASSESSMENT: Earliest realistic go-live is Q1 2027 (March 1 estimate); Q2 2027 more probable under current trajectory.' },
    ];

    let scheduleCount = 0;
    for (const m of milestones) {
      const created = await api('POST', '/api/projects/3/schedule', m, `schedule: ${m.milestone}`);
      if (created) scheduleCount++;
      await sleep(80);
    }
    log.ok(`${scheduleCount} schedule milestones created`);
  }

  log.ok(`${C.bold}Project 3 (County Public Safety Upgrade) seeding complete${C.reset}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROJECT 2: Metro Water District — CIS Replacement (Selection, early stage)
// ═══════════════════════════════════════════════════════════════════════════════

async function seedProject2() {
  log.section('PROJECT 2: Metro Water District — CIS Replacement (Selection)');

  // 1. Update project
  log.info('Updating project status and modules...');
  const proj = await api('PATCH', '/api/projects/2', {
    status: 'active',
    description: 'Metro Water District serving 85,000 service connections in the Dallas-Fort Worth metro area seeks to replace its 20-year-old EDEN financial system and 10-year-old Cartegraph work order system with a modern, integrated Customer Information System (CIS) and ERP. Project in early requirements and vendor selection phase.',
    engagementModules: JSON.stringify(['selection']),
  }, 'update project 2');
  if (proj) log.ok(`Project 2 updated → status: ${proj.status}, modules: ${proj.engagementModules}`);

  // 2. Org Profile
  log.info('Creating org profile...');
  const orgProfile = await api('POST', '/api/projects/2/org-profile', {
    entityType: 'special_district',
    entityName: 'Metro Water District',
    state: 'TX',
    population: 210000,
    employeeCount: 340,
    annualBudget: '$95M',
    domain: 'metrowater-tx.gov',
    currentSystems: [
      { name: 'EDEN (Tyler)', module: 'Finance / GL / AP / AR / Payroll', yearsInUse: 20, vendor: 'Tyler Technologies (legacy)' },
      { name: 'Cartegraph OMS', module: 'Work Orders / Asset Management', yearsInUse: 10, vendor: 'Cartegraph' },
      { name: 'HTE (Superion)', module: 'Utility Billing / Customer Accounts', yearsInUse: 20, vendor: 'Superion (legacy)' },
      { name: 'Kronos Workforce Ready', module: 'Time & Attendance', yearsInUse: 5, vendor: 'UKG' },
      { name: 'Microsoft Excel/Access', module: 'Budget Development, Capital Planning', yearsInUse: 20, vendor: 'Microsoft' },
    ],
    departments: [
      { name: 'Finance', headcount: 28, keyProcesses: ['GL', 'AP', 'AR', 'Payroll', 'Budget', 'Debt Management'] },
      { name: 'Customer Service', headcount: 45, keyProcesses: ['Account Management', 'Billing', 'Collections', 'Field Service Dispatch'] },
      { name: 'Engineering', headcount: 38, keyProcesses: ['Capital Projects', 'Asset Management', 'GIS', 'Developer Services'] },
      { name: 'Operations & Maintenance', headcount: 140, keyProcesses: ['Water Treatment', 'Distribution', 'Meter Reading', 'Service Connections'] },
      { name: 'IT', headcount: 12, keyProcesses: ['Infrastructure', 'SCADA Support', 'Applications'] },
      { name: 'HR & Administration', headcount: 18, keyProcesses: ['Payroll', 'Benefits', 'Purchasing', 'Records'] },
      { name: 'Executive', headcount: 8, keyProcesses: ['Board Relations', 'Strategic Planning', 'Regulatory Compliance'] },
    ],
    leadership: [
      { name: 'Carlos Reyes', title: 'General Manager' },
      { name: 'Michelle Huang', title: 'Chief Financial Officer' },
      { name: 'Bruce Oyelaran', title: 'Director of Operations' },
      { name: 'Sandra Kim', title: 'IT Manager' },
      { name: 'Jeffrey Molina', title: 'Customer Service Manager' },
    ],
    painSummary: 'Metro Water District is operating on a 20-year-old financial system with no web-based access, no mobile capabilities, and vendor support ending in 18 months. Meter-to-cash process is entirely manual with 3 FTEs devoted to meter reading data entry. Customer self-service is non-existent — all account inquiries must be handled by phone. Capital project tracking is maintained in spreadsheets with no integration to financial reporting.',
  }, 'org profile p2');
  if (orgProfile) log.ok('Org profile created');

  // 3. Discovery Interviews
  log.info('Creating discovery interviews...');
  const existingInterviews2 = await api('GET', '/api/projects/2/discovery/interviews', null, 'check existing interviews p2');
  let financeInterview = null, utilInterview = null;

  if (existingInterviews2 && existingInterviews2.length >= 2) {
    log.warn(`${existingInterviews2.length} interviews already exist for Project 2 — skipping interview creation`);
    financeInterview = existingInterviews2.find(i => i.functionalArea === 'Finance') || null;
    utilInterview = existingInterviews2.find(i => i.functionalArea === 'Utility Billing') || null;
  } else {

  // Finance interview
  financeInterview = await api('POST', '/api/projects/2/discovery/interviews', {
    functionalArea: 'Finance',
    interviewee: 'Michelle Huang',
    role: 'Chief Financial Officer',
  }, 'finance interview p2');

  if (financeInterview) {
    log.sub(`Finance interview created (id=${financeInterview.id})`);
    const financeFindings = {
      keyFindings: [
        { finding: 'EDEN system has no web interface — all access is via Citrix terminal sessions with no mobile capability. System is only accessible from on-site workstations, limiting remote work and creating single point of failure.', severity: 'critical' },
        { finding: 'Month-end close averages 9 business days due to manual data aggregation from HTE utility billing system, Cartegraph work orders, and capital project Excel trackers.', severity: 'high' },
        { finding: 'Annual budget development is done entirely in Excel with no connection to EDEN; budget templates are manually re-typed into EDEN after board approval creating a 2-3 day data entry window.', severity: 'high' },
        { finding: 'EDEN vendor (Tyler legacy division) has announced end-of-support for version currently deployed in 18 months. No upgrade path available — full system replacement required.', severity: 'critical' },
      ],
      painPoints: [
        { description: 'EDEN system accessible only via Citrix terminal — no web, no mobile, no remote access', severity: 'critical', frequency: 'daily', impact: 'Finance staff cannot work remotely; single point of failure for all financial operations', currentWorkaround: 'Citrix sessions prone to disconnects; staff come to office even for simple tasks' },
        { description: 'Month-end close takes 9 business days due to multi-system manual data aggregation', severity: 'high', frequency: 'monthly', impact: 'Board financial reports not available until nearly 2 weeks after period close', currentWorkaround: 'Finance analyst maintains parallel Excel tracking to provide preliminary estimates to management' },
        { description: 'Budget development entirely in Excel with no connection to EDEN financial system', severity: 'high', frequency: 'annual', impact: 'Budget vs. actual reporting requires manual reconciliation; variance analysis is a 2-day exercise', currentWorkaround: 'CFO and budget analyst spend 2 days each month reconciling budget to EDEN actuals' },
      ],
      processSteps: {
        'Accounts Payable': [
          { step: 1, description: 'Vendor invoices received by mail or email to a shared inbox', type: 'manual' },
          { step: 2, description: 'AP clerk prints email invoices and manually sorts by department', type: 'manual' },
          { step: 3, description: 'Department managers review paper invoices and return to AP with approval signature', type: 'manual' },
          { step: 4, description: 'AP clerk manually keys invoice into EDEN via Citrix terminal', type: 'manual' },
          { step: 5, description: 'Batch payment run executed in EDEN; checks printed and mailed', type: 'semi-automated' },
        ],
      },
    };
    const fin2Updated = dbUpdateInterview(financeInterview.id, {
      status: 'completed',
      findings: financeFindings,
      painPoints: financeFindings.painPoints,
      processSteps: financeFindings.processSteps,
    });
    if (fin2Updated) log.ok('Finance interview completed');
    else log.warn('Finance interview p2 DB update failed');
  }

  // Utilities/Customer Service interview
  utilInterview = await api('POST', '/api/projects/2/discovery/interviews', {
    functionalArea: 'Utility Billing',
    interviewee: 'Jeffrey Molina',
    role: 'Customer Service Manager',
  }, 'utilities interview p2');

  if (utilInterview) {
    log.sub(`Utility Billing interview created (id=${utilInterview.id})`);
    const utilFindings = {
      keyFindings: [
        { finding: '3 FTEs devoted to manually keying meter reading data from paper route books into HTE — 85,000 meters read monthly with ~2% re-read rate due to entry errors.', severity: 'critical' },
        { finding: 'Customer self-service is entirely phone-based — customers cannot view bills, make payments, or report outages online. Customer Service receives 4,200 calls/month; 35% are account balance inquiries that could be self-served.', severity: 'critical' },
        { finding: 'Delinquency management is manual — staff prints delinquent account list from HTE weekly and calls customers individually. Shut-off notices sent via US mail with 10-day notice.', severity: 'high' },
        { finding: 'AMI (Automated Meter Infrastructure) is installed on 72% of meters but AMI data is not integrated with HTE — reads are collected digitally but must be batch uploaded via a CSV that requires manual intervention daily.', severity: 'high' },
      ],
      painPoints: [
        { description: 'Manual meter-to-cash process: 3 FTEs devoted to manual meter read data entry with 2% error rate requiring re-reads', severity: 'critical', frequency: 'monthly', impact: 'High labor cost; delayed billing when readings are disputed; AMI investment not being fully utilized', currentWorkaround: 'Second person spot-checks high-usage accounts before billing runs' },
        { description: 'No customer web portal or self-service capability — all account inquiries require phone call to Customer Service', severity: 'critical', frequency: 'daily', impact: '4,200 calls/month; 35% could be eliminated with self-service; customer satisfaction declining', currentWorkaround: 'IVR system handles account balance inquiries for registered callers only' },
        { description: 'Delinquency management entirely manual with 10-day mail notice — no automated text/email notifications', severity: 'high', frequency: 'weekly', impact: 'Revenue collection delayed; higher shut-off rate than comparable utilities due to late notifications', currentWorkaround: 'Customer Service supervisor manually calls top-50 delinquent accounts each week' },
        { description: 'AMI data not integrated with billing system — requires manual CSV upload daily creating 24-hour billing data lag', severity: 'high', frequency: 'daily', impact: 'Leak detection alerts delayed by 24 hours; high-consumption billing disputes common', currentWorkaround: 'IT writes scheduled task to process CSV at midnight; failures not automatically detected' },
      ],
      processSteps: {
        'Meter-to-Cash': [
          { step: 1, description: 'Meter readers download AMI data to laptop in field (72% of meters)', type: 'semi-automated' },
          { step: 2, description: 'Paper route books used for remaining 28% of meters requiring manual read', type: 'manual' },
          { step: 3, description: 'AMI data exported to CSV and uploaded manually to HTE by IT', type: 'manual' },
          { step: 4, description: 'Paper route book reads keyed into HTE by 3 clerks (2-3 days per cycle)', type: 'manual' },
          { step: 5, description: 'Billing supervisor reviews exception report for high/low usage anomalies', type: 'semi-automated' },
          { step: 6, description: 'Bills generated in HTE and sent to print vendor via FTP', type: 'semi-automated' },
          { step: 7, description: 'Customers pay by mail, drop box, or phone (no online payment)', type: 'manual' },
          { step: 8, description: 'Lockbox payments uploaded to HTE daily by Finance clerk', type: 'manual' },
          { step: 9, description: 'Cash receipts manually reconciled to bank statement monthly', type: 'manual' },
        ],
      },
    };
    const utilUpdated = dbUpdateInterview(utilInterview.id, {
      status: 'completed',
      findings: utilFindings,
      painPoints: utilFindings.painPoints,
      processSteps: utilFindings.processSteps,
    });
    if (utilUpdated) log.ok('Utility Billing interview completed');
    else log.warn('Utility Billing interview DB update failed');
  }

  // IT interview (in progress)
  const itInterview = await api('POST', '/api/projects/2/discovery/interviews', {
    functionalArea: 'IT Infrastructure',
    interviewee: 'Sandra Kim',
    role: 'IT Manager',
  }, 'IT interview p2');

  if (itInterview) {
    log.sub(`IT interview created (id=${itInterview.id})`);
    const itMessages2 = [
      { role: 'user', content: 'Sandra, can you describe your current infrastructure and readiness for a cloud-based CIS/ERP replacement?', timestamp: new Date('2026-03-22T10:00:00').toISOString() },
      { role: 'assistant', content: 'Sure. We are a small IT shop — 12 people supporting everything from SCADA to desktops. We have moved about 40% of our workloads to Microsoft Azure over the last two years, so cloud is not new to us. Our main concern for a CIS replacement is the SCADA integration — we need near-real-time pressure and flow data flowing into the work order system for our leak management program.', timestamp: new Date('2026-03-22T10:02:00').toISOString() },
      { role: 'user', content: 'What about your network infrastructure — can it support a cloud-based system for all 340 employees?', timestamp: new Date('2026-03-22T10:05:00').toISOString() },
      { role: 'assistant', content: 'Our main campus has a 1Gbps fiber connection that is fine. The challenge is our 8 remote facilities — 4 treatment plants and 4 pump stations — all on legacy DSL connections ranging from 3-10 Mbps. The field crews use those connections for work orders. If the new system is cloud-based, we would need to upgrade those circuits before go-live, and that is not currently in the capital budget for the next 2 years.', timestamp: new Date('2026-03-22T10:08:00').toISOString() },
    ];
    const it2Updated = dbUpdateInterview(itInterview.id, { status: 'in_progress', messages: itMessages2 });
    if (it2Updated) log.ok('IT interview set to in_progress');
    else log.warn('IT interview p2 DB update failed');
  }

  } // end else (interview creation block p2)

  // 4. Vendor Settings
  log.info('Setting vendor evaluation settings...');
  const settings = await api('POST', '/api/projects/2/evaluation/settings', {
    selectedVendors: [1, 2, 3],
    moduleWeights: {
      'Utility Billing': 10,
      'Customer Portal': 9,
      'Meter Data Management': 10,
      'General Ledger': 8,
      'Accounts Payable': 7,
      'Budget Management': 8,
      'Purchasing': 6,
      'Human Resources': 6,
      'Payroll': 7,
      'Asset Management': 9,
      'Work Orders': 9,
      'Project Accounting': 7,
    },
  }, 'vendor settings p2');
  if (settings) log.ok('Vendor settings saved — vendors: [1,2,3]');

  // 5. Generate vendor scores
  log.info('Generating vendor evaluation scores...');
  const scores = await api('POST', '/api/projects/2/evaluation/generate-scores', {}, 'generate scores p2');
  if (scores) log.ok('Scores generated');

  // 6. Pain Points for Metro Water District
  log.info('Creating Metro Water District pain points...');
  const db2 = new Database(DB_PATH);
  const existingPP2 = db2.prepare('SELECT COUNT(*) as cnt FROM discovery_pain_points WHERE project_id = 2').get();
  db2.close();

  if (existingPP2.cnt > 0) {
    log.warn(`${existingPP2.cnt} pain points already exist for Project 2 — skipping`);
  } else {
    const p2PainPoints = [
      { functionalArea: 'Finance', description: 'EDEN system accessible only via Citrix terminal — no web-based access, no mobile capability, no remote work', severity: 'critical', frequency: 'daily', impact: 'Finance staff cannot work remotely; operations halt when Citrix is unavailable', currentWorkaround: 'Staff required to be on-site even for simple financial tasks', sourceInterviewId: financeInterview ? financeInterview.id : null },
      { functionalArea: 'Finance', description: 'EDEN vendor has announced end-of-support for currently deployed version in 18 months', severity: 'critical', frequency: 'ongoing', impact: 'Security and compliance risk; no upgrade path available; replacement mandatory', currentWorkaround: 'No workaround — system replacement required', sourceInterviewId: financeInterview ? financeInterview.id : null },
      { functionalArea: 'Finance', description: 'Month-end close takes 9 business days due to manual data aggregation from HTE utility billing, Cartegraph work orders, and capital project Excel trackers', severity: 'high', frequency: 'monthly', impact: 'Board financial reports not available until nearly 2 weeks after period close', currentWorkaround: 'Finance analyst maintains parallel Excel tracking to provide preliminary estimates' },
      { functionalArea: 'Utility Billing', description: 'Manual meter-to-cash process: 3 FTEs devoted to manually entering meter reading data from paper route books into HTE billing system', severity: 'critical', frequency: 'monthly', impact: 'High labor cost; 2% re-read rate; AMI infrastructure investment not fully utilized', currentWorkaround: 'Second person spot-checks high-usage accounts before billing runs', sourceInterviewId: utilInterview ? utilInterview.id : null },
      { functionalArea: 'Utility Billing', description: 'No customer web portal or self-service — all account inquiries must be handled by phone Customer Service', severity: 'critical', frequency: 'daily', impact: '4,200 calls/month; 35% could be eliminated with self-service portal', currentWorkaround: 'IVR system handles account balance inquiries for registered callers only', sourceInterviewId: utilInterview ? utilInterview.id : null },
      { functionalArea: 'Utility Billing', description: 'AMI data not integrated with HTE billing system — requires manual CSV upload daily creating 24-hour billing data lag', severity: 'high', frequency: 'daily', impact: 'Leak detection alerts delayed by 24 hours; high-consumption billing disputes common', currentWorkaround: 'IT scheduled task processes CSV at midnight; failures not automatically detected', sourceInterviewId: utilInterview ? utilInterview.id : null },
      { functionalArea: 'Utility Billing', description: 'Delinquency management entirely manual with 10-day mail notice — no automated text or email notifications to customers', severity: 'high', frequency: 'weekly', impact: 'Revenue collection delayed; higher shut-off rate than comparable utilities', currentWorkaround: 'Customer Service supervisor manually calls top-50 delinquent accounts each week', sourceInterviewId: utilInterview ? utilInterview.id : null },
    ];

    let ppCount2 = 0;
    for (const pp of p2PainPoints) {
      const ok = dbInsertPainPoint({ projectId: 2, ...pp });
      if (ok) ppCount2++;
    }
    log.ok(`${ppCount2} pain points inserted for Metro Water District`);
  }

  log.ok(`${C.bold}Project 2 (Metro Water District) seeding complete${C.reset}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log(`\n${C.bold}${C.magenta}╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║       Avero Caliber — Demo Data Seed Script                  ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝${C.reset}\n`);

  log.info('Connecting to server at localhost:5000...');
  const ping = await api('GET', '/api/projects', null, 'ping');
  if (!ping) {
    log.err('Cannot connect to server. Make sure it is running on port 5000.');
    process.exit(1);
  }
  log.ok(`Connected — ${ping.length} projects found`);

  // Check vendors
  const vendors = await api('GET', '/api/vendors', null, 'get vendors');
  if (vendors) {
    log.ok(`Vendors: ${vendors.map(v => `${v.id}:${v.shortName}`).join(', ')}`);
  }

  try {
    await seedProject1();
  } catch (err) {
    log.err(`Project 1 seeding failed: ${err.message}`);
    console.error(err);
  }

  try {
    await seedProject3();
  } catch (err) {
    log.err(`Project 3 seeding failed: ${err.message}`);
    console.error(err);
  }

  try {
    await seedProject2();
  } catch (err) {
    log.err(`Project 2 seeding failed: ${err.message}`);
    console.error(err);
  }

  console.log(`\n${C.bold}${C.green}╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║         Seed complete! Open http://localhost:5000             ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝${C.reset}\n`);
}

main().catch((err) => {
  log.err(`Fatal error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
