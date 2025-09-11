// journalUI.js - extracted from inline index2.html journal tab logic
// Handles: initial sync of projects -> journalTasks, dynamic worker tabs, subtab filtering, dialog interactions

(function(){
  try { console.log('[journalUI] v8 defaults (col7 לידור, col8-11 ספיר) + urgency + independence'); } catch(_){ }
  // --- Key normalization & fuzzy lookup to keep notes stable across minor formatting changes ---
  function __normPart(s){ if(!s) return ''; return String(s).trim().replace(/\s+/g,' '); }
  function __buildKey(d,c,p,b){ return [__normPart(d),__normPart(c),__normPart(p),__normPart(b)].join('|'); }
  function __stripZeros(t){ return t.replace(/\b0+(\d)/g,'$1'); }
  function __findExistingKey(store, d,c,p,b){
    const target = __buildKey(d,c,p,b);
    if(store[target]) return target;
    const tp = target.split('|');
    for(const k in store){
      const kp = k.split('|'); if(kp.length!==4) continue;
      let match=true;
      for(let i=0;i<4;i++){
        const a = __stripZeros(__normPart(kp[i]));
        const b2 = __stripZeros(__normPart(tp[i]));
        if(a!==b2){ match=false; break; }
      }
      if(match) return k; // reuse existing to preserve note
    }
    return target; // new key
  }
  function safeParse(key,def){ try { return JSON.parse(localStorage.getItem(key)||def); } catch(e){ return JSON.parse(def); } }

  function initialSync() {
    try {
      let projects = safeParse('projects','[]');
      let journalData = safeParse('journalTasks','{}');
      // Recover journal from backup if empty but backup exists
      if (Object.keys(journalData).length===0) {
        try {
          const bk = localStorage.getItem('journalTasks_backup');
          if (bk) {
            journalData = JSON.parse(bk);
            localStorage.setItem('journalTasks', JSON.stringify(journalData));
            console.warn('[journal] recovered journalTasks from backup');
          }
        } catch(e){}
      }
  projects.forEach(p => {
        if (!p || p.type==='parent') return; // only child rows
        if (!p.orderId || !p.client || !p.projectName || !p.date) return;
        const key = __findExistingKey(journalData, p.date, p.client, p.projectName, p.boardName);
        if (!journalData[key]) {
          journalData[key] = { date: p.date, client: p.client, projectName: p.projectName, boardName: p.boardName };
        }
      });
      Object.keys(journalData).forEach(k => window.assignJournalEntry && window.assignJournalEntry(k, journalData[k]));
    } catch(e) {}
    try {
      let projects = safeParse('projects','[]');
      let journalData = safeParse('journalTasks','{}');
  projects.forEach(p => {
        if (!p.date || !p.client || !p.projectName || !p.boardName) return;
        const key = __findExistingKey(journalData, p.date, p.client, p.projectName, p.boardName);
        if (!journalData[key]) journalData[key] = { col7: '' };
      });
      Object.keys(journalData).forEach(k => window.assignJournalEntry && window.assignJournalEntry(k, journalData[k]));
    } catch(e) {}
  }

  function ensureApprovalButton() {
    if (document.querySelector('.journal-subtab-btn[data-worker="lidor-approval"]')) return;
    const lidorBtn = document.querySelector('.journal-subtab-btn[data-worker="לידור"]');
    if (!lidorBtn) return;
    const approvalBtn = document.createElement('button');
    approvalBtn.className = 'journal-subtab-btn';
    approvalBtn.dataset.worker = 'lidor-approval';
    approvalBtn.style.background = 'var(--primary-light)';
    approvalBtn.style.border = 'none';
    approvalBtn.style.padding = '8px 18px';
    approvalBtn.style.borderRadius = '6px';
    approvalBtn.style.cursor = 'pointer';
    approvalBtn.style.fontWeight = '500';
    approvalBtn.innerText = 'באישור לקוח (לידור)';
    approvalBtn.style.display = 'none';
    lidorBtn.parentNode.insertBefore(approvalBtn, lidorBtn.nextSibling);
  }

  function bindAddWorkerDialog() {
    const addBtn = document.getElementById('add-worker-btn');
    if (!addBtn) return;
    addBtn.onclick = () => {
      const dialog = document.getElementById('add-worker-dialog');
      if (!dialog) return;
      dialog.showModal();
      dialog.querySelector('#new-worker-name').value='';
      dialog.querySelector('#new-worker-logic').value='lidor';
    };
    const cancel = document.getElementById('add-worker-cancel');
    if (cancel) cancel.onclick = () => document.getElementById('add-worker-dialog')?.close();
    const form = document.getElementById('add-worker-dialog');
    if (form) form.onsubmit = ev => {
      ev.preventDefault();
      const name = document.getElementById('new-worker-name').value.trim();
      const logic = document.getElementById('new-worker-logic').value;
      if (!name) return;
      let customWorkers=[]; try { customWorkers = JSON.parse(localStorage.getItem('customWorkers')||'[]'); } catch(e){}
      if (customWorkers.some(w=>w.name===name)) { alert('עובד בשם זה כבר קיים'); return; }
      customWorkers.push({ name, logic });
      localStorage.setItem('customWorkers', JSON.stringify(customWorkers));
      document.getElementById('add-worker-dialog').close();
      if (typeof window.renderCustomWorkerTabs === 'function') window.renderCustomWorkerTabs();
      bindSubtabEvents();
      if (typeof window.syncJournalTable === 'function') window.syncJournalTable(name);
      setTimeout(()=>{
        const btn = document.querySelector('.journal-subtab-btn[data-worker="'+name+'"]');
        if (btn) {
          document.querySelectorAll('.journal-subtab-btn').forEach(b=>b.style.background='var(--primary-light)');
          btn.style.background='var(--primary)';
        }
      },100);
    };
  }

  function bindSubtabEvents() {
    const subtabBtns = Array.from(document.querySelectorAll('.journal-subtab-btn'));
    const approvalBtn = document.querySelector('.journal-subtab-btn[data-worker="lidor-approval"]');
    // color mapping
    const colorMap = {
      'all':'#1976d2', // blue
      'לידור':'#2e7d32', // green
      'ספיר':'#d81b60', // pink
      'מתן':'#ef6c00', // orange
      'done':'#555'
    };
    subtabBtns.forEach(b=>{
      const w=b.dataset.worker;
      if(colorMap[w]) b.style.border=`2px solid ${colorMap[w]}`;
    });
  subtabBtns.forEach(btn => {
      btn.addEventListener('click', e => {
        if (e.target.classList.contains('remove-worker-btn')) {
          const workerName = btn.dataset.worker;
          if (confirm('האם למחוק את העובד ' + workerName + '?')) {
            let customWorkers=[]; try { customWorkers = JSON.parse(localStorage.getItem('customWorkers')||'[]'); } catch(e){}
            customWorkers = customWorkers.filter(w=>w.name !== workerName);
            localStorage.setItem('customWorkers', JSON.stringify(customWorkers));
            if (typeof window.renderCustomWorkerTabs === 'function') window.renderCustomWorkerTabs();
            bindSubtabEvents();
            if (typeof window.syncJournalTable === 'function') window.syncJournalTable('all');
          }
          return;
        }
        const colorMap = {
          'all':'#1976d2',
          'לידור':'#2e7d32',
          'ספיר':'#d81b60',
          'מתן':'#ef6c00',
          'done':'#555'
        };
        subtabBtns.forEach(b=>{
          b.style.background='var(--primary-light)'; b.style.color='#000';
        });
        const w=btn.dataset.worker;
        if(colorMap[w]){ btn.style.background=colorMap[w]; btn.style.color='#fff'; }
        if (btn.dataset.worker === 'לידור') {
          if (approvalBtn) approvalBtn.style.display='';
        } else {
          if (approvalBtn) approvalBtn.style.display='none';
        }
  if (typeof window.syncJournalTable === 'function') window.syncJournalTable(btn.dataset.worker);
  try { localStorage.setItem('__journal_lastFilter', btn.dataset.worker||'all'); } catch(_){}
      });
    });
  }

  function activateDefaultTab() {
    const allBtn = document.querySelector('.journal-subtab-btn[data-worker="all"]');
    // Restore last filter if exists
    let lf = null; try { lf = localStorage.getItem('__journal_lastFilter'); } catch(_){ lf=null; }
    if (lf && document.querySelector('.journal-subtab-btn[data-worker="'+lf+'"]')) {
      setTimeout(()=>{ document.querySelector('.journal-subtab-btn[data-worker="'+lf+'"]').click(); }, 50);
    } else if (allBtn) {
      allBtn.style.background='#1976d2'; allBtn.style.color='#fff';
    }
    const approvalBtn = document.querySelector('.journal-subtab-btn[data-worker="lidor-approval"]');
    if (approvalBtn) approvalBtn.style.display='none';
  }

  window.addEventListener('DOMContentLoaded', () => {
    initialSync();
    ensureApprovalButton();
    if (typeof window.renderCustomWorkerTabs === 'function') window.renderCustomWorkerTabs();
    if (typeof window.syncJournalTable === 'function') window.syncJournalTable();
    bindSubtabEvents();
    activateDefaultTab();
    bindAddWorkerDialog();
  // ensure any pre-existing collapse classes are reset
  document.querySelectorAll('#tasks-journal-table .journal-parent.collapsed').forEach(r=>r.classList.remove('collapsed'));
  });
})();

