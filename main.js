// לוגיקה ראשית - הועתק מ-index2.html
// כאן יפוצל בהמשך למודולים: ניהול עובדים, יומן משימות, מעקב פרויקטים וכו'.

// דוגמה: פונקציית מעבר בין לשוניות
function showTab(idx) {
    document.querySelectorAll('.tab').forEach((el, i) => {
        el.classList.toggle('active', i === idx);
    });
    document.querySelectorAll('.tab-content').forEach((el, i) => {
        el.classList.toggle('active', i === idx);
    });
    if (typeof syncProductionTrackingTable === 'function') {
        syncProductionTrackingTable();
    }
    if (idx === 1 && typeof syncJournalTable === 'function') {
        syncJournalTable();
    }
}
// ...המשך הלוגיקה תועבר לכאן בשלבים הבאים...
async function loadReferenceData(){
    try {
        const res = await fetch('/api/reference/all');
        if(!res.ok) throw new Error('bad status '+res.status);
        const data = await res.json();
        // expecting: { clients, statuses, roles, departments, workers }
        window.__dbClients = (data.clients||[]).map(c=>c.name||c.client_name||c);
        window.__dbStatuses = (data.statuses||[]).map(s=>s.name||s.status_name||s);
        window.__dbWorkers = (data.workers||[]).map(w=>w.name||w.worker_name||w);
        document.dispatchEvent(new CustomEvent('refdata:updated', {detail:{source:'server'}}));
        console.log('Reference data loaded from server', {clients: window.__dbClients.length, statuses: window.__dbStatuses.length, workers: window.__dbWorkers.length});
    } catch (e){
        console.warn('Failed loading reference data', e);
    }
}

// Auto-load reference data when this script is included (e.g. dashboard.html)
if (!window.__refDataAutoLoaded) {
    window.__refDataAutoLoaded = true;
    window.addEventListener('DOMContentLoaded', () => {
        try { loadReferenceData(); } catch(e) { console.warn('auto ref load failed', e); }
    });
}
