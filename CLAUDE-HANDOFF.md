# Health Check Module — Assessment & Progress

## Project Context

Avero Caliber is a vendor evaluation and IV&V compliance platform for government ERP consulting. The Health Check module is meant to be the **ongoing intelligence layer** — consultants upload documents (status reports, RAID logs, SIT/UAT results, contracts, project plans) and the system synthesizes them into a living health assessment grounded in the contract scope, go-live timeline, and project plan.

Projects can span multiple engagement modules (Selection, IV&V, Health Check). If a project started from Discovery/Requirements/Vendor Selection, all of that upstream data should flow into the health check context so the AI can connect the dots (e.g., "the client's top pain point was manual AP processing, the selected vendor scored 72% on AP, and now AP configuration is 2 months behind schedule").

---

## What the Health Check Module Currently Does

Four tabs inside `/projects/:id/health-check`:

1. **Assessment** — 4 domain cards (Governance, RAID, Technical, Budget & Schedule). Click to rate and add findings.
2. **RAID Log** — CRUD table for Risks, Assumptions, Issues, Dependencies.
3. **Budget & Schedule** — Side-by-side panels with budget entries + schedule milestones.
4. **Documents** — Upload/paste documents, AI extracts structured data (RAID items, budget entries, milestones, findings), user clicks "Apply" to push items into the other tabs.

---

## Bugs Found & Fixed (Phase 1 — Complete)

### B1: RAID status not editable ✅ FIXED
- **Problem**: The RAID edit dialog had no status field. Consultants couldn't change items from "open" to "mitigated" or "closed".
- **Fix**: Added `status` to `RaidForm` type, `emptyRaid()`, `openRaidEdit()`, and the dialog UI (type + status shown side by side).
- **File**: `client/src/pages/health-check.tsx`

### B2: Budget & Schedule not editable ✅ FIXED
- **Problem**: No edit buttons on budget/schedule rows. Only delete + re-create. Backend PATCH routes existed but were unreachable.
- **Fix**: Added `editId` to both dialog states, `openBudgetEdit()` and `openScheduleEdit()` functions, wired mutations to PATCH when editing, added edit (pencil) buttons to table rows. Also added Notes field to budget dialog (was missing).
- **File**: `client/src/pages/health-check.tsx`

### B3: Apply creates duplicates ✅ FIXED
- **Problem**: "Apply to Health Check" button could be clicked repeatedly, creating duplicate RAID items, budget entries, etc. No idempotency guard.
- **Fix**: Added `appliedAt` column to `projectDocuments` schema. Backend apply endpoint now rejects with 409 if already applied, stamps `appliedAt` on success. Frontend hides Apply button once applied, shows "Applied on [date]" indicator instead.
- **Files**: `shared/schema.ts`, `server/routes.ts`, `client/src/pages/health-check-documents.tsx`

### B4: No delete confirmation ✅ FIXED
- **Problem**: All delete buttons fired immediately on click — one misclick destroys data.
- **Fix**: Added `AlertDialog` confirmation with entity name shown. All deletes (assessment, RAID, budget, schedule) now go through `confirmDelete()`.
- **File**: `client/src/pages/health-check.tsx`

### B5: Stale root-level duplicate file ✅ FIXED
- **Problem**: `/health-check-documents.tsx` at project root was an outdated copy missing `selectedFile` state, using old paste-only flow for PDFs.
- **Fix**: Deleted the file.

### B6: Upload URL uses `__PORT_5000__` placeholder hack ✅ FIXED
- **Problem**: File upload used `fetch(__PORT_5000__/api/...replace(/__PORT_5000__/g, ""))` — a dev hack that bypassed `apiRequest` (losing auth headers, error handling).
- **Fix**: Replaced with clean `/api/projects/${projectId}/documents/upload` with `credentials: "same-origin"`.
- **File**: `client/src/pages/health-check-documents.tsx`

### B7: Findings schema mismatch ✅ PARTIALLY FIXED
- **Problem**: Backend stores findings as JSON array of `{severity, evidence, recommendation}` objects. Assessment dialog uses plain `<Textarea>`. AI-applied findings are structured JSON; manually entered ones are flat strings.
- **Fix**: Added `renderFindings()` helper that detects JSON findings and formats them as readable text when loading into the edit dialog. Full structured entry form is still needed (see next steps).
- **File**: `client/src/pages/health-check.tsx`

---

## `buildProjectContext` Enrichment ✅ COMPLETE

**Problem**: The Health Check AI prompt only received requirements + vendor evaluation data. It had no visibility into:
- Who the client is (size, type, current systems)
- What was discovered during interviews (pain points, process issues)
- What process transformations are expected

**Fix**: `buildProjectContext()` in `server/ai.ts` now fetches and includes:
- **Client profile** — entity type, population, annual budget, current systems, departments, pain summary
- **Org profile from discovery** — entity details captured during the discovery wizard
- **Discovery pain points** (up to 15) — functional area, description, severity, impact, workarounds
- **Discovery interview findings** (up to 10) — functional area, interviewee, extracted findings
- **Process transformations** (up to 10) — current vs future step counts, manual steps, descriptions

