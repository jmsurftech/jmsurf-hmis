# JMSURF HMIS — Complete Build Specification

> **Instructions to Claude:** Build the complete system described below in one pass. This is **not an MVP**: implement every module, integration, and non-functional requirement listed. Work through the phases in §14 in order. Each phase must pass its acceptance criteria and tests before you start the next. Where an external API spec is not public, such as SHA/HIE endpoints or insurer APIs, build the adapter against the interface defined here. Make endpoints, credentials and payload mappings configurable, ship a sandbox mock server that implements the documented contract, and record every assumption in `docs/integrations/ASSUMPTIONS.md`.

Product name: **JMSURF HMIS**.
Target: a multi-tenant SaaS hospital management system for Kenya first, configurable for any African country. It must cover facilities from a single clinic (Level 2) to a referral hospital (Level 6), plus hospital groups.

---

## 1. Goals and differentiators

1. **SHA-native.** Social Health Authority eligibility, pre-authorisation and claims for all three funds (PHC Fund, SHIF, ECCIF) built into the core workflow, not added later.
2. **Compliant with Kenya's Digital Health Act 2023.** Connects to the Client Registry, Facility Registry (KMHFR), Health Worker Registry and the national HIE, using FHIR R4.
3. **Pan-African by configuration.** Country packs cover the insurance scheme, tax e-invoicing, mobile money, languages, currency, coding and MOH reporting forms.
4. **Offline-first.** Clinics keep working during internet outages and sync safely when the connection returns.
5. **Covers every hospital department** (§6), including the gaps seen in competing products: pharmacy, triage and A&E, nursing and MAR, dental, eye, mental health, HIV/TB, blood bank, mortuary, CSSD and others.
6. **Patient engagement:** a patient app or portal, telemedicine, booking, and SMS and WhatsApp messaging.
7. **Open platform:** a public REST and FHIR API, webhooks and a marketplace for plugins.
8. **AI assistance** that is optional and always reviewed by a person: clinical note drafting, ICD coding suggestions, claim-rejection prediction, stock forecasting.

---

## 2. Tech stack (mandatory unless a strong reason is documented)

| Layer | Choice |
|---|---|
| Monorepo | pnpm + Turborepo |
| Backend | **NestJS (TypeScript)** as a modular monolith with strict module boundaries, ready to split into services later |
| Database | **PostgreSQL 16**, with row-level security (RLS) for tenant isolation, plus TimescaleDB for vitals and dialysis/device time series |
| ORM | Prisma (migrations) plus raw SQL for RLS policies and reports |
| Cache / queues | Redis + BullMQ |
| Event bus | Postgres outbox → NATS JetStream for integration events |
| Search | OpenSearch (patients, drugs, ICD codes, audit) |
| Files | S3-compatible storage (AWS S3 / MinIO), signed URLs |
| Imaging | Orthanc (DICOM server) + OHIF viewer |
| FHIR | HAPI FHIR server as the interoperability layer, mapped from the internal domain model |
| Web front end | **Next.js 15 (React, TypeScript)**, TanStack Query, Tailwind + shadcn/ui, i18next |
| Offline | A PWA with IndexedDB (Dexie) plus a sync engine (§9). An optional Electron "edge node" for large hospitals |
| Mobile | React Native (Expo) for the patient app and clinician app |
| Reporting / BI | Materialised views + Apache Superset embedded, and a custom report builder |
| Auth | Keycloak (OIDC): multi-tenant realms, MFA, SSO, SMART-on-FHIR |
| Infra | Docker, Kubernetes (Helm), Terraform; primary cloud region in-country or nearby (e.g. AWS af-south-1 / Azure South Africa North / a local Kenyan DC to meet data-residency rules) |
| Observability | OpenTelemetry, Prometheus, Grafana, Loki, Sentry |
| CI/CD | GitHub Actions: lint, typecheck, unit and integration tests, Playwright end-to-end tests, container scan, deploy |
| Testing | Vitest/Jest, Supertest, Testcontainers, Playwright, k6 load tests, Pact contract tests for integrations |

---

## 3. Architecture

