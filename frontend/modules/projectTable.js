// מודול רינדור וניהול טבלת פרויקטים (הוצאה מ-index2.html)
// מספק פונקציות: ensureParentRow, addChildRow, updateChildRow, recomputeParentStatusInTable, toggleParentCollapse, inlineEditOrderId

// --- Autosave helpers (debounced) ---
let __projectsAutosaveTimer = null;
function scheduleProjectsAutosave() {
  // Reduced debounce to near-immediate persistence (universal autosave requirement)
  try { if (__projectsAutosaveTimer) clearTimeout(__projectsAutosaveTimer); } catch(_){}
  __projectsAutosaveTimer = setTimeout(()=> {
    try { saveProjectsToStorage(); } catch(e){ console.warn('autosave failed', e); }
  }, 280); // 280ms for smoother typing without over-spamming writes
}

function saveProjectsToStorage() {
  try {
    // Build live snapshot מה-DOM
    const rows = Array.from(document.querySelectorAll('tr.child-row')).map(tr => {
      const tds = tr.querySelectorAll('td');
      // Detect dynamic negative status columns by header text (starts with 'סטטוס שלילי')
      let negStatuses = [];
      try {
        const table = tr.closest('table');
        const theadCells = table?.querySelectorAll('thead tr th') || [];
        for (let i = 0; i < theadCells.length; i++) {
          if (theadCells[i].innerText.startsWith('סטטוס שלילי')) {
            // Child row cell index aligns with header index
            const td = tds[i];
            const val = td?.querySelector('select')?.value || td?.innerText || '';
            if (val) negStatuses.push(val);
          }
        }
      } catch(e) { /* ignore */ }
      // Fallback to legacy fixed positions if detection yielded nothing
      if (!negStatuses.length) {
        [6,7,8].forEach(idx => { const v = tds[idx]?.querySelector('select')?.value || tds[idx]?.innerText || ''; if (v) negStatuses.push(v); });
      }
  const obj = {
          type: 'child',
          orderId: tr.dataset.orderId,
          date: tds[0]?.querySelector('input')?.value || tds[0]?.innerText || '',
          client: tds[1]?.querySelector('input')?.value || tds[1]?.innerText || '',
          projectName: tds[2]?.querySelector('input')?.value || tds[2]?.innerText || '',
          boardName: tds[3]?.querySelector('input')?.value || tds[3]?.innerText || '',
        worker: tds[4]?.querySelector('select')?.value || tds[4]?.innerText || '',
        status: tds[5]?.querySelector('select')?.value || tds[5]?.innerText || '',
        negStatuses: Array.from(new Set(negStatuses)).slice(0,10), // cap for safety
        notes: tds[theadNotesIndex(tds)]?.querySelector('input')?.value || tds[theadNotesIndex(tds)]?.innerText || '',
  treated: false, delivered: false, finished: false,
  lastLocalEdit: Date.now()
      };
      // Derive checkbox indices dynamically relative to notes cell
      const notesIdx = theadNotesIndex(tds);
      obj.treated = tds[notesIdx+1]?.querySelector('input')?.checked || false;
      obj.delivered = tds[notesIdx+2]?.querySelector('input')?.checked || false;
      obj.finished = tds[notesIdx+3]?.querySelector('input')?.checked || false;
      // Maintain legacy fields for backward compatibility (first three only)
      obj.neg1 = obj.negStatuses[0] || '';
      obj.neg2 = obj.negStatuses[1] || '';
      obj.neg3 = obj.negStatuses[2] || '';
      return obj;
    });
    // שמירת הורים
  const parents = Array.from(document.querySelectorAll('tr.parent-row')).map(pr => {
      const bar = pr.querySelector('.parent-bar');
      return {
        type: 'parent',
        orderId: pr.dataset.orderId,
        date: bar?.querySelector('.muted')?.textContent || '',
        client: bar?.querySelector('.client')?.textContent || '',
        projectName: bar?.querySelector('.project')?.textContent || '',
        notes: '',
        treated: bar?.querySelector('.parent-treated')?.checked || false,
        delivered: bar?.querySelector('.parent-delivered')?.checked || false,
        finished: bar?.querySelector('.parent-finished')?.checked || false,
        collapsed: pr.classList.contains('collapsed'),
        lastLocalEdit: Date.now()
      };
    });
    // Preserve stable lastLocalEdit for unchanged records (shallow compare core fields)
    const all = parents.concat(rows);
    if(window.stateStore){
      window.stateStore.bulkUpsert(all, 'projectTable.saveSnapshot');
      window.stateStore.flushSoon('projectTable.saveSnapshot');
      try { console.debug('[persist][projects] projectTable via stateStore snapshot', all.length); } catch(_){ }
    } else {
      try { localStorage.setItem('projects', JSON.stringify(all)); } catch(_){ }
      try { localStorage.setItem('projects_backup', JSON.stringify(all)); } catch(_){ }
    }
    if (window.showSavedIndicator) window.showSavedIndicator();
  } catch(e) { console.warn('saveProjectsToStorage failed', e); }
}

