// NOTE: Transitional file. Legacy UI logic lives mostly inside index2.html inline scripts.
// This module now also loads reference data from backend and overrides static arrays defined later in the page.
import { loadReference, listProjects, listBoards, createProject, createBoard, updateBoard, updateProject, deleteBoard, deleteProject } from './api.js';
import './modules/journalStorage.js';

// --- Local-first workflow helpers ---
const _creationQueue = [];
let _processingQueue = false;
let _queueLoaded = false;
let _formSubmitting = false;

function persistQueue() {
	try { localStorage.setItem('__creationQueue', JSON.stringify(_creationQueue)); } catch(e) {}
}
function loadQueue() {
	if (_queueLoaded) return; _queueLoaded = true;
	try {
		const raw = JSON.parse(localStorage.getItem('__creationQueue')||'[]');
		if (Array.isArray(raw)) raw.forEach(item => _creationQueue.push(item));
	} catch(e) {}
}

function loadLocalProjects() {
	try { return JSON.parse(localStorage.getItem('projects') || '[]'); } catch(e){ return []; }
}
function saveLocalProjects(arr) {
	localStorage.setItem('projects', JSON.stringify(arr));
	if (typeof window.loadProjectsFromStorage === 'function') {
		try { window.loadProjectsFromStorage(); } catch(e){ console.warn('loadProjectsFromStorage failed', e); }
	}
	document.dispatchEvent(new CustomEvent('projects:updated'));
	markUnsyncedProjects();
}

function generateOrderId() {
	const d = new Date();
	return 'PRJ-' + d.getFullYear() + (''+(d.getMonth()+1)).padStart(2,'0') + (''+d.getDate()).padStart(2,'0') + '-' + Math.random().toString(36).slice(2,6).toUpperCase();
}

function upsertJournal(parent, children) {
	if (!window.assignJournalEntry) return; // merge-safe writer defined in index2.html
	const date = parent.date || new Date().toLocaleDateString('he-IL');
	// Parent entry (boardName empty marker)
	const parentKey = [date, parent.client||'', parent.projectName||'', ''].join('|');
	window.assignJournalEntry(parentKey, { date, client: parent.client||'', projectName: parent.projectName||'', boardName: '' });
	(children||[]).forEach(c => {
		const key = [c.date||date, c.client||parent.client||'', c.projectName||parent.projectName||'', c.boardName||''].join('|');
		window.assignJournalEntry(key, { date: c.date||date, client: c.client||parent.client||'', projectName: c.projectName||parent.projectName||'', boardName: c.boardName||'' });
	});
}

function addProjectLocal({ client, projectName, boardName, quantity, notes, status, worker, neg1, neg2, neg3, negStatuses, treated, delivered, finished }) {
	const projects = loadLocalProjects();
	const orderId = generateOrderId();
	const date = new Date().toLocaleDateString('he-IL');
	const parent = { type: 'parent', orderId, projectId: null, date, client, projectName, notes: notes||'', treated: !!treated, delivered: !!delivered, finished: !!finished, collapsed: false, status: status||'' };
	projects.push(parent);
	const children = [];
	for (let i=1;i<=quantity;i++) {
		let bn;
		if (boardName && quantity>1) bn = `${boardName} #${i}`; else if (boardName) bn = boardName; else bn = quantity>1 ? `לוח ${i}` : 'לוח';
		let negArr = Array.isArray(negStatuses) ? negStatuses.slice(0,10) : [neg1,neg2,neg3].filter(Boolean);
		const child = { type:'child', orderId, projectId: null, boardId: null, date, client, projectName, boardName: bn, worker: worker||'', status: status||'', negStatuses: negArr, neg1: negArr[0]||'', neg2: negArr[1]||'', neg3: negArr[2]||'', notes: notes||'', treated: !!treated, delivered: !!delivered, finished: !!finished };
		projects.push(child); children.push(child);
	}
	saveLocalProjects(projects);
	upsertJournal(parent, children);
	return { orderId, parent, children };
}

function queueServerCreation(localMeta) {
	_creationQueue.push(localMeta);
	persistQueue();
	processQueue();
}

