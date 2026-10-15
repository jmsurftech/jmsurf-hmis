#!/bin/sh
# Usage: DUMP=backup.sql.gz TARGET_URL=postgresql://user:pass@host:5432/restore_test ./scripts/restore-drill.sh
set -e
: "${DUMP:?set DUMP}"; : "${TARGET_URL:?set TARGET_URL}"
start=$(date +%s)
gunzip -c "$DUMP" | psql "$TARGET_URL" -q
for t in Tenant Patient Visit Bill Payment Claim; do
  printf '%s: ' "$t"; psql "$TARGET_URL" -tAc "SELECT count(*) FROM \"$t\""
done
echo "Restore completed in $(( $(date +%s) - start ))s"
