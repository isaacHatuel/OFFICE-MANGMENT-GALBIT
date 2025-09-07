// Simple migration runner: executes new *.sql files in init-scripts not yet in schema_migrations
const fs = require('fs');
const path = require('path');
const db = require('../models/db');

async function ensureTable() {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (id SERIAL PRIMARY KEY, filename TEXT UNIQUE, run_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
}

async function run() {
  const dir = path.join(__dirname, '..', 'init-scripts');
  const files = fs.readdirSync(dir).filter(f => /\d+_.+\.sql$/.test(f)).sort();
  await ensureTable();
  const ran = new Set((await db.query('SELECT filename FROM schema_migrations')).rows.map(r => r.filename));
  for (const f of files) {
    if (ran.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    console.log('Running migration', f);
    try {
      await db.query('BEGIN');
      await db.query(sql);
      await db.query('INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING', [f]);
      await db.query('COMMIT');
    } catch (e) {
      await db.query('ROLLBACK');
      console.error('Migration failed', f, e.message);
      process.exitCode = 1;
      return;
    }
  }
  console.log('Migrations complete');
  process.exit(0);
}

run().catch(err => {
  console.warn('Migration runner skipped (likely no DB reachable):', err.message);
  process.exit(0);
});