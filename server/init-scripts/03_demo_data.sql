-- 03_demo_data.sql
-- Optional demo rows linking references

-- Employees
INSERT INTO employees (full_name, department_id, role_id, email) VALUES
    ('ישראל ישראלי', (SELECT id FROM departments WHERE name='פיתוח'), (SELECT id FROM roles WHERE name='מפתח'), 'dev1@example.com'),
    ('רות כהן', (SELECT id FROM departments WHERE name='ניהול'), (SELECT id FROM roles WHERE name='מנהל'), 'manager@example.com')
ON CONFLICT DO NOTHING;

-- Link employees to default client
INSERT INTO employees_clients (employee_id, client_id)
SELECT e.id, c.id
FROM employees e
JOIN clients c ON c.name='לקוח כללי'
ON CONFLICT DO NOTHING;

-- Sample project
INSERT INTO projects (name, client_id, status_id, start_date, description)
VALUES ('פרויקט דוגמה', (SELECT id FROM clients WHERE name='לקוח כללי'), (SELECT id FROM statuses WHERE name='פתוח'), CURRENT_DATE, 'פרויקט דוגמה התחלתי')
ON CONFLICT DO NOTHING;

-- Sample task
INSERT INTO tasks (project_id, title, description, status_id, assigned_employee_id, due_date)
VALUES ((SELECT id FROM projects WHERE name='פרויקט דוגמה'), 'משימת התחלה', 'תיאור משימה', (SELECT id FROM statuses WHERE name='פתוח'), (SELECT id FROM employees WHERE full_name='ישראל ישראלי'), CURRENT_DATE + 7)
ON CONFLICT DO NOTHING;

-- Sample journal entry
INSERT INTO journal_entries (entry_date, employee_id, project_id, description, status_id)
VALUES (CURRENT_DATE, (SELECT id FROM employees WHERE full_name='רות כהן'), (SELECT id FROM projects WHERE name='פרויקט דוגמה'), 'פתיחת פרויקט', (SELECT id FROM statuses WHERE name='פתוח'))
ON CONFLICT DO NOTHING;
