# JMSURF HMIS — notes for Claude

Multi-tenant hospital management SaaS for Kenya, built to expand across Africa. The full specification is in `docs/BUILD_PLAN.md`. The market and positioning research is in `docs/COMPETITIVE_ANALYSIS.md`. Remaining work is listed in `docs/ROADMAP.md`.

## Layout
- `apps/api`: NestJS 10 + Prisma 5 (multi-file schema in `apps/api/prisma/schema/*.prisma`). The domain aggregator modules are `src/clinical`, `src/revenue`, `src/backoffice`. External systems are reached only through `src/integrations` (ports in `ports.ts`).
- `apps/web`: Next.js 15 staff app + landing page.
- `apps/mock-servers`: sandbox SHA/HIE, M-Pesa, eTIMS, DHIS2, SMS.
- `docker-compose.yml`: the production stack for Coolify (see `docs/DEPLOY_COOLIFY.md`).

## Schema changes
Edit `apps/api/prisma/schema/*.prisma`, then run `npx prisma migrate dev --name <change>` and commit the migration. Production applies migrations when the container starts.

## Rules
Follow `docs/CONVENTIONS.md`. In particular:
- `tenantId` always comes from the JWT.
- Money is in integer minor units.
- Charges go only through `BillingCoreService.charge`.
- Document numbers come from `SequenceService`.

## Commands
```
pnpm install
cd apps/api && npx prisma generate && npx prisma db push && pnpm seed && pnpm dev   # API :4000
pnpm --filter @jmsurf-hmis/web dev                                                 # web :3000
pnpm --filter @jmsurf-hmis/mock-servers dev                                        # mocks :4100
cd apps/api && npx jest                                                            # tests
```
