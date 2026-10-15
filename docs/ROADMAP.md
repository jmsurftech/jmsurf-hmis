# Roadmap: built vs remaining

Status against `BUILD_PLAN.md`.

## ✅ Built in this release (v0.1)
Foundation (tenancy, auth, RBAC, audit, sequences); patients and Client Registry; visits, queue and appointments; EMR (triage, vitals/NEWS2, notes, ICD-11); orders, lab and radiology; pharmacy and OTC; inventory and procurement; inpatient and eMAR; maternity and immunisation; theatre; dialysis; home care; pricing, billing, payments and cashier; M-Pesa; eTIMS; SHA/HIE adapter (FHIR); claims (scrubber, state machine, remittance); finance (GL auto-posting, statements); HR and Kenya payroll; assets; budgets; reports (dashboard, MOH 705/717, DHIS2); quality; web app for every module; landing page and pricing; self-service sign-up; mock servers; Coolify deploy; DHA compliance pack templates; CI.

## ⚠️ Needs real-world inputs before go-live
- **SHA/HIE:** the official API specification and credentials are issued during DHA certification. The adapter paths and payloads are configurable assumptions (`docs/integrations/ASSUMPTIONS.md`).
- **eTIMS** OSCU/VSCU credentials and KRA certification; **M-Pesa** production Daraja app.
- **KHIS/DHIS2** real dataSet/dataElement IDs (`backoffice/reports/dhis2-mapping.ts`).
- **Reference data to verify:** payroll rates (`hr/kenya-payroll.ts`), the MOH 705 ICD mapping, the ICD-11 subset (load the full WHO release), SHA package tariffs (currently a SAMPLE file), the national product catalogue.
- **Legal:** ODPC registration, the DPIA sign-off, and the DHA certification application.

## 🔜 Next phases
1. **Security hardening:** Postgres row-level security as a second tenancy layer, TOTP MFA, refresh tokens, rate limits per tenant, field encryption for sensitive notes, break-glass access.
2. **Offline-first:** a PWA service worker with an IndexedDB outbox and sync, plus an edge node for large hospitals.
3. **Patient app and portal** (Expo + Next.js): booking, results, bills, SHA status, payments; **telemedicine** (LiveKit); WhatsApp, USSD and SMS reminders.
4. **Lab analyser interfacing** (ASTM/HL7 v2 via the edge agent); **PACS** (Orthanc + OHIF) with a DICOM worklist.
5. **Remaining clinical modules:** blood bank, mortuary, CSSD, ambulance, kitchen, physiotherapy, HIV/TB programme modules (KenyaEMR-compatible exports), oncology protocols.
6. **AI** (Claude API, opt-in, patient data de-identified first): Swahili/English dictation to notes, ICD-11 coding suggestions, claim-denial prediction, stock forecasting.
7. **SaaS console:** subscription billing (M-Pesa/cards), usage metering, plan enforcement, CSV migration wizard, tenant branding and custom domains.
8. **Country packs:** implement the EFRIS/VFD/EBM/E-VAT/ZRA/FIRS adapters and the TZ NHIF and GH NHIA claims adapters.
9. **Embedded finance** partner API (advances against SHA receivables).
10. **Quality:** end-to-end Playwright suite in CI, k6 load tests, OpenTelemetry tracing, a penetration test.