**File**: `server/ai.ts` (lines 95-230)

---

## Bugs & Issues Still Open

### Architectural Gaps (Phase 2)

**A1: No automatic health synthesis**
The whole point is "upload documents, get a health assessment." Currently: upload → click Analyze → click Apply → manually review 4 domain cards. There's no unified "here's the health of your project" view that aggregates across all documents and upstream data.

**A2: Assessments don't aggregate, they overwrite**
Each "Apply" creates *new* assessment records per domain. Upload 3 status reports → 3 separate "Governance" assessments. The UI uses `Object.fromEntries` keyed by domain so only the last one shows. Earlier ones are silently hidden.

**A3: No contract/SOW baseline**
Health check has no concept of "the contract says X, the project plan says Y, current status shows Z." No baseline for contracted amount, scope, go-live date, or planned milestones to measure against.

**A4: No temporal/trend tracking**
Assessments have `createdAt` but no period concept. Can't see "health was Medium in January, Critical in March." Documents have optional `period` field but it's unused in aggregation.

**A5: Documents tab disconnected from Assessment tab**
AI findings get applied as assessment records, but there's no drill-through from assessment → source documents.

**A6: No project-level enrichment**
Client enrichment (web scraping) exists but isn't triggered or connected at project level.

**A7: Analysis is fire-and-forget**
No re-analyze button. No ability to correct AI extraction errors before applying.

### UX Issues (Phase 3)

**U1: No dashboard/summary view**
No executive summary: overall health, trend, top risks, days to go-live, budget status at a glance.

**U2: RAID log has no filtering/sorting**
Seed data creates 20 items. Real projects will have 50+. No type/severity/status filters.

**U3: Budget amount precision**
Schema uses integer column, UI treats values as dollars. Convention is unclear across seed data vs AI extraction.

**U4: Document library header misalignment**
Header uses CSS grid, rows use flex layout. Columns don't line up.

**U6: Seed data stacks on repeat clicks**
"Load Sample Data" creates duplicates every time.

---

## Recommended Next Steps (Priority Order)

### Phase 2A: Automated Health Synthesis (Core Value)
1. **Build a `/api/projects/:id/health-check/synthesize` endpoint** that:
   - Gathers all project documents, RAID items, budget entries, schedule milestones
   - Includes full `buildProjectContext()` (now enriched with discovery data)
   - Calls Claude to produce a unified health assessment across all 4 domains
   - Stores results as aggregated assessments with source attribution
2. **Auto-trigger synthesis** after each document Apply (or on-demand via a "Refresh Assessment" button)
3. **Design an executive summary view** as the Health Check landing page showing:
   - Overall project health rating with trend arrow
   - Days to go-live (requires contract baseline)
   - Budget status (% spent vs % complete)
   - Top 3-5 risks
   - Recent assessment changes

### Phase 2B: Contract/SOW Baseline
4. **Add baseline fields to project or a new `projectBaseline` table**:
   - Contracted amount, contracted go-live date
   - Scope items / deliverables
   - Key contractual milestones
5. **Wire baseline into the AI prompt** so health assessments are grounded in "what was promised vs where we are"

### Phase 2C: Assessment Aggregation & History
6. **Redesign assessment storage** — instead of creating independent records per Apply, maintain a single assessment per domain that gets updated with new findings appended (with source document attribution)
7. **Add assessment history** — track rating changes over time per domain, enable trend visualization

### Phase 3: UX Polish
8. **RAID log filtering** — add dropdowns for type, severity, status; add search
9. **Structured findings entry** — replace plain textarea with a form that matches the `{severity, evidence, recommendation}` schema
10. **Document "re-analyze" button** — allow re-running AI analysis without re-uploading
11. **Fix document library grid alignment**
12. **Guard seed data** against duplicate loading

---

## Key Files Reference

| Area | File | What's There |
|------|------|-------------|
| Health Check page (main) | `client/src/pages/health-check.tsx` | Assessment, RAID, Budget/Schedule tabs + all dialogs |
| Documents tab | `client/src/pages/health-check-documents.tsx` | Upload, AI analysis display, Apply flow |
| Backend routes | `server/routes.ts` | All CRUD endpoints, analyze, apply, seed (~lines 3275-3900) |
| AI analysis | `server/ai.ts` | `buildProjectContext()` (~line 95), `analyzeHealthCheckDocument()` (~line 850) |
| Schema | `shared/schema.ts` | `healthCheckAssessments`, `raidItems`, `budgetTracking`, `scheduleTracking`, `projectDocuments` |
| Storage | `server/storage.ts` | All CRUD methods for health check entities |
| Sidebar nav | `client/src/components/app-sidebar.tsx` | Module-aware navigation (health_check gate) |
| Route setup | `client/src/App.tsx` | `/projects/:id/health-check` route |
