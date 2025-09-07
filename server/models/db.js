// חיבור ל-PostgreSQL (יחיד – הוסר שכפול)
const { Pool } = require('pg');
const pool = new Pool({
	host: process.env.DB_HOST || 'db',
	user: process.env.DB_USER || 'officeuser',
	password: process.env.DB_PASSWORD || 'officepass',
	database: process.env.DB_NAME || 'officedb',
	port: parseInt(process.env.DB_PORT, 10) || 5432,
	max: 20,
	idleTimeoutMillis: 30_000
});

pool.on('error', err => {
	console.error('PG pool error', err);
});

module.exports = pool;
