-- 07_indexes_constraints.sql
-- Additional performance and data integrity enhancements

BEGIN;

-- Lowercase unique index for clients names (avoid duplicates with case differences)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ux_clients_name_lower'
    ) THEN
        EXECUTE 'CREATE UNIQUE INDEX ux_clients_name_lower ON clients (LOWER(name));';
    END IF;
END $$;

-- Email partial unique (only when not null)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ux_employees_email_lower'
    ) THEN
        EXECUTE 'CREATE UNIQUE INDEX ux_employees_email_lower ON employees (LOWER(email)) WHERE email IS NOT NULL;';
    END IF;
END $$;

-- Performance indexes (skip if exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_projects_name_lower') THEN
        EXECUTE 'CREATE INDEX idx_projects_name_lower ON projects (LOWER(name));';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_employees_full_name_lower') THEN
        EXECUTE 'CREATE INDEX idx_employees_full_name_lower ON employees (LOWER(full_name));';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_statuses_name_lower') THEN
        EXECUTE 'CREATE INDEX idx_statuses_name_lower ON statuses (LOWER(name));';
    END IF;
END $$;

INSERT INTO schema_migrations (filename)
SELECT '07_indexes_constraints.sql'
WHERE NOT EXISTS (SELECT 1 FROM schema_migrations WHERE filename='07_indexes_constraints.sql');

COMMIT;-- 07_indexes_constraints.sql
BEGIN;

-- Add unique lower indexes to avoid case duplicates (if not already there)
CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_name_lower ON clients (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_employees_full_name ON employees(full_name);
CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name);
CREATE INDEX IF NOT EXISTS idx_statuses_name ON statuses(name);

-- Example email unique (nullable) using partial index
CREATE UNIQUE INDEX IF NOT EXISTS uq_employees_email ON employees(email) WHERE email IS NOT NULL;

INSERT INTO schema_migrations (filename)
SELECT '07_indexes_constraints.sql'
WHERE NOT EXISTS (SELECT 1 FROM schema_migrations WHERE filename='07_indexes_constraints.sql');

COMMIT;