-- 06_update_departments.sql
-- עדכון רשימת מחלקות לתצורה החדשה בלבד
-- רשימה נדרשת:
-- ניהול, תכנון, שרטוט, ליילבינג, ייצור, מחסן, בדיקה

BEGIN;

-- הוספת המחלקות החדשות אם אינן קיימות
INSERT INTO departments (name) VALUES
 ('ניהול'),
 ('תכנון'),
 ('שרטוט'),
 ('ליילבינג'),
 ('ייצור'),
 ('מחסן'),
 ('בדיקה')
ON CONFLICT (name) DO NOTHING;

-- מיפוי: מחלקה ישנה 'פיתוח' -> 'תכנון'
UPDATE employees e
SET department_id = (SELECT id FROM departments WHERE name='תכנון')
WHERE department_id IN (SELECT id FROM departments WHERE name='פיתוח');

-- מחיקת מחלקות ישנות שאינן ברשימה החדשה ושאינן בשימוש
DELETE FROM departments d
WHERE d.name NOT IN ('ניהול','תכנון','שרטוט','ליילבינג','ייצור','מחסן','בדיקה')
  AND NOT EXISTS (SELECT 1 FROM employees e WHERE e.department_id = d.id);

-- רישום מיגרציה
INSERT INTO schema_migrations (filename)
SELECT '06_update_departments.sql'
WHERE NOT EXISTS (SELECT 1 FROM schema_migrations WHERE filename='06_update_departments.sql');

COMMIT;