function ensureParentRow(parentData, isDoneTable) {
  const tableId = isDoneTable ? '#projects-table-done' : '#projects-table-active';
  const tbody = document.querySelector(`${tableId} tbody`);
  if (!tbody) return null;
  // Auto-heal missing critical fields instead of aborting (prevents journal/production sync failures)
  if (!parentData.orderId || !parentData.client || !parentData.projectName || !parentData.date) {
    const healed = { ...parentData };
    const today = new Date().toLocaleDateString('he-IL');
    if (!healed.orderId) healed.orderId = 'FIX-' + Math.random().toString(36).slice(2,8);
    if (!healed.date) healed.date = today;
    if (!healed.client) healed.client = '(לקוח חסר)';
    if (!healed.projectName) healed.projectName = '(פרויקט חסר)';
    console.warn('ensureParentRow: auto-healed missing field(s)', parentData, '=>', healed);
    parentData = healed;
  }
  let row = tbody.querySelector(`tr.parent-row[data-order-id="${parentData.orderId}"]`);
  if (!row) {
    row = document.createElement('tr');
    row.className='parent-row';
    row.dataset.orderId = parentData.orderId;
  if (parentData.projectId) row.dataset.projectId = parentData.projectId;
    // Create 14 aligned cells matching headers
    for (let i=0;i<14;i++) { row.appendChild(document.createElement('td')); }
    tbody.appendChild(row);
    // Column mapping per header index
    const tds = row.querySelectorAll('td');
    // Collapse button + date (index 0)
    tds[0].innerHTML = `<button class="collapse-btn" title="הצג/הסתר">▾</button> <span class="parent-date"></span>`;
    tds[1].innerHTML = `<strong class="client"></strong>`;
    tds[2].innerHTML = `<span class="project"></span> <span class="order-id" title="עריכת מזהה הזמנה" style="color:#607d8b;font-size:0.85em;cursor:pointer;margin-right:6px;"></span>`;
    // board / worker / status left blank aggregator
    tds[10].innerHTML = `<input type="checkbox" class="parent-treated" title="סמן כל השורות כטופל">`;
    tds[11].innerHTML = `<input type="checkbox" class="parent-delivered" title="סמן כל השורות כנמסר">`;
    tds[12].innerHTML = `<input type="checkbox" class="parent-finished" title="סמן כל השורות כהסתיים">`;
    tds[13].innerHTML = `<button class="action-btn delete-btn parent-delete-btn" title="מחק פרויקט">✕</button>`;
    // events
    tds[0].querySelector('.collapse-btn').addEventListener('click', ()=> toggleParentCollapse(row));
    tds[2].querySelector('.order-id').addEventListener('dblclick', ()=> inlineEditOrderId(tds[2].querySelector('.order-id')));
    tds[13].querySelector('.parent-delete-btn').addEventListener('click', e => {
      e.stopPropagation();
      if (!confirm('האם למחוק את כל הפרויקט (כולל כל השורות)?')) return;
      let n = row.nextElementSibling; while (n && !n.classList.contains('parent-row')) { const next=n.nextElementSibling; if (n.classList.contains('child-row') && n.dataset.orderId===parentData.orderId) n.remove(); n=next; }
      row.remove(); saveProjectsToStorage();
    });
    row.querySelectorAll('input[type=checkbox]').forEach(chk => chk.addEventListener('change', ()=> saveProjectsToStorage()));
  }
  // Update content
  row.querySelector('.client').textContent = parentData.client || '—';
  row.querySelector('.project').textContent = parentData.projectName || '—';
  row.querySelector('.parent-date').textContent = parentData.date || '';
  if (parentData.projectId) row.dataset.projectId = parentData.projectId; // keep updated
  const oidSpan = row.querySelector('.order-id');
  if (oidSpan) oidSpan.textContent = parentData.orderId;
  row.querySelector('.parent-treated').checked = !!parentData.treated;
  row.querySelector('.parent-delivered').checked = !!parentData.delivered;
  row.querySelector('.parent-finished').checked = !!parentData.finished;
  if (parentData.collapsed) row.classList.add('collapsed'); else row.classList.remove('collapsed');
  return row;
}

function toggleParentCollapse(parentTr) {
  const collapsed = parentTr.classList.toggle('collapsed');
  const orderId = parentTr.dataset.orderId;
  let n = parentTr.nextElementSibling;
  while (n && !n.classList.contains('parent-row')) {
  if (n.classList.contains('child-row') && n.dataset.orderId === orderId) n.style.display = collapsed ? 'none':'';
    n = n.nextElementSibling;
  }
  saveProjectsToStorage();
}

function inlineEditOrderId(spanEl) {
  const current = spanEl.textContent || '';
  const input = document.createElement('input');
  input.type = 'text'; input.value = current; input.style.minWidth='120px';
  spanEl.replaceWith(input); input.focus();
  const commit = () => {
    const newSpan = document.createElement('span');
    newSpan.className='order-id'; newSpan.title='עריכת מזהה הזמנה'; newSpan.textContent = input.value || current;
    input.replaceWith(newSpan); newSpan.addEventListener('dblclick', ()=> inlineEditOrderId(newSpan));
    const parentTr = newSpan.closest('tr.parent-row');
    const oldId = parentTr.dataset.orderId; const newId = newSpan.textContent; parentTr.dataset.orderId = newId;
    let n = parentTr.nextElementSibling; while (n && !n.classList.contains('parent-row')) { if (n.classList.contains('child-row') && n.dataset.orderId===oldId) n.dataset.orderId=newId; n=n.nextElementSibling; }
    saveProjectsToStorage();
  };
  input.addEventListener('blur', commit); input.addEventListener('keydown', ev => { if (ev.key==='Enter') commit(); });
}

// Helper: find index of notes column by header text 'הערות', fallback to 9 (legacy)
function theadNotesIndex(tds) {
  try {
    const row = tds[0]?.parentElement; if (!row) return 9;
    const table = row.closest('table');
    const headers = table?.querySelectorAll('thead tr th') || [];
    for (let i=0;i<headers.length;i++) if (headers[i].innerText.trim()==='הערות') return i;
  } catch(e) {}
  return 9;
}

