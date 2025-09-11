const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const db = require('../models/db');

// Snapshot file (persisted via volume similar to clients.json)
const DATA_FILE = path.join(__dirname,'..','public','workers.json');
// Built-in fallback list (UTF-8) in case file missing / corrupted / empty
const DEFAULT_WORKERS = [
  'מוהנד','איציק','לידור','ספיר','מתן','ישראל','אליהו','עידו','גרישה','ליאוניד','ניקולאי','סמואל','ראובן'
];
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

function requireAdmin(req,res,next){
  if(!ADMIN_TOKEN) return res.status(500).json({ error: 'ADMIN_TOKEN not set' });
  if(req.header('x-admin-token') !== ADMIN_TOKEN) return res.status(403).json({ error: 'forbidden' });
  next();
}

function looksCorrupted(str){ return /׳/.test(str); }
function loadFile(){
  try {
    if(!fs.existsSync(DATA_FILE)) return [];
    const raw = fs.readFileSync(DATA_FILE,'utf8');
    const arr = JSON.parse(raw);
    if(!Array.isArray(arr)) return [];
    // Filter out obviously corrupted mojibake entries
    const cleaned = arr.filter(n => typeof n === 'string' && n.trim() && !looksCorrupted(n));
    return cleaned;
  } catch(e){ return []; }
}
function saveFile(list){
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2)); } catch(e) { /* ignore */ }
}

async function seedFromFileIfEmpty() {
  try {
    const r = await db.query('SELECT COUNT(*)::int AS c FROM employees');
    if (r.rows[0].c === 0) {
      let list = loadFile();
      if(!list.length) list = DEFAULT_WORKERS.slice();
      for (const n of list) {
        const name = (n||'').trim(); if(!name) continue;
        try { await db.query('INSERT INTO employees(full_name) VALUES($1) ON CONFLICT DO NOTHING',[name]); } catch(_){}
      }
    }
  } catch(_) { /* swallow */ }
}

// GET workers (prefer DB; if empty, seed from file then re-query; if DB error, fallback file)
router.get('/', async (req,res) => {
  try {
    await seedFromFileIfEmpty();
    let r = await db.query('SELECT id, full_name FROM employees ORDER BY full_name');
    if (r.rows.length === 0) {
      // fallback to file (even after seed attempt)
      const fileList = loadFile();
      return res.json({ source:'file', count:fileList.length, workers: fileList.map((n,i)=>({ id:null, name:n, idx:i })) });
    }
    return res.json({ source:'db', count:r.rows.length, workers: r.rows.map(w=>({ id:w.id, name:w.full_name })) });
  } catch(dbErr){
    const fileList = loadFile();
    return res.json({ source:'file', count:fileList.length, workers: fileList.map((n,i)=>({ id:null, name:n, idx:i })) });
  }
});

// Export snapshot (flat JSON names)
router.post('/export', requireAdmin, async (req,res)=>{
  try {
    const r = await db.query('SELECT full_name FROM employees ORDER BY full_name');
    const names = r.rows.map(x=>x.full_name);
    saveFile(names);
    res.json({ ok:true, written:names.length });
  } catch(e){ res.status(500).json({ error:'export failed' }); }
});

// Import names (append) body { names:["..."] }
router.post('/import', requireAdmin, express.json(), async (req,res)=>{
  try {
    const names = Array.isArray(req.body?.names)? req.body.names : [];
    if(!names.length) return res.status(400).json({ error:'names array required' });
    let added = 0;
    for(const nRaw of names){
      const n = (nRaw||'').trim(); if(!n) continue;
      await db.query('INSERT INTO employees(full_name) VALUES($1) ON CONFLICT DO NOTHING',[n]);
      added++;
    }
    res.json({ ok:true, added });
  } catch(e){ res.status(500).json({ error:'import failed' }); }
});

// Add single worker (name)
router.post('/', requireAdmin, express.json(), async (req,res)=>{
  try {
    const name = (req.body?.name||'').trim();
    if(!name) return res.status(400).json({ error:'name required' });
    await db.query('INSERT INTO employees(full_name) VALUES($1) ON CONFLICT DO NOTHING',[name]);
    const list = loadFile();
    if(!list.includes(name)){ list.push(name); list.sort((a,b)=>a.localeCompare(b,'he')); saveFile(list); }
    const row = await db.query('SELECT id, full_name FROM employees WHERE full_name=$1',[name]);
    res.json({ ok:true, worker: row.rows[0]? { id:row.rows[0].id, name: row.rows[0].full_name } : { id:null, name } });
  } catch(e){ res.status(500).json({ error:'insert failed' }); }
});

// Delete worker by id or name
router.delete('/:idOrName', requireAdmin, async (req,res)=>{
  const key = req.params.idOrName;
  let deleted = 0;
  try {
    if(/^[0-9]+$/.test(key)){
      const r = await db.query('DELETE FROM employees WHERE id=$1 RETURNING 1',[parseInt(key,10)]); deleted = r.rowCount;
    } else {
      const r = await db.query('DELETE FROM employees WHERE full_name=$1 RETURNING 1',[key]); deleted = r.rowCount;
    }
  } catch(e){ /* ignore */ }
  const list = loadFile();
  const before = list.length;
  const filtered = list.filter(n=> n !== key);
  if(filtered.length !== before) saveFile(filtered);
  res.json({ ok:true, deleted });
});

module.exports = router;
