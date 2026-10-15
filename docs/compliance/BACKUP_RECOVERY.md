# Backup and recovery policy (draft)
- **RPO:** 15 min target (WAL archiving roadmap); daily full `pg_dump` via Coolify scheduled backups to offsite S3, kept 30 days plus monthly copies for 12 months.
- **RTO:** 4 hours.
- **Restore drill:** run `scripts/restore-drill.sh` monthly. It restores the latest dump into a scratch database and runs row-count checks. Record the results below.

| Date | Backup used | Restore time | Result | By |
|---|---|---|---|---|
