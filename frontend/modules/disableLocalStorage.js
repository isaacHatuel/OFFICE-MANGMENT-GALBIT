// disableLocalStorage.js - permanently disables and wipes localStorage usage
(function(){
  try {
    if (window.localStorage) {
      try { window.localStorage.clear(); } catch(_){ }
    }
  } catch(_){ }
  const memory = new Map(); // ephemeral in-memory store (optional)
  const disabled = {
    get length(){ return 0; },
    key(){ return null; },
    getItem(){ return null; },
    setItem(){ /* disabled */ },
    removeItem(){ /* disabled */ },
    clear(){ memory.clear(); },
  };
  try {
    Object.defineProperty(window, 'localStorage', { value: disabled, configurable: false, writable: false });
    console.log('[disableLocalStorage] localStorage disabled and cleared');
  } catch(e){ console.warn('[disableLocalStorage] override failed', e); }
})();
