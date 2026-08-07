// boom-err.js — telemetria errori client, minimale e senza dipendenze.
// Cattura window.onerror + unhandledrejection e li spedisce a /api/log
// via sendBeacon (non blocca mai la pagina). Dedupe per messaggio,
// massimo 5 segnalazioni per caricamento pagina.
(function () {
  'use strict';
  var sent = {};
  var count = 0;
  var MAX = 5;

  function report(kind, message, source, line, col, stack) {
    try {
      message = String(message || '').slice(0, 500);
      if (!message || sent[message] || count >= MAX) return;
      sent[message] = true;
      count++;
      var payload = JSON.stringify({
        kind: kind,
        message: message,
        source: String(source || '').slice(0, 300),
        line: line || 0,
        col: col || 0,
        stack: String(stack || '').slice(0, 1500),
        page: location.pathname + location.search,
        ua: navigator.userAgent.slice(0, 200),
        ts: new Date().toISOString()
      });
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/log', new Blob([payload], { type: 'application/json' }));
      } else {
        fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(function () {});
      }
    } catch (e) { /* la telemetria non deve mai rompere la pagina */ }
  }

  window.addEventListener('error', function (e) {
    report('error', e.message, e.filename, e.lineno, e.colno, e.error && e.error.stack);
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason || {};
    report('unhandledrejection', r.message || String(r), '', 0, 0, r.stack);
  });
})();
