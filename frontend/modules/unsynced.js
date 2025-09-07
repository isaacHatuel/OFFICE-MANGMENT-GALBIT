// מודול הדגשת שורות לא מסונכרנות
function highlightUnsynced() {
  const uns = window.__unsyncedJournalKeys;
  const rows = document.querySelectorAll('tr.child-row');
  rows.forEach(r => {
    const tds = r.querySelectorAll('td');
    const key = [tds[0]?.innerText||'', tds[1]?.innerText||'', tds[2]?.innerText||'', tds[3]?.innerText||''].join('|');
    if (uns && uns.has(key)) r.classList.add('unsynced-row'); else r.classList.remove('unsynced-row');
  });
}

document.addEventListener('projects:updated', highlightUnsynced);

document.addEventListener('journal:unsynced', highlightUnsynced);

window.highlightUnsynced = highlightUnsynced;
