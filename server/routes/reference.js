const express = require('express');
const router = express.Router();
const db = require('../models/db');

// GET /api/reference/all -> minimal batching
router.get('/all', async (req, res) => {
  try {
    const [departments, roles, statuses, clients] = await Promise.all([
      db.query('SELECT id,name FROM departments ORDER BY name'),
      db.query('SELECT id,name FROM roles ORDER BY name'),
      db.query('SELECT id,name,is_negative FROM statuses ORDER BY name'),
      db.query('SELECT id,name,active FROM clients ORDER BY name')
    ]);
    res.json({ departments: departments.rows, roles: roles.rows, statuses: statuses.rows, clients: clients.rows });
  } catch (e) { console.error('reference.all error', e); res.status(500).json({ error: 'Failed to load reference data' }); }
});

// Individual endpoints if needed later
router.get('/statuses', async (req, res) => { try { const r = await db.query('SELECT id,name,is_negative FROM statuses ORDER BY name'); res.json(r.rows); } catch (e) { res.status(500).json({ error: 'Failed to load statuses' }); } });
router.get('/departments', async (req, res) => { try { const r = await db.query('SELECT id,name FROM departments ORDER BY name'); res.json(r.rows); } catch (e) { res.status(500).json({ error: 'Failed to load departments' }); } });
router.get('/roles', async (req, res) => { try { const r = await db.query('SELECT id,name FROM roles ORDER BY name'); res.json(r.rows); } catch (e) { res.status(500).json({ error: 'Failed to load roles' }); } });
router.get('/clients', async (req, res) => { try { const r = await db.query('SELECT id,name,active FROM clients ORDER BY name'); res.json(r.rows); } catch (e) { res.status(500).json({ error: 'Failed to load clients' }); } });

module.exports = router;