async function processQueue() {
	if (_processingQueue) return; _processingQueue = true;
	loadQueue();
	while (_creationQueue.length) {
		const item = _creationQueue.shift();
		try {
			const { parent, children, orderId, formValues } = item;
			// Create project on server
			const project = await createProject({ name: parent.projectName, client: parent.client, status: parent.status || formValues.status || undefined, description: parent.notes });
			// Update local entries with projectId
			const all = loadLocalProjects();
			all.forEach(r => { if (r.orderId === orderId) r.projectId = project.id; });
			saveLocalProjects(all);
			// Create boards sequentially
			for (const child of children) {
				try {
					const resp = await createBoard({
						project: project.id,
						board_name: child.boardName,
						worker: child.worker || null,
						status: child.status || null,
						neg_status1: child.neg1 || null,
						neg_status2: child.neg2 || null,
						neg_status3: child.neg3 || null,
						notes: child.notes || '',
						treated: child.treated,
						delivered: child.delivered,
						finished: child.finished
					});
					// map board id
					const updated = loadLocalProjects();
					const target = updated.find(r => r.orderId === orderId && r.type==='child' && r.boardId === null && r.boardName === child.boardName);
						if (target) target.boardId = resp.id;
					saveLocalProjects(updated);
				} catch(boardErr){ console.warn('createBoard failed', boardErr); }
			}
		} catch(e) {
			console.error('Server creation failed (will not retry automatically)', e);
						// push back for retry later
						_creationQueue.push(item);
						persistQueue();
						break; // exit loop to avoid tight error spin
		}
					persistQueue();
	}
	_processingQueue = false;
				persistQueue();
}

async function updateServerFromChildRow(rowObj) {
	// Ensure legacy fields reflect negStatuses (first 3 only) before sending
	if (Array.isArray(rowObj.negStatuses)) {
		rowObj.neg1 = rowObj.negStatuses[0] || '';
		rowObj.neg2 = rowObj.negStatuses[1] || '';
		rowObj.neg3 = rowObj.negStatuses[2] || '';
	}
	if (rowObj.boardId) {
		try { await updateBoard(rowObj.boardId, {
			board_name: rowObj.boardName,
			worker: rowObj.worker || null,
			status: rowObj.status || null,
			neg_status1: rowObj.neg1 || null,
			neg_status2: rowObj.neg2 || null,
			neg_status3: rowObj.neg3 || null,
			notes: rowObj.notes || '',
			treated: !!rowObj.treated,
			delivered: !!rowObj.delivered,
			finished: !!rowObj.finished
		}); } catch(e){ console.warn('updateBoard server sync failed', e.message); }
	}
	if (rowObj.projectId && rowObj.type==='parent') {
		try { await updateProject(rowObj.projectId, { name: rowObj.projectName, client: rowObj.client, description: rowObj.notes, treated: rowObj.treated, delivered: rowObj.delivered, finished: rowObj.finished }); } catch(e){ console.warn('updateProject server sync failed', e.message); }
	}
}
// expose for legacy inline usage
window.updateServerFromChildRow = updateServerFromChildRow;

function findLocalEntry(predicate){
	const all = loadLocalProjects();
	return all.find(predicate);
}

// --- Unsynced marking (used for journal visual) ---
function markUnsyncedProjects() {
	const all = loadLocalProjects();
	const unsyncedKeys = new Set();
	all.filter(r=>r.type==='child' && (!r.boardId || !r.projectId)).forEach(r => {
		const key = [r.date, r.client||'', r.projectName||'', r.boardName||''].join('|');
		unsyncedKeys.add(key);
	});
	window.__unsyncedJournalKeys = unsyncedKeys;
	document.dispatchEvent(new CustomEvent('journal:unsynced')); // listener in index2.html can re-mark
}

// CSV export
function exportProjectsCsv() {
	const rows = loadLocalProjects();
	// New CSV: include unified negStatuses pipe-joined plus legacy first three
	const headers = ['type','orderId','projectId','boardId','date','client','projectName','boardName','worker','status','negStatuses','neg1','neg2','neg3','notes','treated','delivered','finished'];
	const csvRows = rows.map(r => {
		const rowObj = { ...r };
		rowObj.negStatuses = Array.isArray(r.negStatuses) ? r.negStatuses.join('|') : [r.neg1,r.neg2,r.neg3].filter(Boolean).join('|');
		return headers.map(h => JSON.stringify(rowObj[h]===undefined?'':rowObj[h])).join(',');
	});
	const csv = [headers.join(',')].concat(csvRows).join('\n');
	// UTF-8 BOM for Excel compatibility
	const blob = new Blob(['\uFEFF' + csv], { type:'text/csv;charset=utf-8;' });
	const a = document.createElement('a');
	a.href = URL.createObjectURL(blob); a.download = 'projects_export.csv'; a.click();
	setTimeout(()=> URL.revokeObjectURL(a.href), 5000);
}

