# Code conventions (API)

- NestJS modules, one folder per domain. Controllers are thin and services hold the logic. Every DTO uses class-validator.
- **Tenancy:** get `tenantId` from `@CurrentUser() user: AuthUser` (`user.tenantId`). NEVER accept it from the body or query. Every Prisma query filters by `tenantId`.
- Authentication is global (JWT). Use `@Public()` for open endpoints and `@Roles('DOCTOR','NURSE')` to restrict access. ADMIN always passes.
- Roles: ADMIN, RECEPTION, TRIAGE_NURSE, NURSE, DOCTOR, CLINICAL_OFFICER, LAB_TECH, RADIOGRAPHER, PHARMACIST, CASHIER, CLAIMS_OFFICER, STOREKEEPER, PROCUREMENT, ACCOUNTANT, HR, MANAGER.
- Money is integer minor units (`...Minor`). Use `common/money.ts`.
- Document numbers come from `SequenceService.next(tenantId, 'NAME', 'PREFIX')`.
- Post charges ONLY through `BillingCoreService.charge({...})` (global provider).
- Audit sensitive actions with `AuditService.log({...})`.
- Integrations are reached only through ports in `src/integrations/ports.ts`: inject with `@Inject(NATIONAL_INSURANCE)` etc. Adapters are provided globally by `IntegrationsModule`.
- Routes live under `/api/...` (global prefix). Lists accept `?q=&page=&pageSize=` and return `{ data, total, page, pageSize }`.
- Each domain area has an aggregator module (`clinical/clinical.module.ts`, `revenue/revenue.module.ts`, `backoffice/backoffice.module.ts`). Register sub-modules there, not in app.module.
- Tests: `*.spec.ts` next to the code, using jest + ts-jest. Unit-test pure business rules (pricing, scrubbing, payroll, flags).
