// לוגיקת פרויקטים
const db = require('../models/db');
const { z } = require('zod');

const projectCreateSchema = z.object({
    name: z.string().min(1, 'name required'),
    client: z.string().min(1).optional().or(z.literal('').transform(()=>undefined)),
    status: z.string().min(1).optional().or(z.literal('').transform(()=>undefined)),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/,'invalid date').optional().or(z.literal('').transform(()=>undefined)),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/,'invalid date').optional().or(z.literal('').transform(()=>undefined)),
    budget: z.number().positive().optional().or(z.nan().transform(()=>undefined)).or(z.undefined()),
    description: z.string().max(5000).optional(),
    treated: z.boolean().optional(),
    delivered: z.boolean().optional(),
    finished: z.boolean().optional()
}).strip();

const projectUpdateSchema = projectCreateSchema.partial().refine((v)=>Object.keys(v).length>0, { message: 'no fields' });

exports.getAll = async (req, res) => {
    try {
        // Support either page/pageSize or limit/offset styles
        const pageSizeParam = req.query.pageSize || req.query.limit;
        const pageParam = req.query.page;
        let usePagination = false;
        let limit = 0, offset = 0;
        if (pageSizeParam) {
            usePagination = true;
            const ps = Math.min(Math.max(parseInt(pageSizeParam) || 20, 1), 500);
            if (pageParam) {
                const p = Math.max(parseInt(pageParam) || 1, 1);
                limit = ps; offset = (p - 1) * ps;
            } else {
                limit = ps; offset = Math.max(parseInt(req.query.offset) || 0, 0);
            }
        }
    const filters = [];
    const params = [];
    if (req.query.client) { params.push(req.query.client); filters.push(`c.name = $${params.length}`); }
    if (req.query.status) { params.push(req.query.status); filters.push(`s.name = $${params.length}`); }
    if (req.query.q) { params.push('%'+req.query.q+'%'); filters.push(`(p.name ILIKE $${params.length} OR p.description ILIKE $${params.length})`); }
    const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';
    const baseSelect = `SELECT p.id, p.name, p.start_date, p.end_date, p.budget, p.description,
                    p.treated, p.delivered, p.finished, p.deleted_at,
                    c.name AS client, s.name AS status
                 FROM projects p
                 LEFT JOIN clients c ON c.id = p.client_id
                 LEFT JOIN statuses s ON s.id = p.status_id
                 ${where} ${where? ' AND ':'WHERE '} p.deleted_at IS NULL`;
        if (usePagination) {
        const data = await db.query(baseSelect + ` ORDER BY p.id DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, limit, offset]);
        const count = await db.query('SELECT COUNT(*)::int AS total FROM projects p LEFT JOIN clients c ON c.id = p.client_id LEFT JOIN statuses s ON s.id = p.status_id '+where, params);
            return res.json({ rows: data.rows, total: count.rows[0].total, limit, offset });
        } else {
        const all = await db.query(baseSelect + ' ORDER BY p.id DESC', params);
            return res.json(all.rows);
        }
    } catch (err) {
        console.error('projects.getAll error', err);
        res.status(500).json({ error: 'Failed to fetch projects' });
    }
};

exports.create = async (req, res) => {
    const parsed = projectCreateSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map(i=>i.message).join(', ') });
    const { name, client, status, start_date, end_date, budget, description } = parsed.data;
    try {
        const clientId = client ? (await db.query('SELECT id FROM clients WHERE name=$1', [client])).rows[0]?.id : null;
        const statusId = status ? (await db.query('SELECT id FROM statuses WHERE name=$1', [status])).rows[0]?.id : null;
        const result = await db.query(
            'INSERT INTO projects (name, client_id, status_id, start_date, end_date, budget, description, treated, delivered, finished) VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,false),COALESCE($9,false),COALESCE($10,false)) RETURNING id,name,start_date,end_date,budget,description,treated,delivered,finished',
            [name, clientId, statusId, start_date || null, end_date || null, budget || null, description || null, !!parsed.data.treated, !!parsed.data.delivered, !!parsed.data.finished]
        );
        const created = result.rows[0];
        created.client = client || null;
        created.status = status || null;
        res.status(201).json(created);
    } catch (err) {
        console.error('projects.create error', err);
        res.status(500).json({ error: 'Failed to create project' });
    }
};

exports.update = async (req, res) => {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid id' });
    const parsed = projectUpdateSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map(i=>i.message).join(', ') });
    const body = parsed.data;
    const fields = [];
    const params = [];
    try {
        if (body.name !== undefined) { params.push(body.name); fields.push(`name=$${params.length}`); }
        if (body.client !== undefined) {
            const cId = body.client ? (await db.query('SELECT id FROM clients WHERE name=$1', [body.client])).rows[0]?.id : null;
            params.push(cId); fields.push(`client_id=$${params.length}`);
        }
        if (body.status !== undefined) {
            const sId = body.status ? (await db.query('SELECT id FROM statuses WHERE name=$1', [body.status])).rows[0]?.id : null;
            params.push(sId); fields.push(`status_id=$${params.length}`);
        }
        if (body.start_date !== undefined) { params.push(body.start_date || null); fields.push(`start_date=$${params.length}`); }
        if (body.end_date !== undefined) { params.push(body.end_date || null); fields.push(`end_date=$${params.length}`); }
        if (body.budget !== undefined) { params.push(body.budget || null); fields.push(`budget=$${params.length}`); }
        if (body.description !== undefined) { params.push(body.description || null); fields.push(`description=$${params.length}`); }
        ['treated','delivered','finished'].forEach(flag => {
            if (body[flag] !== undefined) { params.push(!!body[flag]); fields.push(`${flag}=$${params.length}`); }
        });
        if (!fields.length) return res.status(400).json({ error: 'no fields' });
        params.push(id);
        await db.query(`UPDATE projects SET ${fields.join(',')} WHERE id=$${params.length}`, params);
        res.json({ updated: true });
    } catch (err) {
        console.error('projects.update error', err);
        res.status(500).json({ error: 'Failed to update project' });
    }
};

exports.remove = async (req, res) => {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid id' });
    try {
        if (req.query.soft === 'true') {
            // Mark soft deleted
            await db.query('UPDATE projects SET deleted_at = NOW() WHERE id=$1', [id]);
            await db.query('UPDATE project_boards SET deleted_at = NOW() WHERE project_id=$1', [id]);
            return res.json({ deleted: true, soft: true });
        }
        // Explicit cascade physical delete (fallback)
        await db.query('DELETE FROM project_boards WHERE project_id=$1', [id]);
        const del = await db.query('DELETE FROM projects WHERE id=$1 RETURNING id', [id]);
        res.json({ deleted: !!del.rows[0], soft: false });
    } catch (err) {
        console.error('projects.remove error', err);
        res.status(500).json({ error: 'Failed to delete project' });
    }
};