// Manual server sync (merge only new projects that are missing locally) 
async function manualServerSync() {
	try {
		const local = loadLocalProjects();
		const existingOrderIds = new Set(local.filter(r=>r.type==='parent').map(r=>r.orderId));
		const projects = await listProjects();
		const boardsResp = await listBoards({ pageSize: 500 });
		const boards = boardsResp.rows || [];
		const byProject = new Map(); boards.forEach(b => { if(!byProject.has(b.project_id)) byProject.set(b.project_id, []); byProject.get(b.project_id).push(b); });
		let changed = false;
		projects.forEach(p => {
			const orderId = 'PRJ-' + p.id;
			if (existingOrderIds.has(orderId)) return; // skip existing
			const date = p.start_date ? new Date(p.start_date).toLocaleDateString('he-IL') : new Date().toLocaleDateString('he-IL');
			local.push({ type:'parent', orderId, projectId: p.id, date, client: p.client||'', projectName: p.name||'', notes: p.description||'', treated: !!p.treated, delivered: !!p.delivered, finished: !!p.finished, collapsed:false, status:p.status||'' });
			(byProject.get(p.id)||[]).sort((a,b)=>a.id-b.id).forEach((b,idx)=>{
				let bn = b.board_name || ((byProject.get(p.id).length>1)? `לוח ${idx+1}` : 'לוח');
				const negArr = [b.neg_status1, b.neg_status2, b.neg_status3].filter(Boolean);
				local.push({ type:'child', orderId, projectId: p.id, boardId: b.id, date, client: p.client||'', projectName: p.name||'', boardName: bn, worker: b.worker||'', status: b.status||'', negStatuses: negArr, neg1: negArr[0]||'', neg2: negArr[1]||'', neg3: negArr[2]||'', notes: b.notes||'', treated: !!b.treated, delivered: !!b.delivered, finished: !!b.finished });
			});
			changed = true;
		});
		if (changed) saveLocalProjects(local); else alert('אין נתונים חדשים מהשרת');
	} catch(e){ alert('סנכרון נכשל: '+ e.message); }
}

// Checkbox server sync (delegated call from index2.html possible)
window.syncCheckboxServerUpdate = async function(row) {
	if (!row) return;
	await updateServerFromChildRow(row);
};

// renderProjectsTable הוסר כדי למנוע קונפליקט עם הרינדור הלגאסי ב-index2.html
function renderProjectsTable() { /* disabled */ }

// --- מיגרציית סכימת פרויקטים (שלב C) ---
const PROJECTS_SCHEMA_VERSION = 1;
function migrateProjectsSchema() {
	try {
		const currentVersion = parseInt(localStorage.getItem('__projectsSchemaVersion')||'0');
		if (currentVersion >= PROJECTS_SCHEMA_VERSION) return; // כבר מעודכן
		const raw = JSON.parse(localStorage.getItem('projects')||'[]');
		if (!Array.isArray(raw)) return;
		let changed = false;
		raw.forEach(r => {
			if (r && r.type === 'child') {
				if (!Array.isArray(r.negStatuses)) {
					const arr = [r.neg1, r.neg2, r.neg3].filter(Boolean);
					if (arr.length) { r.negStatuses = Array.from(new Set(arr)); changed = true; }
				}
			}
		});
		if (changed) localStorage.setItem('projects', JSON.stringify(raw));
		localStorage.setItem('__projectsSchemaVersion', String(PROJECTS_SCHEMA_VERSION));
	} catch(e) { console.warn('migrateProjectsSchema failed', e); }
}


