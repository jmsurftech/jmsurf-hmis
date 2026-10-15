# JMSURF HMIS

**Certified-ready. Paid faster. Works offline.**
A multi-tenant hospital management SaaS for Kenya, built to expand across Africa: clinical care, SHA claims, billing, pharmacy, lab, inpatient care, back office and MOH reporting in one system.

## Modules
- **Clinical:** patient registration (Client Registry lookup), visits and queues, appointments, triage (SATS), vitals (NEWS2), SOAP and specialty notes, ICD-11 diagnoses, lab (LIS), radiology, pharmacy and OTC sales, inpatient care (bed board, eMAR, discharge), maternity (ANC, delivery, KEPI immunisation), theatre (WHO checklist, clash detection), dialysis (Kt/V), home care (GPS check-in, escrow).
- **Revenue:** pricing and price lists per payer, billing with co-pay split, cashier shifts, M-Pesa STK/C2B, KRA eTIMS invoice signing.
- **Claims:** SHA eligibility, pre-authorisation, FHIR R4 claim submission, an automatic **claim scrubber**, rejection-risk scoring, status tracking, remittance reconciliation, a dashboard with ageing and first-pass acceptance.
- **Back office:** chart of accounts with automatic journal posting, financial statements, Kenya payroll (PAYE, SHIF, housing levy, NSSF, P10 export), assets and depreciation, budgets, incidents and complaints.
- **Reports:** KPI dashboard, MOH 705A/705B/717, DHIS2/KHIS push, CSV export.
- **SaaS:** self-service sign-up, multi-facility tenants, role-based access, hash-chained audit log, country packs (KE, UG, TZ, RW, GH, NG, ZA, ET, ZM).

## Quick start (local)
```bash
pnpm install
cp .env.example apps/api/.env   # set DATABASE_URL to your Postgres
cd apps/api && npx prisma generate && npx prisma db push && pnpm seed && pnpm dev
pnpm --filter @jmsurf-hmis/mock-servers dev   # sandbox SHA / M-Pesa / eTIMS on :4100
pnpm --filter @jmsurf-hmis/web dev            # http://localhost:3000
```
Demo login: `admin@demo.jmsurf.health` / `Demo@1234`. Other demo users (`doctor@`, `nurse@`, `lab@`, `pharmacy@`, `cashier@`, `claims@`, `store@`, `accounts@`, `hr@`, `reception@`) use the same domain and password.
API docs: http://localhost:4000/api/docs

## Deploy
Coolify / Docker Compose: see [`docs/DEPLOY_COOLIFY.md`](docs/DEPLOY_COOLIFY.md).

## Docs
- [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md): full specification
- [`docs/COMPETITIVE_ANALYSIS.md`](docs/COMPETITIVE_ANALYSIS.md): market research
- [`docs/ROADMAP.md`](docs/ROADMAP.md): what's built and what's next
- [`docs/compliance/`](docs/compliance): DHA certification pack
- [`docs/integrations/`](docs/integrations): SHA/HIE contract and assumptions
