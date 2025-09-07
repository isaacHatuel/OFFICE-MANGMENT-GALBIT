// Controllers for tasks CRUD
const db = require('../models/db');

const parsePagination = (req) => {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize) || 25, 1), 200);
  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset };
};

exports.list = async (req, res) => {
  try {
    const { page, pageSize, offset } = parsePagination(req);
    const clauses = [];
    const params = [];
    if (req.query.project) { params.push(req.query.project); clauses.push(`p.name = $${params.length}`); }
    if (req.query.status) { params.push(req.query.status); clauses.push(`s.name = $${params.length}`); }
    const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
    const sql = `SELECT t.id, t.title, t.due_date, t.created_at, t.description,
                        p.name AS project, s.name AS status,
                        e.full_name AS assigned_employee
                 FROM tasks t
                 LEFT JOIN projects p ON p.id = t.project_id
                 LEFT JOIN statuses s ON s.id = t.status_id
                 LEFT JOIN employees e ON e.id = t.assigned_employee_id
                 ${where}
                 ORDER BY t.id DESC
                 LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    const result = await db.query(sql, [...params, pageSize, offset]);
    const total = await db.query(`SELECT count(*) AS cnt FROM tasks t
                 LEFT JOIN projects p ON p.id = t.project_id
                 LEFT JOIN statuses s ON s.id = t.status_id
                 ${where}`, params);
    res.json({ page, pageSize, total: parseInt(total.rows[0].cnt), rows: result.rows });
  } catch (e) {
    console.error('tasks.list error', e); res.status(500).json({ error: 'Failed to list tasks' });
  }
};

exports.create = async (req, res) => {
  try {
    const { title, project, status, assigned_employee, description, due_date } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title required' });
    const projectId = project ? (await db.query('SELECT id FROM projects WHERE name=$1', [project])).rows[0]?.id : null;
    const statusId = status ? (await db.query('SELECT id FROM statuses WHERE name=$1', [status])).rows[0]?.id : null;
    const employeeId = assigned_employee ? (await db.query('SELECT id FROM employees WHERE full_name=$1', [assigned_employee])).rows[0]?.id : null;
    const ins = await db.query(
      `INSERT INTO tasks (title, project_id, status_id, assigned_employee_id, description, due_date)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [title, projectId, statusId, employeeId, description || null, due_date || null]
    );
    res.status(201).json({ id: ins.rows[0].id });
  } catch (e) { console.error('tasks.create error', e); res.status(500).json({ error: 'Failed to create task' }); }
};

exports.update = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid id' });
    const fields = [];
    const params = [];
    const mapLookup = async (val, table, col) => val ? (await db.query(`SELECT id FROM ${table} WHERE ${col}=$1`, [val])).rows[0]?.id : null;
    if (req.body.title !== undefined) { params.push(req.body.title); fields.push(`title=$${params.length}`); }
    if (req.body.project !== undefined) { const pid = await mapLookup(req.body.project, 'projects', 'name'); params.push(pid); fields.push(`project_id=$${params.length}`); }
    if (req.body.status !== undefined) { const sid = await mapLookup(req.body.status, 'statuses', 'name'); params.push(sid); fields.push(`status_id=$${params.length}`); }
    if (req.body.assigned_employee !== undefined) { const eid = await mapLookup(req.body.assigned_employee, 'employees', 'full_name'); params.push(eid); fields.push(`assigned_employee_id=$${params.length}`); }
    if (req.body.description !== undefined) { params.push(req.body.description); fields.push(`description=$${params.length}`); }
    if (req.body.due_date !== undefined) { params.push(req.body.due_date); fields.push(`due_date=$${params.length}`); }
    if (!fields.length) return res.status(400).json({ error: 'no fields' });
    params.push(id);
    await db.query(`UPDATE tasks SET ${fields.join(',')} WHERE id=$${params.length}`, params);
    res.json({ updated: true });
  } catch (e) { console.error('tasks.update error', e); res.status(500).json({ error: 'Failed to update task' }); }
};

exports.remove = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid id' });
    await db.query('DELETE FROM tasks WHERE id=$1', [id]);
    res.json({ deleted: true });
  } catch (e) { console.error('tasks.remove error', e); res.status(500).json({ error: 'Failed to delete task' }); }
};
