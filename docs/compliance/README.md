# DHA certification pack (Kenya)

These are templates and evidence for certification by the Digital Health Agency under the Digital Health Act 2023 and the Digital Health Regulations 2025. Legal and compliance staff must review each document and complete it with company details before submission.

| Requirement | File / evidence | Status |
|---|---|---|
| HMIS self-attestation and gap analysis (form 4) | `SELF_ATTESTATION.md` | Template |
| ODPC registration (data controller and processor) | `ODPC_REGISTRATION.md` | Action needed: register at odpc.go.ke |
| Data Protection Impact Assessment | `DPIA.md` | Draft |
| Security, privacy and confidentiality policy | `SECURITY_POLICY.md` | Draft |
| Backup and recovery policy, with a tested restore | `BACKUP_RECOVERY.md` + `scripts/restore-drill.sh` | Draft |
| ICD-11 coding | API `/api/diagnoses/icd` (ICD-11 code set) | Implemented (subset; load the full WHO release) |
| HL7 FHIR R4 exchange | `apps/api/src/integrations/fhir` | Implemented (mapping) |
| National product catalogue codes | `StockItem.productCode` | Field present; load the catalogue |
| CIHIS / ESB / HIE interface | `apps/api/src/integrations/sha-hie` | Adapter built against assumptions; certify against the official spec |
| Audit trail | Hash-chained `AuditEvent` table | Implemented |
