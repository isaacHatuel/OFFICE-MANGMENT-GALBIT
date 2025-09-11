// frontend/api.js - REST API helper layer
// Provides: loadReference, listProjects, listBoards, createProject, createBoard, updateBoard, updateProject, deleteBoard, deleteProject
// All functions return parsed JSON (or throw on HTTP error). Designed to be resilient if backend unavailable.

const API_BASE = '/api';

async function http(method, path, body, opts={}) {
  const url = API_BASE + path;
  const headers = Object.assign({ 'Accept':'application/json' }, opts.headers||{});
  let payload;
  if (body !== undefined && body !== null) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(url, { method, headers, body: payload, credentials: 'same-origin' });
  } catch (netErr) {
    throw new Error('Network error: ' + netErr.message);
  }
  if (!res.ok) {
    let detail = '';
    try { detail = await res.text(); } catch(_){}
    throw new Error(method + ' ' + path + ' failed: ' + res.status + ' ' + res.statusText + (detail? ' - ' + detail.slice(0,400):''));
  }
  if (res.status === 204) return null;
  try { return await res.json(); } catch(parseErr){ throw new Error('Invalid JSON from ' + path + ': ' + parseErr.message); }
}

// Reference data (batched)
export async function loadReference(){
  return http('GET', '/reference/all');
}

// Projects list (supports optional filters)
export async function listProjects(params={}){
  const qp = new URLSearchParams();
  if (params.client) qp.set('client', params.client);
  if (params.status) qp.set('status', params.status);
  if (params.q) qp.set('q', params.q);
  const path = '/projects' + (qp.toString()? ('?' + qp.toString()):'');
  return http('GET', path);
}

// Boards list (pagination params)
export async function listBoards(params={}){
  const qp = new URLSearchParams();
  qp.set('page', params.page || 1);
  qp.set('pageSize', params.pageSize || 200);
  if (params.project) qp.set('project', params.project);
  if (params.finished !== undefined) qp.set('finished', params.finished? 'true':'false');
  const path = '/boards?' + qp.toString();
  return http('GET', path);
}

export async function createProject(payload){
  return http('POST', '/projects', payload);
}
export async function updateProject(id, payload){
  return http('PATCH', '/projects/' + encodeURIComponent(id), payload);
}
export async function deleteProject(id){
  return http('DELETE', '/projects/' + encodeURIComponent(id));
}

export async function createBoard(payload){
  return http('POST', '/boards', payload);
}
export async function updateBoard(id, payload){
  return http('PATCH', '/boards/' + encodeURIComponent(id), payload);
}
export async function deleteBoard(id){
  return http('DELETE', '/boards/' + encodeURIComponent(id));
}

// Bulk helper
export async function fetchProjectsAndBoards(){
  const [projects, boards] = await Promise.all([ listProjects(), listBoards({ pageSize: 500 }) ]);
  return { projects, boards: boards.rows || [] };
}

// Safe wrappers
export async function safeListProjects(){ try { return await listProjects(); } catch(e){ console.warn('[api] safeListProjects failed', e.message); return []; } }
export async function safeListBoards(){ try { return await listBoards({ pageSize:500 }); } catch(e){ console.warn('[api] safeListBoards failed', e.message); return { rows: [] }; } }

if (typeof window !== 'undefined') {
  window.apiLayer = { loadReference, listProjects, listBoards, createProject, createBoard, updateBoard, updateProject, deleteBoard, deleteProject };
}
