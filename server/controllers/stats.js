// Aggregated statistics & analytics endpoints
const db = require('../models/db');

// Simple in-memory cache (ephemeral). Key = endpoint + sorted query string.
// TTL (ms) default 30s, override via env STATS_CACHE_TTL_MS.
const _cache = new Map();
const STATS_TTL = parseInt(process.env.STATS_CACHE_TTL_MS || '30000');

function cacheGet(key) {
  const hit = _cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > STATS_TTL) { _cache.delete(key); return null; }
  return hit.data;
}
function cacheSet(key, data) { _cache.set(key, { ts: Date.now(), data }); }
function buildKey(req) {
  const q = Object.keys(req.query||{}).sort().map(k=>k+'='+req.query[k]).join('&');
  return req.path+'?'+q;
}

// GET /api/stats/overview
// Returns counts & distribution metrics for dashboard usage.
exports.overview = async (req, res) => {
  try {
    const key = buildKey(req);
    const cached = cacheGet(key); if (cached) return res.json({ cached: true, ...cached });
    const [projCounts, boardCounts, negCounts, recentProjects] = await Promise.all([
      db.query(`SELECT 
          COUNT(*)::int AS total,
          COALESCE(SUM(CASE WHEN finished THEN 1 ELSE 0 END),0)::int AS finished,
          COALESCE(SUM(CASE WHEN delivered THEN 1 ELSE 0 END),0)::int AS delivered,
          COALESCE(SUM(CASE WHEN treated THEN 1 ELSE 0 END),0)::int AS treated
        FROM projects`),
      db.query(`SELECT 
          COUNT(*)::int AS total,
          COALESCE(SUM(CASE WHEN finished THEN 1 ELSE 0 END),0)::int AS finished,
          COALESCE(SUM(CASE WHEN delivered THEN 1 ELSE 0 END),0)::int AS delivered,
          COALESCE(SUM(CASE WHEN treated THEN 1 ELSE 0 END),0)::int AS treated
        FROM project_boards`),
      db.query(`SELECT s.name, COUNT(*)::int AS occurrences
                FROM project_boards b
                LEFT JOIN statuses s ON s.id = ANY(ARRAY[b.neg_status1_id, b.neg_status2_id, b.neg_status3_id])
                WHERE s.is_negative IS TRUE
                GROUP BY s.name
                ORDER BY occurrences DESC, s.name ASC`),
      db.query(`SELECT p.id, p.name, c.name AS client, p.start_date, p.finished, p.delivered
                FROM projects p LEFT JOIN clients c ON c.id = p.client_id
                ORDER BY p.id DESC LIMIT 10`)
    ]);
    const payload = {
      projects: projCounts.rows[0],
      boards: boardCounts.rows[0],
      negativeStatuses: negCounts.rows,
      recentProjects: recentProjects.rows
    };
    cacheSet(key, payload);
    res.json(payload);
  } catch (e) {
    console.error('stats.overview error', e);
    res.status(500).json({ error: 'Failed to compute stats' });
  }
};

// GET /api/stats/time-range?from=YYYY-MM-DD&to=YYYY-MM-DD
exports.timeRange = async (req, res) => {
  try {
    const { from, to } = req.query;
    const params = []; const clauses = [];
    if (from) { params.push(from); clauses.push(`p.start_date >= $${params.length}`); }
    if (to) { params.push(to); clauses.push(`p.start_date <= $${params.length}`); }
    const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
    const key = buildKey(req)+':timeRange';
    const c = cacheGet(key); if (c) return res.json({ cached: true, rows: c });
    const q = await db.query(`SELECT 
        DATE_TRUNC('day', p.start_date)::date AS day,
        COUNT(*)::int AS projects_started,
        SUM(CASE WHEN p.finished THEN 1 ELSE 0 END)::int AS finished
      FROM projects p
      ${where}
      GROUP BY day
      ORDER BY day DESC
      LIMIT 90`, params);
    cacheSet(key, q.rows);
    res.json({ rows: q.rows });
  } catch (e) { console.error('stats.timeRange error', e); res.status(500).json({ error: 'Failed to compute time range stats' }); }
};