function fillChildRow(tr, data) {
  tr.innerHTML = '';
  // ensure boardId persisted on the DOM element for edit operations
  if (data && data.boardId) tr.dataset.boardId = data.boardId;
  // Normalize negative statuses array
  let negStatuses = Array.isArray(data.negStatuses) ? data.negStatuses.filter(Boolean) : [data.neg1, data.neg2, data.neg3].filter(Boolean);
  // Legacy mirror fields
  data.neg1 = negStatuses[0] || '';
  data.neg2 = negStatuses[1] || '';
  data.neg3 = negStatuses[2] || '';
  const statusOpts = Array.isArray(window.PROJECT_STATUS_OPTIONS) ? window.PROJECT_STATUS_OPTIONS : [];
  const negOpts = Array.isArray(window.PROJECT_NEGATIVE_STATUSES) ? window.PROJECT_NEGATIVE_STATUSES : [];
  const buildSelect = (val, opts) => `<select class="proj-cell-select" style="width:100%"><option value=""></option>${opts.map(o=>`<option ${o===val?'selected':''}>${o}</option>`).join('')}</select>`;
  const workerOpts = Array.isArray(window.PROJECT_WORKERS) ? window.PROJECT_WORKERS : [];
  const buildWorkerSelect = (val) => `<select class="proj-worker-select" style="width:100%"><option value=""></option>${workerOpts.map(o=>`<option ${o===val?'selected':''}>${o}</option>`).join('')}</select>`;
  // Base columns up to status
  const cells = [
    `<input type="text" value="${data.date||''}" style="width:100%">`,
    `<input type="text" value="${data.client||''}" style="width:100%">`,
    `<input type="text" value="${data.projectName||''}" style="width:100%">`,
    `<input type="text" value="${data.boardName||''}" style="width:100%">`,
  buildWorkerSelect(data.worker||''),
    buildSelect(data.status||'', statusOpts)
  ];
  // Dynamic negative statuses (render first 3 legacy as editable inputs, rest plain text for now)
  negStatuses.forEach((neg, idx) => {
    if (idx < 3) cells.push(buildSelect(neg, negOpts)); else cells.push(neg);
  });
  // Ensure at least 3 editable cells for legacy layout
  for (let i = negStatuses.length; i < 3; i++) cells.push(buildSelect('', negOpts));
  const noteVal = (data.notes||'').replace(/"/g,'&quot;');
  const noteDisplay = noteVal ? 'הערה קיימת!' : '';
  cells.push(`<div class="note-cell-wrapper" style="position:relative;">
     <span class="note-display" data-has-note="${noteVal?1:0}" style="cursor:${noteVal? 'pointer':'text'};color:${noteVal? '#1565c0':'#333'};font-size:0.88em;white-space:nowrap;">${noteDisplay}</span>
     <input type="hidden" class="note-hidden-input" value="${noteVal}">
   </div>`);
  cells.push(`<input type="checkbox" ${data.treated? 'checked':''}>`);
  cells.push(`<input type="checkbox" ${data.delivered? 'checked':''}>`);
  cells.push(`<input type="checkbox" ${data.finished? 'checked':''}>`);
  cells.push(`<div class="row-actions" style="display:flex;gap:4px;justify-content:center;">
    <button type="button" class="action-btn edit-btn" title="ערוך">✎</button>
    <button type="button" class="action-btn duplicate-btn" title="שכפל">⧉</button>
    <button type="button" class="action-btn delete-btn" title="מחק">✕</button>
  </div>`);
  cells.forEach((html, idx) => { const td=document.createElement('td'); td.innerHTML = html; tr.appendChild(td); if(idx===5) td.classList.add('status-cell'); });
  // attach change listeners to persist + refresh tracking
  Array.from(tr.querySelectorAll('input,select')).forEach(el => {
    // Existing change (commit) save
    el.addEventListener('change', () => {
      saveProjectsToStorage();
      try { const orderId = tr.dataset.orderId; recomputeParentStatusInTable('#projects-table-active', orderId); } catch(_){ }
      if (typeof window.syncProductionTrackingTable === 'function') { try { window.syncProductionTrackingTable(); } catch(_){ } }
      if (typeof window.syncJournalTable === 'function') { try { window.syncJournalTable(); } catch(_){ } }
      // Reverse sync: if this change is in a negative status select, reflect into productionTracking
      try {
        if (el.tagName==='SELECT') {
          // Determine if header of this cell is a negative status header
          const td = el.closest('td');
          const row = td?.parentElement;
          const table = row?.closest('table');
          const tds = row?.querySelectorAll('td') || [];
          if (table) {
            const headerCells = table.querySelectorAll('thead tr th');
            let cellIndex=-1; for(let i=0;i<tds.length;i++){ if(tds[i]===td){ cellIndex=i; break; } }
            if(cellIndex>=0 && headerCells[cellIndex] && headerCells[cellIndex].innerText.startsWith('סטטוס שלילי')){
              if (typeof window.reverseSyncProductionTrackingFromProjectRow === 'function') {
                window.reverseSyncProductionTrackingFromProjectRow(row);
              }
            }
          }
        }
      } catch(err){ /* ignore */ }
      // Clear manual edit flag after change processed
      if (window.__negManualEditActive) setTimeout(()=>{ window.__negManualEditActive=false; },50);
    });
    // Mark manual edit start on focus of negative status select
    el.addEventListener('focus', () => {
      if(el.tagName==='SELECT'){
        try {
          const td = el.closest('td');
          const row = td?.parentElement; const table = row?.closest('table');
          const tds = row?.querySelectorAll('td') || [];
          if(table){
            const headerCells = table.querySelectorAll('thead tr th');
            let cellIndex=-1; for(let i=0;i<tds.length;i++){ if(tds[i]===td){ cellIndex=i; break; } }
            if(cellIndex>=0 && headerCells[cellIndex] && headerCells[cellIndex].innerText.startsWith('סטטוס שלילי')){
              window.__negManualEditActive = true;
            }
          }
        } catch(_){ }
      }
    });
    // New: live autosave for text inputs while typing (debounced) so רענון פתאומי לא יפיל עריכה באמצע
    if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'number')) {
      el.addEventListener('input', () => { scheduleProjectsAutosave(); });
    }
  });
  // action buttons handlers (event delegation per row for robustness)
  const editBtn = tr.querySelector('.edit-btn');
  const dupBtn = tr.querySelector('.duplicate-btn');
  const delBtn = tr.querySelector('.delete-btn');
  if(editBtn) editBtn.addEventListener('click', e => {
    e.stopPropagation();
    try { console.debug('[projects] edit button clicked', { orderId: tr.dataset.orderId, boardId: tr.dataset.boardId }); } catch(_){ }
    if (window.openProjectDialog) {
      window.openProjectDialog(tr);
    } else {
      // Fallback minimal dialog population if legacy module not yet loaded
      const dlg = document.getElementById('project-dialog');
      const form = document.getElementById('project-form');
      if (dlg && form) {
        try {
          const cells = tr.querySelectorAll('td');
          const val = (i,sel) => cells[i]?.querySelector(sel)?.value || cells[i]?.querySelector(sel)?.textContent || cells[i]?.innerText || '';
          form.orderId.value = tr.dataset.orderId || '';
          form.client.value = val(1,'input');
          form.projectName.value = val(2,'input');
          form.boardName.value = val(3,'input');
          form.worker.value = cells[4]?.querySelector('select')?.value || '';
          form.status.value = cells[5]?.querySelector('select')?.value || '';
          form.neg1.value = cells[6]?.querySelector('select')?.value || '';
          form.neg2.value = cells[7]?.querySelector('select')?.value || '';
          form.neg3.value = cells[8]?.querySelector('select')?.value || '';
          form.notes.value = val(9,'input');
          dlg.showModal();
        } catch(err){ console.warn('fallback edit dialog failed', err); }
      } else {
        alert('רכיב עריכה לא נטען עדיין');
      }
    }
  });
  if(dupBtn) dupBtn.addEventListener('click', e => { e.stopPropagation(); if(window.duplicateProjectRow) window.duplicateProjectRow(tr); });
  if(delBtn) delBtn.addEventListener('click', e => { e.stopPropagation(); if(window.deleteProjectRow) window.deleteProjectRow(tr); });
  applyStatusColor(tr);
  applyNegativeStatusColors(tr);
  // setup notes dbl-click editor
  try {
    const notesTd = tr.querySelectorAll('td')[9];
    if (notesTd && !notesTd._noteBound) {
      notesTd.addEventListener('dblclick', () => openInlineNoteEditor(notesTd));
      notesTd._noteBound = true;
    }
  } catch(_){ }
}

