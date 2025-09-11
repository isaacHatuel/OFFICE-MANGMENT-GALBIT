# Database Backups

Place dated PostgreSQL schema/data dumps here. Naming convention:

```
YYYY-MM-DD_full.sql        # full schema + data
YYYY-MM-DD_schema.sql      # schema only
YYYY-MM-DD_data.sql        # data only (optional)
```

Example: `2025-08-30_full.sql` for the 30.08.2025 snapshot you mentioned.

To restore inside running compose stack (Windows PowerShell examples):

```powershell
# Copy dump into db container
docker cp 2025-08-30_full.sql offc_mngr-db-1:/tmp/restore.sql
# Exec restore (will overwrite existing objects)
docker exec -it offc_mngr-db-1 bash -c "psql -U officeuser -d officedb -f /tmp/restore.sql"
```

Automated nightly backup (example cron) will be added later if desired.

## Automated Container Backup Service

Added a `db-backup` service in `docker-compose.yml`:

- Runs once every ~24h (sleep loop) creating two files:
	- `YYYY-MM-DD_schema.sql`
	- `YYYY-MM-DD_full.sql`
- Keeps last 7 days (older files auto-deleted).
- Stores inside named volume `db_backups` and also mirrors host directory `./db_backups` (so you see files locally).

View log lines:
```powershell
docker logs -f offc_mngr-db-backup-1
```

Manual on-demand backup:
```powershell
docker exec -e PGPASSWORD=officepass offc_mngr-db-1 pg_dump -U officeuser -d officedb > .\db_backups\manual_$(Get-Date -Format 'yyyy-MM-dd_HH-mm')_full.sql
```

## Quick Restore Script

`restore.ps1` wrapper:
```powershell
pwsh .\db_backups\restore.ps1 -File .\db_backups\2025-08-30_full.sql
```

## Initial Historical Snapshot (30.08.2025)

Place the file you have (e.g. `2025-08-30_full.sql`) into this folder, then run the restore script if you want the DB to exactly match that snapshot.

