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
  if (confirmPrompt && !confirm('למחוק לחלוטין את כל נתוני localStorage של האפליקציה? (יומן, פרויקטים, הערות וכו\' )')) return;
  try {
    // שמירה על מפתחות שאינם קשורים? כרגע מוחקים הכל לגמרי.
    localStorage.clear();
  } catch(e) {
    // Fallback granular
    const keys = [
      'projects','projects_backup','journalTasks','productionTracking','customWorkers',
      '__creationQueue','__projectsSchemaVersion','__clients_purged_v1','projectHistory',
  '__main_activeTab','workers','clients','statuses','__deletedOrderIds','__deletedBoardIds','__deletedProjectIds'
    ];
    keys.forEach(k=>{ try { localStorage.removeItem(k); } catch(_){ } });
  }
  location.reload();
}

// מחיקת רשומות יומן השייכות ללקוח+פרויקט (ואופציונלית לוח ספציפי)
export function removeJournalEntries(client, projectName, boardName) {
  if (!client || !projectName) return 0;
  let store = {};
  try { store = JSON.parse(localStorage.getItem('journalTasks')||'{}'); } catch(_){ store={}; }
  let removed = 0;
  Object.keys(store).forEach(k => {
    const parts = k.split('|');
    if (parts.length < 4) return;
    const [, c, p, b] = parts; // date|client|project|board
    if (c === client && p === projectName && (boardName ? b === (boardName||'') : true)) {
      delete store[k];
      removed++;
    }
  });
  if (removed) {
    try { localStorage.setItem('journalTasks', JSON.stringify(store)); } catch(_){ }
  }
  return removed;
}

if (!window.removeJournalEntries) window.removeJournalEntries = removeJournalEntries;

// חשיפה ל-legacy inline code
if (!window.assignJournalEntry) window.assignJournalEntry = assignJournalEntry;
if (!window.clearAllData) window.clearAllData = clearAllData;