// Map statuses to background colors
const STATUS_COLORS = {
  'הזמנה חדשה':'#81d4fa', // brighter azure
  'בתכנון':'#42a5f5', // mid blue vibrant
  'בשרטוט':'#9575cd', // saturated purple
  'ממתין לשיבוץ':'#f06292', // vibrant pink
  'בייצור':'#66bb6a', // fresh green
  'בבדיקה':'#ffa726', // vivid orange
  'ממתין לאיסוף':'#ffeb3b' // bright yellow
};

function applyStatusColor(tr){
  try {
    const statusTd = tr.querySelector('td.status-cell');
    if(!statusTd) return;
    const sel = statusTd.querySelector('select');
    const val = sel ? sel.value : (statusTd.textContent||'').trim();
    // ensure inner wrapper to keep outer cell background intact
    let wrap = statusTd.querySelector('.status-color-wrap');
    if(!wrap){
      wrap = document.createElement('div');
      wrap.className='status-color-wrap';
      wrap.style.display='inline-block';
      wrap.style.width='100%';
      wrap.style.boxSizing='border-box';
      wrap.style.padding='2px 4px';
      wrap.style.borderRadius='6px';
      wrap.style.transition='background-color .25s';
      // move existing select into wrapper
      if(sel) wrap.appendChild(sel);
      statusTd.appendChild(wrap);
    } else if(sel && sel.parentElement!==wrap) {
      wrap.appendChild(sel);
    }
    const color = STATUS_COLORS[val] || 'transparent';
    wrap.style.backgroundColor = color;
    if(sel){
      sel.style.background='transparent';
      sel.style.border='1px solid #ccc';
    }
    if(sel && !sel._colorBound){ sel.addEventListener('change', ()=> applyStatusColor(tr)); sel._colorBound=true; }
  } catch(e){}
}

// Highlight negative status columns (indices >=6 until notes column) when they contain a value
function applyNegativeStatusColors(tr){
  try {
    const tds = tr.querySelectorAll('td');
    if(!tds.length) return;
    // determine notes index dynamically
    let notesIdx = theadNotesIndex(tds);
    // iterate negative status region (6..notesIdx-1)
    for(let i=6;i<notesIdx;i++){
      const td=tds[i]; if(!td) continue;
      const sel = td.querySelector('select');
      const val = sel ? sel.value.trim() : (td.textContent||'').trim();
      // ensure inner wrapper exists
      let wrap = td.querySelector('.neg-color-wrap');
      if(!wrap){
        wrap = document.createElement('div');
        wrap.className='neg-color-wrap';
  wrap.style.display='block';
  wrap.style.width='100%';
        wrap.style.boxSizing='border-box';
        wrap.style.padding='2px 4px';
        wrap.style.borderRadius='6px';
        wrap.style.transition='background-color .25s, color .25s';
        if(sel) wrap.appendChild(sel); else {
          // move existing text
          const txt = td.textContent; td.textContent=''; wrap.textContent=txt;
        }
        td.appendChild(wrap);
      } else if(sel && sel.parentElement!==wrap){
        wrap.appendChild(sel);
      }
      if(sel){
  sel.style.width='100%';
  sel.style.minWidth='0';
        sel.style.background='transparent';
        sel.style.border='1px solid #ccc';
  sel.style.boxSizing='border-box';
      }
      if(val){
        wrap.style.backgroundColor='#ef5350';
        wrap.style.color='#fff';
      } else {
        wrap.style.backgroundColor='transparent';
        wrap.style.color='inherit';
      }
      if(sel && !sel._negColorBound){
        sel.addEventListener('change', ()=> applyNegativeStatusColors(tr));
        sel._negColorBound=true;
      }
    }
  } catch(e){}
}

function addChildRow(data, toDone=false, skipSave=false) {
  const tbody = toDone ? document.querySelector('#projects-table-done tbody') : document.querySelector('#projects-table-active tbody');
  if (!data.orderId || !data.date || !data.client || !data.projectName) { console.error('addChildRow missing field', data); return; }
  const parentRow = ensureParentRow({ type:'parent', orderId:data.orderId, date:data.date, client:data.client, projectName:data.projectName, notes:data.notes, treated:data.treated, delivered:data.delivered, finished:data.finished, collapsed:false }, toDone);
  if (!parentRow) return;
  const tr = document.createElement('tr'); tr.className='child-row'; tr.dataset.orderId = data.orderId; fillChildRow(tr, data);
  let insertAfter = parentRow; let n = parentRow.nextElementSibling; while(n && !n.classList.contains('parent-row')) { if (n.classList.contains('child-row') && n.dataset.orderId===data.orderId) insertAfter=n; n=n.nextElementSibling; }
  insertAfter.insertAdjacentElement('afterend', tr);
  if (parentRow.classList.contains('collapsed')) tr.style.display='none';
  if (!skipSave) saveProjectsToStorage();
  if (typeof window.syncJournalTable==='function') try { window.syncJournalTable(); } catch(_){}
  recomputeParentStatusInTable(toDone ? '#projects-table-done' : '#projects-table-active', data.orderId);
}

