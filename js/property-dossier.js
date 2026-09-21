/* Operational property dossier. Reads existing state; actions use the portal's
 * existing guarded flows. No database, AI call, or persisted business state. */
(function (root) {
  'use strict';
  const Engine = typeof module === 'object' && module.exports ? require('./property-dossier-engine.js') : root.BOOM_PROPERTY_DOSSIER_ENGINE;
  const tabs = [['overview','Situazione'],['contracts','Contratti'],['rent','Canoni'],['documents','Documenti'],['activity','Attività']];
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => value == null || !Number.isFinite(Number(value)) ? 'Da verificare' : new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(Number(value));
  function date(value) {
    if (!value) return 'Data non indicata';
    const day = Engine.day(value);
    if (!day) return 'Data da verificare';
    const d = new Date(day + 'T12:00:00Z');
    return Number.isFinite(d.getTime()) ? d.toLocaleDateString('it-IT',{day:'numeric',month:'short',year:'numeric',timeZone:'Europe/Rome'}) : 'Data da verificare';
  }
  function safeURL(value) {
    try { const u = new URL(value); return /^(https?:)$/.test(u.protocol) && !u.username && !u.password ? u.href : ''; } catch (_) { return ''; }
  }
  function parseRoute(value) {
    if (!String(value || '').startsWith('property/')) return null;
    const parts = value.split('/');
    let id = ''; try { id = decodeURIComponent(parts[1] || ''); } catch (_) { return {invalid:true}; }
    const tab = parts[2] || 'overview';
    return !id || /[\x00-\x1f/]/.test(id) || parts.length > 3 || !tabs.some(t => t[0] === tab) ? {invalid:true} : {id,tab};
  }
  const routeFor = (id, tab = 'overview') => 'property/' + encodeURIComponent(id) + '/' + tab;
  const icon = '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M5 27V12l11-7 11 7v15H5Z M12 27V17h8v10 M10 12h.01M22 12h.01" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';
  const button = (label,action,id='',kind='quiet') => `<button type="button" class="pdos-button pdos-${kind}" data-pdos-action="${action}" data-id="${esc(id)}">${esc(label)}</button>`;
  const badge = (label,tone='neutral') => `<span class="pdos-badge pdos-${tone}">${esc(label)}</span>`;
  const empty = (title,text) => `<div class="pdos-empty"><h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;
  const section = (title,body,aside='') => `<section class="pdos-card"><div class="pdos-section-head"><h2>${esc(title)}</h2>${aside}</div>${body}</section>`;
  const detail = (label,value) => `<div><dt>${esc(label)}</dt><dd>${esc(value == null || value === '' ? 'Non indicato' : value)}</dd></div>`;
  const rentLabels = {paid:'Pagato',reported:'Segnalato · da verificare',processing:'In corso',due:'Da pagare',overdue:'In ritardo',cancelled:'Annullato',unknown:'Da verificare'};
  const contractLabels = {active:'Attivo',draft:'Bozza',pending:'In preparazione',expired:'Scaduto',terminated:'Terminato',cancelled:'Annullato',signed:'Firmato'};
  function linkedDocuments(m) {
    const rows = (m.documents || []).filter(d => d.status !== 'archived').map(d => ({id:d.id,name:d.name || d.fileName || 'Documento',url:d.fileUrl,type:d.type === 'receipt' ? 'Ricevuta' : 'Archivio',at:d.createdAt}));
    m.contracts.filter(c => c.generatedPDF).forEach(c => rows.push({id:'contract:'+c.id,name:'Contratto · '+(c.type || 'Locazione'),url:c.generatedPDF,type:'Contratto',at:c.pdfGeneratedAt}));
    const labels = {visura:'Visura catastale',planimetria:'Planimetria',ape:'Attestato energetico',delega:'Delega ARPE'};
    Object.keys(labels).forEach(key => { const d=m.property.dossier && m.property.dossier[key]; if(d) rows.push({id:'arpe:'+key,name:labels[key],url:d.url,type:'Fascicolo ARPE',at:d.at}); });
    const urls = new Set();
    return rows.filter(r => { const url=safeURL(r.url); if(url && urls.has(url)) return false; if(url) urls.add(url); return true; });
  }
  function contractCard(row,m) {
    const c=row.source;
    const people = m.tenants.filter(t => t.contractId === c.id).map(t => t.name || t.user?.name || 'Conduttore da collegare');
    return `<article class="pdos-record"><div class="pdos-row-head"><div><p class="pdos-eyebrow">${esc(c.type || 'Locazione')}</p><h3>${esc(people.join(' · ') || 'Conduttore da collegare')}</h3></div>${badge(contractLabels[c.status] || 'Stato da verificare',c.status==='active'?'good':'neutral')}</div><dl class="pdos-facts">${detail('Periodo',date(row.startDate)+' → '+date(row.endDate))}${detail('Canone contrattuale',money(row.rent)+' / mese')}${detail('Deposito',money(row.deposit))}</dl><div class="pdos-actions">${button('Apri contratto','contract',c.id)}<a class="pdos-button" href="/casa?as=${encodeURIComponent(c.id)}" target="_blank" rel="noopener">Vista cliente <span aria-hidden="true">↗</span></a></div></article>`;
  }
  function maintenanceCard(row) {
    const m=row.source;
    return `<article class="pdos-record"><div class="pdos-row-head"><div><p class="pdos-eyebrow">Manutenzione${m.priority==='urgent'?' · Urgente':''}</p><h3>${esc(m.title || 'Richiesta senza titolo')}</h3></div>${badge(row.statusLabel,m.status==='resolved'?'good':m.priority==='urgent'?'attention':'neutral')}</div>${m.description?`<p class="pdos-description">${esc(m.description)}</p>`:''}<dl class="pdos-facts">${detail('Aperta il',date(row.createdDate))}${detail('Tecnico',m.technician || 'Da assegnare')}${row.status==='resolved' && row.resolvedDate?detail('Risoluzione registrata',date(row.resolvedDate)):''}</dl>${button('Apri richiesta','maintenance',m.id)}</article>`;
  }
  function nextAction(m) {
    const urgent = m.maintenance.find(x => x.priority==='urgent' && ['open','in_progress','pending'].includes(x.status));
    if (urgent) return {label:'Una richiesta urgente',text:urgent.title || 'Controlla la manutenzione e il prossimo intervento.',cta:'Apri richiesta',action:'maintenance',id:urgent.id};
    if(m.issues.some(i=>i.code==='relationship_conflict')) return {label:'Collegamenti discordanti',text:'Controlla i riferimenti dell’immobile prima di procedere con le rate.',cta:'Vedi verifiche',action:'issues',id:''};
    const payment=m.payments.find(x => x.state==='reported') || m.payments.find(x=>x.state==='overdue');
    if(payment) return {label:payment.state==='reported'?'Un pagamento da verificare':(payment.isRent?'Un canone in ritardo':'Un addebito in ritardo'),text:(payment.tenantName || 'Conduttore da collegare')+' · '+money(payment.amount),cta:'Controlla rata',action:'payment',id:payment.id};
    const issue=m.issues?.length;
    if(issue) return {label:'Collegamenti da verificare',text:'Alcuni dati hanno riferimenti mancanti o discordanti. Apri i dettagli prima di procedere.',cta:'Vedi verifiche',action:'issues',id:''};
    return {label:'Il prossimo passo, nel suo contesto',text:'Apri contratti, canoni o richieste. Qui trovi le informazioni già collegate a questo immobile.',cta:'Vedi attività',action:'tab',id:'activity'};
  }
  function notice(load, m) {
    const capped=[['properties',400],['contracts',800],['users',800],['payments',3000],['documents',1500],['maintenance',600]].some(([key,max]) => (load.counts?.[key] || 0)>=max);
    const labels={initial:'Ultima lettura non ancora disponibile.',cached:'Ultimi dati salvati · aggiornamento in attesa.',loading:'Aggiornamento in corso…',error:'Aggiornamento non riuscito. I dati precedenti restano visibili.',ready:'Ultima lettura '+(load.checkedAt ? date(load.checkedAt)+' · '+new Date(load.checkedAt).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}) : '')};
    const tasksWarning=load.tasks?.status==='error'?' · Attività non aggiornate: lettura non riuscita.':(load.tasks?.count || 0)>=800?' · Attività parziali: limite di 800 record.':'';
    return `<div class="pdos-source" role="status"><span>${esc(labels[load.status] || labels.initial)}${capped?' · Archivio parziale: raggiunto il limite di caricamento.':' · Sono mostrati i record caricati nel portale.'}${tasksWarning}</span><button class="pdos-button" data-pdos-action="refresh" ${load.status==='loading'?'disabled':''}>${load.status==='loading'?'Aggiornamento…':'Aggiorna'}</button></div>`;
  }
  function tasksNotice(load) {
    const tasks=load.tasks || {}, labels={initial:'Attività: lettura non ancora disponibile.',cached:'Attività salvate · aggiornamento in attesa.',loading:'Aggiornamento attività in corso…',error:'Lettura attività non riuscita. Restano visibili gli ultimi dati disponibili, anche nella cronologia.',ready:'Attività aggiornate'+(tasks.checkedAt?' il '+date(tasks.checkedAt)+' · '+new Date(tasks.checkedAt).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}):'.')};
    return `<p class="pdos-note" role="status">${esc(labels[tasks.status] || labels.initial)}${tasks.count>=800?' Archivio attività parziale: raggiunto il limite di 800 record.':''}</p>`;
  }
  function render(state, route, load={status:'initial'}) {
    if (state?.profile?.role !== 'admin') return '<div class="property-dossier">'+empty('Accesso riservato','Il fascicolo operativo è disponibile agli amministratori.')+'</div>';
    if (!route || route.invalid) return `<div class="property-dossier">${button('Torna agli immobili','back')}${empty('Collegamento non valido','Apri un immobile dall’elenco per ritrovare il suo fascicolo.')}</div>`;
    const m=Engine.build({...state,propertyId:route.id});
    if (!m.property) return `<div class="property-dossier">${button('Torna agli immobili','back')}${notice(load,m)}${empty('Immobile non disponibile','Questo immobile non è presente nei dati caricati. Aggiorna oppure torna all’elenco.')}</div>`;
    const p=m.property, docs=linkedDocuments(m), action=nextAction(m);
    const image=safeURL(p.heroPhoto || p.coverImage || p.image || p.imageUrl || (Array.isArray(p.photos) && (p.photos[0]?.url || p.photos[0])));
    const availability={available:'Disponibile',negotiation:'In trattativa',rented:'Affittato',off_market:'Fuori mercato'}[p.availabilityStatus] || 'Disponibilità da verificare';
    let body='';
    if(route.tab==='overview') {
      const owner = `<div class="pdos-person"><div class="pdos-avatar" aria-hidden="true">${esc((m.owner?.name || '?').trim().charAt(0))}</div><div><p class="pdos-eyebrow">Proprietario</p><h3>${esc(m.owner?.name || 'Da collegare')}</h3><p>${esc(m.owner?.email || 'Recapito non indicato')}</p></div>${m.owner?button('Scheda','person',m.owner.id):''}</div>`;
      const tenants = m.tenants.filter(t=>t.active).map(t=>`<div class="pdos-person"><div class="pdos-avatar" aria-hidden="true">${esc((t.name || '?').trim().charAt(0))}</div><div><p class="pdos-eyebrow">Conduttore · contratto attivo</p><h3>${esc(t.name || 'Da collegare')}</h3><p>${esc(t.user?.email || 'Recapito non indicato')}</p></div>${t.user?button('Scheda','person',t.user.id):''}</div>`).join('');
      body=`<div class="pdos-grid"><div>${section('Da seguire',`<div class="pdos-next"><p class="pdos-eyebrow">${esc(action.label)}</p><h3>${esc(action.text)}</h3>${button(action.cta,action.action,action.id,'primary')}</div>`)}${section('Persone',owner+tenants+(!m.activeContracts.length?'<p class="pdos-note">Nessun contratto con stato attivo nei dati caricati.</p>':''))}</div><div>${section('L’immobile',`<dl class="pdos-facts pdos-property-facts">${detail('Indirizzo',p.address)}${detail('Zona',p.zone)}${detail('Superficie',p.sqm!=null&&p.sqm!==''?p.sqm+' m²':null)}${detail('Locali',p.rooms)}${detail('Bagni',p.bathrooms)}${detail('Piano',p.floor)}${detail('Tipologia',({apartment:'Appartamento',studio:'Monolocale',room:'Stanza',house:'Casa',loft:'Loft'})[p.propertyType] || p.propertyType)}</dl>`)}${section('Strumenti',`<div class="pdos-tool-list"><a class="pdos-button" href="/inventario?p=${encodeURIComponent(p.id)}" target="_blank" rel="noopener">Inventario <span aria-hidden="true">↗</span></a>${button('Valutazione immobile','valuation',p.id)}<details class="pdos-manage"><summary>Gestisci immobile</summary>${button('Elimina immobile','delete',p.id,'danger')}</details>${safeURL(p.youtubeUrl)?`<a class="pdos-button" href="${esc(safeURL(p.youtubeUrl))}" target="_blank" rel="noopener">Video dell’immobile ↗</a>`:''}</div>`)}</div></div>${p.notes?section('Note dell’immobile',`<p class="pdos-description">${esc(p.notes)}</p>`):''}`;
    } else if(route.tab==='contracts') {
      body=section('Contratti collegati',m.contracts.length?`<div class="pdos-records">${m.contractRows.map(c=>contractCard(c,m)).join('')}</div>`:empty('Nessun contratto collegato','La presenza dell’immobile non conferma una locazione attiva.'));
    } else if(route.tab==='rent') {
      const totals=m.totals;
      body=section('Canoni per il proprietario',`<p class="pdos-note">Tutti i periodi registrati. Canoni e depositi sono distinti dai compensi dell’agenzia.</p><div class="pdos-metrics">${[['Incassato',totals.paid],['Da pagare',totals.pending],['Segnalato',totals.reported],['In corso',totals.processing]].map(([label,n])=>`<div><span>${label}</span><strong>${money(n)}</strong></div>`).join('')}</div>${m.payments.length?`<div class="pdos-payment-list">${m.payments.map(r=>`<article class="pdos-payment"><div><strong>${esc(r.month || 'Periodo da verificare')}${r.payment.coversTo?' → '+esc(r.payment.coversTo):''}</strong><p>${esc(r.isRent ? 'Canone' : 'Deposito / altro addebito')} · ${esc(r.tenantName || 'Conduttore da collegare')}</p><small>${r.state==='paid'?'Pagato il':'Scadenza'} ${esc(date(r.state==='paid'?(r.payment.paidDate || r.payment.paidAt):r.payment.dueDate))}</small></div><div><strong>${money(r.amount)}</strong>${badge(rentLabels[r.state] || 'Da verificare',r.state==='paid'?'good':['reported','overdue','unknown'].includes(r.state)?'attention':'neutral')}</div>${button('Dettagli rata','payment',r.id)}</article>`).join('')}</div>`:empty('Nessuna rata collegata','Nessun incasso o debito viene dedotto dal solo contratto.')}${totals.unknownAmountCount?'<p class="pdos-note">Sono presenti importi da verificare, esclusi dai totali.</p>':''}`);
    } else if(route.tab==='documents') {
      body=section('Documenti dell’immobile',`<p class="pdos-note">Archivio, contratti e fascicolo ARPE. Il collegamento del file non certifica una firma o un pagamento.</p>${docs.length?`<div class="pdos-document-list">${docs.map(d=>`<article class="pdos-document"><div><p class="pdos-eyebrow">${esc(d.type)}</p><h3>${esc(d.name)}</h3><p>${esc(date(d.at))}</p></div>${safeURL(d.url)?`<a class="pdos-button" href="${esc(safeURL(d.url))}" target="_blank" rel="noopener">Apri documento <span aria-hidden="true">↗</span></a>`:badge('File non disponibile','attention')}</article>`).join('')}</div>`:empty('Nessun documento collegato','I documenti generici della persona non vengono attribuiti automaticamente a questo immobile.')}`);
    } else {
      body=section('Manutenzioni',m.maintenance.length?`<div class="pdos-records">${m.maintenanceRows.map(maintenanceCard).join('')}</div>`:empty('Nessuna richiesta collegata','Non risultano manutenzioni per questo immobile nei dati caricati.'));
      body+=section('Attività collegate',`<p class="pdos-note">Attività con un riferimento esplicito all’immobile. Le decisioni della Segreteria restano in Oggi.</p>${tasksNotice(load)}${m.tasks.length?m.taskRows.map(row=>{const t=row.source;return `<article class="pdos-document"><div><h3>${esc(t.title || 'Attività')}</h3><p>${esc(row.statusLabel)} · ${esc(date(row.dueDate))}</p></div>${button('Apri attività','task',t.id)}</article>`;}).join(''):empty(load.tasks?.status==='ready'?'Nessuna attività collegata nei dati caricati':'Attività non ancora disponibili','La vista comprende solo le attività caricate e collegate in modo certo.')}`);
    }
    if(route.tab==='activity' && m.timeline.length) {
      body+=section('Cronologia registrata',`<ol class="pdos-timeline">${m.timeline.slice(0,30).map(e=>`<li><time>${esc(date(e.date))}</time><div><h3>${esc(e.label)}</h3><p>${esc(e.detail || '')}</p></div>${['contract','maintenance','task','payment'].includes(e.kind)?button('Apri fonte',e.kind,e.recordId):''}</li>`).join('')}</ol>${m.timeline.length>30?'<p class="pdos-note">Mostrati gli ultimi 30 eventi. I record completi restano nelle sezioni del fascicolo.</p>':''}`);
    }
    const issues=m.issues || [];
    return `<div class="property-dossier" data-property="${esc(p.id)}"><div class="pdos-topline">${button('← Indietro','back')}<span>BOOM / IMMOBILI</span></div><header class="pdos-header"><div class="pdos-cover">${image?`<img src="${esc(image)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:icon}</div><div class="pdos-identity"><p class="pdos-eyebrow">Fascicolo immobile</p><h1 id="pdos-title" tabindex="-1">${esc(p.name || 'Immobile senza nome')}</h1><p>${esc(p.address || 'Indirizzo non indicato')}${p.zone?' · '+esc(p.zone):''}</p><div class="pdos-chips">${badge(availability)}${badge(m.activeContracts.length+(m.activeContracts.length===1?' contratto attivo':' contratti attivi'),m.activeContracts.length?'good':'neutral')}</div></div>${button('Modifica immobile','edit',p.id)}</header>${notice(load,m)}<nav class="pdos-tabs" aria-label="Sezioni del fascicolo">${tabs.map(([key,label])=>`<a href="#${routeFor(p.id,key)}" data-pdos-tab="${key}" ${route.tab===key?'aria-current="page"':''}>${label}${key==='documents'?` <span>${docs.length}</span>`:key==='contracts'?` <span>${m.contracts.length}</span>`:''}</a>`).join('')}</nav><div class="pdos-content" id="pdos-content">${body}</div>${issues.length?`<details class="pdos-issues" id="pdos-issues"><summary>${issues.length} riferimenti da verificare</summary><p>Questi record hanno dati mancanti o collegamenti discordanti. Nessuna associazione è dedotta dal nome della persona.</p><ul>${issues.map(i=>`<li>${esc(i.message || 'Riferimento da verificare')}${i.id?' · '+esc(i.id):''}</li>`).join('')}</ul></details>`:''}<footer class="pdos-footer">Gestione immobiliare BOOM</footer></div>`;
  }

  let adapter, origin=null, focusRequest=null, bound=false, lastPage=null, sourceFocus=null;
  const load = {status:'initial',checkedAt:null,counts:{},tasks:{status:'initial',checkedAt:null,count:0}};
  function configure(value) {
    adapter=value;
    if(bound || !root.document) return; bound=true;
    root.document.addEventListener('click', event => {
      const tab=event.target.closest('[data-pdos-tab]');
      if(tab && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button===0) {
        event.preventDefault(); const route=parseRoute(adapter.state().page);
        if(route && !route.invalid) {focusRequest='tab';adapter.navigate(routeFor(route.id,tab.dataset.pdosTab));} return;
      }
      const control=event.target.closest('[data-pdos-action]');
      if(!control || !control.closest('.property-dossier')) return;
      const state=adapter.state(); if(state.profile?.role!=='admin') return;
      const kind=control.dataset.pdosAction,id=control.dataset.id;
      if(kind==='back') { focusRequest='return'; adapter.navigate(origin?.page || 'properties'); return; }
      if(kind==='refresh') { if(load.status!=='loading') adapter.refresh(); return; }
      const route=parseRoute(state.page); if(!route || route.invalid) return;
      const m=Engine.build({...state,propertyId:route.id}); if(!m.property) return;
      if(kind==='tab') {focusRequest='tab';adapter.navigate(routeFor(route.id,id));}
      else if(kind==='issues') {const el=root.document.getElementById('pdos-issues');if(el){el.open=true;el.querySelector('summary').focus();el.scrollIntoView({block:'center'});}}
      else if(kind==='payment') {const row=m.payments.find(r=>r.id===id);if(row)adapter.actions.payment(row.unitId,row.month,row.id);}
      else if(kind==='contract' && m.contracts.some(c=>c.id===id)) adapter.actions.contract(id);
      else if(kind==='maintenance' && m.maintenance.some(c=>c.id===id)) adapter.actions.maintenance(id);
      else if(kind==='task' && m.tasks.some(c=>c.id===id)) adapter.actions.task(id);
      else if(kind==='person' && (m.owner?.id===id || m.tenants.some(t=>t.user?.id===id))) adapter.actions.person(id);
      else if(kind==='edit' && m.property.id===id) adapter.actions.edit(m.property);
      else if(kind==='delete' && m.property.id===id) adapter.actions.remove(m.property);
      else if(kind==='valuation' && m.property.id===id) adapter.actions.valuation(id);
    });
  }
  function open(id, context=null) {
    if(!adapter || adapter.state().profile?.role!=='admin') return;
    const state=adapter.state();
    if(!parseRoute(state.page)) origin={page:state.page,scroll:root.scrollY || 0,search:root.document.getElementById('propertySearch')?.value || '',filter:root.document.querySelector('#main [data-filter]:not(.btn-secondary)')?.dataset.filter || 'all',id,context};
    root.document.getElementById('modals')?.replaceChildren();
    root.document.body.classList.remove('modal-open');
    focusRequest='title';adapter.navigate(routeFor(id));
  }
  function afterRender() {
    if(!adapter) return;
    const currentPage=adapter.state().page, changed=currentPage!==lastPage;
    lastPage=currentPage;
    const route=parseRoute(currentPage);
    if(route) {
      if(focusRequest) {const target=root.document.querySelector(focusRequest==='tab'?'.pdos-tabs [aria-current]':'#pdos-title'); target?.focus({preventScroll:true});focusRequest=null;}
    } else if(changed && currentPage==='properties' && origin?.page==='properties') {
      const search=root.document.getElementById('propertySearch'); if(search)search.value=origin.search;
      root.document.querySelectorAll('#main [data-filter]').forEach(b=>b.classList.toggle('btn-secondary',b.dataset.filter!==origin.filter));
      root.document.querySelectorAll('.property-item').forEach(row=>{row.style.display=(origin.filter==='all'||row.dataset.avail===origin.filter) && (row.dataset.search||'').includes(origin.search.toLowerCase().trim())?'':'none';});
      // Let goTo's mobile wrapper adopt the section, then complete its row
      // transformation before restoring position (its normal debounce is 70ms).
      root.requestAnimationFrame(()=>{
      if(adapter.state().page!==currentPage)return;
      root.BOOM_MOBILE?.refresh?.();
      root.requestAnimationFrame(()=>{
      if(adapter.state().page!==currentPage)return;
      const row=Array.from(root.document.querySelectorAll('[data-property-id]')).find(el=>el.dataset.propertyId===origin.id); row?.focus({preventScroll:true});root.scrollTo(0,origin.scroll);focusRequest=null;
      });
      });
    } else if(changed && origin?.page===currentPage) {
      adapter.restoreOrigin?.(origin);
      focusRequest=null;
    }
  }
  function setSourceState(status) {
    load.status=status;
    if(status==='ready') {load.checkedAt=new Date().toISOString();const s=adapter?.state() || {};['properties','contracts','users','payments','documents','maintenance'].forEach(k=>load.counts[k]=(s[k]||[]).length);}
    if(status==='cached') {load.checkedAt=null;load.tasks={status:'cached',checkedAt:null,count:(adapter?.state().tasks || []).length};}
    renderSourceUpdate(status);
  }
  function setTasksSourceState(status) {
    load.tasks.status=status;
    if(status==='ready') {load.tasks.checkedAt=new Date().toISOString();load.tasks.count=(adapter?.state().tasks || []).length;}
    renderSourceUpdate(status);
  }
  function renderSourceUpdate(status) {
    if(adapter && parseRoute(adapter.state().page)) {
      const active=root.document.activeElement;
      const current=active?.dataset?.pdosAction ? {action:active.dataset.pdosAction,id:active.dataset.id} : active?.dataset?.pdosTab ? {tab:active.dataset.pdosTab} : null;
      if(status==='loading')sourceFocus=current;
      const restore=current || (active===root.document.body ? sourceFocus : null);
      adapter.render();
      if(restore)Array.from(root.document.querySelectorAll('[data-pdos-action],[data-pdos-tab]')).find(el=>!el.disabled && (restore.tab ? el.dataset.pdosTab===restore.tab : el.dataset.pdosAction===restore.action && el.dataset.id===restore.id))?.focus({preventScroll:true});
      if(status!=='loading')sourceFocus=null;
    }
  }
  const API={parseRoute,routeFor,render,safeURL,configure,open,afterRender,setSourceState,setTasksSourceState,load};
  if(typeof module==='object' && module.exports) module.exports=API;
  root.BOOM_PROPERTY_DOSSIER=API;
})(typeof window!=='undefined'?window:globalThis);
