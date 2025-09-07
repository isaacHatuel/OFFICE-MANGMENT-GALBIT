-- 12_project_status_flags.sql
-- Adds aggregate treated/delivered/finished flags to projects and backfills.

BEGIN;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS treated BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS delivered BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS finished BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill existing rows (idempotent)
UPDATE projects SET treated = COALESCE(treated, FALSE), delivered = COALESCE(delivered, FALSE), finished = COALESCE(finished, FALSE);

INSERT INTO schema_migrations (filename)
SELECT '12_project_status_flags.sql'
WHERE NOT EXISTS (SELECT 1 FROM schema_migrations WHERE filename='12_project_status_flags.sql');

COMMIT;