function updateChildRow(tr, data) {
  const isDoneTable = tr.closest('table').id === 'projects-table-done';
  const shouldBeDone = !!data.finished;
  if (isDoneTable !== shouldBeDone) { tr.remove(); addChildRow(data, shouldBeDone); }
  else { fillChildRow(tr, data); saveProjectsToStorage(); }
}

function recomputeParentStatusInTable(tableSelector, orderId) {
  const tbody = document.querySelector(`${tableSelector} tbody`);
  if (!tbody) return;
  const parentRow = tbody.querySelector(`tr.parent-row[data-order-id="${orderId}"]`);
  if (!parentRow) return;
  const children = Array.from(tbody.querySelectorAll(`tr.child-row[data-order-id="${orderId}"]`));
  if (!children.length) return;
  let allT=true, allD=true, allF=true;
  children.forEach(tr => {
    const tds=tr.querySelectorAll('td');
    const treated=tds[10]?.querySelector('input')?.checked || false;
    const delivered=tds[11]?.querySelector('input')?.checked || false;
    const finished=tds[12]?.querySelector('input')?.checked || false;
    if(!treated) allT=false; if(!delivered) allD=false; if(!finished) allF=false;
  });
  parentRow.querySelector('.parent-treated').checked = allT;
  parentRow.querySelector('.parent-delivered').checked = allD;
  parentRow.querySelector('.parent-finished').checked = allF;
}

// חשיפה ל-legacy
window.ensureParentRow = ensureParentRow;
window.addChildRow = addChildRow;
window.updateChildRow = updateChildRow;
window.recomputeParentStatusInTable = recomputeParentStatusInTable;
window.toggleParentCollapse = toggleParentCollapse;
window.inlineEditOrderId = inlineEditOrderId;

// --- Added legacy dependent helpers migrated from inline script ---

function onCheckBoxChange(checkbox) {
  const tr = checkbox.closest('tr');
  if (!tr) return;
  if (tr.classList.contains('child-row')) {
    const tds = tr.querySelectorAll('td');
    // indices based on fillChildRow layout
    const data = {
      orderId: tr.dataset.orderId,
      date: tds[0]?.querySelector('input')?.value || tds[0]?.innerText || '',
      client: tds[1]?.querySelector('input')?.value || tds[1]?.innerText || '',
      projectName: tds[2]?.querySelector('input')?.value || tds[2]?.innerText || '',
      boardName: tds[3]?.querySelector('input')?.value || tds[3]?.innerText || '',
    worker: tds[4]?.querySelector('input')?.value || tds[4]?.innerText || '',
    status: tds[5]?.querySelector('input')?.value || tds[5]?.innerText || '',
      neg1: tds[6]?.querySelector('input')?.value || tds[6]?.innerText || '',
      neg2: tds[7]?.querySelector('input')?.value || tds[7]?.innerText || '',
      neg3: tds[8]?.querySelector('input')?.value || tds[8]?.innerText || '',
      notes: tds[9]?.querySelector('input')?.value || tds[9]?.innerText || '',
      treated: tds[10]?.querySelector('input')?.checked || false,
      delivered: tds[11]?.querySelector('input')?.checked || false,
      finished: tds[12]?.querySelector('input')?.checked || false
    };
    const isDoneTable = tr.closest('table').id === 'projects-table-done';
    const shouldBeDone = !!data.finished;
    if (isDoneTable !== shouldBeDone) {
      tr.remove();
      addChildRow(data, shouldBeDone);
      // remove parent if no children remain in source tbody
      // handled inside addChildRow on target; clean source manually
      document.querySelectorAll('#projects-table-active tbody, #projects-table-done tbody').forEach(tb => {
        const orphanParents = Array.from(tb.querySelectorAll('tr.parent-row')).filter(pr => !tb.querySelector(`tr.child-row[data-order-id="${pr.dataset.orderId}"]`));
        orphanParents.forEach(op => op.remove());
      });
    } else {
      fillChildRow(tr, data);
      recomputeParentStatusInTable(isDoneTable ? '#projects-table-done' : '#projects-table-active', data.orderId);
      saveProjectsToStorage();
    }
    if (typeof window.syncJournalTable === 'function') { try { window.syncJournalTable(); } catch(_){} }
    // server sync best-effort
    try {
      if (window.updateServerFromChildRow) window.updateServerFromChildRow(data);
    } catch(e) { console.warn('server sync (checkbox) failed', e); }
  } else if (tr.classList.contains('parent-row')) {
    saveProjectsToStorage();
    try {
      const orderId = tr.dataset.orderId;
      const stored = JSON.parse(localStorage.getItem('projects')||'[]');
      const parent = stored.find(r => r.type==='parent' && r.orderId===orderId);
      if (parent && window.updateServerFromChildRow) window.updateServerFromChildRow(parent);
    } catch(e){ console.warn('parent sync failed', e); }
  }
}
window.onCheckBoxChange = onCheckBoxChange;