window.addEventListener('DOMContentLoaded', function() {
	migrateProjectsSchema();
	// הוסף כפתור ניקוי
	let btn = document.createElement('button');
	btn.innerText = 'נקה את כל הפרויקטים והיומן';
	btn.style = 'position:fixed;top:10px;left:10px;z-index:9999;background:#e53935;color:#fff;padding:8px 18px;border:none;border-radius:8px;cursor:pointer;font-weight:bold;box-shadow:0 2px 8px #0002;';
	btn.onclick = () => window.clearAllData && window.clearAllData();
	document.body.appendChild(btn);

	// כפתור סנכרון מהשרת
	const syncBtn = document.createElement('button');
	syncBtn.innerText = 'סנכרון מהשרת';
	syncBtn.style = 'position:fixed;top:10px;left:230px;z-index:9999;background:#0288d1;color:#fff;padding:8px 18px;border:none;border-radius:8px;cursor:pointer;font-weight:bold;box-shadow:0 2px 8px #0002;';
	syncBtn.onclick = manualServerSync;
	document.body.appendChild(syncBtn);

	// כפתור CSV
	const csvBtn = document.createElement('button');
	csvBtn.innerText = 'ייצוא CSV (UTF-8 BOM)';
	csvBtn.style = 'position:fixed;top:10px;left:380px;z-index:9999;background:#00796b;color:#fff;padding:8px 18px;border:none;border-radius:8px;cursor:pointer;font-weight:bold;box-shadow:0 2px 8px #0002;';
	csvBtn.onclick = exportProjectsCsv;
	document.body.appendChild(csvBtn);

	// לא מרנדר כאן – הרינדור הלגאסי ידאג לטבלה
	// אפשר להוסיף כאן רינדור ראשוני למודולים נוספים
});

// Late load (after window load) so it overrides static arrays declared further down in index2.html
window.addEventListener('load', async () => {
	if (window.LEGACY_FORM) { 
		console.info('[projects-sync] Skipping auto API sync (LEGACY_FORM enabled)');
		return; 
	}
	try {
		const ref = await loadReference();
		// Preserve original values for debugging
		window._legacyClients = window.clients;
		window._legacyWorkers = window.workers;
		// Map backend data to legacy global variable names (so existing dialogs keep working)
		if (ref?.clients) {
			window.clients = ref.clients.map(c => c.name).sort((a,b)=>a.localeCompare(b,'he')); // replace
		}
		if (ref?.departments && !window.departments) {
			window.departments = ref.departments.map(d=>d.name);
		}
		if (ref?.roles && !window.roles) {
			window.roles = ref.roles.map(r=>r.name);
		}
		if (ref?.statuses) {
			// Separate negative vs normal for future use
			const normal = ref.statuses.filter(s=>!s.is_negative).map(s=>s.name);
			const negative = ref.statuses.filter(s=>s.is_negative).map(s=>s.name);
			// If legacy arrays exist, merge unique
			if (Array.isArray(window.statusOptions)) {
				window.statusOptions = Array.from(new Set([...window.statusOptions, ...normal]));
			} else {
				window.statusOptions = normal;
			}
			if (Array.isArray(window.negativeStatuses)) {
				window.negativeStatuses = Array.from(new Set([...window.negativeStatuses, ...negative]));
			} else {
				window.negativeStatuses = negative;
			}
		}
		document.dispatchEvent(new CustomEvent('refdata:updated'));
		console.info('[refdata] Loaded from backend. Clients:', window.clients?.length, 'Statuses:', window.statusOptions?.length);
	} catch (e) {
		console.warn('Failed to load reference data from backend, using legacy static lists.', e.message);
	}
		// After reference load, try syncing projects/boards from backend (read-only, transitional)
		try {
			await syncProjectsFromApi();
		} catch (e) {
			console.warn('Project sync from API failed, falling back to localStorage only.', e.message);
		}
});

// Consumers (legacy scripts) can listen and refresh selects if needed:
// document.addEventListener('refdata:updated', ()=> { /* re-fill selects */ });