```
apps/
  api/            NestJS modular monolith
  web/            Next.js staff app (PWA, offline)
  portal/         Next.js patient portal + public booking pages
  mobile-patient/ Expo
  mobile-staff/   Expo (ward rounds, MAR, approvals)
  admin/          SaaS super-admin console (tenants, billing, plans)
  edge/           Optional on-prem sync node (Electron/Node + Postgres)
  mock-servers/   SHA/HIE, insurers, M-Pesa, eTIMS, MTN MoMo… sandboxes
packages/
  domain/         Shared types, Zod schemas, business rules
  ui/             Design system
  fhir-mappers/   Internal model <-> FHIR R4 resources
  country-packs/  ke, ug, tz, rw, gh, ng, za, et, zm, … (config + adapters)
  integrations/   Adapter interfaces + implementations
  sdk/            Public TypeScript API client
infra/            Terraform, Helm charts
docs/             ADRs, API docs, integration specs, user manuals
```

**Principles:**
- Each domain module owns its own tables. Modules talk to each other only through service interfaces and domain events.
- Every external integration sits behind a port interface with a per-country adapter, a sandbox mock, retries with backoff, idempotency keys, a dead-letter queue and a replay UI.
- Every clinical and financial change emits an immutable audit event.
- Money uses integer minor units with an ISO currency code. Never floats.
- Timestamps are stored in UTC and displayed in the tenant's timezone.

---

## 4. Multi-tenancy and SaaS

- **Hierarchy:** Tenant (organisation or group) → Facilities (branches) → Departments/Service points → Wards/Beds/Rooms.
- **Isolation:** a shared database with `tenant_id` on every table, enforced by Postgres RLS. An enterprise option provides a dedicated database or cluster.
- **Sharing within a group:** patient records shared across a tenant's facilities, with consent; central purchasing, stock transfers between branches, and consolidated accounts and BI.
- **Plans:** Clinic / Hospital / Enterprise, with feature flags per module.
- **Billing models** (all must be supported): annual, monthly, per patient visit, and per bed. Usage metering lives in the admin console.
- **SaaS billing** is collected through M-Pesa, cards (Stripe/Flutterwave/Paystack) and bank transfer, with automatic invoices (including eTIMS invoices for Kenyan tenants), dunning, grace periods and read-only mode when a subscription lapses.
- **Self-service onboarding:** sign-up, KMHFR facility code lookup, a setup wizard (departments, price lists, insurers, users, opening stock CSV import) and a demo tenant with seed data.
- **Data import tools** to migrate from legacy systems: CSV/Excel templates for patients, prices, stock and balances.
- **Branding per tenant:** logo, colours, receipt and report headers, custom domain.

---

## 5. Identity, access and security

- RBAC + ABAC: roles (doctor, clinical officer, nurse, pharmacist, lab tech, radiographer, cashier, claims officer, storekeeper, accountant, HR, admin…), scoped by facility and department. A permission matrix is editable per tenant.
- Health workers verified against the Health Worker Registry and the professional councils (KMPDC, NCK, PPB, KMLTTB), with licence expiry alerts.
- MFA for privileged roles. Session timeout. Device trust for edge nodes.
- **Break-glass** emergency access to a record, which requires a reason and is reviewed afterwards.
- Field-level encryption for sensitive data (HIV status, mental health, reproductive health). TLS 1.2+ everywhere. Data encrypted at rest.
- A tamper-evident audit log (hash chain) covering reads of sensitive records as well as all writes.
- **Data Protection Act 2019 (Kenya)** and the equivalents elsewhere (Uganda DPPA, Nigeria NDPA, Ghana DPA, South Africa POPIA, Rwanda DPP Law):
  - consent capture and management (FHIR Consent)
  - tools for data-subject access, correction and deletion requests, with legal retention overrides
  - ODPC registration fields; a breach notification workflow (72h)
  - data-residency setting per country pack
- OWASP ASVS L2. A security test suite in CI. Penetration-test checklist in `docs/security`.
- Backups: point-in-time recovery, cross-region copies, quarterly restore drills. RPO ≤ 15 min, RTO ≤ 4 h.

---

## 6. Functional modules (implement ALL)

Every module needs: CRUD with validation, role permissions, audit, print/PDF output, list filters and export, and its relevant reports and dashboard widgets. Every billable action posts to the patient bill automatically through the pricing engine (§7).