function deleteProjectRow(tr) {
  if (!tr) return;
  try { console.debug('[legacyDelete] invoked', { type: tr.classList.contains('parent-row')?'parent': (tr.classList.contains('child-row')?'child':'other'), orderId: tr.dataset.orderId, projectId: tr.dataset.projectId, boardId: tr.dataset.boardId }); } catch(_){ }
  if (tr.classList.contains('child-row')) {
    const orderId = tr.dataset.orderId;
    // Tombstone board (if has boardId) to stop resurrection during sync
    try {
      const boardId = tr.dataset.boardId;
      if (boardId) {
        const key='__deletedBoardIds';
        let arr=[]; try { arr=JSON.parse(localStorage.getItem(key)||'[]'); } catch(_){ }
        if(!arr.includes(Number(boardId))) { arr.push(Number(boardId)); localStorage.setItem(key, JSON.stringify(arr)); }
      }
    } catch(_){ }
    // Collect identifiers before removal
    let client='', projectName='', boardName='';
    try {
      const tds = tr.querySelectorAll('td');
      client = tds[1]?.querySelector('input')?.value || tds[1]?.innerText || '';
      projectName = tds[2]?.querySelector('input')?.value || tds[2]?.innerText || '';
      boardName = tds[3]?.querySelector('input')?.value || tds[3]?.innerText || '';
    } catch(_){ }
    const tbody = tr.closest('tbody');
    tr.remove();
    if (!tbody.querySelector(`tr.child-row[data-order-id="${orderId}"]`)) {
      const parentRow = tbody.querySelector(`tr.parent-row[data-order-id="${orderId}"]`);
      if (parentRow) parentRow.remove();
    }
    // Remove only this board's journal entries
    try { if (window.removeJournalEntries) window.removeJournalEntries(client, projectName, boardName); } catch(_){ }
  } else if (tr.classList.contains('parent-row')) {
    const tbody = tr.closest('tbody');
    const orderId = tr.dataset.orderId;
    const projectId = tr.dataset.projectId;
  const normalizeSig = (c,p) => (c||'').trim().replace(/\s+/g,' ') + '|' + (p||'').trim().replace(/\s+/g,' ');
    // Tombstone parent orderId (prevents server sync from re-adding)
    try {
      const key='__deletedOrderIds';
      let arr=[]; try { arr=JSON.parse(localStorage.getItem(key)||'[]'); } catch(_){ }
      if(!arr.includes(orderId)) { arr.push(orderId); localStorage.setItem(key, JSON.stringify(arr)); }
    } catch(_){ }
    // Tombstone projectId as well (so even if orderId edited, server project suppressed)
    try {
      if (projectId) {
        const key='__deletedProjectIds';
        let arr=[]; try { arr=JSON.parse(localStorage.getItem(key)||'[]'); } catch(_){ }
        if(!arr.includes(Number(projectId))) { arr.push(Number(projectId)); localStorage.setItem(key, JSON.stringify(arr)); }
      }
    } catch(_){ }
    // Tombstone by (client|projectName) signature in case projectId/orderId unknown at deletion time
    try {
      const clientTxt = tr.querySelector('.client')?.textContent?.trim() || '';
      const projTxt = tr.querySelector('.project')?.textContent?.trim() || '';
      if (clientTxt || projTxt) {
        const sigKey='__deletedProjectSignatures';
        let arr=[]; try { arr=JSON.parse(localStorage.getItem(sigKey)||'[]'); } catch(_){ }
    const sig = normalizeSig(clientTxt, projTxt);
        if (!arr.includes(sig)) { arr.push(sig); localStorage.setItem(sigKey, JSON.stringify(arr)); }
      }
    } catch(_){ }
    // Capture client & project from bar
    let client='', projectName='';
    try {
      client = tr.querySelector('.client')?.textContent || '';
      projectName = tr.querySelector('.project')?.textContent || '';
    } catch(_){ }
    // remove all subsequent children until next parent
    let n = tr.nextElementSibling;
    while (n && !n.classList.contains('parent-row')) {
      const next = n.nextElementSibling;
      if (n.classList.contains('child-row') && n.dataset.orderId===orderId) n.remove();
      n = next;
    }
    tr.remove();
    // If this was an unsynced local-only project (no projectId), purge any queued creation + local array entries now
    if (!projectId) {
      try {
        if (window.cancelQueuedCreation) window.cancelQueuedCreation(orderId);
        let arr=[]; try { arr = JSON.parse(localStorage.getItem('projects')||'[]'); } catch(_){ }
        if (Array.isArray(arr)) {
          const lenBefore = arr.length;
          arr = arr.filter(r => r.orderId !== orderId);
          if (arr.length !== lenBefore) {
            localStorage.setItem('projects', JSON.stringify(arr));
            localStorage.setItem('projects_backup', JSON.stringify(arr));
            try { console.debug('[purge] removed local unsynced project orderId', orderId); } catch(_){ }
          }
        }
      } catch(_){ }
    }
    // Remove all journal entries for this client+project (all boards)
    try { if (window.removeJournalEntries) window.removeJournalEntries(client, projectName); } catch(_){ }
  }
  saveProjectsToStorage();
  try { console.debug('[legacyDelete] after save, tombstone sets', {
    delOrders: JSON.parse(localStorage.getItem('__deletedOrderIds')||'[]'),
    delBoards: JSON.parse(localStorage.getItem('__deletedBoardIds')||'[]'),
    delProjects: JSON.parse(localStorage.getItem('__deletedProjectIds')||'[]'),
    delSigs: JSON.parse(localStorage.getItem('__deletedProjectSignatures')||'[]')
  }); } catch(_){ }
  if (typeof window.syncJournalTable === 'function') { try { window.syncJournalTable(); } catch(_){} }
  // recompute all parents in both tables
  ['#projects-table-active','#projects-table-done'].forEach(sel => {
    const tb = document.querySelector(sel+' tbody'); if (!tb) return;
    const ids = Array.from(new Set(Array.from(tb.querySelectorAll('tr.child-row')).map(r=>r.dataset.orderId)));
    ids.forEach(id => recomputeParentStatusInTable(sel, id));
  });
}
window.deleteProjectRow = deleteProjectRow;

