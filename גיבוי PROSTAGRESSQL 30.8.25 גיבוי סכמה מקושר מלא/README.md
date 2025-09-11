This folder contains a full plain‑SQL backup of the PanelPro PostgreSQL database taken on 2025‑08‑30 and helper scripts to restore it.

Files:
- panelpro_db_full_2025_08_30.sql  — full plain SQL dump (schema + data)
- restore_full.sh                 — shell script to restore dump into a running postgres container
- restore_full.ps1               — PowerShell wrapper for Windows hosts
- checksum.sha256                — SHA256 checksum of the SQL dump

Restore notes:
1) The dump was created with pg_dump --no-owner --no-privileges -Fc (or plain SQL). If plain SQL, import with psql -U <user> -d <db> -f <dumpfile>. If custom format (.dump) use pg_restore.
2) Required extensions: pg_trgm, unaccent. If not present, run:
   CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
   CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;
3) The restore script will terminate active connections, drop and recreate the database, create necessary extensions, and import the dump.
4) After restore, some indexes depending on extensions may need to be recreated; the restore script attempts to run them again.

If you want exact constraint/index names changed after restore, edit the restore scripts to include ALTER ... RENAME statements.

Contact: DevOps notes in repo. Created by automated assistant.
