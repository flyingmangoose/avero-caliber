# Avero Caliber

**Vendor Evaluation & IV&V Compliance Platform**

A full-lifecycle consulting platform for ERP/EAM vendor selection, implementation oversight, and project health checks.

## Modules

- **Selection** — Requirements management, vendor scoring (S/F/C/T/N), weighted evaluation, gap analysis, cost comparison, stakeholder workshops, custom criteria
- **IV&V Oversight** — Contract compliance tracking, deliverable management, IV&V checkpoint assessments (7 validation dimensions), deviation register, escalation SLAs, pulse reports, go-live readiness scorecard
- **Health Check & Rescue** — Rapid diagnostic assessment (governance, RAID, technical, budget/schedule), independent RAID log validation, budget variance tracking, schedule slippage analysis
- **AI-Powered** — Caliber AI chat (project-aware), proposal ingestion with qualitative vendor profiling, vendor intelligence cards with radar charts
- **Integrations** — Jira, Smartsheet, Azure DevOps connectors for auto-syncing vendor PM data

## Tech Stack

- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui + Recharts
- **Backend**: Express + SQLite (Drizzle ORM)
- **AI**: Anthropic Claude (streaming chat, proposal analysis)
- **Reports**: ReportLab (PDF) + docx (Word)

## Setup

```bash
npm install
npm run dev
```

## Production

```bash
npm run build
NODE_ENV=production node dist/index.cjs
```

## Deployment

See the included deployment guide for DigitalOcean setup with Nginx + PM2.

---

Built by [Avero Advisors](https://averoadvisors.com)
