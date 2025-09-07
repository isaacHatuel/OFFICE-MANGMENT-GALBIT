-- 02_reference_data.sql
-- Seed reference / lookup tables (idempotent)
INSERT INTO departments (name) VALUES
    ('ניהול'),
    ('פיתוח'),
    ('שירות לקוחות'),
    ('כספים')
ON CONFLICT (name) DO NOTHING;

INSERT INTO roles (name) VALUES
    ('מנהל'),
    ('ראש צוות'),
    ('מפתח'),
    ('נציג שירות')
ON CONFLICT (name) DO NOTHING;

INSERT INTO statuses (name) VALUES
    ('פתוח'),
    ('בתהליך'),
    ('הושהה'),
    ('סגור')
ON CONFLICT (name) DO NOTHING;

-- Example clients (replace / extend later)
INSERT INTO clients (name) VALUES
    ('לקוח כללי'),
    ('מפעל א'),
    ('מפעל ב')
ON CONFLICT (name) DO NOTHING;
