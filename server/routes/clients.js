const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const db = require('../models/db');

const DATA_FILE = path.join(__dirname,'..','public','clients.json');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

function requireAdmin(req,res,next){
  if(!ADMIN_TOKEN) return res.status(500).json({ error: 'ADMIN_TOKEN not set' });
  if(req.header('x-admin-token') !== ADMIN_TOKEN) return res.status(403).json({ error: 'forbidden' });
  next();
}

function loadFile(){
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    const raw = fs.readFileSync(DATA_FILE,'utf8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr)? arr : [];
  } catch(e){ return []; }
}

function saveFile(list){
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2)); } catch(e){ /* ignore */ }
}

// GET list (prefers DB, falls back to file) for consistency keep name + id if from DB
router.get('/', async (req,res)=>{
  try {
    const r = await db.query('SELECT id,name FROM clients ORDER BY name');
    return res.json({ source:'db', count:r.rows.length, clients:r.rows });
  } catch(dbErr){
    const fileList = loadFile();
    return res.json({ source:'file', count:fileList.length, clients:fileList.map((n,i)=>({ id:null, name:n, idx:i })) });
  }
});

// Export flat JSON file from DB (snapshot)
router.post('/export', requireAdmin, async (req,res)=>{
  try {
    const r = await db.query('SELECT name FROM clients ORDER BY name');
    const names = r.rows.map(x=>x.name);
    saveFile(names);
    res.json({ ok:true, written:names.length });
  } catch(e){ res.status(500).json({ error:'export failed' }); }
});

// Import (append) names from uploaded JSON array body { names:["..."] }
router.post('/import', requireAdmin, express.json(), async (req,res)=>{
  try {
    const names = Array.isArray(req.body?.names)? req.body.names : [];
    if(!names.length) return res.status(400).json({ error:'names array required'});
    let added = 0;
    for(const nRaw of names){
      const n = (nRaw||'').trim();
      if(!n) continue;
      await db.query('INSERT INTO clients(name) VALUES($1) ON CONFLICT DO NOTHING',[n]);
      added++;
    }
    res.json({ ok:true, added });
  } catch(e){ res.status(500).json({ error:'import failed' }); }
});

// Add single client (mirrors reference route but also updates file snapshot lazily)
router.post('/', requireAdmin, express.json(), async (req,res)=>{
  try {
    const name = (req.body?.name||'').trim();
    if(!name) return res.status(400).json({ error:'name required' });
    await db.query('INSERT INTO clients(name) VALUES($1) ON CONFLICT DO NOTHING',[name]);
    // Lazy append if file exists
    const list = loadFile();
    if(!list.includes(name)){ list.push(name); list.sort((a,b)=>a.localeCompare(b,'he')); saveFile(list); }
    const row = await db.query('SELECT id,name FROM clients WHERE name=$1',[name]);
    res.json({ ok:true, client: row.rows[0]||{ id:null, name } });
  } catch(e){ res.status(500).json({ error:'insert failed' }); }
});

// Delete client by id or name
router.delete('/:idOrName', requireAdmin, async (req,res)=>{
  const key = req.params.idOrName;
  let deleted = 0;
  try {
    if(/^[0-9]+$/.test(key)){
      const r = await db.query('DELETE FROM clients WHERE id=$1 RETURNING 1',[parseInt(key,10)]);
      deleted = r.rowCount;
    } else {
      const r = await db.query('DELETE FROM clients WHERE name=$1 RETURNING 1',[key]);
      deleted = r.rowCount;
    }
  } catch(e){ /* ignore DB error -> still try file */ }
  // Update file snapshot if exists
  const list = loadFile();
  const before = list.length;
  const filtered = list.filter(n=> n !== key);
  if(filtered.length !== before) { saveFile(filtered); }
  res.json({ ok:true, deleted });
});

module.exports = router;