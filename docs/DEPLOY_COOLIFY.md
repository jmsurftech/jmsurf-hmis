# Deploying JMSURF HMIS on Coolify

This guide is written so that **Claude Code running on your server** (or you) can follow it step by step.

## What gets deployed
| Service | Purpose | Port (internal) | Public domain |
|---|---|---|---|
| `postgres` | PostgreSQL 16 (main database) | 5432 | none (keep private) |
| `redis` | cache/queues | 6379 | none |
| `api` | NestJS API (`/api`, Swagger at `/api/docs`) | 4000 | e.g. `https://api.hmis.example.com` |
| `web` | Next.js staff app + landing page | 3000 | e.g. `https://hmis.example.com` |
| `mock-servers` | SHA/HIE, M-Pesa, eTIMS, DHIS2, SMS sandboxes | 4100 | none (remove once real credentials exist) |

**Database choice:** plain PostgreSQL runs inside the stack (recommended). Supabase also works, because it is PostgreSQL: delete the `postgres` service and set `DATABASE_URL` on `api` to the Supabase **direct** connection string (port 5432, not the pooler). Use the same approach for a Coolify-managed PostgreSQL resource.

## Steps (Coolify v4)
1. **Projects → New → Resource → Public/Private Repository**. Select `jmsurftech/jmsurf-hmis` (connect the GitHub App if it's private), branch `main`.
2. **Build pack: Docker Compose**. Compose file: `/docker-compose.yml`.
3. **Environment variables** (Coolify → Environment Variables):
   ```
   POSTGRES_PASSWORD=<generate strong>
   JWT_SECRET=<generate 64+ random chars>
   NEXT_PUBLIC_API_URL=https://api.hmis.example.com/api
   WEB_ORIGIN=https://hmis.example.com
   SEED_DEMO=true            # first deploy only, gives you demo logins; set false afterwards
   ```
   Integration variables (`SHA_*`, `MPESA_*`, `ETIMS_*`, `AFRICASTALKING_*`, `DHIS2_*`, `ANTHROPIC_API_KEY`) default to the mock servers. Replace them with real credentials when you have them (see `.env.example`).
4. **Domains**: on the `web` service set `https://hmis.example.com` (port 3000). On `api` set `https://api.hmis.example.com` (port 4000). Coolify issues Let's Encrypt certificates automatically. Point DNS A records at the server first.
5. **Deploy.** The API container runs database migrations on start (`docker-entrypoint.sh`) and seeds demo data when `SEED_DEMO=true`.
6. **Verify:**
   - `https://api.hmis.example.com/api/health` → `{"status":"ok"}`
   - `https://hmis.example.com` → landing page → **Login** with `admin@demo.jmsurf.health` / `Demo@1234` (demo seed)
   - Or click **Sign up** to create a real tenant.
7. **After the first deploy:** set `SEED_DEMO=false` and redeploy. Change the demo passwords or delete the demo tenant.
8. **M-Pesa callback:** with real Daraja credentials, set `MPESA_CALLBACK_URL=https://api.hmis.example.com/api/payments/mpesa/callback`.
9. **Backups:** enable Coolify scheduled backups for the `postgres` volume (daily, offsite S3). Test a restore monthly (`docs/compliance/BACKUP_RECOVERY.md`).

## Updating
Push to `main`, then click **Redeploy** in Coolify (or enable auto-deploy on push).

## Troubleshooting
- API keeps restarting → check `DATABASE_URL`/`POSTGRES_PASSWORD` and the logs (`Applying database migrations...`).
- Web shows network errors → `NEXT_PUBLIC_API_URL` is baked in at build time, so redeploy `web` after changing it. Check that `WEB_ORIGIN` matches the web domain (CORS).
