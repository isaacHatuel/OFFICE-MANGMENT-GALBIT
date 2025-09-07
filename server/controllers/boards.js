// @ts-nocheck
// Controllers for project boards (child rows of a project)
const db = require('../models/db');
const { z } = require('zod');

const boardCreateSchema = z.object({
  project: z.union([z.number(), z.string().min(1)]),
  board_name: z.string().max(200).optional().or(z.literal('').transform(()=>undefined)),
  worker: z.string().min(1).optional().or(z.literal('').transform(()=>undefined)),
  status: z.string().min(1).optional().or(z.literal('').transform(()=>undefined)),
  neg_status1: z.string().min(1).optional().or(z.literal('').transform(()=>undefined)),
  neg_status2: z.string().min(1).optional().or(z.literal('').transform(()=>undefined)),
  neg_status3: z.string().min(1).optional().or(z.literal('').transform(()=>undefined)),
  notes: z.string().max(5000).optional(),
  treated: z.boolean().optional(),
  delivered: z.boolean().optional(),
  finished: z.boolean().optional()
}).strip();

const boardUpdateSchema = boardCreateSchema.partial().refine(v=>Object.keys(v).length>0, { message: 'no fields' });

function parsePagination(req) {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize) || 50, 1), 500);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

async function ensureEmployee(fullName) {
  if (!fullName) return null;
  const existing = await db.query('SELECT id FROM employees WHERE full_name=$1', [fullName]);
  if (existing.rows[0]) return existing.rows[0].id;
  // Create minimal employee placeholder (department/role null)
  const ins = await db.query('INSERT INTO employees (full_name) VALUES ($1) RETURNING id', [fullName]);
  return ins.rows[0].id;
}

async function resolveStatus(name) {
  if (!name) return null;
  const r = await db.query('SELECT id FROM statuses WHERE name=$1', [name]);
  return r.rows[0]?.id || null;
}

async function resolveProject(nameOrId) {
  if (!nameOrId) return null;
  if (/^\d+$/.test(String(nameOrId))) {
    const r = await db.query('SELECT id FROM projects WHERE id=$1', [nameOrId]);
    return r.rows[0]?.id || null;
  }
  const r = await db.query('SELECT id FROM projects WHERE name=$1', [nameOrId]);
  return r.rows[0]?.id || null;
}

async function recalcProjectAggregate(projectId) {
  if (!projectId) return;
  try {
    await db.query(`WITH agg AS (
        SELECT COALESCE(bool_and(treated), false) AS treated,
               COALESCE(bool_and(delivered), false) AS delivered,
               COALESCE(bool_and(finished), false) AS finished
        FROM project_boards WHERE project_id = $1
      )
      UPDATE projects p
      SET treated = agg.treated,
          delivered = agg.delivered,
          finished = agg.finished
      FROM agg WHERE p.id = $1`, [projectId]);
  } catch(e) { console.warn('recalcProjectAggregate failed', e.message); }
}

