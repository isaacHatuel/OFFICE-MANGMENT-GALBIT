-- 11_negative_statuses_seed.sql
-- Seed additional negative statuses derived from legacy UI so they can be referenced by project_boards

BEGIN;

ALTER TABLE statuses ADD COLUMN IF NOT EXISTS is_negative BOOLEAN NOT NULL DEFAULT FALSE;

WITH incoming(name) AS (
    VALUES
    ('חסר ציוד'),
    ('חסר מבנה'),
    ('חסר שילוט'),
    ('כשלים בבדיקה'),
    ('ממתין ל AM'),
    ('חסר פנאלים'),
    ('חסר מודול פנאלים'),
    ('בהזמנה'),
    ('ציוד בהזמנה'),
    ('חסר מרכיבים'),
    ('חסר גידים'),
    ('נכשל בבדיקה')
)
INSERT INTO statuses(name, is_negative)
SELECT i.name, TRUE
FROM incoming i
LEFT JOIN statuses s ON s.name = i.name
WHERE s.id IS NULL;

-- Ensure all listed are marked negative (idempotent)
UPDATE statuses SET is_negative = TRUE WHERE name IN (
    'חסר ציוד','חסר מבנה','חסר שילוט','כשלים בבדיקה','ממתין ל AM',
    'חסר פנאלים','חסר מודול פנאלים','בהזמנה','ציוד בהזמנה','חסר מרכיבים','חסר גידים','נכשל בבדיקה'
);

INSERT INTO schema_migrations (filename)
SELECT '11_negative_statuses_seed.sql'
WHERE NOT EXISTS (SELECT 1 FROM schema_migrations WHERE filename='11_negative_statuses_seed.sql');

COMMIT;
