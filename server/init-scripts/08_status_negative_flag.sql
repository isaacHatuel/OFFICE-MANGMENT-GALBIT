-- 08_status_negative_flag.sql
BEGIN;

ALTER TABLE statuses ADD COLUMN IF NOT EXISTS is_negative BOOLEAN NOT NULL DEFAULT FALSE;

-- Mark some negative statuses heuristically (adjust as needed)
UPDATE statuses SET is_negative = TRUE WHERE name IN ('הושהה','סגור');

INSERT INTO schema_migrations (filename)
SELECT '08_status_negative_flag.sql'
WHERE NOT EXISTS (SELECT 1 FROM schema_migrations WHERE filename='08_status_negative_flag.sql');

COMMIT;