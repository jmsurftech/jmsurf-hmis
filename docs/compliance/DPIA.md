# Data Protection Impact Assessment (draft)

1. **Processing:** registration, clinical care, billing, insurance claims, reporting to MOH/DHIS2, SMS reminders.
2. **Data categories:** identifiers (national ID, CR ID, SHA number), contact details, health data (sensitive), financial data, staff HR data.
3. **Lawful basis:** provision of healthcare (DPA 2019 s.30, s.46); legal obligation (MOH reporting, tax); consent (marketing SMS, research).
4. **Data flows:** facility ↔ JMSURF HMIS cloud ↔ national HIE/SHA, KRA eTIMS, M-Pesa, SMS provider, DHIS2.
5. **Risks and mitigations:**

   | Risk | Mitigation |
   |---|---|
   | Unauthorised access | RBAC, per-facility scoping, audit logging, MFA |
   | Cross-tenant leakage | `tenantId` taken from the JWT on every query; RLS planned |
   | Breach | 72-hour notification workflow; encryption |
   | Over-sharing to the HIE | Consent records checked before pushing |

6. **Retention:** medical records ≥10 years (minors: until age of majority plus the statutory period); financial records 7 years.
7. **Data subject rights:** access, correction and deletion requests handled by admin tooling (roadmap).
8. **Residual risk and sign-off:** ____ (DPO)
