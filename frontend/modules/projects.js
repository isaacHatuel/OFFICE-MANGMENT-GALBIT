// מודול ניהול פרויקטים - קריאות לשרת, ניהול טבלה וכו'
export function fetchProjects() {
    return fetch('/api/projects').then(r => r.json());
}
// ...פונקציות נוספות: addProject, updateProject וכו'
