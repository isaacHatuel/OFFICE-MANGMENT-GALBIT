-- יצירת טבלאות בסיסיות למערכת
CREATE TABLE IF NOT EXISTS workers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    logic VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    order_id VARCHAR(50),
    client VARCHAR(100),
    project_name VARCHAR(100),
    board_name VARCHAR(100),
    quantity INTEGER,
    worker VARCHAR(100),
    status VARCHAR(50),
    neg1 VARCHAR(50),
    neg2 VARCHAR(50),
    neg3 VARCHAR(50),
    notes TEXT,
    treated BOOLEAN,
    delivered BOOLEAN,
    finished BOOLEAN,
    date DATE
);

CREATE TABLE IF NOT EXISTS journal (
    id SERIAL PRIMARY KEY,
    date DATE,
    client VARCHAR(100),
    project_name VARCHAR(100),
    board_name VARCHAR(100),
    col4 TEXT,
    col5 TEXT,
    col6 TEXT,
    col7 VARCHAR(100),
    col8 VARCHAR(100),
    col9 VARCHAR(100),
    col10 VARCHAR(100),
    col11 VARCHAR(100),
    col12 VARCHAR(100),
    col13 VARCHAR(100)
);

-- =============================================================
-- NEW NORMALIZED SCHEMA (clients, statuses, employees, projects, project_boards)
-- Includes automatic migration from legacy denormalized 'projects' table if present.
-- Safe to re-run (guards included).
-- =============================================================

-- 1) Detect legacy 'projects' structure (has project_name column, lacks client_id) and rename to legacy_projects
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='projects' AND column_name='project_name'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='projects' AND column_name='client_id'
    ) THEN
        EXECUTE 'ALTER TABLE projects RENAME TO legacy_projects';
    END IF;
END $$;

-- 2) Core reference tables
CREATE TABLE IF NOT EXISTS clients (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS statuses (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) UNIQUE NOT NULL,
    is_negative BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(150) UNIQUE NOT NULL,
    department_id INTEGER NULL,
    role_id INTEGER NULL
);

-- 3) New projects table (normalized)
CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    status_id INTEGER REFERENCES statuses(id) ON DELETE SET NULL,
    start_date DATE,
    end_date DATE,
    budget NUMERIC,
    description TEXT,
    treated BOOLEAN DEFAULT false,
    delivered BOOLEAN DEFAULT false,
    finished BOOLEAN DEFAULT false,
    deleted_at TIMESTAMPTZ
);

-- 4) Boards (child rows)
CREATE TABLE IF NOT EXISTS project_boards (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    board_name VARCHAR(200),
    worker_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    status_id INTEGER REFERENCES statuses(id) ON DELETE SET NULL,
    neg_status1_id INTEGER REFERENCES statuses(id) ON DELETE SET NULL,
    neg_status2_id INTEGER REFERENCES statuses(id) ON DELETE SET NULL,
    neg_status3_id INTEGER REFERENCES statuses(id) ON DELETE SET NULL,
    notes TEXT,
    treated BOOLEAN DEFAULT false,
    delivered BOOLEAN DEFAULT false,
    finished BOOLEAN DEFAULT false,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5) Add helper indexes if not exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename='project_boards' AND indexname='idx_project_boards_project_id') THEN
        EXECUTE 'CREATE INDEX idx_project_boards_project_id ON project_boards(project_id)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename='project_boards' AND indexname='idx_project_boards_worker_id') THEN
        EXECUTE 'CREATE INDEX idx_project_boards_worker_id ON project_boards(worker_id)';
    END IF;
END $$;