async function syncProjectsFromApi() {
	// Fetch and build legacy parent + child format expected by existing inline scripts.
	const projects = await listProjects();
	const boardsResp = await listBoards({ pageSize: 500 });
	const boards = boardsResp.rows || [];
	// Group boards by project for name sequencing when blank
	const boardsByProject = new Map();
	boards.forEach(b => {
		if (!boardsByProject.has(b.project_id)) boardsByProject.set(b.project_id, []);
		boardsByProject.get(b.project_id).push(b);
	});
	// Ensure stable ordering (oldest first) so numbering consistent
	boardsByProject.forEach(arr => arr.sort((a,b)=>a.id - b.id));
	const legacy = [];
	projects.forEach(p => {
		const orderId = 'PRJ-' + p.id;
		legacy.push({
			type: 'parent',
			orderId,
			projectId: p.id,
			date: p.start_date ? new Date(p.start_date).toLocaleDateString('he-IL') : new Date().toLocaleDateString('he-IL'),
			client: p.client || '',
			projectName: p.name || '',
			notes: p.description || '',
			treated: !!p.treated,
			delivered: !!p.delivered,
			finished: !!p.finished,
			collapsed: false
		});
		const projBoards = boardsByProject.get(p.id) || [];
		projBoards.forEach((b, idx) => {
			let bn = b.board_name || '';
			if (!bn) bn = projBoards.length > 1 ? `לוח ${idx+1}` : 'לוח';
			const negArr = [b.neg_status1, b.neg_status2, b.neg_status3].filter(Boolean);
			legacy.push({
				type: 'child',
				orderId,
				projectId: p.id,
				boardId: b.id,
				date: p.start_date ? new Date(p.start_date).toLocaleDateString('he-IL') : new Date().toLocaleDateString('he-IL'),
				client: p.client || '',
				projectName: p.name || '',
				boardName: bn,
				worker: b.worker || '',
				status: b.status || '',
				negStatuses: negArr,
				neg1: negArr[0]||'',
				neg2: negArr[1]||'',
				neg3: negArr[2]||'',
				notes: b.notes || '',
				treated: !!b.treated,
				delivered: !!b.delivered,
				finished: !!b.finished
			});
		});
	});
	localStorage.setItem('projects', JSON.stringify(legacy));
	if (typeof window.loadProjectsFromStorage === 'function') {
		try { window.loadProjectsFromStorage(); }
		catch(e){ console.error('[projects-sync] loadProjectsFromStorage failed', e); }
	} else {
		console.warn('[projects-sync] loadProjectsFromStorage not found at time of sync');
	}
	if (typeof window.syncProductionTrackingTable === 'function') {
		try { window.syncProductionTrackingTable(); } catch(_) {}
	}
	document.dispatchEvent(new CustomEvent('projects:updated'));
	console.info('[projects-sync] Loaded', projects.length, 'projects and', boards.length, 'boards from API (parent+child legacy mapping)');
}

// Intercept legacy project form to use API instead of localStorage (gradual migration)