### 6.1 Patient administration
- Registration: national ID / passport / birth certificate / Maisha Namba / alien ID / refugee ID. Lookup in the **Client Registry**, which returns or creates the national client ID (CR ID).
- Search for and merge duplicate patients. Next of kin. Photo and biometrics (pluggable fingerprint SDK). Patient ID cards and wristbands with barcode/QR.
- Visit types: OPD, IPD, emergency, walk-in, referral in, telemedicine, outreach.
- **Queue management:** tokens, display boards (TV mode), SMS alerts, wait-time analytics.
- Appointments: scheduling, doctor calendars, online self-booking, reminders, no-show tracking.
- Referrals in and out: an e-referral message over the HIE plus a printed referral letter.

### 6.2 Triage and emergency (A&E)
- Triage scales (South African Triage Scale, ESI) with colour coding and automatic queue priority.
- Resuscitation records, trauma forms, MLC/P3 police form, ambulance handover, emergency billing deferral.

### 6.3 Outpatient consultation (EMR)
- SOAP notes with templates for each specialty, history (medical, surgical, family, social, allergies), vitals with growth charts and z-scores.
- Diagnoses coded with **ICD-11** (with ICD-10 support) and a search tool. Problem list.
- Orders: lab, imaging, procedures, prescriptions, referrals, admission. Order sets.
- **Clinical decision support:** drug–drug, drug–allergy, duplicate therapy and dose-range checks; abnormal-result alerts; guideline prompts from the Kenya Essential Medicines List and treatment guidelines.
- Sick notes, medical certificates, fitness reports, death notification (feeds CRVS).
- Specialty clinics with structured forms:
  - **Dental:** odontogram, procedures
  - **Ophthalmology:** visual acuity, refraction, IOP, spectacle prescription and optical shop
  - **ENT, physiotherapy, nutrition, psychiatry/mental health** (PHQ-9, GAD-7; restricted access)
  - **Paediatrics, gynaecology, orthopaedics, oncology** (chemotherapy protocols and cycles)
  - **Diabetes, hypertension and chronic-care follow-ups**

### 6.4 Public health and programmes
- **HIV care:** HTS, ART, viral load tracking, PMTCT. Can export in a format compatible with KenyaEMR/NASCOP data tools.
- **TB:** case register, DOT. Malaria. Family planning. **Immunisation (KEPI schedule)** with defaulter tracing. Nutrition (MUAC). NCD screening. Community referrals (eCHIS link).
- Disease surveillance: notifiable disease alerts (IDSR) sent to county systems.

### 6.5 Inpatient (IPD)
- Admission (from OPD or A&E or directly), deposit and estimate, bed management board with live occupancy, transfers, bed-booking requests.
- Ward rounds, progress notes, care plans, fluid input/output charts, NEWS2 early-warning score, nursing handover.
- **Nursing module and eMAR:** medication schedules, administration with barcode scanning, missed-dose alerts.
- Diet orders → kitchen. Daily automatic charges (bed, nursing, doctor visits).
- Interim bills, discharge workflow (clinical sign-off → pharmacy return → billing clearance → gate pass), discharge summary sent over the HIE.
- Leave of absence, abscondment, death in ward → mortuary.

### 6.6 Maternity and newborn
- ANC profile (MOH 405 / mother-child booklet fields), visits, scans, risk flags.
- Labour and delivery: electronic partograph, mode of delivery, APGAR, newborn registration (linked mother–baby record, birth notification), PNC, NBU/NICU.
- SHA maternity package mapping (Linda Mama successor packages).

### 6.7 Theatre / surgery
- Booking with clash detection for room, surgeon and anaesthetist. Pre-op checklist (WHO Surgical Safety Checklist). Anaesthesia record. Operation notes. Consent forms. Swab and instrument counts. Recovery. Implants and consumables captured to the bill and stock. Pre-authorisation check before the operation.

### 6.8 Laboratory (LIS)
- Order → sample collection (barcode labels) → accession → processing → results → validation (two-level) → release.
- Test catalogue with LOINC codes, reference ranges by age and sex, panels, calculated tests, critical-value alerts.
- **Analyser interfacing:** ASTM E1381/E1394 and HL7 v2 middleware over serial/TCP, run through the edge agent. Includes a driver framework and simulator.
- Microbiology (culture, sensitivity), histology and cytology, blood bank link, external/referral lab sending, QC (Levey-Jennings charts), turnaround-time analytics.

