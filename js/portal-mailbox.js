/* Explicit, read-only mailbox UI. Data lives only in the current admin session. */
(function (root) {
  'use strict';
  var adapter, state, dialog, request, sequence = 0, returnFocus;
  var esc = function (value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
  function session() { try { return adapter && adapter.getSession(); } catch (_) { return null; } }
  function valid() { return !!state && !!adapter && adapter.isCurrent(state.session); }
  function fresh(proof) { return {session:proof, draft:'', searched:'', items:[], source:null, checkedAt:null, nextCursor:null, incomplete:false, searchedOnce:false, selected:null, message:null, records:[], error:'', busy:'', listScroll:0, readerScroll:0}; }
  function stop() { sequence++; if (request) request.abort(); request = null; if (state) state.busy = ''; }
  function reset() { stop(); if (dialog) { dialog.close(); dialog.remove(); dialog = null; } document.body.classList.remove('portal-mailbox-open'); state = null; returnFocus = null; }
  function close() {
    if (!dialog) return;
    saveScroll(); var interrupted = state && state.busy;
    stop(); if (state && interrupted) state.error = 'Lettura interrotta. Puoi riprovare.';
    dialog.close(); dialog.remove(); dialog = null; document.body.classList.remove('portal-mailbox-open');
    if (returnFocus && returnFocus.isConnected) returnFocus.focus({preventScroll:true});
  }
  function saveScroll() {
    if (!dialog || !state) return;
    state.listScroll = dialog.querySelector('.mb-list')?.scrollTop || 0;
    state.readerScroll = dialog.querySelector('.mb-reader')?.scrollTop || 0;
  }
  function date(value) { var d = new Date(value); return value && Number.isFinite(d.getTime()) ? d.toLocaleString('it-IT', {day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'}) : 'Data non disponibile'; }
  function people(rows) { return (rows || []).map(function (p) { return p.name ? p.name + (p.address ? ' <' + p.address + '>' : '') : p.address; }).filter(Boolean).join(', '); }
  function sourceLabel() {
    if (!state.source) return 'Cerca nella casella collegata a BOOM';
    return state.source.account + ' · ' + (state.source.coverage === 'all-mail' ? 'Tutta la posta' : 'Solo posta in arrivo');
  }
  function render() {
    if (!dialog) return;
    if (!valid()) { reset(); return; }
    var focused = dialog.querySelector('#mailboxQuery') === document.activeElement;
    var selection = focused ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
    var selected = state.selected, message = state.message, shown = message || selected;
    dialog.classList.toggle('mb-reading', !!selected);
    dialog.innerHTML = '<header class="mb-header"><div><span class="mb-eyebrow">BOOM / CONSULTAZIONE</span><h2 id="mailboxTitle">Email</h2></div><button type="button" class="mb-close" data-mb="close" aria-label="Chiudi email">×</button></header>'
      + '<form class="mb-search"><label for="mailboxQuery">Cerca nella posta</label><div><input id="mailboxQuery" type="search" autocomplete="off" maxlength="160" value="'+esc(state.draft)+'" placeholder="Nome, indirizzo email o parole…" '+(state.denied?'disabled':'')+'><button type="submit" class="btn" '+(state.busy==='search'||state.denied?'disabled':'')+'>Cerca</button></div></form>'
      + '<div class="mb-source"><strong>'+esc(sourceLabel())+'</strong>'+(state.source?'<span>Cartella: '+esc(state.source.folder)+(state.checkedAt?' · Verificata '+esc(date(state.checkedAt)):'')+(state.source.coverage==='all-mail'?' · Spam e cestino esclusi':'')+'</span>':'<span>La ricerca parte solo con il tuo comando.</span>')+'</div>'
      + (state.error?'<div class="mb-notice mb-error" role="alert">'+esc(state.error)+'</div>':'')
      + '<div class="mb-status" role="status" aria-live="polite">'+(state.busy==='search'?'Ricerca nella casella…':state.busy==='page'?'Leggo altri risultati…':state.busy==='read'?'Apro il messaggio…':'')+'</div>'
      + '<div class="mb-content"><section class="mb-list" aria-label="Risultati email">'
      + (state.searchedOnce?'<div class="mb-list-caption">'+state.items.length+' messaggi per <strong>“'+esc(state.searched)+'”</strong></div>':'')
      + (!state.items.length ? '<div class="mb-empty">'+(!state.searchedOnce?'Trova una comunicazione senza uscire dal portale.':state.incomplete?'Nessun messaggio nella parte verificata. La ricerca è parziale.':'Nessun messaggio trovato per questa ricerca.')+'</div>' : state.items.map(function (item, i) {
        return '<button type="button" class="mb-result '+(selected?.messageRef===item.messageRef?'is-selected':'')+'" data-mb="read" data-index="'+i+'" '+(selected?.messageRef===item.messageRef?'aria-current="true"':'')+'><span class="mb-result-from">'+esc(people(item.from)||'Mittente non disponibile')+'</span><strong>'+esc(item.subject||'Senza oggetto')+'</strong><span class="mb-result-meta">'+esc(date(item.at))+(item.hasAttachments?' · Allegati':'')+'</span></button>';
      }).join(''))
      + (state.incomplete?'<p class="mb-notice">Ricerca parziale: potrebbero esserci altri messaggi.</p>':'')
      + (state.nextCursor?'<button type="button" class="btn btn-secondary mb-more" data-mb="more" '+(state.busy?'disabled':'')+'>Mostra altri messaggi</button>':'')+'</section>'
      + '<section class="mb-reader" aria-label="Lettura email">'+(!shown?'<div class="mb-reader-empty"><span aria-hidden="true">↗</span><p>Scegli un messaggio per leggerlo qui.</p></div>':
        '<button type="button" class="mb-back" data-mb="back">← Risultati</button><article><header class="mb-message-header"><h3>'+esc(shown.subject||'Senza oggetto')+'</h3><dl><div><dt>Da</dt><dd>'+esc(people(shown.from)||'Non disponibile')+'</dd></div><div><dt>A</dt><dd>'+esc(people(shown.to)||'Non disponibile')+'</dd></div><div><dt>Data</dt><dd>'+esc(date(shown.at))+'</dd></div></dl>'+(shown.hasAttachments?'<p class="mb-attachment">Allegati presenti · non aperti in questa vista</p>':'')+'</header>'
        + (!message?'<div class="mb-empty">'+(state.busy==='read'?'Lettura del testo…':'Il testo non è stato caricato. <button type="button" class="mb-link" data-mb="retry-read">Riprova</button>')+'</div>':
          (message.bodyUnavailable?'<p class="mb-notice">Il testo non è disponibile in questa vista. Sono visibili solo i dati del messaggio.</p>':'<div class="mb-message-text">'+esc(message.text||'Il messaggio non contiene testo.')+'</div>')
          + (message.truncated?'<p class="mb-notice">Testo parziale: il messaggio supera il limite di lettura.</p>':'')
          + '<details class="mb-records"><summary>Schede BOOM con la stessa email'+(state.records.length?' · '+state.records.length:'')+'</summary><p>Confronto esatto degli indirizzi nei dati già caricati. L’archivio può essere parziale; nessuna associazione viene salvata.</p>'+(state.records.length?state.records.map(function (record,i) { return '<button type="button" data-mb="record" data-index="'+i+'"><small>'+esc(record.typeLabel||record.kind)+'</small><strong>'+esc(record.label)+'</strong><span>'+esc(record.matchedEmail)+'</span></button>'; }).join(''):'<p>Nessuna scheda caricata con questi indirizzi.</p>')+'</details>')+'</article>')+'</section></div>';
    dialog.querySelector('.mb-list').scrollTop = state.listScroll;
    dialog.querySelector('.mb-reader').scrollTop = state.readerScroll;
    if (focused) { var input = dialog.querySelector('#mailboxQuery'); input.focus({preventScroll:true}); try { input.setSelectionRange(selection[0],selection[1]); } catch (_) {} }
  }
  function fail(code) {
    return ({invalid_query:'Scrivi da 3 a 160 caratteri per cercare nella posta.',invalid_reference:'Il riferimento è scaduto o non è più valido. Ripeti la ricerca.',message_not_found:'Il messaggio non è più disponibile. Ripeti la ricerca.',mailbox_changed:'La casella è cambiata. Ripeti la ricerca per leggere i dati aggiornati.',config_changed:'Il collegamento email è cambiato. Ripeti la ricerca.',admin_required:'La consultazione richiede una sessione amministratore.',invalid_or_expired_token:'Sessione scaduta. Accedi nuovamente.',mailbox_unconfigured:'La casella email non è configurata sul server.',mailbox_unavailable:'La casella non è raggiungibile. Riprova tra poco.',mailbox_timeout:'La casella non ha risposto in tempo. Riprova.',invalid_response:'La risposta della casella non è leggibile. Riprova.'})[code] || 'Lettura non riuscita. Riprova; i risultati precedenti restano disponibili.';
  }
  function textOK(value, limit) { return typeof value === 'string' && value.length <= limit; }
  function sourceOK(value) { return value && textOK(value.account,320) && value.account && textOK(value.folder,1024) && value.folder && ['all-mail','inbox-only'].includes(value.coverage); }
  function personOK(rows) { return Array.isArray(rows) && rows.length <= 100 && rows.every(function (p) { return p && textOK(p.address || '',320) && textOK(p.name || '',1000); }); }
  function itemOK(item) { return item && textOK(item.messageRef,4096) && item.messageRef && personOK(item.from) && personOK(item.to) && textOK(item.subject,2000) && (item.at==null || textOK(item.at,100)); }
  function sameSource(a,b) { return !a || (a.account===b.account && a.folder===b.folder && a.coverage===b.coverage); }
  async function call(body, type, accept) {
    if (!valid() || !dialog || state.denied) return;
    var fingerprint = JSON.stringify(body);
    if (request?.fingerprint===fingerprint) return;
    stop(); var seq = sequence, currentState = state, controller = new AbortController(); request = controller; request.fingerprint = fingerprint;
    state.busy = type; state.error = ''; render();
    var current = function () { return sequence===seq && state===currentState && !!dialog && valid(); };
    // The same deadline includes token acquisition and JSON parsing. Aborting
    // fetch alone cannot release an auth SDK promise that never settles.
    var cancelled = new Promise(function (_, reject) { controller.signal.addEventListener('abort',function () { reject({code:'mailbox_timeout'}); },{once:true}); });
    var wait = function (operation) { return Promise.race([Promise.resolve().then(function () { if (!current() || controller.signal.aborted) throw {code:'cancelled'}; return operation(); }),cancelled]); };
    var timer = setTimeout(function () { controller.abort(); }, 65000);
    try {
      var token = await wait(function () { return adapter.getToken(currentState.session); });
      if (!current()) return;
      var response = await wait(function () { return fetch('/api/mailbox/query', {method:'POST', cache:'no-store', signal:controller.signal, headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'}, body:JSON.stringify(body)}); });
      if (!current()) return;
      var data = await wait(function () { return response.json(); });
      if (!current()) return;
      if (!response.ok || !data || data.ok===false) throw {code:data?.error || (response.status===403?'admin_required':'mailbox_unavailable')};
      accept(data);
    } catch (error) {
      if (!current()) return;
      var code = error.code || (error.name==='AbortError'?'mailbox_timeout':'mailbox_unavailable');
      if (['mailbox_changed','config_changed','invalid_reference'].includes(code)) { state.items=[];state.selected=null;state.message=null;state.records=[];state.nextCursor=null;state.source=null;state.searchedOnce=false; }
      if (['admin_required','invalid_or_expired_token'].includes(code)) {
        Object.assign(state,{items:[],selected:null,message:null,records:[],nextCursor:null,source:null,checkedAt:null,searchedOnce:false,draft:'',searched:'',incomplete:false,denied:true});
      }
      state.error = fail(code);
    } finally {
      clearTimeout(timer);
      if (sequence===seq && state===currentState) { request=null;state.busy=''; if (dialog) { if (valid()) render(); else reset(); } }
    }
  }
  function search(more) {
    if (!valid()) { reset(); return; }
    if (state.denied) return;
    var query = (more?state.searched:state.draft).trim();
    if (query.length<3 || query.length>160 || /[\u0000-\u001f\u007f]/.test(query)) { stop();state.error=fail('invalid_query');render();dialog?.querySelector('#mailboxQuery').focus();return; }
    if (more && !state.nextCursor) return;
    var cursor = more ? state.nextCursor : null;
    return call({action:'search',query:query,...(cursor?{cursor:cursor}:{})},more?'page':'search',function (data) {
      if (!sourceOK(data.source) || !Array.isArray(data.items) || data.items.length>20 || !data.items.every(itemOK) || (data.nextCursor!=null && (!textOK(data.nextCursor,4096) || data.nextCursor===cursor)) || typeof data.incomplete!=='boolean') throw {code:'invalid_response'};
      if (more && !sameSource(state.source,data.source)) throw {code:'mailbox_changed'};
      state.source=data.source;state.checkedAt=data.checkedAt;state.items=more?Array.from(new Map(state.items.concat(data.items).map(function (item) { return [item.messageRef,item]; })).values()):data.items;
      state.nextCursor=data.nextCursor||null;state.incomplete=more?(state.incomplete||data.incomplete):data.incomplete;state.searched=query;state.searchedOnce=true;state.selected=null;state.message=null;state.records=[];state.readerScroll=0;
      if (!more) state.listScroll=0;
    });
  }
  function read(item) {
    if (!valid() || !item) return;
    if (state.busy==='read' && state.selected?.messageRef===item.messageRef) return;
    saveScroll(); state.selected=item;state.message=null;state.records=[];state.readerScroll=0;
    return call({action:'read',messageRef:item.messageRef},'read',function (data) {
      var message=data.message;
      if (!itemOK(message) || message.messageRef!==item.messageRef || !textOK(message.text,262144) || typeof message.truncated!=='boolean' || typeof message.bodyUnavailable!=='boolean') throw {code:'invalid_response'};
      if (data.source && (!sourceOK(data.source)||!sameSource(state.source,data.source))) throw {code:'mailbox_changed'};
      state.message=message;
      var emails=[...new Set(message.from.concat(message.to).map(function (p) { return p.address.trim().toLowerCase(); }).filter(function (email) { return email && email!==state.source?.account.toLowerCase(); }))];
      state.records=adapter.findRecordsByEmail?.(emails)||[];
    });
  }
  function open(query, options) {
    if (state && !valid()) reset();
    var proof=session(); if (!proof) return false;
    if (!state) state=fresh(proof);
    var supplied=typeof query==='string', changed=supplied && query.trim()!==state.searched;
    if (supplied && !state.denied) state.draft=query;
    if (!dialog) {
      if (document.querySelector('.modal-overlay.active')) return false;
      returnFocus=document.activeElement;
      dialog=document.createElement('dialog'); dialog.id='portalMailbox';dialog.className='portal-mailbox';dialog.setAttribute('aria-labelledby','mailboxTitle');
      dialog.addEventListener('cancel',function (event) { event.preventDefault();close(); });
      dialog.addEventListener('scroll',function (event) { if(!valid())return;if(event.target.matches('.mb-list'))state.listScroll=event.target.scrollTop;if(event.target.matches('.mb-reader'))state.readerScroll=event.target.scrollTop; },true);
      dialog.addEventListener('input',function (event) { if(event.target.id==='mailboxQuery' && valid()) state.draft=event.target.value; });
      dialog.addEventListener('submit',function (event) { event.preventDefault(); if(valid()) { state.draft=dialog.querySelector('#mailboxQuery').value;search(false); } });
      dialog.addEventListener('click',function (event) {
        var button=event.target.closest('[data-mb]'); if (!button) return;
        if (button.dataset.mb==='close') return close(); if (!valid()) return reset();
        switch(button.dataset.mb) {
          case 'read': return read(state.items[Number(button.dataset.index)]);
          case 'retry-read': return read(state.selected);
          case 'more': return search(true);
          case 'back': stop();state.selected=null;state.message=null;state.error='';state.readerScroll=0;render();return;
          case 'record': { var record=state.records[Number(button.dataset.index)], proof=state.session; if(record) { close();if(adapter.isCurrent(proof))adapter.openRecord(record); } return; }
        }
      });
      document.body.appendChild(dialog); document.body.classList.add('portal-mailbox-open'); render();dialog.showModal();
    } else render();
    if (!state.denied && options?.search===true && supplied && query.trim().length>=3 && query.trim().length<=160 && (changed || !state.searchedOnce)) search(false);
    else if (!state.selected) dialog.querySelector('#mailboxQuery')?.focus();
    return true;
  }
  root.BOOM_MAILBOX={init:function (config) { if (adapter!==config) { reset();adapter=config; } },open:open,close:close,reset:reset};
})(window);