// GET /api/stats/top-clients?limit=10
exports.topClients = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit)||10,1),50);
    const key = buildKey(req)+':topClients';
    const cached = cacheGet(key); if (cached) return res.json({ cached: true, rows: cached });
    const q = await db.query(`SELECT c.name AS client, COUNT(*)::int AS project_count,
        SUM(CASE WHEN p.finished THEN 1 ELSE 0 END)::int AS finished_count
      FROM projects p
      LEFT JOIN clients c ON c.id = p.client_id
      GROUP BY c.name
      ORDER BY project_count DESC, client ASC
      LIMIT $1`, [limit]);
    cacheSet(key, q.rows);
    res.json({ rows: q.rows });
  } catch (e) { console.error('stats.topClients error', e); res.status(500).json({ error: 'Failed to compute top clients' }); }
};

// GET /api/stats/status-distribution
exports.statusDistribution = async (req, res) => {
  try {
    const key = buildKey(req)+':statusDist';
    const cached = cacheGet(key); if (cached) return res.json({ cached: true, ...cached });
    const proj = await db.query(`SELECT s.name, COUNT(*)::int AS count
        FROM projects p LEFT JOIN statuses s ON s.id = p.status_id
        GROUP BY s.name ORDER BY count DESC, s.name ASC`);
    const boards = await db.query(`SELECT s.name, COUNT(*)::int AS count
        FROM project_boards b LEFT JOIN statuses s ON s.id = b.status_id
        GROUP BY s.name ORDER BY count DESC, s.name ASC`);
    const payload = { projectStatuses: proj.rows, boardStatuses: boards.rows };
    cacheSet(key, payload); res.json(payload);
  } catch (e) { console.error('stats.statusDistribution error', e); res.status(500).json({ error: 'Failed to compute status distribution' }); }
};

// GET /api/stats/workload?window=30
exports.workload = async (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.window)||30,1),180);
    const key = buildKey(req)+':workload';
    const cached = cacheGet(key); if (cached) return res.json({ cached: true, rows: cached });
    const q = await db.query(`WITH recent AS (
        SELECT * FROM project_boards WHERE created_at >= NOW() - ($1||' days')::interval
      )
      SELECT COALESCE(e.full_name,'(לא משויך)') AS worker,
             COUNT(*)::int AS boards_total,
             SUM(CASE WHEN finished THEN 1 ELSE 0 END)::int AS finished,
             SUM(CASE WHEN delivered THEN 1 ELSE 0 END)::int AS delivered,
             SUM(CASE WHEN treated THEN 1 ELSE 0 END)::int AS treated
      FROM recent r
      LEFT JOIN employees e ON e.id = r.worker_id
      GROUP BY worker
      ORDER BY boards_total DESC, worker ASC`, [days]);
    cacheSet(key, q.rows);
    res.json({ windowDays: days, rows: q.rows });
  } catch (e) { console.error('stats.workload error', e); res.status(500).json({ error: 'Failed to compute workload' }); }
};

// GET /api/stats/negative-trends?days=30
exports.negativeTrends = async (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days)||30,1),120);
    const key = buildKey(req)+':negTrends';
    const cached = cacheGet(key); if (cached) return res.json({ cached: true, rows: cached });
    const q = await db.query(`WITH expanded AS (
        SELECT created_at::date AS day, unnest(ARRAY[neg_status1_id,neg_status2_id,neg_status3_id]) AS sid
        FROM project_boards
        WHERE created_at >= NOW() - ($1||' days')::interval
      )
      SELECT day, s.name, COUNT(*)::int AS occurrences
      FROM expanded e
      JOIN statuses s ON s.id = e.sid
      WHERE s.is_negative
      GROUP BY day, s.name
      ORDER BY day DESC, occurrences DESC`, [days]);
    cacheSet(key, q.rows);
    res.json({ days, rows: q.rows });
  } catch (e) { console.error('stats.negativeTrends error', e); res.status(500).json({ error: 'Failed to compute negative trends' }); }
};
