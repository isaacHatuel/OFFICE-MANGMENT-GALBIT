// לוגיקת יומן משימות
const db = require('../models/db');
const { z } = require('zod');

const journalCreateSchema = z.object({
    description: z.string().min(1, 'description required'),
    employee: z.string().min(1).optional(),
    project: z.string().min(1).optional(),
    status: z.string().min(1).optional(),
    entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/,'bad date').optional()
}).strip();

const journalUpdateSchema = journalCreateSchema.partial().refine(v => Object.keys(v).length > 0, { message: 'no fields' });

// GET /api/journal?from=2025-09-01&to=2025-09-04&employee=ישראל&project=XYZ&status=בייצור
exports.getAll = async (req, res) => {
    try {
        const { from, to, employee, project, status, q } = req.query;
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const pageSize = Math.min(Math.max(parseInt(req.query.pageSize) || 50, 1), 500);
        const offset = (page - 1) * pageSize;
        const clauses = [];
        const params = [];
        if (from) { params.push(from); clauses.push(`j.entry_date >= $${params.length}`); }
        if (to) { params.push(to); clauses.push(`j.entry_date <= $${params.length}`); }
        if (employee) { params.push(employee); clauses.push(`e.full_name = $${params.length}`); }
        if (project) { params.push(project); clauses.push(`p.name = $${params.length}`); }
        if (status) { params.push(status); clauses.push(`s.name = $${params.length}`); }
        if (q) { params.push('%' + q + '%'); clauses.push(`j.description ILIKE $${params.length}`); }
        const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
        const baseSelect = `FROM journal_entries j
            LEFT JOIN employees e ON e.id = j.employee_id
            LEFT JOIN projects  p ON p.id = j.project_id
            LEFT JOIN statuses  s ON s.id = j.status_id`;
        const rows = await db.query(
            `SELECT j.id, j.entry_date, j.description, e.full_name AS employee, p.name AS project,
                            s.name AS status, s.is_negative, j.created_at ${baseSelect} ${where}
             ORDER BY j.entry_date DESC, j.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
            [...params, pageSize, offset]
        );
        const total = await db.query(`SELECT count(*) AS cnt ${baseSelect} ${where}`, params);
        res.json({ page, pageSize, total: parseInt(total.rows[0].cnt), rows: rows.rows });
    } catch (err) {
        console.error('journal.getAll error', err);
    res.status(500).json({ error: 'Failed to fetch journal entries' });
    }
};

exports.create = async (req, res) => {
    const parsed = journalCreateSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map(i => i.message).join(', ') });
    const { description, employee, project, status, entry_date } = parsed.data;
    try {
        // Lookups (case-insensitive fallback)
        const employeeId = employee ? (await db.query(
            'SELECT id FROM employees WHERE full_name=$1 OR full_name ILIKE $2 LIMIT 1', [employee, employee]
        )).rows[0]?.id : null;
        const projectId = project ? (await db.query(
            'SELECT id FROM projects WHERE name=$1 OR name ILIKE $2 LIMIT 1', [project, project]
        )).rows[0]?.id : null;
        const statusId = status ? (await db.query(
            'SELECT id FROM statuses WHERE name=$1 OR name ILIKE $2 LIMIT 1', [status, status]
        )).rows[0]?.id : null;

        const dateVal = (entry_date && /^\d{4}-\d{2}-\d{2}$/.test(entry_date)) ? entry_date : null; // let DB default if null

        const insert = await db.query(
            `INSERT INTO journal_entries (description, employee_id, project_id, status_id, entry_date)
             VALUES ($1,$2,$3,$4,COALESCE($5, CURRENT_DATE))
             RETURNING id`,
            [description, employeeId, projectId, statusId, dateVal]
        );

                res.status(201).json({ id: insert.rows[0].id });
    } catch (err) {
        console.error('journal.create error', err);
    res.status(500).json({ error: 'Failed to create journal entry' });
    }
};

exports.update = async (req, res) => {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid id' });
    const parsed = journalUpdateSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map(i => i.message).join(', ') });
    const body = parsed.data;
    try {
        const fields = []; const params = [];
        if (body.description !== undefined) { params.push(body.description); fields.push(`description=$${params.length}`); }
        if (body.employee !== undefined) {
            const q = await db.query('SELECT id FROM employees WHERE full_name=$1 OR full_name ILIKE $1 LIMIT 1',[body.employee]);
            params.push(q.rows[0]?.id || null); fields.push(`employee_id=$${params.length}`);
        }
        if (body.project !== undefined) {
            const q = await db.query('SELECT id FROM projects WHERE name=$1 OR name ILIKE $1 LIMIT 1',[body.project]);
            params.push(q.rows[0]?.id || null); fields.push(`project_id=$${params.length}`);
        }
        if (body.status !== undefined) {
            const q = await db.query('SELECT id FROM statuses WHERE name=$1 OR name ILIKE $1 LIMIT 1',[body.status]);
            params.push(q.rows[0]?.id || null); fields.push(`status_id=$${params.length}`);
        }
        if (body.entry_date !== undefined) { params.push(body.entry_date || null); fields.push(`entry_date=$${params.length}`); }
        if (!fields.length) return res.status(400).json({ error: 'no fields' });
        params.push(id);
        const upd = await db.query(`UPDATE journal_entries SET ${fields.join(',')} WHERE id=$${params.length} RETURNING id`, params);
        if (!upd.rows[0]) return res.status(404).json({ error: 'not found' });
        res.json({ updated: true });
    } catch (err) {
    console.error('journal.update error', err); res.status(500).json({ error: 'Failed to update journal entry' });
    }
};

exports.remove = async (req, res) => {
    const id = parseInt(req.params.id); if (!id) return res.status(400).json({ error: 'invalid id' });
    try {
        const del = await db.query('DELETE FROM journal_entries WHERE id=$1 RETURNING id',[id]);
        if (!del.rows[0]) return res.status(404).json({ error: 'not found' });
        res.json({ deleted: true });
    } catch (err) { console.error('journal.remove error', err); res.status(500).json({ error: 'Failed to delete journal entry' }); }
};
