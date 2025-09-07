// Simple API helper for fetching reference and domain data
// Gradual migration: front-end code (index2.html) still uses global arrays (clients, workers, etc.)
// This module standardizes loading from the backend so we can later remove hard‑coded lists.

export async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, { headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }, ...opts });
  if (!res.ok) {
    const text = await res.text().catch(()=> '');
    throw new Error(`HTTP ${res.status} ${res.statusText} :: ${text}`);
  }
  return res.json();
}

export async function loadReference() {
  return fetchJSON('/api/reference/all');
}

// Projects (simple, no pagination yet in backend route)
export async function listProjects() {
  return fetchJSON('/api/projects');
}

// Boards list (supports pagination). Will fetch all pages up to a safety cap.
export async function listBoards({ project, pageSize = 200, finished } = {}) {
  const params = new URLSearchParams();
  if (project) params.set('project', project);
  if (finished !== undefined) params.set('finished', finished);
  params.set('pageSize', pageSize);
  return fetchJSON('/api/boards?' + params.toString());
}

// Create project
export async function createProject(payload) {
  return fetchJSON('/api/projects', { method: 'POST', body: JSON.stringify(payload) });
}

// Update project (partial)
export async function updateProject(id, payload) {
  return fetchJSON(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

// Delete project
export async function deleteProject(id) {
  return fetch(`/api/projects/${id}`, { method: 'DELETE' }).then(r => { if(!r.ok) throw new Error('delete project failed'); return true; });
}

// Boards CRUD
export async function createBoard(payload) {
  return fetchJSON('/api/boards', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateBoard(id, payload) {
  return fetchJSON(`/api/boards/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export async function deleteBoard(id) {
  return fetch(`/api/boards/${id}`, { method: 'DELETE' }).then(r => { if(!r.ok) throw new Error('delete board failed'); return true; });
}

// Placeholders reserved for later expansion
export async function listWorkers() { return []; }
export async function listStatuses() { return []; }
