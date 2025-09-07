// productionTracking.js - extracted production tracking logic from inline script
// Provides: syncProductionTrackingTable (global), ensures dynamic negative status columns, propagates negatives to project rows.

(function(){
  // Expose functions on window for legacy code still calling them
  function syncProductionTrackingTable(){
    const tbody = document.querySelector('#production-tracking-table tbody');
    if(!tbody) return;
    tbody.innerHTML='';
    const structureOptions = ["", "קיים במלאי", "חסר מבנה", "חסר פנאלים", "חסר מודול פנאלים", "בהזמנה", "סופק"];
    const equipmentOptions = ["", "לוקט במלואו", "ממתין לציוד", "חסר ציוד", "ציוד בהזמנה", "ציוד סופק"];
    const assemblyOptions = ["", "בהרכבה", "חסר מרכיבים", "הורכב"];
    const wiringOptions = ["", "בתהליך", "חסר גידים", "הסתיים"];
    const testOptions = ["", "ממתין לבדיקה", "בבדיקה", "נכשל בבדיקה", "הסתיים"];
    const activeRows = document.querySelectorAll('#projects-table-active tbody tr.child-row');
    const doneRows = document.querySelectorAll('#projects-table-done tbody tr.child-row');
    const allRows = [...activeRows, ...doneRows];
    let prodData = {};
    try { prodData = JSON.parse(localStorage.getItem('productionTracking')||'{}'); } catch(e){ prodData={}; }
    const parentInserted = new Set();
    allRows.forEach(tr=>{
      const tds = tr.querySelectorAll('td');
      const dateVal = tds[0]?.querySelector('input')?.value || tds[0]?.innerText || '';
      const clientVal = tds[1]?.querySelector('input')?.value || tds[1]?.innerText || '';
      const projectVal = tds[2]?.querySelector('input')?.value || tds[2]?.innerText || '';
      const boardVal = tds[3]?.querySelector('input')?.value || tds[3]?.innerText || '';
  const workerVal = tds[4]?.querySelector('select')?.value || tds[4]?.querySelector('input')?.value || tds[4]?.innerText || '';
      const statusVal = tds[5]?.querySelector('select')?.value || tds[5]?.innerText || '';
      if(statusVal.trim()==='בייצור'){
        const key = [dateVal,clientVal,projectVal,boardVal].join('|');
        const orderId = tr.dataset.orderId || '';
        // Insert parent row once per orderId
        if(orderId && !parentInserted.has(orderId)) {
          const parentTr = document.createElement('tr');
          parentTr.className='prod-parent-row'; parentTr.dataset.orderId=orderId;
          const collapseTd=document.createElement('td'); collapseTd.style.background='#f1f8ff'; collapseTd.style.fontWeight='600';
          collapseTd.innerHTML = `<button class="prod-collapse" style="cursor:pointer;border:1px solid #90caf9;background:#fff;border-radius:4px;padding:0 6px;">▾</button> ${dateVal}`;
          parentTr.appendChild(collapseTd);
          const rest=[clientVal, projectVal, '', '', 'בייצור'];
          rest.forEach(v=>{ const td=document.createElement('td'); td.style.background='#f1f8ff'; td.style.fontWeight='600'; td.textContent=v; parentTr.appendChild(td); });
          for(let i=0;i<5;i++){ const td=document.createElement('td'); td.style.background='#f1f8ff'; parentTr.appendChild(td); }
          tbody.appendChild(parentTr);
          parentTr.querySelector('.prod-collapse').addEventListener('click', () => {
            const collapsed = parentTr.classList.toggle('collapsed');
            let n = parentTr.nextElementSibling;
            while(n && !n.classList.contains('prod-parent-row')) { if(!collapsed) n.style.display=''; else n.style.display='none'; n=n.nextElementSibling; }
            parentTr.querySelector('.prod-collapse').textContent = collapsed ? '▸' : '▾';
          });
          parentInserted.add(orderId);
        }
        const row = document.createElement('tr');
        // First 6 core columns
        const coreVals=[dateVal,clientVal,projectVal,boardVal,workerVal,statusVal];
        coreVals.forEach(v=>{ const td=document.createElement('td'); td.textContent=v; row.appendChild(td); });
        const addSelect=(opts,val,col)=>{
          const td=document.createElement('td');
            const sel=document.createElement('select');
            opts.forEach(opt=>{ const o=document.createElement('option'); o.value=o.textContent=opt; if(opt===val) o.selected=true; sel.appendChild(o); });
            sel.addEventListener('change',()=>{
              if(!prodData[key]) prodData[key]={};
              prodData[key][col]=sel.value;
              localStorage.setItem('productionTracking', JSON.stringify(prodData));
              syncNegativeStatusesToProjects(key, prodData[key]);
            });
            td.appendChild(sel);
            return td;
        };
        row.appendChild(addSelect(structureOptions, prodData[key]?.structure||"", 'structure'));
        row.appendChild(addSelect(equipmentOptions, prodData[key]?.equipment||"", 'equipment'));
        row.appendChild(addSelect(assemblyOptions, prodData[key]?.assembly||"", 'assembly'));
        row.appendChild(addSelect(wiringOptions, prodData[key]?.wiring||"", 'wiring'));
        row.appendChild(addSelect(testOptions, prodData[key]?.test||"", 'test'));
  tbody.appendChild(row);
  syncNegativeStatusesToProjects(key, prodData[key]);
      }
    });
    updateNegativeStatusHeaders();
    const activeRowsSync = document.querySelectorAll('#projects-table-active tbody tr.child-row');
    let prodDataSync={};
    try { prodDataSync = JSON.parse(localStorage.getItem('productionTracking')||'{}'); } catch(e){}
    activeRowsSync.forEach(tr=>{
      const tds=tr.querySelectorAll('td');
      const keyArr=[tds[0]?.innerText,tds[1]?.innerText,tds[2]?.innerText,tds[3]?.innerText];
      let foundKey=null;
      for(const k in prodDataSync){
        const kArr=k.split('|');
        let match=true;
        for(let i=0;i<4;i++){
          if((keyArr[i]||'').replace(/\s+/g,'').replace(/\D/g,'') !== (kArr[i]||'').replace(/\s+/g,'').replace(/\D/g,'')) match=false;
        }
        if(match){ foundKey=k; break; }
      }
      if(foundKey) syncNegativeStatusesToProjects(foundKey, prodDataSync[foundKey]);
    });
  }

  function syncNegativeStatusesToProjects(key, prodRow){
    const negativeMap=[
      {col:'structure', values:["חסר מבנה","חסר פנאלים","חסר מודול פנאלים","בהזמנה"]},
      {col:'equipment', values:["חסר ציוד","ציוד בהזמנה"]},
      {col:'assembly', values:["חסר מרכיבים"]},
      {col:'wiring', values:["חסר גידים"]},
      {col:'test', values:["נכשל בבדיקה"]}
    ];
    let negatives=[];
    negativeMap.forEach(item=>{ if(prodRow && item.values.includes(prodRow[item.col])) negatives.push(prodRow[item.col]); });
    const allRows=document.querySelectorAll('#projects-table-active tbody tr.child-row');
    for(const tr of allRows){
      const tds=tr.querySelectorAll('td');
      const rowKey=[tds[0].innerText,tds[1].innerText,tds[2].innerText,tds[3].innerText].join('|');
      let notesIdx=-1;
      const thead=tr.parentElement.parentElement.querySelector('thead tr');
      for(let i=0;i<thead.children.length;i++){ if(thead.children[i].innerText.trim()==='הערות'){ notesIdx=i; break; } }
      if(notesIdx===-1) notesIdx=9;
      if(rowKey===key){
        ensureNegativeStatusColumns(negatives.length);
        for(let i=0;i<negatives.length;i++){ if(tds[6+i] && (6+i)<notesIdx) tds[6+i].innerText=negatives[i]; }
        for(let i=negatives.length;(6+i)<notesIdx && i<10;i++){ if(tds[6+i]) tds[6+i].innerText=''; }
      }
    }
    let projects=[]; try { projects=JSON.parse(localStorage.getItem('projects')||'[]'); } catch(e){}
    for(const p of projects){
      if(p.type==='child'){
        const pkey=[p.date,p.client,p.projectName,p.boardName].join('|');
        if(pkey===key){
          for(let i=0;i<negatives.length;i++){ p['neg'+(i+1)]=negatives[i]; }
          for(let i=negatives.length;i<5;i++){ p['neg'+(i+1)]=''; }
          // keep unified array
          p.negStatuses = Array.from(new Set(negatives));
        }
      }
    }
    localStorage.setItem('projects', JSON.stringify(projects));
  }

  function ensureNegativeStatusColumns(count){
    const table=document.getElementById('projects-table-active');
    if(!table) return;
    const thead=table.querySelector('thead tr');
    let notesIdx=-1;
    for(let i=0;i<thead.children.length;i++){ if(thead.children[i].innerText.trim()==='הערות'){ notesIdx=i; break; } }
    if(notesIdx===-1) notesIdx=9;
    let currentNegs=0;
    for(let i=6;i<notesIdx;i++){ if(thead.children[i].innerText.startsWith('סטטוס שלילי')) currentNegs++; }
    const minNegs=3;
    const neededNegs=Math.max(count,minNegs);
    for(let i=currentNegs+1;i<=neededNegs;i++){
      const th=document.createElement('th'); th.innerText='סטטוס שלילי'+(i>1?' '+i:''); thead.insertBefore(th, thead.children[6 + i - 1]);
      const rows=table.querySelectorAll('tbody tr.child-row');
      for(const tr of rows){ const td=document.createElement('td'); tr.insertBefore(td, tr.children[6 + i - 1]); }
    }
    for(let i=thead.children.length-1;i>=6+neededNegs;i--){
      if(thead.children[i].innerText.startsWith('סטטוס שלילי')){
        thead.removeChild(thead.children[i]);
        const rows=table.querySelectorAll('tbody tr.child-row');
        for(const tr of rows){ if(tr.children[i]) tr.removeChild(tr.children[i]); }
      }
    }
  }

  function updateNegativeStatusHeaders(){
    let prodData={};
    try { prodData=JSON.parse(localStorage.getItem('productionTracking')||'{}'); } catch(e){}
    let maxNegs=3;
    for(const key in prodData){
      const prodRow=prodData[key];
      const negativeMap=[
        {col:'structure', values:["חסר מבנה","חסר פנאלים","חסר מודול פנאלים","בהזמנה"]},
        {col:'equipment', values:["חסר ציוד","ציוד בהזמנה"]},
        {col:'assembly', values:["חסר מרכיבים"]},
        {col:'wiring', values:["חסר גידים"]},
        {col:'test', values:["נכשל בבדיקה"]}
      ];
      let negatives=[];
      negativeMap.forEach(item=>{ if(prodRow && item.values.includes(prodRow[item.col])) negatives.push(prodRow[item.col]); });
      if(negatives.length>maxNegs) maxNegs=negatives.length;
    }
    ensureNegativeStatusColumns(maxNegs);
  }

  window.syncProductionTrackingTable = syncProductionTrackingTable;
  window.syncNegativeStatusesToProjects = syncNegativeStatusesToProjects;
  window.ensureNegativeStatusColumns = ensureNegativeStatusColumns;
  window.updateNegativeStatusHeaders = updateNegativeStatusHeaders;

  // Wrap project row mutation functions to keep production tracking synced
  const origAddChildRow = window.addChildRow;
  if (typeof origAddChildRow === 'function') {
    window.addChildRow = function() {
      try { origAddChildRow.apply(this, arguments); }
      finally { try { syncProductionTrackingTable(); } catch(_){} }
    };
  }
  const origUpdateChildRow = window.updateChildRow;
  if (typeof origUpdateChildRow === 'function') {
    window.updateChildRow = function() {
      try { origUpdateChildRow.apply(this, arguments); }
      finally { try { syncProductionTrackingTable(); } catch(_){} }
    };
  }
  const origDeleteProjectRow = window.deleteProjectRow;
  if (typeof origDeleteProjectRow === 'function') {
    window.deleteProjectRow = function() {
      try { origDeleteProjectRow.apply(this, arguments); }
      finally { try { syncProductionTrackingTable(); } catch(_){} }
    };
  }

  window.addEventListener('DOMContentLoaded', ()=>{
    if(typeof syncProductionTrackingTable==='function') syncProductionTrackingTable();
  });
})();
