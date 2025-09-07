// מודול: legacyProjectUI
// העברה של קוד inline מ-index2.html לטובת ניקיון הדף.
// תפקיד: ניהול לשוניות בסיסי, מילוי דיאלוג פרויקט, יצירה/עדכון שורות, עריכת מזהה, שמירה וטעינה מ-localStorage.
// הערה: חלק מהפונקציות כבר קיימות במודול projectTable.js; כאן שמרנו רק מה שחסר עדיין גלובלית.

// לשוניות
export function showTab(idx) {
  document.querySelectorAll('.tab').forEach((el, i) => el.classList.toggle('active', i === idx));
  document.querySelectorAll('.tab-content').forEach((el, i) => el.classList.toggle('active', i === idx));
  if (typeof window.syncProductionTrackingTable === 'function') window.syncProductionTrackingTable();
  if (idx === 1 && typeof window.syncJournalTable === 'function') window.syncJournalTable();
}
window.showTab = showTab;

// נתונים סטטיים (לשימוש הדיאלוג) – מוזנים מ-window כפי שמוגדר ב- index2.html
export const clients = Array.isArray(window.PROJECT_CLIENTS) ? window.PROJECT_CLIENTS : [];
export const workers = Array.isArray(window.PROJECT_WORKERS) ? window.PROJECT_WORKERS : [];
export const statusOptions = Array.isArray(window.PROJECT_STATUS_OPTIONS) ? window.PROJECT_STATUS_OPTIONS : [];
export const negativeStatuses = Array.isArray(window.PROJECT_NEGATIVE_STATUSES) ? window.PROJECT_NEGATIVE_STATUSES : [];

// עזר למילוי select בדיאלוג
export function fillDialogSelect(id, options) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML = `<option value="" disabled selected hidden></option>` + options.map(opt => `<option>${opt}</option>`).join('');
}
window.fillDialogSelect = fillDialogSelect;

let editRow = null; // local reference
export function openProjectDialog(row=null) {
  editRow = row;
  window.editRow = row; // expose globally for main.js form logic
  const dialog = document.getElementById('project-dialog');
  const form = document.getElementById('project-form');
  if (!dialog || !form) return;
  form.reset();
  fillDialogSelect('dialog-client', clients);
  fillDialogSelect('dialog-worker', workers);
  fillDialogSelect('dialog-status', statusOptions);
  fillDialogSelect('dialog-neg1', negativeStatuses);
  fillDialogSelect('dialog-neg2', negativeStatuses);
  fillDialogSelect('dialog-neg3', negativeStatuses);
  const ensureOption = (selEl, val) => {
    if (!val) return;
    if (![...selEl.options].some(o=>o.value===val)) {
      const opt = document.createElement('option');
      opt.value = val; opt.textContent = val; selEl.appendChild(opt);
    }
  };
  document.getElementById('dialog-title').innerText = row ? 'ערוך פרוייקט' : 'הוסף פרוייקט';
  form.querySelector('#dialog-save').innerText = row ? 'שמור' : 'הוסף';
  if (row) {
    const cells = row.querySelectorAll('td');
    const isChild = row.classList.contains('child-row');
    if (isChild) {
      form.orderId.value = row.dataset.orderId || '';
      const val = (td,sel)=> td?.querySelector(sel)?.value || td?.querySelector(sel)?.textContent || td?.innerText || '';
      form.client.value = val(cells[1],'input');
      form.projectName.value = val(cells[2],'input');
      form.boardName.value = val(cells[3],'input');
      const wVal = val(cells[4],'select');
      const sVal = val(cells[5],'select');
      const n1Val = val(cells[6],'select');
      const n2Val = val(cells[7],'select');
      const n3Val = val(cells[8],'select');
      ensureOption(form.worker, wVal); form.worker.value = wVal;
      ensureOption(form.status, sVal); form.status.value = sVal;
      ensureOption(form.neg1, n1Val); form.neg1.value = n1Val;
      ensureOption(form.neg2, n2Val); form.neg2.value = n2Val;
      ensureOption(form.neg3, n3Val); form.neg3.value = n3Val;
      form.notes.value = val(cells[9],'input');
      form.treated.checked = !!cells[10].querySelector('input')?.checked;
      form.delivered.checked = !!cells[11].querySelector('input')?.checked;
      form.finished.checked = !!cells[12].querySelector('input')?.checked;
  const qEl = document.getElementById('dialog-quantity'); if (qEl) qEl.value = 1;
    } else {
      const orderId = row.dataset.orderId;
      const allRows = Array.from(document.querySelectorAll(`tr.child-row[data-order-id="${orderId}"]`));
      const firstChild = allRows[0];
      form.orderId.value = orderId;
      const client = row.querySelector('.client')?.innerText || '';
      const projectName = row.querySelector('.project')?.innerText || '';
      form.client.value = client;
      form.projectName.value = projectName;
      if (firstChild) {
        const tds2 = firstChild.querySelectorAll('td');
  const val2 = (td,sel)=> td?.querySelector(sel)?.value || td?.querySelector(sel)?.textContent || td?.innerText || '';
  form.boardName.value = val2(tds2[3],'input');
  const wVal2 = val2(tds2[4],'select');
  const sVal2 = val2(tds2[5],'select');
  const n1Val2 = val2(tds2[6],'select');
  const n2Val2 = val2(tds2[7],'select');
  const n3Val2 = val2(tds2[8],'select');
  ensureOption(form.worker, wVal2); form.worker.value = wVal2;
  ensureOption(form.status, sVal2); form.status.value = sVal2;
  ensureOption(form.neg1, n1Val2); form.neg1.value = n1Val2;
  ensureOption(form.neg2, n2Val2); form.neg2.value = n2Val2;
  ensureOption(form.neg3, n3Val2); form.neg3.value = n3Val2;
  form.notes.value = val2(tds2[9],'input');
        form.treated.checked = row.querySelector('.parent-treated')?.checked || false;
        form.delivered.checked = row.querySelector('.parent-delivered')?.checked || false;
        form.finished.checked = row.querySelector('.parent-finished')?.checked || false;
      }
  const qEl = document.getElementById('dialog-quantity'); if (qEl) qEl.value = Math.max(1, allRows.length||1);
    }
  }
  dialog.showModal();
}
window.openProjectDialog = openProjectDialog;

export function closeProjectDialog(){
  const dlg = document.getElementById('project-dialog');
  if (dlg) dlg.close();
  editRow = null; window.editRow = null;
}
window.closeProjectDialog = closeProjectDialog;

// NOTE: generateOrderId ו-loadProjectsFromStorage מסופקים דרך projectTable.js כעת.
