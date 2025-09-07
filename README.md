# Office Management (Offc Mngr)

מערכת ניהול (פרויקטים / לוחות / יומן / זמן) ממודרת עם Docker.

## ארכיטקטורה
Services (docker-compose):
1. db (Postgres 16) – טוען סכמה ונתוני בסיס מקבצי `server/init-scripts` (מיגרציות 00..12 ועוד).
2. app (Node/Express, פורט 3001) – API.
3. frontend (Nginx, פורט 3000) – מגיש את ה‐HTML/JS הסטטי (`index2.html`, `frontend/*`).

## הפעלה
```bash
docker compose up -d --build
```
גישה:
- אפליקציה: http://localhost:3000
- API Health: http://localhost:3001/api/health
- Postgres: localhost:5432 (user: officeuser / pass: officepass / db: officedb)

## משתני סביבה חשובים (service app)
| Variable | Default | Purpose |
|----------|---------|---------|
| DB_HOST | db | Hostname of Postgres (service name) |
| DB_PORT | 5432 | Port |
| DB_USER | officeuser | User |
| DB_PASSWORD | officepass | Password |
| DB_NAME | officedb | Database |
| STATS_CACHE_TTL_MS | 30000 | TTL ל‐cache סטטיסטיקות |

## מיגרציות
קבצי init (00_*.sql וכו׳) נטענים רק בבניה ראשונה של הקונטיינר db. מיגרציות חדשות (מספר גדול יותר) יש להוסיף לתיקיית `server/init-scripts` ולוודא שמוקלטות ב‐`schema_migrations`.

סקריפט ריצה ידני (בתוך קונטיינר app):
```bash
npm run migrate
```

## Endpoints (עיקריים)

Projects / Boards:
- GET /api/projects?client=..&status=..&q=..&page=1&pageSize=50
- POST /api/projects (name, client?, status?, description?, treated?, delivered?, finished?)
- PATCH /api/projects/:id (שדות חלקיים)
- DELETE /api/projects/:id
- GET /api/boards?project=ID|Name&finished=true|false&page=1&pageSize=50
- POST /api/boards (project, board_name?, worker?, status?, neg_status1..3?, notes?, treated/delivered/finished)
- PATCH /api/boards/:id
- DELETE /api/boards/:id

Reference:
- GET /api/reference/all (departments, roles, clients, statuses [כולל is_negative])

Journal:
- GET /api/journal?from=YYYY-MM-DD&to=...&employee=..&project=..&status=..&q=..&page=1&pageSize=50
- POST /api/journal (description, employee?, project?, status?, entry_date?)
- PATCH /api/journal/:id (partial)
- DELETE /api/journal/:id

Tasks & Time:
- GET /api/time-entries?employee=..&project=..&from=..&to=..&page=1&pageSize=25
- POST /api/time-entries (minutes חובה, אופציונלי: task, employee, work_date, notes)
- PATCH /api/time-entries/:id
- DELETE /api/time-entries/:id

Stats:
- GET /api/stats/overview (סיכומים + 10 אחרונים)
- GET /api/stats/time-range?from=&to=
- GET /api/stats/top-clients?limit=10
- GET /api/stats/status-distribution
- GET /api/stats/workload?window=30
- GET /api/stats/negative-trends?days=30

## ולידציה
Zod משמשת ל: projects, boards, journal, time-entries.

## Aggregate Flags
עמודות treated/delivered/finished ב‐projects מתעדכנות אוטומטית בעת שינוי לוחות (recalcProjectAggregate).

## פיתוח מקומי ללא Docker
```bash
cd server
npm install
npm start
```
דורש Postgres רץ מקומית וערכי ENV מתאימים.

## צעדים עתידיים מוצעים
1. Auth (JWT/API key).
2. אחידות הודעות שגיאה (מבנה {error, code}).
3. העברת יומן קדמי מלא ל־API (הסרת localStorage כפול).
4. בדיקות אוטומטיות ו־CI.
5. לוגים מובנים (pino). 

---
עודכן בהתאם לכל השינויים האחרונים.
