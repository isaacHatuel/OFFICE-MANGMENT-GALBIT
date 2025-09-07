// Controllers for time entries
const db = require('../models/db');
const { z } = require('zod');

const timeEntryCreateSchema = z.object({
  task: z.string().min(1).optional(),
  employee: z.string().min(1).optional(),
    work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'bad date').optional(),
  minutes: z.number().int().positive('minutes>0'),
  notes: z.string().max(4000).optional()
}).strip();
const timeEntryUpdateSchema = timeEntryCreateSchema.partial().refine(v=>Object.keys(v).length>0,{ message: 'no fields' });

const parsePagination = (req) => {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize) || 25, 1), 200);
  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset };
};

exports.list = async (req, res) => {
  try {
    const { page, pageSize, offset } = parsePagination(req);
    const params = [];
    const clauses = [];
    if (req.query.employee) { params.push(req.query.employee); clauses.push(`e.full_name = $${params.length}`); }
    if (req.query.project) { params.push(req.query.project); clauses.push(`p.name = $${params.length}`); }
    if (req.query.from) { params.push(req.query.from); clauses.push(`te.work_date >= $${params.length}`); }
    if (req.query.to) { params.push(req.query.to); clauses.push(`te.work_date <= $${params.length}`); }
    const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
    const sql = `SELECT te.id, te.work_date, te.minutes, te.notes, te.created_at,
                        t.title AS task, p.name AS project, e.full_name AS employee
                 FROM time_entries te
                 LEFT JOIN tasks t ON t.id = te.task_id
                 LEFT JOIN projects p ON p.id = t.project_id
                 LEFT JOIN employees e ON e.id = te.employee_id
                 ${where}
                 ORDER BY te.work_date DESC, te.id DESC
                 LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    const rows = await db.query(sql, [...params, pageSize, offset]);
    const total = await db.query(`SELECT count(*) AS cnt FROM time_entries te
                 LEFT JOIN tasks t ON t.id = te.task_id
                 LEFT JOIN projects p ON p.id = t.project_id
                 LEFT JOIN employees e ON e.id = te.employee_id ${where}`, params);
    res.json({ page, pageSize, total: parseInt(total.rows[0].cnt), rows: rows.rows });
  } catch (e) { console.error('timeEntries.list error', e); res.status(500).json({ error: 'Failed to list time entries' }); }
};

exports.create = async (req, res) => {
  try {
  const parsed = timeEntryCreateSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map(i => i.message).join(', ') });
  const { task, employee, work_date, minutes, notes } = parsed.data;
    const taskId = task ? (await db.query('SELECT id FROM tasks WHERE title=$1', [task])).rows[0]?.id : null;
    const employeeId = employee ? (await db.query('SELECT id FROM employees WHERE full_name=$1', [employee])).rows[0]?.id : null;
    const ins = await db.query(
      `INSERT INTO time_entries (task_id, employee_id, work_date, minutes, notes)
       VALUES ($1,$2,COALESCE($3,CURRENT_DATE),$4,$5) RETURNING id`,
      [taskId, employeeId, work_date || null, minutes, notes || null]
    );
    res.status(201).json({ id: ins.rows[0].id });
  } catch (e) { console.error('timeEntries.create error', e); res.status(500).json({ error: 'Failed to create time entry' }); }
};

exports.remove = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid id' });
    await db.query('DELETE FROM time_entries WHERE id=$1', [id]);
    res.json({ deleted: true });
  } catch (e) { console.error('timeEntries.remove error', e); res.status(500).json({ error: 'Failed to delete time entry' }); }
};

exports.update = async (req, res) => {
  try {
    const id = parseInt(req.params.id); if (!id) return res.status(400).json({ error: 'invalid id' });
  const parsed = timeEntryUpdateSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map(i => i.message).join(', ') });
    const body = parsed.data;
    const fields = []; const params = [];
    if (body.minutes !== undefined) { params.push(body.minutes); fields.push(`minutes=$${params.length}`); }
    if (body.notes !== undefined) { params.push(body.notes); fields.push(`notes=$${params.length}`); }
    if (body.work_date !== undefined) { params.push(body.work_date || null); fields.push(`work_date=$${params.length}`); }
    if (body.task !== undefined) {
      const tId = body.task ? (await db.query('SELECT id FROM tasks WHERE title=$1',[body.task])).rows[0]?.id : null;
      params.push(tId); fields.push(`task_id=$${params.length}`);
    }
    if (body.employee !== undefined) {
      const eId = body.employee ? (await db.query('SELECT id FROM employees WHERE full_name=$1',[body.employee])).rows[0]?.id : null;
      params.push(eId); fields.push(`employee_id=$${params.length}`);
    }
    if (!fields.length) return res.status(400).json({ error: 'no fields' });
    params.push(id);
    const upd = await db.query(`UPDATE time_entries SET ${fields.join(',')} WHERE id=$${params.length} RETURNING id`, params);
    if (!upd.rows[0]) return res.status(404).json({ error: 'not found' });
    res.json({ updated: true });
  } catch (e) { console.error('timeEntries.update error', e); res.status(500).json({ error: 'Failed to update time entry' }); }
};
