/* Explicit mailbox reader and confirmed import into an existing conversation. */
(function (root) {
  'use strict';
  var adapter, state, dialog, request, sequence = 0, returnFocus;
  var esc = function (value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
  function session() { try { return adapter && adapter.getSession(); } catch (_) { return null; } }
  function valid() { return !!state && !!adapter && adapter.isCurrent(state.session); }
  function fresh(proof) { return {session:proof, draft:'', searched:'', items:[], source:null, checkedAt:null, nextCursor:null, incomplete:false, searchedOnce:false, selected:null, message:null, records:[], conversations:[], target:'', receipt:null, admissionName:'', admissionConfirmed:false, error:'', busy:'', listScroll:0, readerScroll:0}; }
  function clearImport() { state.conversations=[];state.target='';state.receipt=null;state.admissionName='';state.admissionConfirmed=false; }
  function writing() { return state && ['import','admit'].includes(state.busy); }
  function stop() { sequence++; if (request) request.abort(); request = null; if (state) state.busy = ''; }
  function reset() { stop(); if (dialog) { dialog.close(); dialog.remove(); dialog = null; } document.body.classList.remove('portal-mailbox-open'); state = null; returnFocus = null; }
  function close() {
    if (!dialog) return;
    saveScroll(); var interrupted = state && state.busy;
    stop(); if (state && interrupted) state.error = ['import','admit'].includes(interrupted) ? 'Esito del collegamento non verificato. Riprova sulla stessa conversazione: non verrà creata una copia.' : 'Lettura interrotta. Puoi riprovare.';
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
  function importPanel(message) {
    if (state.receipt?.review) return '<section class="mb-import"><strong role="status">Fonte salvata · collegamento da verificare</strong><p>L’email è conservata, ma la verifica finale non è riuscita. Apri la conversazione per controllare il contatto prima di procedere.</p><button class="btn" type="button" data-mb="inbox">Verifica in Inbox ↗</button></section>';
    if (state.receipt) return '<section class="mb-import"><strong role="status">'+(state.receipt.duplicate?'Email già collegata.':'Email collegata.')+'</strong><p>La fonte è nella conversazione. Aprila per assegnare il prossimo passo con «Prendi in carico».</p><button class="btn" type="button" data-mb="inbox">Apri conversazione ↗</button></section>';
    if (message.truncated || message.bodyUnavailable || !message.text.trim() || message.importable===false) return '';
    var rows=state.conversations, target=rows.find(function(row){return row.id===state.target;});
    return '<section class="mb-import" aria-label="Collega alla conversazione"><h4>Porta questa email nel lavoro</h4>'
      + (!rows.length?admissionPanel(message):
        '<p>Scegli la conversazione esistente. Il collegamento conserva la fonte; non invia risposte e non attiva la Segretaria.</p><label for="mailboxConversation">Conversazione</label><select id="mailboxConversation" '+(state.busy?'disabled':'')+'><option value="">Scegli il contatto…</option>'
        + rows.map(function(row){return '<option value="'+esc(row.id)+'" '+(row.id===state.target?'selected':'')+'>'+esc(row.label+' · '+row.email)+'</option>';}).join('')+'</select>'
        +(target?'<p class="mb-import-target">Collega a <strong>'+esc(target.label)+'</strong><br>'+esc(target.email)+'. La casa resta quella già associata alla conversazione.</p>':'')
        +'<button class="btn" type="button" data-mb="import" '+(!target||state.busy?'disabled':'')+'>Conferma collegamento</button>')+'</section>';
  }
  function admissionPanel(message) {
    var contact = message.importContact;
    if (!textOK(contact,320) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) return '<p>Nessuna conversazione caricata con l’email del contatto. Ripeti la lettura per verificare il recapito sul server.</p>';
    return '<p>Avvia una richiesta da <strong>'+esc(contact)+'</strong>. Verifico prima se esiste già una conversazione. La casa e il ruolo del contatto restano da verificare.</p>'
      +'<label for="mailboxContactName">Nome del contatto (facoltativo)</label><input id="mailboxContactName" type="text" maxlength="150" autocomplete="off" value="'+esc(state.admissionName)+'" '+(state.busy?'disabled':'')+'>'
      +'<label class="mb-confirm" for="mailboxAdmissionConfirmed"><input id="mailboxAdmissionConfirmed" type="checkbox" '+(state.admissionConfirmed?'checked ':'')+(state.busy?'disabled':'')+'><span>Confermo che <strong>'+esc(contact)+'</strong> è il recapito della richiesta di lavoro BOOM.</span></label>'
      +'<p>L’originale sarà conservato in Inbox. Nessun messaggio viene inviato.</p><button class="btn" type="button" data-mb="admit" '+(!state.admissionConfirmed||state.busy?'disabled':'')+'>Crea richiesta da questa email</button>';
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
      + '<div class="mb-status" role="status" aria-live="polite">'+(state.busy==='search'?'Ricerca nella casella…':state.busy==='page'?'Leggo altri risultati…':state.busy==='read'?'Apro il messaggio…':writing()?'Verifico la fonte e salvo la richiesta…':'')+'</div>'
      + '<div class="mb-content"><section class="mb-list" aria-label="Risultati email">'
      + (state.searchedOnce?'<div class="mb-list-caption">'+state.items.length+' messaggi per <strong>“'+esc(state.searched)+'”</strong></div>':'')
      + (!state.items.length ? '<div class="mb-empty">'+(!state.searchedOnce?'Trova una comunicazione senza uscire dal portale.':state.incomplete?'Nessun messaggio nella parte verificata. La ricerca è parziale.':'Nessun messaggio trovato per questa ricerca.')+'</div>' : state.items.map(function (item, i) {
        return '<button type="button" class="mb-result '+(selected?.messageRef===item.messageRef?'is-selected':'')+'" data-mb="read" data-index="'+i+'" '+(selected?.messageRef===item.messageRef?'aria-current="true"':'')+'><span class="mb-result-from">'+esc(people(item.from)||'Mittente non disponibile')+'</span><strong>'+esc(item.subject||'Senza oggetto')+'</strong><span class="mb-result-meta">'+esc(date(item.at))+(item.hasAttachments?' · Allegati':'')+'</span></button>';
      }).join(''))
      + (state.incomplete?'<p class="mb-notice">Ricerca parziale: potrebbero esserci altri messaggi.</p>':'')
      + (state.nextCursor?'<button type="button" class="btn btn-secondary mb-more" data-mb="more" '+(state.busy?'disabled':'')+'>Mostra altri messaggi</button>':'')+'</section>'
      + '<section class="mb-reader" aria-label="Lettura email">'+(!shown?'<div class="mb-reader-empty"><span aria-hidden="true">↗</span><p>Scegli un messaggio per leggerlo qui.</p></div>':
        '<button type="button" class="mb-back" data-mb="back">← Risultati</button><article><header class="mb-message-header"><h3>'+esc(shown.subject||'Senza oggetto')+'</h3><dl><div><dt>Da</dt><dd>'+esc(people(shown.from)||'Non disponibile')+'</dd></div><div><dt>A</dt><dd>'+esc(people(shown.to)||'Non disponibile')+'</dd></div><div><dt>Data</dt><dd>'+esc(date(shown.at))+'</dd></div></dl>'+(shown.hasAttachments?'<p class="mb-attachment">Allegati presenti · non aperti in questa vista</p>':'')+'</header>'
        + (message?.replyTo?.length?'<p class="mb-reply-to">Rispondi a: '+esc(people(message.replyTo))+'</p>':'')
        + (!message?'<div class="mb-empty">'+(state.busy==='read'?'Lettura del testo…':'Il testo non è stato caricato. <button type="button" class="mb-link" data-mb="retry-read">Riprova</button>')+'</div>':
          (message.bodyUnavailable?'<p class="mb-notice">Il testo non è disponibile in questa vista. Sono visibili solo i dati del messaggio.</p>':'<div class="mb-message-text">'+esc(message.text||'Il messaggio non contiene testo.')+'</div>')
          + (message.truncated?'<p class="mb-notice">Testo parziale: il messaggio supera il limite di lettura.</p>':'')
          + importPanel(message)
          + '<details class="mb-records"><summary>Schede BOOM con la stessa email'+(state.records.length?' · '+state.records.length:'')+'</summary><p>Confronto esatto degli indirizzi nei dati già caricati. L’archivio può essere parziale; aprire una scheda non salva associazioni.</p>'+(state.records.length?state.records.map(function (record,i) { return '<button type="button" data-mb="record" data-index="'+i+'"><small>'+esc(record.typeLabel||record.kind)+'</small><strong>'+esc(record.label)+'</strong><span>'+esc(record.matchedEmail)+'</span></button>'; }).join(''):'<p>Nessuna scheda caricata con questi indirizzi.</p>')+'</details>')+'</article>')+'</section></div>';
    dialog.querySelector('.mb-list').scrollTop = state.listScroll;
    dialog.querySelector('.mb-reader').scrollTop = state.readerScroll;
    if (focused) { var input = dialog.querySelector('#mailboxQuery'); input.focus({preventScroll:true}); try { input.setSelectionRange(selection[0],selection[1]); } catch (_) {} }
  }
  function fail(code) {
    var imports = {
      email_not_inbound:'Questa email non è un messaggio in entrata per la casella BOOM.',
      email_sender_ambiguous:'Il contatto nell’email è ambiguo. Il collegamento richiede una verifica.',
      email_message_id_missing:'Manca il riferimento originale dell’email: non posso collegarla senza rischiare doppioni.',
      email_body_incomplete:'Il testo è incompleto: questa email non può essere collegata dalla vista attuale.',
      email_contact_mismatch:'L’email non coincide più con il contatto della conversazione. Verifica in Inbox.',
      email_identity_ambiguous:'Il collegamento del contatto è ambiguo. Verificalo in Inbox.',
      conversation_automated:'Questa conversazione è affidata alla Segretaria. Il collegamento manuale è sospeso per evitare azioni automatiche.',
      conversation_identity_changed:'La conversazione è cambiata. Verifica il contatto in Inbox prima di riprovare.',
      email_message_identity_conflict:'La stessa email risulta già collegata con dati diversi. Verifica la conversazione esistente.',
      email_identity_scan_incomplete:'La verifica delle conversazioni è parziale. Il collegamento resta sospeso.',
      email_date_invalid:'La data originale dell’email non è verificabile. Il collegamento resta sospeso.',
      conversation_not_found:'La conversazione non è più disponibile. Verifica in Inbox.',
      conversation_changed:'La conversazione è cambiata durante il collegamento. Verifica in Inbox e riprova.',
      invalid_conversation_id:'La conversazione selezionata non è valida.',
      email_contact_confirmation_required:'Conferma il recapito della richiesta prima di procedere.',
      email_confirmation_changed:'Il recapito nella fonte è cambiato. Riapri il messaggio e verifica il contatto.',
      invalid_contact_name:'Inserisci un nome valido, lungo al massimo 150 caratteri.',
      email_conversation_exists:'Esiste già una conversazione con questa email. Sceglila qui sotto per collegare il messaggio.',
      email_admission_review_required:'L’email è salvata, ma il collegamento richiede verifica in Inbox.',
      email_admission_verification_failed:'L’email è salvata. Non riesco a verificare il collegamento finale: controlla in Inbox.'
    };
    if (imports[code]) return imports[code];
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
      if (type==='admit' && data?.error==='email_conversation_exists' && data.conversation
          && /^[\w.-]{1,180}$/.test(data.conversation.id||'') && !['.','..'].includes(data.conversation.id)
          && textOK(data.conversation.label,300) && data.conversation.email===currentState.message?.importContact) {
        state.conversations=[data.conversation];state.target='';state.admissionConfirmed=false;
      }
      if (type==='admit' && ['email_admission_review_required','email_admission_verification_failed'].includes(data?.error)
          && data.sourceSaved===true && /^[\w.-]{1,180}$/.test(data.conversationId||'') && !['.','..'].includes(data.conversationId)
          && /^segretaria_mail_[a-f0-9]{64}$/.test(data.messageId||'')) {
        state.receipt={conversationId:data.conversationId,messageId:data.messageId,review:true};
      }
      if (!response.ok || !data || data.ok===false) throw {code:data?.error || (response.status===403?'admin_required':'mailbox_unavailable')};
      accept(data);
    } catch (error) {
      if (!current()) return;
      var code = error.code || (error.name==='AbortError'?'mailbox_timeout':'mailbox_unavailable');
      if (['mailbox_changed','config_changed','invalid_reference'].includes(code)) { state.items=[];state.selected=null;state.message=null;state.records=[];state.nextCursor=null;state.source=null;state.searchedOnce=false;clearImport(); }
      if (['admin_required','invalid_or_expired_token'].includes(code)) {
        Object.assign(state,{items:[],selected:null,message:null,records:[],nextCursor:null,source:null,checkedAt:null,searchedOnce:false,draft:'',searched:'',incomplete:false,denied:true});
        clearImport();
      }
      state.error = ['import','admit'].includes(type)&&['mailbox_timeout','mailbox_unavailable','invalid_response'].includes(code) ? 'Esito del collegamento non verificato. Riprova sulla stessa conversazione: non verrà creata una copia.' : fail(code);
    } finally {
      clearTimeout(timer);
      if (sequence===seq && state===currentState) { request=null;state.busy=''; if (dialog) { if (valid()) render(); else reset(); } }
    }
  }
  function search(more) {
    if (!valid()) { reset(); return; }
    if (state.denied || writing()) return;
    var query = (more?state.searched:state.draft).trim();
    if (query.length<3 || query.length>160 || /[\u0000-\u001f\u007f]/.test(query)) { stop();state.error=fail('invalid_query');render();dialog?.querySelector('#mailboxQuery').focus();return; }
    if (more && !state.nextCursor) return;
    var cursor = more ? state.nextCursor : null;
    return call({action:'search',query:query,...(cursor?{cursor:cursor}:{})},more?'page':'search',function (data) {
      if (!sourceOK(data.source) || !Array.isArray(data.items) || data.items.length>20 || !data.items.every(itemOK) || (data.nextCursor!=null && (!textOK(data.nextCursor,4096) || data.nextCursor===cursor)) || typeof data.incomplete!=='boolean') throw {code:'invalid_response'};
      if (more && !sameSource(state.source,data.source)) throw {code:'mailbox_changed'};
      state.source=data.source;state.checkedAt=data.checkedAt;state.items=more?Array.from(new Map(state.items.concat(data.items).map(function (item) { return [item.messageRef,item]; })).values()):data.items;
      state.nextCursor=data.nextCursor||null;state.incomplete=more?(state.incomplete||data.incomplete):data.incomplete;state.searched=query;state.searchedOnce=true;state.selected=null;state.message=null;state.records=[];state.readerScroll=0;clearImport();
      if (!more) state.listScroll=0;
    });
  }
  function read(item) {
    if (!valid() || !item) return;
    if (state.busy==='read' && state.selected?.messageRef===item.messageRef) return;
    if (writing()) return;
    saveScroll(); state.selected=item;state.message=null;state.records=[];state.readerScroll=0;clearImport();
    return call({action:'read',messageRef:item.messageRef},'read',function (data) {
      var message=data.message;
      if (!itemOK(message) || message.messageRef!==item.messageRef || !textOK(message.text,262144) || typeof message.truncated!=='boolean' || typeof message.bodyUnavailable!=='boolean' || (message.replyTo!=null&&!personOK(message.replyTo)) || (message.importable!=null&&typeof message.importable!=='boolean') || (message.importContact!=null&&!textOK(message.importContact,320))) throw {code:'invalid_response'};
      if (data.source && (!sourceOK(data.source)||!sameSource(state.source,data.source))) throw {code:'mailbox_changed'};
      state.message=message;
      var emails=[...new Set(message.from.concat(message.to,message.replyTo||[]).map(function (p) { return (p.address||'').trim().toLowerCase(); }).filter(function (email) { return email && email!==state.source?.account.toLowerCase(); }))];
      state.records=adapter.findRecordsByEmail?.(emails)||[];
      var contactRows=message.replyTo?.length?message.replyTo:message.from;
      var contactEmails=[...new Set(contactRows.map(function(p){return (p.address||'').trim().toLowerCase();}).filter(Boolean))];
      state.conversations=contactEmails.length===1&&contactEmails[0]!==state.source?.account.toLowerCase() ? adapter.findConversationsByEmail?.(contactEmails)||[] : [];
    });
  }
  function importMessage() {
    if (!valid() || state.busy || !state.message || state.receipt) return;
    var target=state.conversations.find(function(row){return row.id===state.target;}), message=state.message;
    if (!target || message.truncated || message.bodyUnavailable || message.importable===false) return;
    return call({action:'import',messageRef:message.messageRef,conversationId:target.id},'import',function(data){
      if (data.conversationId!==target.id || !textOK(data.messageId,180) || !data.messageId || typeof data.imported!=='boolean' || typeof data.duplicate!=='boolean' || data.imported===data.duplicate) throw {code:'invalid_response'};
      if (data.source && (!sourceOK(data.source)||!sameSource(state.source,data.source))) throw {code:'mailbox_changed'};
      state.receipt={conversationId:target.id,messageId:data.messageId,duplicate:data.duplicate};
    });
  }
  function admitMessage() {
    if (!valid() || state.busy || !state.message || state.receipt || !state.admissionConfirmed || state.conversations.length) return;
    var message=state.message;
    if (!message.importContact || message.importable!==true || message.truncated || message.bodyUnavailable) return;
    return call({action:'admit',messageRef:message.messageRef,confirmedEmail:message.importContact,contactName:state.admissionName.trim()},'admit',function(data){
      if (!/^conv_email_[a-f0-9]{64}$/.test(data.conversationId||'') || !/^segretaria_mail_[a-f0-9]{64}$/.test(data.messageId||'')
          || typeof data.created!=='boolean' || typeof data.imported!=='boolean' || typeof data.duplicate!=='boolean' || data.imported===data.duplicate) throw {code:'invalid_response'};
      if (data.source && (!sourceOK(data.source)||!sameSource(state.source,data.source))) throw {code:'mailbox_changed'};
      state.receipt={conversationId:data.conversationId,messageId:data.messageId,duplicate:data.duplicate};
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
      dialog.addEventListener('input',function (event) { if(!valid())return;if(event.target.id==='mailboxQuery') state.draft=event.target.value;if(event.target.id==='mailboxContactName'&&!state.busy)state.admissionName=event.target.value; });
      dialog.addEventListener('change',function(event){if(event.target.id==='mailboxAdmissionConfirmed'&&valid()&&!state.busy){saveScroll();state.admissionConfirmed=event.target.checked;render();return;}if(event.target.id==='mailboxConversation'&&valid()&&!state.busy){saveScroll();state.target=event.target.value;state.error='';render();}});
      dialog.addEventListener('submit',function (event) { event.preventDefault(); if(valid()) { state.draft=dialog.querySelector('#mailboxQuery').value;search(false); } });
      dialog.addEventListener('click',function (event) {
        var button=event.target.closest('[data-mb]'); if (!button) return;
        if (button.dataset.mb==='close') return close(); if (!valid()) return reset();
        if (writing()) return;
        switch(button.dataset.mb) {
          case 'read': return read(state.items[Number(button.dataset.index)]);
          case 'import': return importMessage();
          case 'admit': return admitMessage();
          case 'inbox': { var receipt=state.receipt, proof=state.session;if(receipt){close();if(adapter.isCurrent(proof))adapter.openConversation?.(receipt.conversationId);}return; }
          case 'retry-read': return read(state.selected);
          case 'more': return search(true);
          case 'back': stop();state.selected=null;state.message=null;state.error='';state.readerScroll=0;clearImport();render();return;
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
