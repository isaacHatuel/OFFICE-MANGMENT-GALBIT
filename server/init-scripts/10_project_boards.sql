-- 10_project_boards.sql
-- Adds project_boards table to model the per-board (child row) concept from the legacy UI.
-- Supports up to 3 negative statuses (nullable foreign keys) plus flags.

BEGIN;

CREATE TABLE IF NOT EXISTS project_boards (
    id SERIAL PRIMARY KEY,
    project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    board_name VARCHAR(200),
    worker_id INT REFERENCES employees(id) ON DELETE SET NULL,
    status_id INT REFERENCES statuses(id) ON DELETE SET NULL,
    neg_status1_id INT REFERENCES statuses(id) ON DELETE SET NULL,
    neg_status2_id INT REFERENCES statuses(id) ON DELETE SET NULL,
    neg_status3_id INT REFERENCES statuses(id) ON DELETE SET NULL,
    notes TEXT,
    treated BOOLEAN NOT NULL DEFAULT FALSE,
    delivered BOOLEAN NOT NULL DEFAULT FALSE,
    finished BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_boards_project_id ON project_boards(project_id);
CREATE INDEX IF NOT EXISTS idx_project_boards_worker_id ON project_boards(worker_id);
CREATE INDEX IF NOT EXISTS idx_project_boards_status_id ON project_boards(status_id);

INSERT INTO schema_migrations (filename)
SELECT '10_project_boards.sql'
WHERE NOT EXISTS (SELECT 1 FROM schema_migrations WHERE filename='10_project_boards.sql');

COMMIT;
