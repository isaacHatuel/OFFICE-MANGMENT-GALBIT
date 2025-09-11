// stateStore.js - מרכז כתיבה/מיזוג עבור projects (שלב ראשון) למניעת דריסות
// מספק API גלובלי: window.stateStore
// אחריות: החזקת מצב בזיכרון, patch נקודתי, upsert קבוצתי, merge מול שרת, flush אטומי + רוטציית גיבויים

const MERGE_EDITABLE_FIELDS = ['date','client','projectName','boardName','worker','status','negStatuses','neg1','neg2','neg3','notes','treated','delivered','finished','collapsed'];

class ProjectsStateStore {
  constructor(){
    this._map = new Map();
    this._dirty = false;
    this._flushTimer = null;
    this._loaded = false;
    this._suppressWarn = false; // כדי שכתיבת flush לא תזהר עצמה
  }
  _keyOf(r){
    if(!r) return null;
    if(r.type==='parent') return 'P:'+r.orderId;
    if(r.type==='child') return 'C:'+r.orderId+'|'+(r.boardName||'');
    return null;
  }
  init(){ if(!this._loaded) this._load(); }
  _load(){
    this._map.clear();
  let arr=[]; // localStorage disabled: start empty each load
    const now = Date.now();
    for(const r of arr){
      if(!r || !r.type || !r.orderId) continue;
      if(!r.lastLocalEdit) r.lastLocalEdit = now;
      const k=this._keyOf(r); if(k) this._map.set(k, r);
    }
    this._loaded=true;
  }
  getProjects(){ this.init(); return Array.from(this._map.values()); }
  replaceAllFromArray(arr, origin='replaceAll'){
    if(!Array.isArray(arr)) return;
    const now=Date.now();
    const next=new Map();
    for(const r of arr){ if(!r||!r.type||!r.orderId) continue; if(!r.lastLocalEdit) r.lastLocalEdit=now; const k=this._keyOf(r); if(k) next.set(k,r);} 
    this._map=next; this._dirty=true; this.flushSoon(origin);
  }
  bulkUpsert(records, origin='bulkUpsert'){
    if(!Array.isArray(records)) return;
    const now=Date.now(); let any=false;
    for(const r of records){
      if(!r||!r.type||!r.orderId) continue;
      if(!r.lastLocalEdit) r.lastLocalEdit=now;
      const k=this._keyOf(r); if(!k) continue;
      const prev=this._map.get(k);
      if(!prev){ this._map.set(k,r); any=true; continue; }
      const { lastLocalEdit:_, ...a } = prev; const { lastLocalEdit:__, ...b } = r;
      if(JSON.stringify(a)!==JSON.stringify(b)){
        const lle = Math.max(prev.lastLocalEdit||0, r.lastLocalEdit||0, now);
        this._map.set(k, { ...prev, ...r, lastLocalEdit: lle });
        any=true;
      }
    }
    if(any){ this._dirty=true; this.flushSoon(origin); }
  }
  patchProject(keyObj, fields, origin='patch'){
    if(!keyObj || !keyObj.type || !keyObj.orderId) return;
    const k=this._keyOf({ type:keyObj.type, orderId:keyObj.orderId, boardName:keyObj.boardName||'' });
    if(!k) return; let rec=this._map.get(k);
    if(!rec){ rec={ type:keyObj.type, orderId:keyObj.orderId, boardName:keyObj.boardName||'', lastLocalEdit: Date.now() }; this._map.set(k, rec); }
    let changed=false; Object.keys(fields||{}).forEach(f=>{ if(rec[f]!==fields[f]){ rec[f]=fields[f]; changed=true; } });
    if(changed){ rec.lastLocalEdit=Date.now(); this._dirty=true; this.flushSoon(origin); }
  }
  mergeServer(serverList, fetchStartTs, origin='mergeServer'){
    if(!Array.isArray(serverList)) return;
    const now=Date.now();
    const serverMap=new Map();
    for(const r of serverList){ if(!r||!r.type||!r.orderId) continue; if(!r.lastLocalEdit) r.lastLocalEdit=now; const k=this._keyOf(r); if(k) serverMap.set(k,{...r}); }
    for(const [k, localRec] of this._map.entries()){
      const srv = serverMap.get(k);
      if(!srv){ serverMap.set(k, localRec); continue; }
      if(localRec.lastLocalEdit && fetchStartTs && localRec.lastLocalEdit > fetchStartTs){
        for(const f of MERGE_EDITABLE_FIELDS){ if(localRec[f] !== undefined) srv[f] = localRec[f]; }
        srv.lastLocalEdit = Math.max(localRec.lastLocalEdit, srv.lastLocalEdit||0, now);
      } else {
        srv.lastLocalEdit = Math.max(localRec.lastLocalEdit||0, srv.lastLocalEdit||0, now);
      }
    }
    this._map = serverMap; this._dirty=true; this.flushSoon(origin);
  }
  _rotateBackups(_prevStr){ /* disabled */ }
  flushSoon(reason){ try { if(this._flushTimer) clearTimeout(this._flushTimer); } catch(_){} this._flushTimer = setTimeout(()=> this.flushNow(reason), 120); }
  flushNow(reason='manual'){
    if(!this._dirty) return;
    const arr = this.getProjects().slice();
    arr.sort((a,b)=> (a.type===b.type)?0 : (a.type==='parent'?-1:1));
    const json = JSON.stringify(arr);
  try { console.debug('[stateStore] flush (memory only)', { reason, count: arr.length }); } catch(_){ }
    this._dirty=false;
    try { document.dispatchEvent(new CustomEvent('projects:updated')); } catch(_){ }
  }
}

if(!window.stateStore){
  window.stateStore = new ProjectsStateStore();
  window.stateStore.init();
}

export {}; // ESM conformity
