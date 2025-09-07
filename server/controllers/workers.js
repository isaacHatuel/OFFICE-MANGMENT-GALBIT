// לוגיקת עובדים
const db = require('../models/db');

exports.getAll = async (req, res) => {
    try {
        const result = await db.query(`SELECT e.id, e.full_name, e.email, e.phone, e.active,
                                              d.name AS department, r.name AS role
                                       FROM employees e
                                       LEFT JOIN departments d ON d.id = e.department_id
                                       LEFT JOIN roles r ON r.id = e.role_id
                                       ORDER BY e.id`);
        res.json(result.rows);
    } catch (err) {
        console.error('workers.getAll error', err);
        res.status(500).json({ error: 'Failed to fetch workers' });
    }
};

exports.create = async (req, res) => {
    const { full_name, email, phone, department, role } = req.body || {};
    if (!full_name) return res.status(400).json({ error: 'full_name required' });
    try {
        const deptId = department ? (await db.query('SELECT id FROM departments WHERE name=$1', [department])).rows[0]?.id : null;
        const roleId = role ? (await db.query('SELECT id FROM roles WHERE name=$1', [role])).rows[0]?.id : null;
        const result = await db.query(
            'INSERT INTO employees (full_name, email, phone, department_id, role_id) VALUES ($1,$2,$3,$4,$5) RETURNING *',
            [full_name, email || null, phone || null, deptId, roleId]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('workers.create error', err);
        res.status(500).json({ error: 'Failed to create worker' });
    }
};