function duplicateProjectRow(tr) {
  if (!tr || !tr.classList.contains('child-row')) return;
  const tds = tr.querySelectorAll('td');
  const val = (tdIdx, sel)=> tds[tdIdx]?.querySelector(sel)?.value || tds[tdIdx]?.querySelector(sel)?.textContent || tds[tdIdx]?.innerText || '';
  const data = {
    orderId: tr.dataset.orderId,
    date: new Date().toLocaleDateString('he-IL'),
    client: val(1,'input'),
    projectName: val(2,'input'),
    boardName: val(3,'input'),
    worker: tds[4]?.querySelector('select')?.value || val(4,'input'),
    status: tds[5]?.querySelector('select')?.value || val(5,'input'),
    neg1: tds[6]?.querySelector('select')?.value || val(6,'input'),
    neg2: tds[7]?.querySelector('select')?.value || val(7,'input'),
    neg3: tds[8]?.querySelector('select')?.value || val(8,'input'),
    notes: val(9,'input'),
    treated: tds[10]?.querySelector('input')?.checked || false,
    delivered: tds[11]?.querySelector('input')?.checked || false,
    finished: tds[12]?.querySelector('input')?.checked || false
  };
  addChildRow(data, data.finished);
  try { if (window.showSavedIndicator) window.showSavedIndicator(); } catch(_){ }
}
window.duplicateProjectRow = duplicateProjectRow;

// Inline note editor overlay
function openInlineNoteEditor(notesTd){
  try {
    // avoid multiple editors
    const existing = document.querySelector('.note-editor-overlay');
    if (existing) existing.remove();
    const hidden = notesTd.querySelector('.note-hidden-input');
    const span = notesTd.querySelector('.note-display');
    const current = hidden?.value || '';
    const rect = notesTd.getBoundingClientRect();
    const ov = document.createElement('div');
    ov.className='note-editor-overlay';
    ov.style.position='absolute';
    ov.style.top = (window.scrollY + rect.top - 4) + 'px';
    ov.style.left = (window.scrollX + rect.left - 4) + 'px';
    ov.style.width = Math.max(rect.width + 8, 260) + 'px';
    ov.style.minHeight = '140px';
    ov.style.background='#ffffff';
    ov.style.border='2px solid #1565c0';
    ov.style.borderRadius='8px';
    ov.style.padding='8px';
    ov.style.boxShadow='0 4px 14px rgba(0,0,0,0.15)';
    ov.style.zIndex='9999';
    ov.style.direction='rtl';
    ov.innerHTML = `<textarea style="width:100%;height:90px;resize:vertical;box-sizing:border-box;font-family:inherit;font-size:0.9em;padding:6px;direction:rtl;">${current.replace(/</g,'&lt;')}</textarea>
      <div style="margin-top:6px;display:flex;gap:8px;justify-content:flex-start;">
        <button type="button" class="note-save-btn" style="background:#1565c0;color:#fff;border:none;padding:4px 14px;border-radius:6px;cursor:pointer;font-size:0.85em;">שמירה</button>
        <button type="button" class="note-cancel-btn" style="background:#e0e0e0;color:#333;border:none;padding:4px 14px;border-radius:6px;cursor:pointer;font-size:0.85em;">ביטול</button>
      </div>`;
    document.body.appendChild(ov);
    const ta = ov.querySelector('textarea');
    ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    // Live autosave while typing inside note editor (projects + journal)
    let liveTimer=null;
    const livePersist = () => {
      try {
        const val = ta.value.trim();
        if (hidden) hidden.value = val; // keep hidden input up to date for saveProjectsToStorage
        scheduleProjectsAutosave();
        // Mirror into journal if applicable (without closing overlay)
        const journalRow = notesTd.closest('#tasks-journal-table tr');
        if (journalRow && journalRow.dataset.journalKey) {
          let journalData={};
          try { journalData = JSON.parse(localStorage.getItem('journalTasks')||'{}'); } catch(e){ journalData={}; }
          if(!journalData[journalRow.dataset.journalKey]) journalData[journalRow.dataset.journalKey] = {};
          journalData[journalRow.dataset.journalKey].note = val;
          localStorage.setItem('journalTasks', JSON.stringify(journalData));
        }
      } catch(e){ /* ignore */ }
    };
    ta.addEventListener('input', ()=>{
      try { if (liveTimer) clearTimeout(liveTimer); } catch(_){}
      liveTimer = setTimeout(()=>{ livePersist(); if (window.showSavedIndicator) window.showSavedIndicator(); }, 300);
    });
    const commit = () => {
      const val = ta.value.trim();
      if (hidden) hidden.value = val;
      if (span){
        span.dataset.hasNote = val? '1':'0';
        span.textContent = val ? 'הערה קיימת!' : '';
        span.style.cursor = val ? 'pointer' : 'text';
        span.style.color = val ? '#1565c0' : '#333';
      }
      // Persist for projects table
      try { saveProjectsToStorage(); } catch(_){ }
      // Persist for journal table if inside it
      try {
        const journalRow = notesTd.closest('#tasks-journal-table tr');
        if (journalRow && journalRow.dataset.journalKey){
          let journalData={};
          try { journalData = JSON.parse(localStorage.getItem('journalTasks')||'{}'); } catch(e){ journalData={}; }
          if(!journalData[journalRow.dataset.journalKey]) journalData[journalRow.dataset.journalKey] = {};
          journalData[journalRow.dataset.journalKey].note = val;
          localStorage.setItem('journalTasks', JSON.stringify(journalData));
        }
      } catch(e){ console.warn('journal note save failed', e); }
      ov.remove();
      if (window.__activeNoteCommit === commit) delete window.__activeNoteCommit;
      try { if (window.showSavedIndicator) window.showSavedIndicator(); } catch(_){ }
    };
    const cancel = () => { ov.remove(); };
    ov.querySelector('.note-save-btn').addEventListener('click', commit);
    ov.querySelector('.note-cancel-btn').addEventListener('click', cancel);
    ta.addEventListener('keydown', ev => {
      if (ev.key==='Escape'){ ev.preventDefault(); cancel(); }
      else if ((ev.key==='Enter' && (ev.ctrlKey||ev.metaKey))){ ev.preventDefault(); commit(); }
    });
    // click outside closes (commit)
    const outsideHandler = (e) => { if (!ov.contains(e.target)) { commit(); document.removeEventListener('mousedown', outsideHandler); } };
    setTimeout(()=> document.addEventListener('mousedown', outsideHandler), 0);
    // Expose commit so beforeunload יכול לשמור בעת סגירת לשונית פתאומית
    window.__activeNoteCommit = commit;
  } catch(e){ console.warn('openInlineNoteEditor failed', e); }
}
window.openInlineNoteEditor = openInlineNoteEditor;

