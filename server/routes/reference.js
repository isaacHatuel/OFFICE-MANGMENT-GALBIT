const express = require('express');
const router = express.Router();
const db = require('../models/db');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

// GET /api/reference/all -> minimal batching
router.get('/all', async (req, res) => {
  try {
    const [departments, roles, statuses, clients, employees] = await Promise.all([
      db.query('SELECT id,name FROM departments ORDER BY name').catch(()=>({ rows: [] })),
      db.query('SELECT id,name FROM roles ORDER BY name').catch(()=>({ rows: [] })),
      db.query('SELECT id,name,is_negative FROM statuses ORDER BY name').catch(()=>({ rows: [] })),
      db.query('SELECT id,name FROM clients ORDER BY name').catch(()=>({ rows: [] })),
      db.query('SELECT id,full_name AS name FROM employees ORDER BY full_name').catch(()=>({ rows: [] }))
    ]);
    // Normalize shape and add synthetic active=true for compatibility if frontend expects it
    const normClients = clients.rows.map(c => ({ id: c.id, name: c.name, active: true }));
    const normWorkers = employees.rows.map(w => ({ id: w.id, name: w.name, active: true }));
    res.json({ departments: departments.rows, roles: roles.rows, statuses: statuses.rows, clients: normClients, workers: normWorkers });
  } catch (e) {
    console.error('reference.all fatal error', e);
    res.status(500).json({ error: 'Failed to load reference data' });
  }
});

// Individual endpoints if needed later
router.get('/statuses', async (req, res) => { try { const r = await db.query('SELECT id,name,is_negative FROM statuses ORDER BY name'); res.json(r.rows); } catch (e) { res.status(500).json({ error: 'Failed to load statuses' }); } });
router.get('/departments', async (req, res) => { try { const r = await db.query('SELECT id,name FROM departments ORDER BY name'); res.json(r.rows); } catch (e) { res.status(500).json({ error: 'Failed to load departments' }); } });
router.get('/roles', async (req, res) => { try { const r = await db.query('SELECT id,name FROM roles ORDER BY name'); res.json(r.rows); } catch (e) { res.status(500).json({ error: 'Failed to load roles' }); } });
router.get('/clients', async (req, res) => { try { const r = await db.query('SELECT id,name,active FROM clients ORDER BY name'); res.json(r.rows); } catch (e) { res.status(500).json({ error: 'Failed to load clients' }); } });
router.get('/workers', async (req, res) => { try { const r = await db.query('SELECT id,full_name AS name,active FROM workers ORDER BY full_name'); res.json(r.rows); } catch (e) { res.status(500).json({ error: 'Failed to load workers' }); } });

// --- Mutations (protected) ---
function requireAdmin(req,res,next){
  const tok = req.header('x-admin-token');
  if(!ADMIN_TOKEN){
    return res.status(500).json({ error: 'ADMIN_TOKEN not configured on server' });
  }
  if(tok !== ADMIN_TOKEN){
    return res.status(403).json({ error: 'forbidden' });
  }
  next();
}

router.post('/clients', requireAdmin, express.json(), async (req,res)=>{
  try {
    const name = (req.body?.name||'').trim();
    if(!name) return res.status(400).json({ error: 'name required' });
    await db.query('INSERT INTO clients(name) VALUES($1) ON CONFLICT DO NOTHING',[name]);
    const row = await db.query('SELECT id,name FROM clients WHERE name=$1',[name]);
    res.json({ ok:true, client: row.rows[0]||null });
  } catch(e){
    console.error('add client failed', e); res.status(500).json({ error: 'insert failed' });
  }
});

router.post('/employees', requireAdmin, express.json(), async (req,res)=>{
  try {
    const fullName = (req.body?.full_name||req.body?.name||'').trim();
    if(!fullName) return res.status(400).json({ error: 'full_name required' });
    await db.query('INSERT INTO employees(full_name) VALUES($1) ON CONFLICT DO NOTHING',[fullName]);
    const row = await db.query('SELECT id,full_name AS name FROM employees WHERE full_name=$1',[fullName]);
    res.json({ ok:true, employee: row.rows[0]||null });
  } catch(e){
    console.error('add employee failed', e); res.status(500).json({ error: 'insert failed' });
  }
});

module.exports = router;