-- 6) Data migration from legacy_projects (one-time; guarded so it won't duplicate)
DO $$
DECLARE legacy_exists BOOLEAN; migrated BOOLEAN; legacy_rows INT; new_projects INT;
BEGIN
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='legacy_projects') INTO legacy_exists;
    IF legacy_exists THEN
        -- If projects table already has rows, assume migration done
        SELECT COUNT(*) INTO new_projects FROM projects;
        IF new_projects = 0 THEN
            RAISE NOTICE 'Starting legacy migration from legacy_projects';
            -- Insert clients
            INSERT INTO clients(name)
            SELECT DISTINCT TRIM(client) FROM legacy_projects lp
            WHERE client IS NOT NULL AND TRIM(client) <> ''
            ON CONFLICT (name) DO NOTHING;

            -- Prepare status sets (normal vs negative)
            WITH negs AS (
                SELECT UNNEST(ARRAY[neg1,neg2,neg3]) AS n FROM legacy_projects
            ), all_status AS (
                SELECT status AS n FROM legacy_projects WHERE status IS NOT NULL
            )
            INSERT INTO statuses(name, is_negative)
            SELECT DISTINCT s.n, COALESCE(c.is_neg,false) AS is_negative
            FROM (
                SELECT n FROM all_status
                UNION
                SELECT n FROM negs
            ) s
            LEFT JOIN (
                SELECT n, true AS is_neg FROM negs WHERE n IS NOT NULL AND TRIM(n)<>''
            ) c ON c.n = s.n
            WHERE s.n IS NOT NULL AND TRIM(s.n)<>''
            ON CONFLICT (name) DO NOTHING;

            -- Employees
            INSERT INTO employees(full_name)
            SELECT DISTINCT TRIM(worker) FROM legacy_projects WHERE worker IS NOT NULL AND TRIM(worker)<>''
            ON CONFLICT(full_name) DO NOTHING;

            -- Projects (group by client+project_name)
            INSERT INTO projects(name, client_id, status_id, start_date, description, treated, delivered, finished)
            SELECT grp.project_name,
                   c.id,
                   (SELECT s.id FROM statuses s WHERE s.name = grp.any_status LIMIT 1) AS status_id,
                   grp.min_date,
                   NULL AS description,
                   grp.any_treated,
                   grp.any_delivered,
                   grp.any_finished
            FROM (
                SELECT project_name, client,
                       MIN(date) AS min_date,
                       MAX(CASE WHEN status IS NOT NULL THEN status END) AS any_status,
                       BOOL_OR(COALESCE(treated,false)) AS any_treated,
                       BOOL_OR(COALESCE(delivered,false)) AS any_delivered,
                       BOOL_OR(COALESCE(finished,false)) AS any_finished
                FROM legacy_projects
                WHERE project_name IS NOT NULL AND TRIM(project_name)<>''
                GROUP BY project_name, client
            ) grp
            LEFT JOIN clients c ON c.name = grp.client;

            -- Boards (each legacy row becomes a board)
            INSERT INTO project_boards(project_id, board_name, worker_id, status_id, neg_status1_id, neg_status2_id, neg_status3_id, notes, treated, delivered, finished)
            SELECT p.id,
                   COALESCE(lp.board_name,'לוח'),
                   e.id,
                   st.id,
                   ns1.id,
                   ns2.id,
                   ns3.id,
                   lp.notes,
                   COALESCE(lp.treated,false),
                   COALESCE(lp.delivered,false),
                   COALESCE(lp.finished,false)
            FROM legacy_projects lp
            JOIN projects p ON p.name = lp.project_name AND (
                (p.client_id IS NULL AND lp.client IS NULL) OR
                p.client_id = (SELECT c2.id FROM clients c2 WHERE c2.name = lp.client LIMIT 1)
            )
            LEFT JOIN employees e ON e.full_name = lp.worker
            LEFT JOIN statuses st ON st.name = lp.status
            LEFT JOIN statuses ns1 ON ns1.name = lp.neg1
            LEFT JOIN statuses ns2 ON ns2.name = lp.neg2
            LEFT JOIN statuses ns3 ON ns3.name = lp.neg3;

            -- Add supporting aggregate correction (ensure project flags reflect boards)
            UPDATE projects p SET treated = agg.treated, delivered = agg.delivered, finished = agg.finished
            FROM (
                SELECT project_id,
                       COALESCE(bool_and(treated),false) AS treated,
                       COALESCE(bool_and(delivered),false) AS delivered,
                       COALESCE(bool_and(finished),false) AS finished
                FROM project_boards GROUP BY project_id
            ) agg
            WHERE p.id = agg.project_id;

            RAISE NOTICE 'Legacy migration complete';
        END IF;
    END IF;
END $$;

-- 7) Convenience view (optional) to inspect migrated legacy raw rows if table exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='legacy_projects') AND NOT EXISTS (
        SELECT 1 FROM information_schema.views WHERE table_name='v_legacy_projects'
    ) THEN
        EXECUTE 'CREATE OR REPLACE VIEW v_legacy_projects AS SELECT * FROM legacy_projects';
    END IF;
END $$;

-- 8) Ensure deleted_at columns exist (idempotent) - already in new create but safe for future
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='deleted_at') THEN
        EXECUTE 'ALTER TABLE projects ADD COLUMN deleted_at TIMESTAMPTZ';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='project_boards' AND column_name='deleted_at') THEN
        EXECUTE 'ALTER TABLE project_boards ADD COLUMN deleted_at TIMESTAMPTZ';
    END IF;
END $$;

-- END NEW SCHEMA MIGRATION BLOCK