### 6.9 Radiology (RIS/PACS)
- Orders, modality worklist (DICOM MWL), scheduling, reporting with templates, report verification, OHIF viewer embedded in the record, image sharing link for patients, MOH radiology reports.

### 6.10 Pharmacy
- Outpatient dispensing from e-prescriptions, inpatient dispensing (unit dose / ward stock), returns, partial dispensing.
- **OTC / retail pharmacy:** point of sale, barcode, cash/insurance/M-Pesa, eTIMS receipt.
- Formulary, generic substitution, controlled-drugs register (PPB requirements), expiry and FEFO picking, drug interaction checks, labelling, counselling notes.
- Pharmacovigilance: adverse drug reaction reporting compatible with PPB PvERS.

### 6.11 Dialysis
- Chair and machine scheduling, recurring sessions, pre/intra/post vitals, machine parameters (time series), access type, dialyser reuse tracking, consumables kits, the SHA renal package, outcome reports (Kt/V, URR).

### 6.12 Other clinical support
- **Blood bank:** donors, screening, grouping and crossmatch, inventory, transfusion records, reactions.
- **Mortuary:** body admission, storage, post-mortem, release, mortuary billing, burial permit data.
- **CSSD:** instrument sets, sterilisation cycles, tracking to the patient.
- **Physiotherapy / occupational therapy:** sessions and plans.
- **Ambulance / EMS:** dispatch, trip logs, billing.
- **Kitchen / dietetics:** diet orders, meal plans.
- **Housekeeping and laundry:** bed-cleaning status feeding the bed board.

