# HMIS self-attestation (template)

- **Vendor:** ____ · **Product:** JMSURF HMIS · **Version:** 0.1.0 · **Hosting:** ____ (data residency: Kenya / approved region)

| Domain | Requirement | Compliant (Y/N/Partial) | Evidence |
|---|---|---|---|
| Identity | Client Registry lookup and use of the national client ID | Partial | sha-hie adapter `lookupClient` |
| Interoperability | FHIR R4 resources: Patient, Encounter, Claim, Practitioner, Organization | Y | integrations/fhir |
| Terminology | ICD-11 diagnoses | Y | diagnoses module |
| Claims | SHA eligibility, pre-auth, claims, status | Partial | revenue/claims + sha-hie |
| Security | RBAC, MFA (admin), encryption in transit/at rest, audit | Partial | auth, guards, AuditService |
| Privacy | Consent capture, data-subject requests | Partial | Consent model |
| Availability | Backups, tested restore, monitoring | Partial | BACKUP_RECOVERY.md |
