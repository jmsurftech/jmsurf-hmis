#!/bin/sh
set -e
echo "Applying database migrations..."
if [ -d prisma/migrations ] && [ "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  npx prisma migrate deploy
else
  npx prisma db push --skip-generate
fi
if [ "$SEED_DEMO" = "true" ]; then
  echo "Seeding demo data..."
  npx ts-node prisma/seed.ts || echo "Seed failed (continuing)"
fi
exec node dist/main.js
