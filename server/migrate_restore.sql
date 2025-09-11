-- migrate_restore.sql
-- שימוש: אחרי שאתה מעלה (psql) את הגיבוי הישן שלך למסד זמני restore_tmp
-- תיצור ו/או תאכלס טבלה legacy_projects ב-officedb מהטבלה projects שבמסד restore_tmp,
-- ואז תריץ את הבלוק הזה (psql -U officeuser -d officedb -f server/migrate_restore.sql)
-- הבלוק מעתיק לקוחות, סטטוסים, עובדים, פרויקטים ולוחות (boards) לטבלאות המנורמלות הריקות.

DO $$
DECLARE legacy_exists BOOLEAN; new_projects INT;
BEGIN
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='legacy_projects') INTO legacy_exists;
    IF NOT legacy_exists THEN
        RAISE NOTICE 'No legacy_projects table found. Aborting migration.';
        RETURN;
    END IF;

    SELECT COUNT(*) INTO new_projects FROM projects; -- projects (המנורמל) אמור להיות ריק לפני הרצה
    IF new_projects <> 0 THEN
        RAISE NOTICE 'projects table not empty (%). Skipping migration to avoid duplicates.', new_projects;
        RETURN;
    END IF;

    RAISE NOTICE 'Starting migration from legacy_projects -> normalized schema';

    -- Clients
    INSERT INTO clients(name)
    SELECT DISTINCT TRIM(client) FROM legacy_projects lp
    WHERE client IS NOT NULL AND TRIM(client) <> ''
    ON CONFLICT (name) DO NOTHING;

    -- Statuses (חיובי / שלילי)
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

    -- Boards (each legacy row becomes board)
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

    -- Aggregate flags correction
    UPDATE projects p SET treated = agg.treated, delivered = agg.delivered, finished = agg.finished
    FROM (
        SELECT project_id,
               COALESCE(bool_and(treated),false) AS treated,
               COALESCE(bool_and(delivered),false) AS delivered,
               COALESCE(bool_and(finished),false) AS finished
        FROM project_boards GROUP BY project_id
    ) agg
    WHERE p.id = agg.project_id;

    RAISE NOTICE 'Migration complete.';
END $$;
