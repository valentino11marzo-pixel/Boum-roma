// Il sito BOOM vede solo l'esito della sua richiesta, senza privilegi Chrome.
document.documentElement.dataset.boomSmartlinkExtension = '1';
window.addEventListener('message', event => {
  if (event.source !== window || event.origin !== location.origin || event.data?.type !== 'BOOM_SMARTLINK_EXTRACT') return;
  const id = String(event.data.requestId || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  chrome.runtime.sendMessage({ type:'BOOM_SMARTLINK_EXTRACT', url:event.data.url }, response => {
    const result = chrome.runtime.lastError ? { ok:false, error:'browser_unavailable' } : response;
    window.postMessage({ type:'BOOM_SMARTLINK_EXTRACT_RESULT', requestId:id, result }, location.origin);
  });
});
