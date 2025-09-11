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
// Serve only needed frontend bundle (all logic now lives under index2.html + modules)
['/index2.html'].forEach(f => {
	const relative = f.slice(1);
	const filePath = path.join(__dirname, '..', relative);
	if (fs.existsSync(filePath)) {
		app.get(f, (req,res) => res.sendFile(filePath));
	}
});
app.get('/index.html', (req,res) => res.redirect(301, '/index2.html'));
app.use('/frontend', express.static(path.join(__dirname, '..', 'frontend'), { maxAge: '1h' }));

// Root: serve SPA (index2.html). If missing in public (dev), fallback to root copy.
app.get('/', (req,res) => {
	const spaPublic = path.join(publicDir,'index2.html');
	if (fs.existsSync(spaPublic)) return res.sendFile(spaPublic);
	const rootCopy = path.join(__dirname,'..','index2.html');
	if (fs.existsSync(rootCopy)) return res.sendFile(rootCopy);
	return res.status(500).send('index2.html missing');
});

// Routes
app.use('/api/projects', require('./routes/projects'));
app.use('/api/journal', require('./routes/journal'));
app.use('/api/workers', require('./routes/workers'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/time-entries', require('./routes/timeEntries'));
app.use('/api/reference', require('./routes/reference'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/worker-names', require('./routes/workerNames')); // flat names snapshot UI mgmt
app.use('/api/boards', require('./routes/boards'));
app.use('/api/stats', require('./routes/stats'));

// Lightweight flag so frontend can detect admin capability without exposing token
if (process.env.ADMIN_TOKEN) {
	app.get('/admin-flag.js', (req, res) => {
		res.type('application/javascript').send('window.__HAS_ADMIN__=true;');
	});
	// Also expose under /api so it passes through frontend nginx proxy rules
	app.get('/api/admin-flag.js', (req, res) => {
		res.type('application/javascript').send('window.__HAS_ADMIN__=true;');
	});
}

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
			'/api/clients',
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

// --- Development live-reload (SSE) ---
if (process.env.NODE_ENV !== 'production') {
	const watchers = [];
	const clients = new Set();
	const ssePath = '/__livereload';
	app.get(ssePath, (req,res) => {
		res.writeHead(200, {
			'Content-Type':'text/event-stream',
			'Cache-Control':'no-cache',
			'Connection':'keep-alive',
			'Access-Control-Allow-Origin':'*'
		});
		res.write('\n');
		clients.add(res);
		req.on('close', ()=> clients.delete(res));
	});
	function broadcast(){
		for(const c of clients){ try { c.write('event: reload\n'); c.write('data: now\n\n'); } catch(_){ /* ignore */ } }
	}
	const watchDirs = [path.join(__dirname,'public'), path.join(__dirname,'..','frontend')];
	watchDirs.forEach(dir => {
		try {
			if (fs.existsSync(dir)) {
				const w = fs.watch(dir, { recursive:true }, (et,fn) => {
					if(!fn) return; if(/\.\w+$/.test(fn)) broadcast();
				});
				watchers.push(w);
				console.log('[live-reload] watching', dir);
			}
		} catch(e){ console.warn('[live-reload] watch failed', dir, e.message); }
	});
	process.on('exit', ()=> watchers.forEach(w=>{ try { w.close(); } catch(_){ } }));
}

// Dev asset sync: copy root-level SPA assets into server/public so Express can serve them without duplication pains
if (process.env.NODE_ENV !== 'production') {
	const sourceBase = process.env.STATIC_ALT || path.join(__dirname, '..');
	const targets = ['index2.html','main.css','main.js','dashboard.html'];
	function syncOnce() {
		targets.forEach(f => {
			const src = path.join(sourceBase, f);
			const dst = path.join(publicDir, f);
			try {
				if (fs.existsSync(src)) {
					const needCopy = !fs.existsSync(dst) || fs.statSync(src).mtimeMs > fs.statSync(dst).mtimeMs;
					if (needCopy) {
						fs.copyFileSync(src, dst);
						console.log('[dev-sync] copied', f);
					}
				}
			} catch (e) { console.warn('[dev-sync] failed', f, e.message); }
		});
	}
	syncOnce();
	setInterval(syncOnce, 5000).unref();
}

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