// Provide global key resolver for journal (mirrors private logic) so later code can use it safely
if(!window.__findExistingJournalKey){
  window.__findExistingJournalKey = function(store, d, c, p, b){
    function norm(s){ return !s? '': String(s).trim().replace(/\s+/g,' '); }
    function stripZeros(t){ return String(t).replace(/\b0+(\d)/g,'$1'); }
    const target=[norm(d),norm(c),norm(p),norm(b)].join('|');
    if(store && store[target]) return target;
    const tp=target.split('|');
    for(const k in (store||{})){
      const kp=k.split('|'); if(kp.length!==4) continue; let match=true;
      for(let i=0;i<4;i++){ if(stripZeros(norm(kp[i]))!==stripZeros(norm(tp[i]))){ match=false; break; } }
      if(match) return k;
    }
    return target;
  };
}

// Backward compatibility: some legacy code (or cached tabs) may still reference __findExistingKey globally.
// Expose a safe alias that delegates to the new public helper if the closure version is gone.
if (typeof window.__findExistingKey !== 'function') {
  window.__findExistingKey = function(store, d, c, p, b){
    return window.__findExistingJournalKey ? window.__findExistingJournalKey(store,d,c,p,b) : [d||'',c||'',p||'',b||''].join('|');
  };
}

// --- Autosave integration for journal tasks: debounce journalTasks writes on note / select changes already occur; add beforeunload flush
if(!window.__journalAutosaveBound){
  window.addEventListener('beforeunload', ()=>{
    try { const jd = JSON.parse(localStorage.getItem('journalTasks')||'{}'); localStorage.setItem('journalTasks', JSON.stringify(jd)); } catch(_){}
  });
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState==='hidden'){
      try { const jd = JSON.parse(localStorage.getItem('journalTasks')||'{}'); localStorage.setItem('journalTasks', JSON.stringify(jd)); } catch(_){}
    }
  });
  window.__journalAutosaveBound = true;
}