exports.list = async (req, res) => {
  try {
    const { page, pageSize, offset } = parsePagination(req);
    const clauses = [];
    const params = [];
    if (req.query.project) { params.push(req.query.project); clauses.push('(p.name = $' + params.length + ' OR p.id::text = $' + params.length + ')'); }
    if (req.query.finished) { params.push(req.query.finished === 'true'); clauses.push('b.finished = $' + params.length); }
    const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
    const sql = `SELECT b.id, b.board_name, b.notes, b.treated, b.delivered, b.finished, b.created_at,
                        p.id AS project_id, p.name AS project,
                        e.full_name AS worker,
                        s.name AS status,
                        ns1.name AS neg_status1, ns2.name AS neg_status2, ns3.name AS neg_status3
                 FROM project_boards b
                 JOIN projects p ON p.id = b.project_id
                 LEFT JOIN employees e ON e.id = b.worker_id
                 LEFT JOIN statuses s ON s.id = b.status_id
                 LEFT JOIN statuses ns1 ON ns1.id = b.neg_status1_id
                 LEFT JOIN statuses ns2 ON ns2.id = b.neg_status2_id
                 LEFT JOIN statuses ns3 ON ns3.id = b.neg_status3_id
                 ${where}
                 ORDER BY b.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    const rows = await db.query(sql, [...params, pageSize, offset]);
    const total = await db.query(`SELECT count(*) AS cnt FROM project_boards b JOIN projects p ON p.id=b.project_id ${where}`, params);
    res.json({ page, pageSize, total: parseInt(total.rows[0].cnt), rows: rows.rows });
  } catch (e) {
    console.error('boards.list error', e); res.status(500).json({ error: 'Failed to list boards' });
  }
};

exports.create = async (req, res) => {
  try {
  const parsed = boardCreateSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map(i=>i.message).join(', ') });
  const { project, board_name, worker, status, neg_status1, neg_status2, neg_status3, notes, treated, delivered, finished } = parsed.data;
    const projectId = await resolveProject(project);
    if (!projectId) return res.status(400).json({ error: 'project not found' });
    const workerId = await ensureEmployee(worker);
    const statusId = await resolveStatus(status);
    const neg1 = await resolveStatus(neg_status1);
    const neg2 = await resolveStatus(neg_status2);
    const neg3 = await resolveStatus(neg_status3);
    const ins = await db.query(`INSERT INTO project_boards (project_id, board_name, worker_id, status_id, neg_status1_id, neg_status2_id, neg_status3_id, notes, treated, delivered, finished)
                                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,false),COALESCE($10,false),COALESCE($11,false)) RETURNING id, project_id`,
      [projectId, board_name || null, workerId, statusId, neg1, neg2, neg3, notes || null, treated, delivered, finished]);
    await recalcProjectAggregate(ins.rows[0].project_id);
    res.status(201).json({ id: ins.rows[0].id });
  } catch (e) {
    console.error('boards.create error', e); res.status(500).json({ error: 'Failed to create board' });
  }
};

exports.update = async (req, res) => {
  try {
    const id = parseInt(req.params.id); if (!id) return res.status(400).json({ error: 'invalid id' });
  const fields = []; const params = []; let idx; // idx assigned once (eslint prefer-const suppressed below)
  const parsed = boardUpdateSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map(i=>i.message).join(', ') });
  const body = parsed.data;
    async function pushStatus(fieldName, val, column) {
      if (val !== undefined) { const sid = await resolveStatus(val); params.push(sid); fields.push(`${column}=$${params.length}`); }
    }
    if (body.board_name !== undefined) { params.push(body.board_name); fields.push(`board_name=$${params.length}`); }
    if (body.worker !== undefined) { const wid = await ensureEmployee(body.worker); params.push(wid); fields.push(`worker_id=$${params.length}`); }
    await pushStatus('status', body.status, 'status_id');
    await pushStatus('neg_status1', body.neg_status1, 'neg_status1_id');
    await pushStatus('neg_status2', body.neg_status2, 'neg_status2_id');
    await pushStatus('neg_status3', body.neg_status3, 'neg_status3_id');
    if (body.notes !== undefined) { params.push(body.notes); fields.push(`notes=$${params.length}`); }
    ['treated','delivered','finished'].forEach(flag => {
      if (body[flag] !== undefined) { params.push(!!body[flag]); fields.push(`${flag}=$${params.length}`); }
    });
    if (!fields.length) return res.status(400).json({ error: 'no fields' });
  params.push(id); idx = params.length; // eslint-disable-line prefer-const
  const upd = await db.query(`UPDATE project_boards SET ${fields.join(',')} WHERE id=$${idx} RETURNING project_id`, params);
  if (upd.rows[0]) await recalcProjectAggregate(upd.rows[0].project_id);
  res.json({ updated: true });
  } catch (e) { console.error('boards.update error', e); res.status(500).json({ error: 'Failed to update board' }); }
};

exports.remove = async (req, res) => {
  try {
    const id = parseInt(req.params.id); if (!id) return res.status(400).json({ error: 'invalid id' });
  const del = await db.query('DELETE FROM project_boards WHERE id=$1 RETURNING project_id', [id]);
  if (del.rows[0]) await recalcProjectAggregate(del.rows[0].project_id);
  res.json({ deleted: !!del.rows[0] });
  } catch (e) { console.error('boards.remove error', e); res.status(500).json({ error: 'Failed to delete board' }); }
};