### 6.13 Telemedicine and patient engagement
- Video consultations (WebRTC via LiveKit), e-prescriptions, payment before the session.
- Patient portal and app: bookings, results, prescriptions, bills, insurance status, payments, visit history, health records download (FHIR), family accounts.
- Messaging: SMS (Africa's Talking, Twilio fallback), WhatsApp Business API, email, USSD for feature phones. Reminders, results-ready alerts, feedback surveys (NPS).

### 6.14 Billing and revenue cycle
- **Pricing engine:** price lists per payer (cash, SHA, each insurer, corporate, staff), per facility, with effective dates; packages and bundles; tariff mapping to SHA benefit packages; discounts and waivers that need approval.
- Encounter bill built from every module. Deposits. Interim and final bills. Splitting a bill between payers (SHA cap → insurer → co-pay → cash). Refunds and credit notes. Write-offs.
- **Cashier:** cash, M-Pesa STK push and Paybill/Till matching (C2B), card, bank, cheque, waiver, corporate credit. End-of-shift reconciliation.
- **Claims management** for SHA and private insurers:
  1. eligibility check
  2. pre-auth request and status
  3. claim assembly with diagnosis and procedure codes and attachments
  4. scrubbing (validation rules)
  5. submission, then status tracking
  6. rejection and resubmission
  7. remittance reconciliation and ageing
- Debtors: corporate accounts, statements, payment plans.

### 6.15 Finance and accounting
- Chart of accounts (IFRS-aligned template), general ledger, AP/AR, bank and M-Pesa reconciliation, multiple currencies, fixed assets link, cost centres per department.
- Automatic journals from billing, receipts, procurement, payroll and stock.
- Financial statements, trial balance, VAT/withholding reports, period closing, approvals, audit trail.
- Export to and integration with QuickBooks, Sage, Xero and Odoo (optional connectors).

### 6.16 Procurement and supply chain
- Requisitions → RFQ → quote comparison → approval workflow with configurable levels → LPO/LSO → goods received note (GRN) with batch and expiry → supplier invoice → three-way match → payment.
- Supplier portal: quotes, LPO acknowledgment, invoice upload. Contracts. KEMSA/MEDS ordering templates.
- Donor/programme stock tracking (separate funding sources).

### 6.17 Inventory
- Multiple stores per facility (main store, pharmacy, wards, lab, theatre). Transfers, issues, consumption, adjustments with approval, stock takes (mobile barcode count).
- Batch/lot, expiry, FEFO, reorder levels, minimum/maximum stock, ABC/VED analysis, valuation (FIFO / weighted average), wastage and expiry reports.
- AI demand forecasting (optional).

### 6.18 Human resources and payroll
- Staff records, contracts, licences, departments, rosters and shifts, duty swaps, attendance (biometric device import), leave, appraisals, training/CPD tracking, disciplinary records.
- **Payroll** with statutory engines in the country pack.
  - Kenya: PAYE, SHIF deduction (2.75%), NSSF tiers, Affordable Housing Levy, HELB, reliefs, P9/P10 forms, iTax CSV export, bank and M-Pesa B2C salary payment.
- Locum and doctor fee-sharing (fee-for-service commissions).
- Employee self-service: payslips, leave requests.

### 6.19 Budgeting
- Departmental and facility budgets, versions, approvals, live spending against budget, commitment control (LPOs reserve budget), variance reports.

### 6.20 Asset and facility management
- Asset register (QR tags), depreciation methods, transfers, disposal, insurance, warranties, preventive maintenance schedules, work orders, biomedical equipment calibration logs, downtime tracking.

### 6.21 Business intelligence and reporting
- Role-based dashboards: CEO, medical director, finance, departmental heads.
- KPIs: revenue, collections, claim rejection rate, ALOS (average length of stay), bed occupancy, turnaround times, top diagnoses, drug consumption, staff productivity.
- **MOH reports** generated automatically with **DHIS2/KHIS submission** via the API:
  - MOH 705A/B (OPD under 5 and over 5), 717 (service workload), 711 (RH/FP/immunisation)
  - 710 (immunisation), 731 (HIV), 240/333 lab and inpatient registers, etc.
  - Country packs supply each country's DHIS2 dataset mapping.
- Report builder (drag and drop), scheduled email reports, Superset embedding, CSV/Excel/PDF exports.

### 6.22 Quality, risk and governance
- Incident reporting, patient complaints, infection-control surveillance, clinical audits, mortality and morbidity reviews, accreditation checklists (KENAS/SafeCare/JCI), policy document library.

### 6.23 AI assistance (behind feature flags, human-in-the-loop, logged)
- Drafting clinical notes from dictation (speech-to-text supporting English and Swahili), ICD-11 code suggestions, discharge summary drafting.
- Claim scrubbing that predicts SHA/insurer rejections, plus stock demand forecasting.
- Use the Claude API (latest Claude models) through a provider-abstracted `ai` module. Strip patient identifiers before sending, and honour the tenant's opt-in setting.

---

## 7. Cross-cutting engines

- **Workflow / approval engine:** configurable multi-level approvals for discounts, waivers, LPOs, stock adjustments, leave and refunds.
- **Pricing engine** as described in §6.14.
- **Numbering:** configurable document numbers per facility (invoice, receipt, LPO, lab accession).
- **Document templates:** receipts, invoices, prescriptions, lab reports, discharge summaries in Handlebars → PDF (Puppeteer), plus thermal printer support (ESC/POS) and barcode/label printers (ZPL).
- **Notification centre:** in-app, email, SMS, WhatsApp, push.
- **Master data:** ICD-11/10, LOINC, SNOMED CT (where licensed), the Kenya Essential Medicines List / national drug codes, KMHFR facilities, SHA benefit package and tariff tables. All versioned and updatable from the admin console.
- **Localisation:** English, Kiswahili, French, Portuguese, Amharic, Arabic (right-to-left), Hausa, Yoruba, Zulu (framework present; at least EN, SW, FR complete).

---

## 8. Integrations (adapters + mocks + contract tests for each)

### 8.1 Kenya: SHA and the national digital health systems (highest priority)
Adapter `integrations/ke/sha-hie`. It authenticates with facility credentials issued through the HIE and SHA provider registration (OAuth2 client credentials). Payloads use FHIR R4 where the HIE requires it.

| Capability | Behaviour |
|---|---|
| Client Registry | Search by ID number or CR ID; create or update a client; get the CR ID; handle dependants |
| Eligibility | Real-time SHA membership and contribution status check per visit; cache with a TTL; show in the UI which fund covers the visit (PHC / SHIF / ECCIF); OTP/biometric verification step if the HIE requires it |
| Benefit packages | Sync SHA package and intervention codes and tariffs; map them to the internal price list; enforce caps, frequency limits and facility level eligibility |
| Pre-authorisation | Submit for packages that need it (surgery, dialysis, oncology, imaging…); poll or receive webhooks; block or flag the service until approved |
| Claims | Build the FHIR Claim (encounter, diagnoses ICD-11, interventions, practitioner ID from the HWR, facility from KMHFR, attachments); submit, track status, query/respond, resubmit |
| Remittance | Import payment advice; automatic reconciliation against claims; ageing and rejection analytics |
| Facility Registry (KMHFR) | Validate the facility code, level and services during onboarding |
| Health Worker Registry | Validate practitioner registration and licence |
| Shared Health Record | Push encounter summaries, and pull history with patient consent |
| Referrals | E-referral exchange |

Make the claims workflow a state machine:
`draft → validated → (preauth_pending → preauth_approved) → submitted → in_review → approved/partially_approved/rejected → paid/reconciled`.

### 8.2 Kenya: other integrations
- **KRA eTIMS** (OSCU/VSCU): invoice and credit note signing, QR on receipts, item classification codes, stock movement reporting, offline queue.
- **M-Pesa Daraja:** STK Push, C2B (Paybill/Till) validation and confirmation, B2C (refunds, salaries), transaction status, reversal, automatic matching to bills.
- **Airtel Money, Pesalink, banks** (Equity, KCB, Co-op APIs), and card payments via Flutterwave/Pesapal/DPO/Stripe.
- **Private insurers and administrators:**
  - Smart/biometric member verification (SMART Applications, Slade360/Savannah EDI)
  - Direct APIs where available (Jubilee, AAR, Britam, CIC, Madison, Old Mutual…)
  - Otherwise generic e-claim export (FHIR/CSV/PDF)
- **DHIS2/KHIS** reporting. **eCHIS** community referrals. **KenyaEMR** data exchange. **NASCOP** reporting. **PPB** (PvERS, product registry). **CRVS** birth and death notifications.
- **iTax** payroll exports. **Africa's Talking** SMS/USSD. **WhatsApp Business** API.

### 8.3 Pan-African country packs (`packages/country-packs/<iso>`)
Each pack defines: currency, tax rules, e-invoicing adapter, national insurance adapter, mobile money adapters, ID types and validation, payroll statutory rules, MOH/DHIS2 report mappings, language defaults, data-residency region, public holidays.

| Country | National insurance | E-invoicing / tax | Mobile money |
|---|---|---|---|
| Kenya | SHA (PHC/SHIF/ECCIF) | KRA eTIMS | M-Pesa, Airtel |
| Uganda | NHIS (when live) + private | URA EFRIS | MTN MoMo, Airtel |
| Tanzania | NHIF (TZ) | TRA VFD/EFD | M-Pesa TZ, Tigo/Mixx, Airtel |
| Rwanda | RSSB/CBHI (Mutuelle) | RRA EBM | MTN MoMo, Airtel |
| Ghana | NHIA (claimIT) | GRA E-VAT | MTN MoMo, Telecel, AT |
| Nigeria | NHIA + HMOs | FIRS e-invoicing | Paystack, Flutterwave, OPay |
| South Africa | Medical schemes (switches e.g. MediKredit / Healthbridge) | SARS | Cards, EFT |
| Ethiopia | EHIA CBHI | ERCA | Telebirr |
| Zambia | NHIMA | ZRA Smart Invoice | MTN, Airtel |
| Others | Generic insurer adapter | Generic VAT | Generic gateway |

Kenya must be fully implemented. Other packs need working configuration and the adapter skeleton plus a mock. Where a public spec exists, implement the real adapter.

### 8.4 Standards
HL7 FHIR R4 (public API + HIE), HL7 v2 (lab/radiology), DICOM / DICOMweb, ASTM (analysers), IHE profiles (PIX/PDQ, XDS where needed), SMART on FHIR app launch, OpenAPI 3.1 for the REST API.

### 8.5 Developer platform
Public REST + FHIR API with OAuth2, per-tenant API keys, rate limits, signed webhooks (e.g. patient.created, bill.paid, claim.status_changed, result.released), a developer portal with docs and sandbox, and a plugin/marketplace framework with UI extension points.

---

## 9. Offline-first design
- The PWA caches reference data and the current working set (today's queue, ward patients, stock items).
- Every write is a command with a client UUID, saved to a local outbox and synced when online. The server is the authority. Conflicts are resolved by entity: last-writer-wins for demographics; append-only for clinical notes and vitals; stock and money move only through server-validated commands.
- Offline bills issue provisional receipt numbers and queue eTIMS signing.
- The optional **edge node** (on-premise) keeps a local Postgres replica for a whole facility, so it keeps running through long outages. It also hosts the lab analyser and printer drivers.
- A sync status indicator is shown in the UI, and an admin screen lists sync conflicts.

---

## 10. Data model (core entities, non-exhaustive)
Tenant, Facility, Department, ServicePoint, Ward, Bed, User, Role, Permission, Practitioner, Patient, Identifier, NextOfKin, Consent, Visit/Encounter, QueueTicket, Appointment, Triage, Vitals, ClinicalNote, Diagnosis, Allergy, Order (polymorphic: Lab/Imaging/Procedure/Medication/Diet/Referral), Specimen, LabResult, ImagingStudy, Prescription, Dispense, MedicationAdministration, Admission, BedTransfer, Discharge, Surgery, AnaesthesiaRecord, DialysisSession, Delivery, Newborn, Immunization, ProgrammeEnrollment, ChargeItem, PriceList, PriceListItem, Package, Bill, BillLine, Payment, Receipt, Refund, Payer, Scheme, MemberCover, PreAuth, Claim, ClaimLine, Remittance, Account, JournalEntry, JournalLine, Supplier, Requisition, RFQ, Quotation, PurchaseOrder, GRN, SupplierInvoice, Item, Store, StockBatch, StockMovement, StockTake, Employee, Contract, Shift, Attendance, Leave, PayrollRun, Payslip, Budget, BudgetLine, Asset, MaintenanceOrder, Incident, AuditEvent, IntegrationMessage, OutboxEvent, Notification, Document, ReportDefinition.

Every table carries `id (uuid v7)`, `tenant_id`, `facility_id` (where relevant), `created_at/by`, `updated_at/by`, `version` (optimistic locking) and soft delete where legally required.

---

## 11. Non-functional requirements
- **Performance:** p95 API latency < 300 ms; patient search < 500 ms across 10 million patients; 5,000 concurrent users per region; billing posts in < 1 s.
- **Availability:** 99.9% SLA; zero-downtime deploys; status page.
- **Scalability:** horizontal API pods; read replicas for reporting; partitioning of large tables (audit, stock movements, vitals).
- **Accessibility:** WCAG 2.1 AA. Works on low-end Android devices and 3G networks (bundle budget < 250 KB initial JS on key screens).
- **Usability:** keyboard-first data entry for clerks, a touch-friendly mode for wards, dark mode, and most common workflows completed in 3 clicks or fewer.
- **Data retention:** configurable per country (Kenya medical records are typically kept at least 10 years; children's records until adulthood plus the statutory period).

---

## 12. Seed data and demo
- A demo tenant "Demo Mission Hospital" (Level 4) with 2 branches, 50 staff, 2,000 synthetic patients, a year of synthetic visits, a stock list from the Kenya Essential Medicines List, SHA package tables (sample), 5 insurers, price lists.
- A sandbox where all integration mocks are wired in, so you can run end-to-end through SHA eligibility → pre-auth → claim → remittance, M-Pesa STK, and eTIMS signing.

---

## 13. Documentation deliverables
- `README` with one-command local start (`docker compose up`), architecture decision records (ADRs), ER diagram, OpenAPI and FHIR capability statement.
- An integration guide for each adapter. A runbook (deploy, backups, incident response). A security and data protection pack (DPIA template, ROPA).
- User manuals for each role (Markdown → docs site), plus in-app guided tours.

---

## 14. Build order (one continuous build; each phase is gated by tests)

1. **Foundation:** monorepo, CI, infra-as-code, Keycloak, tenancy + RLS, RBAC, audit, outbox/events, design system, i18n, country-pack framework, master data loaders.
2. **Patient administration + queue + appointments + Client Registry adapter.**
3. **Pricing engine, billing, cashier, M-Pesa, eTIMS.**
4. **OPD EMR + triage/A&E + CDS + ICD-11.**
5. **Pharmacy + inventory + procurement.**
6. **Laboratory (incl. analyser framework) + radiology (Orthanc/OHIF, MWL).**
7. **IPD + nursing/eMAR + maternity/newborn + theatre + dialysis.**
8. **SHA full integration** (eligibility, packages, pre-auth, claims, remittance) **+ private insurers + claims workbench.**
9. **Accounting, budgeting, assets, HR + payroll.**
10. **Specialty clinics, programmes (HIV/TB/immunisation/FP), blood bank, mortuary, CSSD, ambulance, kitchen, quality.**
11. **BI, MOH reports, DHIS2 submission, report builder.**
12. **Patient portal and apps, telemedicine, messaging, USSD.**
13. **Offline sync engine + edge node.**
14. **Public API, webhooks, developer portal, plugin framework.**
15. **AI features.**
16. **Additional country packs** (UG, TZ, RW, GH, NG, ZA, ET, ZM).
17. **SaaS admin console, subscription billing, onboarding wizard, data migration tools.**
18. **Hardening:** load tests, security tests, accessibility audit, documentation, demo seed.

**Definition of done for each phase:**
- Unit coverage ≥ 80% on domain logic.
- Integration tests on all endpoints.
- Playwright end-to-end tests for the phase's main workflows.
- Contract tests for its adapters.
- No high or critical security findings.
- Docs updated.

---

## 15. End-to-end acceptance scenarios (must pass in CI against mocks)
1. A walk-in SHA member is registered via the Client Registry, eligibility shows PHC cover, triaged, consulted (ICD-11), lab ordered and resulted, prescription dispensed. The claim is generated and submitted automatically, and the remittance reconciles.
2. A cash patient pays by M-Pesa STK. An eTIMS-signed receipt prints with a QR code, and journals post to the general ledger.
3. Inpatient surgery under a private insurer: pre-auth is obtained, admission happens, theatre consumables are deducted from stock, daily charges run, the bill splits between insurer and co-pay, and the discharge summary is pushed to the HIE.
4. A recurring dialysis patient under the SHA renal package has 3 sessions per week scheduled, and the package frequency cap is enforced.
5. Maternity: ANC → delivery → newborn registered with a linked record → birth notification → immunisation schedule created.
6. Stock falls below its reorder level → requisition → LPO approval → GRN with batch and expiry → three-way match → supplier payment.
7. Month end: payroll with Kenyan statutory deductions, P10 export, financial statements, and the MOH 705/717 reports pushed to the DHIS2 mock.
8. The internet drops at a clinic. Registration, consultation and cash billing continue offline, then sync without data loss when the connection returns.
9. A tenant in Ghana (GH pack) runs an NHIA-covered visit with MoMo payment, all in GHS.
10. A patient books online in the app, holds a telemedicine call, receives an e-prescription and pays in the app.

---

*End of specification. Build the complete system as specified.*

---

## 16. Competitive priorities (added after the market research in docs/COMPETITIVE_ANALYSIS.md)
These change the build order and add to the scope above.
1. **A DHA certification pack is part of Phase 1:** a `docs/compliance/` folder with a DPIA, security/privacy policy, backup and recovery policy plus a restore-drill script, HMIS form-4 self-attestation evidence, ODPC controller/processor details, and a conformance test suite for ICD-11, FHIR, national product catalogue codes and the CIHIS/ESB interface.
2. **Move SHA/HIE integration up to Phase 3**, alongside billing. Without it the product can't be sold in Kenya.
3. **Claims intelligence:** an SHA rules engine, pre-submission scrubber, rejection predictor, a "why is this claim stuck" tracker and remittance auto-reconciliation. Track a first-pass acceptance KPI (target ≥95%).
4. **Taifa Care coexistence:** exchange records with government facilities through the HIE (referrals, shared health record).
5. **Deadline-rescue onboarding:** a tenant goes from sign-up to compliant and live in 48 hours (KMHFR lookup, CSV import, SHA tariff preload).
6. **Published pricing page** with KES tiers and no setup fee, plus an optional %-of-collections plan for the claims module.
7. **Home-care module:** caregiver/nurse home and bedside visits with GPS check-in/out, escrow payments and provider vetting.
8. **Embedded finance hooks (partner-ready):** advances against SHA receivables and patient pay-later; expose receivables data through a partner API.
9. **Fiscal adapter layer** covering eTIMS, EFRIS, VFD, EBM, E-VAT, ZRA Smart Invoice and FIRS behind one interface.
10. **Target market:** private, faith-based and Level 5/6 hospitals, specialist centres, chains, pharmacies and labs. Public Level 2–4 facilities are on Taifa Care.
