// מודול ניהול יומן מקומי ומיזוג בטוח של רשומות journalTasks
// מספק window.assignJournalEntry (תואם למה שהיה inline)

function safeParse(obj) {
  try { return JSON.parse(obj || '{}') || {}; } catch(e){ return {}; }
}

function loadJT() {
  return safeParse(localStorage.getItem('journalTasks'));
}

function mergeObject(target, src) {
  let changed = false;
  Object.keys(src).forEach(k => {
    if (target[k] === undefined || target[k] === null || target[k] === '') { target[k] = src[k]; changed = true; }
  });
  return changed;
}

// כתיבה בטוחה של מפתח בודד
export function assignJournalEntry(entryKey, payload) {
  const existing = loadJT();
  if (!existing[entryKey]) existing[entryKey] = payload; else mergeObject(existing[entryKey], payload);
  try { localStorage.setItem('journalTasks', JSON.stringify(existing)); } catch(e) {}
}

// מיזוג מלא של אובייקט journalTasks נכנס (לדוגמה אם נרצה בעתיד סנכרון מהשרת)
export function mergeJournalTasks(incoming) {
  if (!incoming || typeof incoming !== 'object') return;
  const existing = loadJT();
  let modified = false;
  Object.keys(incoming).forEach(key => {
    if (!existing[key]) { existing[key] = incoming[key]; modified = true; }
    else if (mergeObject(existing[key], incoming[key])) modified = true;
  });
  if (modified) {
    try { localStorage.setItem('journalTasks', JSON.stringify(existing)); } catch(e) {}
  }
}

// פונקציית ניקוי כללית (לשימוש ע"י כפתור גלובלי)
export function clearAllData(confirmPrompt = true) {
  if (confirmPrompt && !confirm('האם אתה בטוח שברצונך למחוק את כל הפרויקטים, היומן והמעקב?')) return;
  localStorage.removeItem('projects');
  // לא מוחקים journalTasks כדי לא לאבד הערות – אם רוצים מחיקה מלאה בטוח להוסיף כאן.
  localStorage.removeItem('productionTracking');
  localStorage.removeItem('customWorkers');
  location.reload();
}

// חשיפה ל-legacy inline code
if (!window.assignJournalEntry) window.assignJournalEntry = assignJournalEntry;
if (!window.clearAllData) window.clearAllData = clearAllData;
