// journalUI.js - extracted from inline index2.html journal tab logic
// Handles: initial sync of projects -> journalTasks, dynamic worker tabs, subtab filtering, dialog interactions

(function(){
  function safeParse(key,def){ try { return JSON.parse(localStorage.getItem(key)||def); } catch(e){ return JSON.parse(def); } }

  function initialSync() {
    try {
      let projects = safeParse('projects','[]');
      let journalData = safeParse('journalTasks','{}');
      projects.forEach(p => {
        if (!p || p.type==='parent') return; // only child rows
        if (!p.orderId || !p.client || !p.projectName || !p.date) return;
        const key = [p.date, p.client, p.projectName, p.boardName].join('|');
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
        const key = [p.date, p.client, p.projectName, p.boardName].join('|');
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
      });
    });
  }

  function activateDefaultTab() {
    const allBtn = document.querySelector('.journal-subtab-btn[data-worker="all"]');
  if (allBtn) { allBtn.style.background='#1976d2'; allBtn.style.color='#fff'; }
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
    // load journal assignment data (col7-col13 etc)
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
        const key=[ch.date,ch.client,ch.projectName,ch.boardName].join('|');
        const rowData=journalData[key];
        return rowIncluded(rowData, filterWorker);
      });
      if (!pChildren.length) return; // skip if no visible children for this filter
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
      // Notes column for parent
      if(!journalData[parentKey]) journalData[parentKey] = journalData[parentKey] || {};
      const parentNoteVal = (journalData[parentKey] && journalData[parentKey].note) ? journalData[parentKey].note : '';
      const noteTd = document.createElement('td');
      noteTd.style.background = '#eef6fb';
      noteTd.innerHTML = `<div class="journal-note-cell note-cell-wrapper" style="position:relative;">
          <span class="note-display" data-has-note="${parentNoteVal?1:0}" style="cursor:${parentNoteVal? 'pointer':'text'};color:${parentNoteVal? '#1565c0':'#333'};font-size:0.85em;white-space:nowrap;">${parentNoteVal? 'הערה קיימת!':''}</span>
          <input type="hidden" class="note-hidden-input" value="${parentNoteVal.replace(/"/g,'&quot;')}">
        </div>`;
      pr.appendChild(noteTd);
      // Remaining 8 task columns placeholders (col7-col13)
      for(let i=0;i<8;i++){ const td=document.createElement('td'); td.style.background='#eef6fb'; pr.appendChild(td); }
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
        const key = [ch.date,ch.client,ch.projectName,ch.boardName].join('|');
        if (window.assignJournalEntry) window.assignJournalEntry(key, { date:ch.date, client:ch.client, projectName:ch.projectName, boardName:ch.boardName });
        if(!journalData[key]) journalData[key]={};
        const tr=document.createElement('tr'); tr.className='journal-child';
        tr.dataset.journalKey = key;
        // static columns
  // Child row base columns: date, client, project, board, quantity(=1), notes(blank)
        const noteVal = journalData[key].note || '';
        const staticVals=[ch.date||'', ch.client||'', ch.projectName||'', ch.boardName||'', 1];
        staticVals.forEach((val)=>{ const td=document.createElement('td'); td.textContent=val; tr.appendChild(td); });
        // notes cell
        const notesTd = document.createElement('td');
        notesTd.innerHTML = `<div class="journal-note-cell note-cell-wrapper" style="position:relative;">
            <span class="note-display" data-has-note="${noteVal?1:0}" style="cursor:${noteVal? 'pointer':'text'};color:${noteVal? '#1565c0':'#333'};font-size:0.85em;white-space:nowrap;">${noteVal? 'הערה קיימת!':''}</span>
            <input type="hidden" class="note-hidden-input" value="${noteVal.replace(/"/g,'&quot;')}">
          </div>`;
        tr.appendChild(notesTd);
        // columns 7-13 with selects
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
              // After revert go to מתן subtab
              setTimeout(()=>{ document.querySelector('.journal-subtab-btn[data-worker="מתן"]')?.click(); },80);
            });
          } else {
            const sel=buildWorkerSelect(currentVal, col);
            sel.addEventListener('change', ()=>{
              journalData[key]['col'+col]=sel.value;
              localStorage.setItem('journalTasks', JSON.stringify(journalData));
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
    // persist any initialization of journalData
    localStorage.setItem('journalTasks', JSON.stringify(journalData));

    // Bind double-click to open note editor for all journal note cells (parent + child)
    function bindJournalNoteCells(){
      Array.from(tbody.querySelectorAll('.journal-note-cell')).forEach(cell => {
        const td = cell.closest('td');
        if(td && !td._journalNoteBound){
          td.addEventListener('dblclick', (ev) => {
            try { console.debug('[journal] dblclick note cell', td.dataset.journalKey || td.parentElement?.dataset?.journalKey); } catch(_){}
            if (typeof window.openInlineNoteEditor === 'function') window.openInlineNoteEditor(td);
            else {
              // retry shortly if function not yet on window
              setTimeout(()=>{ if (typeof window.openInlineNoteEditor === 'function') window.openInlineNoteEditor(td); }, 250);
            }
          });
          // also bind directly on inner span to be safe
          const span = td.querySelector('.note-display');
          if(span && !span._noteSpanBound){
            span.addEventListener('dblclick', (ev) => {
              ev.stopPropagation();
              if (typeof window.openInlineNoteEditor === 'function') window.openInlineNoteEditor(td);
            });
            span._noteSpanBound = true;
          }
          td._journalNoteBound = true;
        }
      });
    }
    bindJournalNoteCells();
    // Delegation fallback (in case future rows injected without full rebuild)
    if(!tbody._journalNoteDelegated){
      tbody.addEventListener('dblclick', (e)=>{
        const wrapper = e.target.closest && e.target.closest('.journal-note-cell');
        if(wrapper){
          const td = wrapper.closest('td');
            if(td){
              if (typeof window.openInlineNoteEditor === 'function') window.openInlineNoteEditor(td);
            }
        }
      });
      tbody._journalNoteDelegated = true;
    }
  } catch(e){ console.warn('syncJournalTable failed', e); }
};
