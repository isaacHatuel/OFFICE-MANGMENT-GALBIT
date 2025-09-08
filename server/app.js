// שרת ראשי Express
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const db = require('./models/db');
const { SERVER_PORT } = require('./config');

// In-memory sliding window rate limiter (IP->timestamps array)
const RATE_LIMIT_MAX = 600; // per 60s
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateStore = new Map();

const app = express();
app.set('trust proxy', true);
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors());
app.use(express.json({ limit: '256kb' }));

app.use((req, res, next) => {
	const ip = req.ip || 'unknown';
	const now = Date.now();
	const bucket = rateStore.get(ip) || [];
	// purge old
	while (bucket.length && now - bucket[0] > RATE_LIMIT_WINDOW_MS) bucket.shift();
	bucket.push(now);
	rateStore.set(ip, bucket);
	if (bucket.length > RATE_LIMIT_MAX) return res.status(429).json({ error: 'Too many requests' });
	next();
});

// Serve only explicit public folder (avoid exposing repo root)
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir, { maxAge: '1h', index: 'index.html', fallthrough: true }));
// Whitelist root files (index2.html, main.css, main.js, frontend assets)
// Serve selected root files ONLY if they actually exist on filesystem (in production might not be needed when nginx handles them)
['/index2.html','/main.css','/main.js'].forEach(f => {
	const relative = f.replace(/^\//,''); // remove leading slash for path.join
	const filePath = path.join(__dirname, '..', relative);
	if (fs.existsSync(filePath)) {
		app.get(f, (req,res) => res.sendFile(filePath));
	}
});
app.use('/frontend', express.static(path.join(__dirname, '..', 'frontend'), { maxAge: '1h' }));

// Root: serve SPA from server/public (index2.html placed there for dev)
app.get(['/','/index2.html'], (req,res) => {
	const spa = path.join(publicDir,'index2.html');
	if (fs.existsSync(spa)) return res.sendFile(spa);
	return res.status(500).send('index2.html missing in public');
});

// Routes
app.use('/api/projects', require('./routes/projects'));
app.use('/api/journal', require('./routes/journal'));
app.use('/api/workers', require('./routes/workers'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/time-entries', require('./routes/timeEntries'));
app.use('/api/reference', require('./routes/reference'));
app.use('/api/boards', require('./routes/boards'));
app.use('/api/stats', require('./routes/stats'));

// Health
app.get('/api/health', async (req, res) => {
	try {
		await db.query('SELECT 1');
		res.json({ status: 'ok' });
	} catch (e) {
		res.status(500).json({ status: 'error', detail: e.message });
	}
});

// API root index (so GET /api/ won't 404)
app.get(['/api','/api/'], (req,res) => {
	res.json({
		status: 'ok',
		message: 'API root',
		endpoints: [
			'/api/health',
			'/api/projects',
			'/api/journal',
			'/api/workers',
			'/api/tasks',
			'/api/time-entries',
			'/api/reference',
			'/api/boards',
			'/api/stats'
		]
	});
});

// 404
app.use('/api', (req, res, next) => {
	if (!res.headersSent) return res.status(404).json({ error: 'Not found' });
	next();
});

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
	console.error('API error', err);
	res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

const server = app.listen(SERVER_PORT, () => console.log('Server listening on', SERVER_PORT));

function gracefulExit(signal) {
	console.log(`Received ${signal} – shutting down gracefully`);
	server.close(() => {
		db.end?.().catch(()=>{}).finally(()=> process.exit(0));
	});
	// force after 10s
	setTimeout(()=>process.exit(1), 10_000).unref();
}
['SIGINT','SIGTERM'].forEach(sig => process.on(sig, () => gracefulExit(sig)));

process.on('uncaughtException', err => {
	console.error('Uncaught exception', err);
});
process.on('unhandledRejection', err => {
	console.error('Unhandled rejection', err);
});
