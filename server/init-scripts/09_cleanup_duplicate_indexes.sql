-- 09_cleanup_duplicate_indexes.sql
-- Purpose: remove redundant duplicate indexes created accidentally in 07_indexes_constraints.sql
-- We keep the *lower suffix variants as the canonical ones and drop the older generic names.
-- Safe to run multiple times (IF EXISTS) and idempotent.

BEGIN;

-- Drop redundant unique/regular indexes if they coexist with canonical *_lower versions
DO $$
BEGIN
    -- Clients unique index (keep ux_clients_name_lower)
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='uq_clients_name_lower') THEN
        EXECUTE 'DROP INDEX IF EXISTS uq_clients_name_lower';
    END IF;

    -- Employees email unique (keep ux_employees_email_lower partial index)
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='uq_employees_email') THEN
        EXECUTE 'DROP INDEX IF EXISTS uq_employees_email';
    END IF;

    -- Employees name regular index (keep idx_employees_full_name_lower)
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='idx_employees_full_name') THEN
        EXECUTE 'DROP INDEX IF EXISTS idx_employees_full_name';
    END IF;

    -- Projects name regular index (keep idx_projects_name_lower)
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='idx_projects_name') THEN
        EXECUTE 'DROP INDEX IF EXISTS idx_projects_name';
    END IF;

    -- Statuses name regular index (keep idx_statuses_name_lower)
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='idx_statuses_name') THEN
        EXECUTE 'DROP INDEX IF EXISTS idx_statuses_name';
    END IF;
END $$;

INSERT INTO schema_migrations (filename)
SELECT '09_cleanup_duplicate_indexes.sql'
WHERE NOT EXISTS (SELECT 1 FROM schema_migrations WHERE filename='09_cleanup_duplicate_indexes.sql');

COMMIT;