// Commit any פתיחת הערת overlay לפני עזיבת הדף & final autosave of projects
if (!window.__projectsUnloadBound) {
  window.addEventListener('beforeunload', () => {
    try { if (window.__activeNoteCommit) window.__activeNoteCommit(); } catch(_){}
    try { saveProjectsToStorage(); } catch(_){}
    // Flush מיידי כדי למנוע איבוד שינוי בגלל debounce
    try { if (window.stateStore) window.stateStore.flushNow('unload'); } catch(_){ }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      try { if (window.__activeNoteCommit) window.__activeNoteCommit(); } catch(_){}
      try { saveProjectsToStorage(); } catch(_){}
      try { if (window.stateStore) window.stateStore.flushNow('visibilityHidden'); } catch(_){ }
    }
  });
  window.__projectsUnloadBound = true;
}

function loadProjectsFromStorage() {
  const raw = localStorage.getItem('projects');
  if (!raw) {
    // Attempt recovery from backup
    try {
      const backup = localStorage.getItem('projects_backup');
      if (backup) {
        console.warn('[projects] recovering from backup snapshot');
        if(window.stateStore){
          try {
            const parsed = JSON.parse(backup);
            if(Array.isArray(parsed)) { window.stateStore.replaceAllFromArray(parsed, 'projectTable.recover'); window.stateStore.flushNow('projectTable.recover'); }
          } catch(e){ localStorage.setItem('projects', backup); }
        } else {
          localStorage.setItem('projects', backup);
        }
        try { console.warn('[persist][projects] recovered from backup (projects empty)'); } catch(_){ }
      } else return;
    } catch(e){ return; }
  }
  let items;
  try { items = JSON.parse(raw); } catch(e){ console.warn('loadProjectsFromStorage parse fail', e); return; }
  if (!Array.isArray(items)) return;
  // Apply tombstones (deleted identifiers)
  try {
    let delOrders=[]; let delBoards=[];
    try { delOrders = JSON.parse(localStorage.getItem('__deletedOrderIds')||'[]'); } catch(_){ }
    try { delBoards = JSON.parse(localStorage.getItem('__deletedBoardIds')||'[]'); } catch(_){ }
    let delProjects=[]; try { delProjects = JSON.parse(localStorage.getItem('__deletedProjectIds')||'[]'); } catch(_){ }
  let delSigs=[]; try { delSigs = JSON.parse(localStorage.getItem('__deletedProjectSignatures')||'[]'); } catch(_){ }
    if (delOrders.length || delBoards.length) {
      items = items.filter(r => {
        if (r.type==='parent' && delOrders.includes(r.orderId)) return false;
        if (r.type==='child') {
          if (r.boardId && delBoards.includes(r.boardId)) return false;
          if (delOrders.includes(r.orderId)) return false;
        }
        return true;
      });
    }
    if (delProjects.length) {
      items = items.filter(r => {
        if (r.projectId && delProjects.includes(r.projectId)) return false;
        return true;
      });
    }
    if (delSigs.length) {
      // Normalize incoming records signature before compare
      items = items.filter(r => {
        const sig = ((r.client||'').trim().replace(/\s+/g,' ')) + '|' + ((r.projectName||'').trim().replace(/\s+/g,' '));
        if ((r.type==='parent' || r.type==='child') && delSigs.includes(sig)) return false;
        return true;
      });
    }
  } catch(_){ }
  // Self-healing: ensure required fields for parent rows so other modules (journal) won't fail silently
  let healed=false; const today=new Date().toLocaleDateString('he-IL');
  items.forEach(r => {
    if(r && r.type==='parent'){
      if(!r.orderId){ r.orderId='FIX-'+Math.random().toString(36).slice(2,8); healed=true; }
      if(!r.date){ r.date = today; healed=true; }
      if(!r.client){ r.client='(לקוח חסר)'; healed=true; }
      if(!r.projectName){ r.projectName='(פרויקט חסר)'; healed=true; }
    }
  });
  if(healed){ try { localStorage.setItem('projects', JSON.stringify(items)); } catch(_){ } }
  const hasStructured = items.some(it => it && it.type);
  if (hasStructured) {
    // Clear existing rows to avoid duplication from multiple invocations
    ['#projects-table-active','#projects-table-done'].forEach(sel => {
      const tb = document.querySelector(sel+' tbody');
      if (tb) Array.from(tb.querySelectorAll('tr.parent-row, tr.child-row')).forEach(r=>r.remove());
    });
    // Rebuild parents then children
    items.filter(i=>i.type==='parent').forEach(p => ensureParentRow(p, !!p.finished));
    items.filter(i=>i.type==='child').forEach(c => addChildRow(c, !!c.finished, true));
  } else {
    // legacy flat rows -> assign each to its own parent
    items.forEach(old => {
      const orderId = old.orderId || ('MIG-'+Math.random().toString(36).slice(2,8));
      ensureParentRow({ type:'parent', orderId, date: old.date, client: old.client, projectName: old.projectName, notes:'', treated:false, delivered:false, finished:!!old.finished, collapsed:false }, !!old.finished);
      addChildRow({ ...old, orderId }, !!old.finished, true);
    });
    saveProjectsToStorage();
  }
  // recompute after load
  ['#projects-table-active','#projects-table-done'].forEach(sel => {
    const tb = document.querySelector(sel+' tbody'); if (!tb) return;
    const ids = Array.from(new Set(Array.from(tb.querySelectorAll('tr.child-row')).map(r=>r.dataset.orderId)));
    ids.forEach(id => recomputeParentStatusInTable(sel, id));
  });
}
window.loadProjectsFromStorage = loadProjectsFromStorage;

// Auto load projects early to avoid race with journal initialSync
try {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { try { loadProjectsFromStorage(); if (window.syncJournalTable) window.syncJournalTable(); } catch(e){} });
  } else {
    loadProjectsFromStorage(); if (window.syncJournalTable) window.syncJournalTable();
  }
} catch(e) { /* ignore */ }
