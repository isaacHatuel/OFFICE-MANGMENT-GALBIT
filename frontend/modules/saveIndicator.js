// saveIndicator.js - lightweight global "נשמר" toast indicator
(function(){
  if (window.showSavedIndicator) return; // already defined
  const el = document.createElement('div');
  el.id = 'save-indicator';
  el.textContent = 'נשמר';
  el.style.cssText = [
    'position:fixed','bottom:14px','left:14px','z-index:10000','background:#1565c0',
    'color:#fff','padding:8px 18px','border-radius:24px','font-family:inherit','font-size:15px',
    'box-shadow:0 4px 14px rgba(0,0,0,0.25)','opacity:0','pointer-events:none',
    'transform:translateY(12px)','transition:opacity .28s, transform .28s'
  ].join(';');
  document.addEventListener('DOMContentLoaded', ()=> document.body.appendChild(el));
  let hideTimer=null; let lastStamp=0;
  function showSavedIndicator(msg){
    if (msg) el.textContent = msg;
    const now = Date.now();
    lastStamp = now;
    if (hideTimer) { clearTimeout(hideTimer); hideTimer=null; }
    requestAnimationFrame(()=>{
      el.style.opacity='1';
      el.style.transform='translateY(0)';
    });
    hideTimer = setTimeout(()=>{
      // Only hide if no newer show call happened
      if (Date.now()-lastStamp >= 950){
        el.style.opacity='0';
        el.style.transform='translateY(12px)';
      }
    }, 1200);
  }
  window.showSavedIndicator = showSavedIndicator;
})();
