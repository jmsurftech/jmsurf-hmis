#!/bin/sh
# Private test stack for JMSURF HMIS on the build server (never the live database).
# Runs from /root/hmis-work/tree: Postgres + API (built) + web (next dev, hot reload) + mocks on docker network hmis-test.
# Usage: sh scripts/testenv.sh up|api|web|down
set -e
NET=hmis-test; T=/root/hmis-work/tree; C=/root/hmis-work/pnpm-store
API_URL=http://hmis-api:4000/api
docker network inspect $NET >/dev/null 2>&1 || docker network create $NET >/dev/null
case "$1" in
  up)
    docker rm -f hmis-pg >/dev/null 2>&1 || true
    docker run -d --name hmis-pg --network $NET -e POSTGRES_USER=jmsurf -e POSTGRES_PASSWORD=testpass -e POSTGRES_DB=jmsurf_hmis postgres:16-alpine >/dev/null
    docker rm -f hmis-mock >/dev/null 2>&1 || true
    docker run -d --name hmis-mock --network $NET -v $T:/repo -w /repo/apps/mock-servers node:22-alpine sh -c 'corepack enable >/dev/null; pnpm install --no-frozen-lockfile >/dev/null 2>&1; PORT=4100 npx ts-node --transpile-only src/main.ts' >/dev/null
    sleep 5; sh $0 api; sh $0 web ;;
  api)
    docker rm -f hmis-api >/dev/null 2>&1 || true
    docker run -d --name hmis-api --network $NET -v $T:/repo -v $C:/pnpm-store -w /repo \
      -e DATABASE_URL="postgresql://jmsurf:testpass@hmis-pg:5432/jmsurf_hmis?schema=public" -e JWT_SECRET=test-secret-test-secret -e API_PORT=4000 \
      -e SHA_BASE_URL=http://hmis-mock:4100/sha -e MPESA_BASE_URL=http://hmis-mock:4100/mpesa -e ETIMS_BASE_URL=http://hmis-mock:4100/etims \
      -e DHIS2_BASE_URL=http://hmis-mock:4100/dhis2 -e AFRICASTALKING_BASE_URL=http://hmis-mock:4100/sms -e SMS_PROVIDER=mock -e JMSURFPAY_URL=http://hmis-mock:4100/jmsurfpay -e JMSURFPAY_API_KEY=test-key \
      node:22-alpine sh -c 'apk add --no-cache openssl >/dev/null; corepack enable; pnpm config set store-dir /pnpm-store >/dev/null; pnpm install --filter @jmsurf-hmis/api... --frozen-lockfile=false >/tmp/i.log 2>&1;
        cd apps/api && npx prisma generate >/dev/null && npx prisma migrate deploy && (test -f /repo/.seeded || (npx ts-node prisma/seed.ts && touch /repo/.seeded)); pnpm build >/tmp/b.log 2>&1 || { cat /tmp/b.log; exit 1; }; node dist/main.js' >/dev/null ;;
  web)
    docker rm -f hmis-web >/dev/null 2>&1 || true
    docker run -d --name hmis-web --network $NET -v $T:/repo -v $C:/pnpm-store -w /repo -e NEXT_PUBLIC_API_URL=$API_URL -e WATCHPACK_POLLING=true -e NEXT_TELEMETRY_DISABLED=1 \
      node:22-alpine sh -c 'corepack enable; pnpm config set store-dir /pnpm-store >/dev/null; pnpm install --filter @jmsurf-hmis/web... --frozen-lockfile=false >/tmp/i.log 2>&1; cd apps/web && npx next dev -p 3000' >/dev/null ;;
  down) docker rm -f hmis-pg hmis-api hmis-web hmis-mock >/dev/null 2>&1 || true; rm -f $T/.seeded ;;
esac