// New implementation: build journal table from current project child rows
window.syncJournalTable = function(filterWorker) {
  try {
    const tbody = document.querySelector('#tasks-journal-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const all = JSON.parse(localStorage.getItem('projects')||'[]');
    const parents = all.filter(r=>r.type==='parent');
    const children = all.filter(r=>r.type==='child');
    const workerColor={ 'לידור':'#2e7d32', 'ספיר':'#d81b60', 'מתן':'#ef6c00' };
    let journalData={};
    try { journalData=JSON.parse(localStorage.getItem('journalTasks')||'{}'); } catch(e){ journalData={}; }

    function rowIncluded(rowData, workerFilter){
      if(!workerFilter || workerFilter==='all') return true;
      if(workerFilter==='לידור'){ // show לidor rows + באישור לקוח
        return (rowData && (rowData.col7==='לידור' || rowData.col7==='באישור לקוח'));
      }
      if(workerFilter==='lidor-approval'){ // only approval state
        return (rowData && rowData.col7==='באישור לקוח');
      }
      if(workerFilter==='ספיר'){ // any column 7-13 equals ספיר
        if(!rowData) return false; for(let i=7;i<=13;i++){ if(rowData['col'+i]==='ספיר') return true; } return false;
      }
      if(workerFilter==='מתן'){ // any column equals מתן or הסתיים (completed)
        if(!rowData) return false; for(let i=7;i<=13;i++){ if(rowData['col'+i]==='מתן' || rowData['col'+i]==='הסתיים') return true; } return false;
      }
      if(workerFilter==='done'){ // col7 מאושר לביצוע OR any col>=8 == הסתיים
        if(!rowData) return false; if(rowData.col7==='מאושר לביצוע') return true; for(let i=8;i<=13;i++){ if(rowData['col'+i]==='הסתיים') return true; } return false;
      }
      // fallback: generic worker filter
      if(!rowData) return false; for(let i=7;i<=13;i++){ if(rowData['col'+i]===workerFilter) return true; } return false;
    }

    function buildWorkerSelect(currentVal, colIdx){
      // base options
      const isMatanContext = true; // allow 'הסתיים' option universally for now (simpler)
      let opts=['','לידור','ספיר','מתן'];
      let extra=[];
      if(colIdx===7){ // drawing column special states
        if(!opts.includes('באישור לקוח')) extra.push('באישור לקוח');
        if(!opts.includes('מאושר לביצוע')) extra.push('מאושר לביצוע');
      }
      if(isMatanContext) opts.push('הסתיים');
      const select=document.createElement('select');
      select.className='journal-worker-select';
      [...opts,...extra].forEach(o=>{ const op=document.createElement('option'); op.value=o; op.textContent=o; if(o===currentVal) op.selected=true; select.appendChild(op); });
      return select;
    }
  parents.forEach(parent => {
      const allChildren = children.filter(c=>c.orderId===parent.orderId);
      // children after worker filter (using journalData assignment logic) not just worker field on project
      const pChildren = allChildren.filter(ch=>{
  const key=window.__findExistingJournalKey(journalData, ch.date, ch.client, ch.projectName, ch.boardName);
  const rowData=journalData[key];
        return rowIncluded(rowData, filterWorker);
      });
  // If there are no child boards yet, previously we skipped the parent entirely – causing an empty journal.
  // Show parent row (quantity 0) when filter is 'all' (or undefined). For specific worker filters still hide.
  if (!pChildren.length && filterWorker && filterWorker!=='all') return;
      // Build an aligned parent row (no colspan) with collapse button similar to production tracking
      const pr = document.createElement('tr');
      pr.className='journal-parent';
      pr.dataset.orderId = parent.orderId || '';
      // journal key for parent (special sentinel for boardName)
      const parentKey = [parent.date||'', parent.client||'', parent.projectName||'', '__PARENT__'].join('|');
      pr.dataset.journalKey = parentKey;
      const collapseTd = document.createElement('td');
      collapseTd.style.background='#eef6fb';
      collapseTd.style.fontWeight='600';
      collapseTd.innerHTML = `<button class="journal-collapse" style="cursor:pointer;border:1px solid #90caf9;background:#fff;border-radius:4px;padding:0 6px;">▾</button> ${parent.date||''}`;
      pr.appendChild(collapseTd);
  const parentVals = [parent.client || '', parent.projectName || ''];
  parentVals.forEach(v=>{ const td=document.createElement('td'); td.style.background='#eef6fb'; td.style.fontWeight='600'; td.textContent=v; pr.appendChild(td); });
  // Board column (empty for parent)
  const boardTd=document.createElement('td'); boardTd.style.background='#eef6fb'; pr.appendChild(boardTd);
  // Quantity column = number of child boards (after worker filter)
      const qtyTd=document.createElement('td'); qtyTd.style.background='#eef6fb'; qtyTd.style.fontWeight='600'; qtyTd.textContent = pChildren.length; pr.appendChild(qtyTd);
      // Job Number / Plan column (parent only)
      if(!journalData[parentKey]) journalData[parentKey] = { jobNumber: '' };
      if(typeof journalData[parentKey].urgency === 'undefined') journalData[parentKey].urgency = '';
      const jobNumberVal = journalData[parentKey].jobNumber || '';
      const urgencyVal = journalData[parentKey].urgency || '';
      const jobTd = document.createElement('td');
      jobTd.style.background='#eef6fb';
      jobTd.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:4px;align-items:stretch">
          <input type="text" class="job-number-input" placeholder="מספר עבודה /תכנית" value="${(jobNumberVal||'').replace(/"/g,'&quot;')}" style="width:100%;box-sizing:border-box;padding:2px 4px;font-size:0.8em;direction:rtl;">
          <div style="display:flex;align-items:center;gap:6px;justify-content:space-between;font-size:0.7em;">
            <span style="white-space:nowrap;">רמת דחיפות:</span>
            <select class="journal-urgency-select" style="flex:1;direction:rtl;padding:2px 4px;font-size:0.9em;">
              <option value="" ${!urgencyVal?'selected':''}></option>
              <option value="רגילה" ${urgencyVal==='רגילה'?'selected':''}>רגילה</option>
              <option value="דחופה" ${urgencyVal==='דחופה'?'selected':''}>דחופה</option>
              <option value="בהולה" ${urgencyVal==='בהולה'?'selected':''}>בהולה</option>
              <option value="קריטית" ${urgencyVal==='קריטית'?'selected':''}>קריטית</option>
            </select>
          </div>
        </div>`;
      const jobInp = jobTd.querySelector('input');
      const urgencySel = jobTd.querySelector('.journal-urgency-select');
      let jbTimer=null;
      jobInp.addEventListener('input', ()=>{
        if(jbTimer) clearTimeout(jbTimer);
        jbTimer = setTimeout(()=>{
          journalData[parentKey].jobNumber = jobInp.value.trim();
          try {
            localStorage.setItem('journalTasks', JSON.stringify(journalData));
            localStorage.setItem('journalTasks_backup', JSON.stringify(journalData));
          } catch(_){ }
          if(window.showSavedIndicator) window.showSavedIndicator();
        }, 300);
      });
      // Urgency handling
      function applyUrgencyColor(tr, val){
        const map = {
          '': {bg:'#eef6fb', color:'#000'},
          'רגילה': { bg:'#fff9c4', color:'#000' }, // Yellow
          'דחופה': { bg:'#ffe0b2', color:'#000' }, // Orange
          'בהולה': { bg:'#ffcdd2', color:'#000' }, // Red tint
          'קריטית': { bg:'#e1bee7', color:'#311b92' } // Purple tint
        };
        const cfg = map[val] || map[''];
        try {
          tr.style.backgroundColor = cfg.bg;
          // Keep first cells bold but readable
          Array.from(tr.children).forEach(td=>{ td.style.backgroundColor = cfg.bg; });
        } catch(e){}
      }
      applyUrgencyColor(pr, urgencyVal);
      urgencySel.addEventListener('change', ()=>{
        journalData[parentKey].urgency = urgencySel.value;
        try {
          localStorage.setItem('journalTasks', JSON.stringify(journalData));
          localStorage.setItem('journalTasks_backup', JSON.stringify(journalData));
        } catch(_){ }
        applyUrgencyColor(pr, urgencySel.value);
        if(window.showSavedIndicator) window.showSavedIndicator();
      });
      pr.appendChild(jobTd);
  // New board notes column placeholder (parent row empty)
  const parentNoteTd = document.createElement('td'); parentNoteTd.style.background='#eef6fb'; pr.appendChild(parentNoteTd);
  // Remaining 7 task columns placeholders (after new note column)
  for(let i=0;i<7;i++){ const td=document.createElement('td'); td.style.background='#eef6fb'; pr.appendChild(td); }
      tbody.appendChild(pr);
      const collapseBtn = pr.querySelector('.journal-collapse');
      collapseBtn.addEventListener('click', () => {
        const collapsed = pr.classList.toggle('collapsed');
        let n = pr.nextElementSibling;
        while(n && !n.classList.contains('journal-parent')){
          if(collapsed) n.style.display='none'; else n.style.display='';
          n = n.nextElementSibling;
        }
        collapseBtn.textContent = collapsed ? '▸' : '▾';
      });
      // Child rows with worker assignment selects
      pChildren.forEach(ch => {
  const key = window.__findExistingJournalKey(journalData, ch.date, ch.client, ch.projectName, ch.boardName);
        if (window.assignJournalEntry) window.assignJournalEntry(key, { date:ch.date, client:ch.client, projectName:ch.projectName, boardName:ch.boardName });
        if(!journalData[key]) journalData[key]={};
        // Apply default worker assignments (only if empty) once when row materializes
        try {
          if((journalData[key].col7||'')==='') journalData[key].col7='לידור'; // שרטוט
          // מדבקות/מהדקים/גידים/שלטים -> col8..col11
          if((journalData[key].col8||'')==='') journalData[key].col8='ספיר';
          if((journalData[key].col9||'')==='') journalData[key].col9='ספיר';
          if((journalData[key].col10||'')==='') journalData[key].col10='ספיר';
          if((journalData[key].col11||'')==='') journalData[key].col11='ספיר';
        } catch(_){ }
        const tr=document.createElement('tr'); tr.className='journal-child';
        tr.dataset.journalKey = key;
        // static columns
  // Child row base columns: date, client, project, board, quantity(=1), notes(blank)
  let noteVal = '';
  if (journalData[key] && typeof journalData[key].note === 'string') noteVal = journalData[key].note; // no project fallback (strict)
        const staticVals=[ch.date||'', ch.client||'', ch.projectName||'', ch.boardName||'', 1];
        staticVals.forEach((val)=>{ const td=document.createElement('td'); td.textContent=val; tr.appendChild(td); });
        // Job number column for child (blank)
        const childJobTd=document.createElement('td'); tr.appendChild(childJobTd);
        // Board note column (interactive like project notes)
        const noteTd = document.createElement('td');
        noteTd.className = 'journal-note-cell';
        noteTd.innerHTML = `<div class="note-cell-wrapper" style="position:relative;">
          <span class="note-display" data-has-note="${noteVal?1:0}" style="cursor:${noteVal? 'pointer':'text'};color:${noteVal? '#1565c0':'#333'};font-size:0.78em;white-space:nowrap;">${noteVal? 'הערה קיימת!':''}</span>
          <input type="hidden" class="note-hidden-input" value="${(noteVal||'').replace(/"/g,'&quot;')}">
        </div>`;
        // dblclick opens shared overlay editor from projectTable.js
        noteTd.addEventListener('dblclick', ()=>{
          if (typeof window.openInlineNoteEditor === 'function') {
            window.openInlineNoteEditor(noteTd);
          } else {
            // simple fallback inline prompt
            const nv = prompt('הערה ללוח', noteVal||'')||'';
            noteVal = nv.trim();
            let jd={}; try{ jd=JSON.parse(localStorage.getItem('journalTasks')||'{}'); }catch(e){ jd={}; }
            if(!jd[key]) jd[key]={};
            jd[key].note = noteVal; localStorage.setItem('journalTasks', JSON.stringify(jd));
            const span = noteTd.querySelector('.note-display');
            const hidden = noteTd.querySelector('.note-hidden-input');
            if(span){ span.textContent = noteVal? 'הערה קיימת!':''; span.dataset.hasNote = noteVal? '1':'0'; span.style.cursor = noteVal? 'pointer':'text'; span.style.color = noteVal? '#1565c0':'#333'; }
            if(hidden) hidden.value = noteVal;
          }
        });
        tr.appendChild(noteTd);
        // columns 7-13 (worker selects) now shift right by one due to note column addition
        for(let col=7; col<=13; col++){
          const td=document.createElement('td');
          const currentVal=journalData[key]['col'+col]||'';
          const isDoneState = (col===7 && currentVal==='מאושר לביצוע') || (col>=8 && currentVal==='הסתיים');
          if(isDoneState){
            td.innerHTML = `<button class="journal-done-toggle" data-col="${col}" title="החזר למתן" style="background:none;border:none;cursor:pointer;">`+
              `<span style="color:green;font-size:1.3em;">✔️</span>`+
              `</button>`;
            td.querySelector('.journal-done-toggle').addEventListener('click', (ev)=>{
              ev.preventDefault();
              journalData[key]['col'+col]='מתן';
              localStorage.setItem('journalTasks', JSON.stringify(journalData));
              if (window.showSavedIndicator) window.showSavedIndicator();
              // After revert go to מתן subtab
              setTimeout(()=>{ document.querySelector('.journal-subtab-btn[data-worker="מתן"]')?.click(); },80);
            });
          } else {
            const sel=buildWorkerSelect(currentVal, col);
            sel.addEventListener('change', ()=>{
              // Re-evaluate key in case parts changed (unlikely but safe)
              const newKey = window.__findExistingJournalKey(journalData, ch.date, ch.client, ch.projectName, ch.boardName);
              if(newKey!==key && !journalData[newKey]) journalData[newKey]=journalData[key];
              journalData[newKey]['col'+col]=sel.value;
              localStorage.setItem('journalTasks', JSON.stringify(journalData));
              if (window.showSavedIndicator) window.showSavedIndicator();
              // automation transitions
              if(col===7 && sel.value==='באישור לקוח'){
                setTimeout(()=>{ document.querySelector('.journal-subtab-btn[data-worker="lidor-approval"]')?.click(); },120);
              } else if(col===7 && sel.value==='מאושר לביצוע'){
                setTimeout(()=>{ document.querySelector('.journal-subtab-btn[data-worker="done"]')?.click(); },120);
              } else if(col>=8 && sel.value==='הסתיים'){
                setTimeout(()=>{ document.querySelector('.journal-subtab-btn[data-worker="done"]')?.click(); },150);
              } else {
                if(filterWorker) window.syncJournalTable(filterWorker);
              }
            });
      // color worker value text if exists
      if(currentVal && workerColor[currentVal]) sel.style.color=workerColor[currentVal];
      sel.addEventListener('input', ()=>{ const v=sel.value; sel.style.color=workerColor[v]||'#000'; });
            td.appendChild(sel);
          }
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      });
    });
    // persist snapshot if changed
    try {
      const prev = localStorage.getItem('journalTasks');
      const nextStr = JSON.stringify(journalData);
      if (prev !== nextStr) {
        localStorage.setItem('journalTasks', nextStr);
        try { localStorage.setItem('journalTasks_backup', nextStr); } catch(_){ }
      }
    } catch(_){ }
  } catch(e){ console.warn('syncJournalTable failed', e); }
};

// Board note overlay editor (global)
// Board note feature removed per latest request
