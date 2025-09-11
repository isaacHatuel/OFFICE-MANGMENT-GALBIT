# מצב פיתוח (Live Reload)

קובץ `docker-compose.override.yml` החדש מאפשר פיתוח בלי לבנות כל פעם את ה-frontend.

## איך מפעילים
פשוט:
```
docker compose up -d
```
(Compose טוען אוטומטית גם את ה-override אם הוא באותה תיקייה.)

## מה משתנה
- השרות `frontend` רץ על nginx:alpine ומגיש ישירות את הקבצים מהספרייה המקומית באמצעות bind mount.
- השרות `app` רץ עם `nodemon` (פקודת `npm run dev`) כך ששינויים בקבצי JS תחת `server/` גורמים ל-restart אוטומטי.
- אין צורך `docker compose build frontend` אחרי שינוי קובץ HTML/JS ב-frontend.

## אימות
1. שנה למשל כותרת ב-`index2.html` ושמור.
2. רענן את הדפדפן (Ctrl+F5) – תראה מיד את העדכון.

## מעבר חזרה ל"פרודקשן"
כדי לבדוק אימג' בנוי כמו בפרודקשן:
```
docker compose down
docker compose up -d --build
```
(זה יתעלם זמנית מה-override כי אתה בונה שוב את האימג'ים.)

## הערות
- קאש דפדפן של מודולי ES לפעמים עקשן: Ctrl+F5 או DevTools > Network > Disable cache.
- ב-production מחזירים את Dockerfile.frontend לבנייה רגילה, וה-override רק לפיתוח.

בהצלחה!