document.addEventListener('DOMContentLoaded', () => {
	if (window.LEGACY_FORM) { console.info('[project-form] legacy mode active, skipping module interception'); return; }
	const form = document.getElementById('project-form');
	if (!form || window.__projectFormHijacked) return; // avoid multiple attach
	window.__projectFormHijacked = true;
	form.addEventListener('submit', async (e) => {
		// Local-first create or update
		e.preventDefault();
		const fd = new FormData(form);
		const payload = {
			projectName: fd.get('projectName')?.trim(),
			client: fd.get('client')?.trim(),
			status: fd.get('status')?.trim(),
			boardName: fd.get('boardName')?.trim(),
			quantity: parseInt(fd.get('quantity')||'1') || 1,
			notes: fd.get('notes')?.trim(),
			worker: fd.get('worker')?.trim(),
			neg1: fd.get('neg1')?.trim(),
			neg2: fd.get('neg2')?.trim(),
			neg3: fd.get('neg3')?.trim(),
			negStatuses: [fd.get('neg1')?.trim(), fd.get('neg2')?.trim(), fd.get('neg3')?.trim()].filter(Boolean),
			treated: fd.get('treated')==='on',
			delivered: fd.get('delivered')==='on',
			finished: fd.get('finished')==='on'
		};
		console.debug('[project-form] raw payload', JSON.stringify(payload));
		// שיטות הגנה והשלמות אוטומטיות
		if (!payload.client) {
			alert('חובה לבחור לקוח');
			console.warn('[project-form] missing client stops submission');
			return;
		}
		if (!payload.projectName) {
			payload.projectName = 'פרויקט ללא שם';
			console.debug('[project-form] auto projectName => פרויקט ללא שם');
		}
		if (!payload.boardName) {
			payload.boardName = 'לוח';
			console.debug('[project-form] auto boardName => לוח');
		}
		if (!payload.quantity || isNaN(payload.quantity) || payload.quantity < 1) payload.quantity = 1;
		console.debug('[project-form] normalized payload', JSON.stringify(payload));
		if (_formSubmitting) { e.preventDefault(); return; }
		_formSubmitting = true;
		const isChildEdit = window.editRow && window.editRow.classList && window.editRow.classList.contains('child-row');
		const isParentEdit = window.editRow && window.editRow.classList && window.editRow.classList.contains('parent-row');
		try {
			console.debug('[project-form] mode', { isChildEdit, isParentEdit });
			if (isChildEdit) {
				const boardId = window.editRow.dataset.boardId;
				const orderId = window.editRow.dataset.orderId || findLocalEntry(r=>r.boardId===boardId)?.orderId;
				const all = loadLocalProjects();
				const target = all.find(r => r.type==='child' && r.boardId === (boardId?parseInt(boardId):r.boardId) && r.orderId===orderId);
				if (target) {
					const negArr = payload.negStatuses && payload.negStatuses.length ? payload.negStatuses : [payload.neg1, payload.neg2, payload.neg3].filter(Boolean);
					Object.assign(target, {
						boardName: payload.boardName||target.boardName,
						worker: payload.worker||'',
						status: payload.status||'',
						negStatuses: negArr,
						neg1: negArr[0]||'',
						neg2: negArr[1]||'',
						neg3: negArr[2]||'',
						notes: payload.notes||'',
						treated: payload.treated,
						delivered: payload.delivered,
						finished: payload.finished
					});
					saveLocalProjects(all);
					updateServerFromChildRow(target);
				}
				if (window.closeProjectDialog) window.closeProjectDialog();
			} else if (isParentEdit) {
				const orderId = window.editRow.dataset.orderId;
				const all = loadLocalProjects();
				all.forEach(r => { if (r.orderId === orderId) {
					if (r.type==='parent') { Object.assign(r, { client: payload.client, projectName: payload.projectName, notes: payload.notes, treated: payload.treated, delivered: payload.delivered, finished: payload.finished }); }
					else { Object.assign(r, { client: payload.client, projectName: payload.projectName, notes: payload.notes, treated: payload.treated, delivered: payload.delivered, finished: payload.finished }); }
				}});
				saveLocalProjects(all);
				const parent = all.find(r=>r.orderId===orderId && r.type==='parent');
				if (parent) updateServerFromChildRow(parent);
				if (window.closeProjectDialog) window.closeProjectDialog();
			} else {
				try {
					const { orderId, parent, children } = addProjectLocal(payload);
					console.debug('[project-form] added local project', { orderId, childCount: children.length });
					queueServerCreation({ orderId, parent, children, formValues: payload });
					console.debug('[project-form] queued server creation');
					if (window.closeProjectDialog) window.closeProjectDialog();
				} catch (localErr) {
					console.error('[project-form] local add failed', localErr);
					alert('שגיאה ביצירת פרויקט מקומי');
				}
			}
		} catch(err) {
			console.error('Local-first create/edit failed', err);
			alert('שגיאה בשמירה');
		} finally { _formSubmitting = false; }
	}, { capture: true });
});

// Override legacy delete function to call API when IDs present
window.addEventListener('DOMContentLoaded', () => {
	const originalDelete = window.deleteProjectRow;
	window.deleteProjectRow = async function(tr) {
		try {
			if (tr && tr.classList.contains('child-row') && tr.dataset.boardId) {
				await deleteBoard(tr.dataset.boardId);
				await syncProjectsFromApi();
				return;
			}
			if (tr && tr.classList.contains('parent-row') && tr.dataset.projectId) {
				if (!confirm('למחוק את כל הפרויקט מהשרת?')) return;
				await deleteProject(tr.dataset.projectId);
				await syncProjectsFromApi();
				// ניקוי רשומות יומן על בסיס שם לקוח / פרויקט
				try {
					const tds = tr.querySelectorAll('td');
					const date = tds[0]?.innerText.trim();
					const client = tds[1]?.innerText.trim();
					const project = tds[2]?.innerText.trim();
					let jd = {};
					try { jd = JSON.parse(localStorage.getItem('journalTasks')||'{}'); } catch(e){}
					Object.keys(jd).forEach(k => { if (k.includes(client) && k.includes(project)) delete jd[k]; });
					localStorage.setItem('journalTasks', JSON.stringify(jd));
					if (typeof window.syncJournalTable==='function') window.syncJournalTable();
				} catch(e) { console.warn('journal cleanup failed', e); }
				return;
			}
		} catch (e) {
			console.error('Server delete failed, falling back to legacy removal', e);
		}
		if (typeof originalDelete === 'function') return originalDelete(tr);
	};
});
