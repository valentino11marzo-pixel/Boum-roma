(function(root){
  'use strict';
  var states={},context=null;
  var E=root.BOOM_TENANT_WORKSPACE;
  var words={
    en:{loading:'Loading your archive…',docsError:'Your archive could not be loaded.',retry:'Try again',search:'Search documents',empty:'No additional files have been published yet.',noResults:'No matching documents.',files:'available files',limit:'This list may be incomplete. Contact BOOM if something is missing.',ticketsError:'Your requests could not be loaded.',loadingTickets:'Loading requests…',newTicket:'Report a problem',intro:'Describe what happened and when you are available. You can update your request after sending it.',category:'What needs attention?',priority:'Urgency',normal:'Normal',high:'High',urgent:'Urgent',description:'What happened?',availability:'When can we contact you or arrange a visit?',availabilityHint:'Optional · days and time windows',send:'Send request to BOOM',save:'Save changes',saving:'Saving…',saved:'Saved in BOOM.',notSent:'Supplier forwarding is not active yet. BOOM will arrange the next step.',noSpend:'Sending a request does not book a visit or authorize any costs.',emergency:'Immediate danger? Contact the emergency services. This form is not an emergency response service.',myTickets:'Your requests',noTickets:'No requests for this home yet.',open:'Open',in_progress:'In progress',resolved:'Resolved',edit:'Edit request',cancel:'Cancel',updated:'Updated',short:'Describe the problem in 8–3,000 characters.',failure:'We could not confirm the save. Your draft is safe; try again.',stale:'The request has changed. Refresh the list before saving again; your draft has been kept.',refresh:'Refresh requests',uncertain:'A previous save still needs confirmation. Retry it before starting another request.',clear:'Discard this draft',readonly:'Contact BOOM to update this request.',idraulica:'Plumbing',elettricita:'Electricity',elettrodomestici:'Appliances',riscaldamento:'Heating',serrature:'Locks',altro:'Other'},
    it:{loading:'Caricamento del tuo archivio…',docsError:'Non è stato possibile caricare l’archivio.',retry:'Riprova',search:'Cerca nei documenti',empty:'Non sono ancora stati pubblicati altri file.',noResults:'Nessun documento corrispondente.',files:'file disponibili',limit:'L’elenco potrebbe essere incompleto. Contatta BOOM se manca qualcosa.',ticketsError:'Non è stato possibile caricare le richieste.',loadingTickets:'Caricamento richieste…',newTicket:'Segnala un problema',intro:'Descrivi cosa è successo e quando sei disponibile. Puoi aggiornare la richiesta dopo averla inviata.',category:'Dove serve assistenza?',priority:'Urgenza',normal:'Normale',high:'Alta',urgent:'Urgente',description:'Cosa è successo?',availability:'Quando possiamo contattarti o concordare una visita?',availabilityHint:'Facoltativo · giorni e fasce orarie',send:'Invia la richiesta a BOOM',save:'Salva modifiche',saving:'Salvataggio…',saved:'Salvato in BOOM.',notSent:'L’inoltro al fornitore non è ancora attivo. BOOM coordinerà il prossimo passo.',noSpend:'La richiesta non prenota una visita e non autorizza alcuna spesa.',emergency:'Pericolo immediato? Contatta i servizi di emergenza. Questo modulo non è un servizio di pronto intervento.',myTickets:'Le tue richieste',noTickets:'Nessuna richiesta per questa casa.',open:'Aperta',in_progress:'In lavorazione',resolved:'Risolta',edit:'Modifica richiesta',cancel:'Annulla',updated:'Aggiornata',short:'Descrivi il problema in 8–3.000 caratteri.',failure:'Non abbiamo conferma del salvataggio. La bozza è conservata: riprova.',stale:'La richiesta è cambiata. Aggiorna l’elenco prima di salvare; la tua bozza è conservata.',refresh:'Aggiorna richieste',uncertain:'Un precedente salvataggio è ancora da verificare. Riprovalo prima di aprire un’altra richiesta.',clear:'Elimina questa bozza',readonly:'Contatta BOOM per aggiornare questa richiesta.',idraulica:'Idraulica',elettricita:'Elettricità',elettrodomestici:'Elettrodomestici',riscaldamento:'Riscaldamento',serrature:'Serrature',altro:'Altro'}
  };
  function t(k){return words[context.lang==='it'?'it':'en'][k]||k}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function el(id){return document.getElementById(id)}
  function current(s){return context&&s.key===context.key}
  function draft(){return {description:'',availability:'',category:'idraulica',priority:'normal'}}
  function storageKey(s){return 'boom:maintenance-draft:'+s.key}
  function remember(s){try{sessionStorage.setItem(storageKey(s),JSON.stringify({form:s.form,pending:s.pending}))}catch(e){}}
  async function request(s,path,body){
    var token=await s.user.getIdToken();
    var controller=new AbortController(),timer=setTimeout(function(){controller.abort()},20000);
    try{
      var r=await fetch('/api/tenant/'+path+(body?'':'?contractId='+encodeURIComponent(s.contractId)),{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},cache:'no-store',signal:controller.signal,body:body?JSON.stringify(Object.assign({contractId:s.contractId},body)):undefined});
      var j=await r.json();if(!r.ok||!j.ok){var e=new Error(j.error||'failed');e.status=r.status;throw e}return j;
    }finally{clearTimeout(timer)}
  }
  function paintDocs(s){
    if(!current(s)||!el('tenantArchive'))return;
    var box=el('tenantArchive');
    if(s.docsState!=='ready'){box.innerHTML='<p class="tw-note" role="status">'+t(s.docsState==='error'?'docsError':'loading')+'</p>'+(s.docsState==='error'?'<button class="obtn" data-doc-retry>'+t('retry')+'</button>':'');return}
    box.innerHTML='<div class="tw-toolbar"><span>'+s.docs.length+' '+t('files')+'</span><button class="obtn" type="button" data-doc-retry>'+(context.lang==='it'?'Aggiorna archivio':'Refresh archive')+'</button></div><label class="fld"><span>'+t('search')+'</span><input id="tenantDocSearch" type="search" autocomplete="off" value="'+esc(s.search||'')+'"></label><div id="tenantDocResults"></div>'+(s.docsLimited?'<p class="tw-note">'+t('limit')+'</p>':'');
    filterDocs(s);
    el('tenantDocSearch').oninput=function(e){s.search=e.target.value;filterDocs(s)};
  }
  function filterDocs(s){
    var q=(s.search||'').toLocaleLowerCase();
    var rows=s.docs.filter(function(d){return (d.name+' '+d.type).toLocaleLowerCase().indexOf(q)>=0});
    el('tenantDocResults').innerHTML=rows.length?rows.map(function(d){return '<a class="dlink" href="'+esc(d.url)+'" target="_blank" rel="noopener noreferrer"><span class="ic" aria-hidden="true">↗</span><span>'+esc(d.name)+'<br><small>'+esc(d.type)+'</small></span><span class="go" aria-hidden="true">→</span></a>'}).join(''):'<p class="tw-note">'+t(s.docs.length?'noResults':'empty')+'</p>';
  }
  async function loadDocs(s){
    if(s.docsState==='loading')return;
    s.docsState='loading';paintDocs(s);
    try{var j=await request(s,'documents');if(!Array.isArray(j.documents))throw new Error('invalid_archive');s.docs=j.documents;s.docsLimited=j.limited;s.docsState='ready'}catch(e){s.docsState='error'}
    paintDocs(s);
  }
  function options(values,value){return values.map(function(v){return '<option value="'+v+'"'+(v===value?' selected':'')+'>'+t(v)+'</option>'}).join('')}
  function formHtml(s,id,data,editing){
    var locked=s.busy===id||(!editing&&!!s.pending);
    return '<form data-ticket-form="'+esc(id)+'"><fieldset'+(locked?' disabled':'')+' style="border:0;padding:0;margin:0"><div class="g2"><label class="fld"><span>'+t('category')+'</span><select name="category">'+options(E.categories,data.category)+'</select></label><label class="fld"><span>'+t('priority')+'</span><select name="priority">'+options(['normal','high','urgent'],data.priority)+'</select></label></div><label class="fld"><span>'+t('description')+'</span><textarea name="description" required minlength="8" maxlength="3000" rows="4">'+esc(data.description)+'</textarea></label><label class="fld"><span>'+t('availability')+'</span><input name="availability" maxlength="500" placeholder="'+t('availabilityHint')+'" value="'+esc(data.availability)+'"></label></fieldset><div class="tw-actions"><button class="obtn" type="submit"'+(s.busy?' disabled':'')+'>'+t(s.busy===id?'saving':editing?'save':s.pending?'retry':'send')+'</button>'+(editing?'<button class="obtn" type="button" data-cancel-edit>'+t('cancel')+'</button>':'')+'</div><p class="tw-note" role="status">'+esc(s.messages[id]?t(s.messages[id]):'')+'</p></form>';
  }
  function paintTickets(s){
    if(!current(s)||!el('tenantTickets'))return;
    var html=(s.messages.new==='saved'?'<p class="tw-note" role="status">'+t('saved')+'</p>':'')+'<details class="tw-compose"'+((s.composeOpen!==undefined?s.composeOpen:!s.tickets.length)||s.pending?' open':'')+'><summary>'+t('newTicket')+'</summary><p class="tw-note">'+t('intro')+'</p>';
    if(s.pending)html+='<p class="tw-note">'+t('uncertain')+'</p>';
    html+=formHtml(s,'new',s.form,false)+'<p class="tw-note">'+t('noSpend')+'</p><details class="tw-emergency"><summary>'+t('urgent')+'</summary><p>'+t('emergency')+'</p></details></details><div class="tw-toolbar"><h3 class="tw-heading">'+t('myTickets')+'</h3><button class="obtn" type="button" data-tickets-refresh>'+t('refresh')+'</button></div>';
    if(s.ticketsState!=='ready')html+='<p class="tw-note" role="status">'+t(s.ticketsState==='error'?'ticketsError':'loadingTickets')+'</p>';
    else if(!s.tickets.length)html+='<p class="tw-note">'+t('noTickets')+'</p>';
    else html+=s.tickets.map(function(m){
      return '<details class="tw-ticket"'+(s.open===m.id?' open':'')+' data-ticket="'+esc(m.id)+'"><summary><span><strong>'+esc(t(m.category))+'</strong><small>#'+esc(m.id.slice(-8))+' · '+t('updated')+' '+esc(date(m.updatedAt))+'</small></span><span class="st '+(m.status==='resolved'?'paid':'pending')+'">'+esc(t(m.status))+'</span></summary><div class="tw-ticket-body"><p class="tw-description">'+esc(m.description)+'</p>'+(m.availability?'<p class="tw-note">'+esc(m.availability)+'</p>':'')+'<p class="tw-note">'+t('notSent')+'</p>'+(s.edit===m.id?formHtml(s,m.id,s.edits[m.id],true):m.editable?'<button class="obtn" type="button" data-edit-ticket="'+esc(m.id)+'">'+t('edit')+'</button>':'<p class="tw-note">'+t('readonly')+'</p>')+'</div></details>';
    }).join('');
    if(s.ticketsLimited)html+='<p class="tw-note">'+t('limit')+'</p>';
    el('tenantTickets').innerHTML=html;
    el('tenantTickets').querySelectorAll('.tw-compose').forEach(function(node){node.ontoggle=function(){if(node.isConnected)s.composeOpen=node.open}});
    el('tenantTickets').querySelectorAll('[data-ticket]').forEach(function(node){node.ontoggle=function(){if(node.open)s.open=node.dataset.ticket;else if(s.open===node.dataset.ticket)s.open=null}});
    el('tenantTickets').querySelectorAll('form').forEach(function(form){
      form.oninput=function(){var id=form.dataset.ticketForm,data=id==='new'?s.form:s.edits[id];['category','priority','description','availability'].forEach(function(k){data[k]=form.elements[k].value});remember(s)};
      form.onsubmit=function(e){e.preventDefault();save(s,form.dataset.ticketForm)};
    });
  }
  function date(v){var d=new Date(v);return isNaN(d)?'—':d.toLocaleDateString(context.lang==='it'?'it-IT':'en-GB',{day:'numeric',month:'short'})}
  async function loadTickets(s){
    if(s.ticketsState==='loading')return;
    s.ticketsState='loading';paintTickets(s);
    try{var j=await request(s,'maintenance');if(!Array.isArray(j.tickets))throw new Error('invalid_tickets');s.tickets=j.tickets;s.ticketsLimited=j.limited;s.ticketsState='ready';if(s.edit&&s.edits[s.edit]){var updated=s.tickets.find(function(m){return m.id===s.edit});if(updated)s.edits[s.edit].revision=updated.revision}}catch(e){s.ticketsState='error'}
    paintTickets(s);
  }
  async function save(s,id){
    if(s.busy)return;
    var data=id==='new'?s.form:s.edits[id],input=E.input(data);
    if(!input){s.messages[id]='short';paintTickets(s);return}
    if(id==='new'&&!s.pending){s.pending=Object.assign({action:'create',requestId:crypto.randomUUID()},input);remember(s)}
    var body=id==='new'?s.pending:Object.assign({action:'update',ticketId:id,revision:data.revision},input);
    s.busy=id;s.messages[id]='';paintTickets(s);
    try{
      var j=await request(s,'maintenance',body);
      s.tickets=s.tickets.filter(function(m){return m.id!==j.ticket.id});s.tickets.unshift(j.ticket);s.open=j.ticket.id;
      s.messages[id]='saved';
      if(id==='new'){s.form=draft();s.pending=null;s.composeOpen=false;remember(s)}else{s.edit=null;delete s.edits[id]}
      // Refresh later is explicit; a successful save does not hide an earlier list failure.
    }catch(e){
      s.messages[id]=e.status===409?'stale':'failure';
      if(id==='new'&&e.status>=400&&e.status<500){s.pending=null;remember(s)}
    }
    s.busy=null;paintTickets(s);
  }
  function paintNotices(s){
    if(!current(s)||!el('tenantNotices'))return;
    var it=context.lang==='it';
    var body=s.noticeState==='error'?(it?'Non è stato possibile caricare gli avvisi.':'Your updates could not be loaded.'):
      s.noticeState!=='ready'?(it?'Caricamento avvisi…':'Loading updates…'):
      !s.notices.length?(it?'Nessun avviso personale disponibile.':'No personal updates available.'):
      s.notices.map(function(n){var date=new Date(n.createdAt);return '<article class="tw-notice"><strong>'+esc(n.title)+'</strong>'+(Number.isFinite(date.getTime())?'<time>'+esc(date.toLocaleDateString(it?'it-IT':'en-GB'))+'</time>':'')+'<p>'+esc(n.message)+'</p></article>'}).join('');
    el('tenantNotices').innerHTML='<div class="tw-toolbar"><h3>'+(it?'I tuoi avvisi':'Your updates')+'</h3><button type="button" class="obtn" data-notices-refresh'+(s.noticeState==='loading'?' disabled':'')+'>'+(it?'Aggiorna avvisi':'Refresh updates')+'</button></div><p class="tw-hint">'+(it?'Comunicazioni personali di tutte le tue case. Per lo stato aggiornato di una rata, consulta Pagamenti.':'Personal updates across your homes. Check Payments for the current status of an instalment.')+'</p><div role="status">'+body+'</div>'+(s.noticeLimited?'<p class="tw-hint">'+(it?'Sono mostrati fino a 50 avvisi.':'Showing up to 50 updates.')+'</p>':'');
  }
  async function loadNotices(s){
    if(s.noticeState==='loading')return;
    s.noticeState='loading';paintNotices(s);
    try{var j=await request(s,'notifications');s.notices=j.notifications||[];s.noticeLimited=j.limited;s.noticeState='ready'}catch(e){s.noticeState='error'}
    paintNotices(s);
  }
  function mount(opts){
    if(!opts.contract||!opts.contract.id)return;
    context={key:opts.user.uid+':'+opts.contract.id,lang:opts.lang};
    var s=states[context.key];
    if(!s){
      s=states[context.key]={key:context.key,contractId:opts.contract.id,user:opts.user,docs:[],tickets:[],form:draft(),edits:{},messages:{}};
      try{var saved=JSON.parse(sessionStorage.getItem(storageKey(s))||'null');if(saved&&E.input(saved.form)){s.form=saved.form;s.pending=saved.pending}}catch(e){}
    }
    paintDocs(s);paintTickets(s);paintNotices(s);
    if(el('tenantNotices'))el('tenantNotices').onclick=function(e){if(e.target.closest('[data-notices-refresh]'))loadNotices(s)};
    if(el('tenantArchive'))el('tenantArchive').onclick=function(e){if(e.target.closest('[data-doc-retry]'))loadDocs(s)};
    if(el('tenantTickets'))el('tenantTickets').onclick=function(e){
      var edit=e.target.closest('[data-edit-ticket]');
      if(edit){var m=s.tickets.find(function(x){return x.id===edit.dataset.editTicket});s.edit=m.id;s.open=m.id;s.edits[m.id]=s.edits[m.id]||Object.assign({},m);paintTickets(s)}
      if(e.target.closest('[data-cancel-edit]')){s.edit=null;paintTickets(s)}
      if(e.target.closest('[data-tickets-refresh]'))loadTickets(s);
    };
    if(!s.docsState)loadDocs(s);if(!s.ticketsState)loadTickets(s);if(!s.noticeState)loadNotices(s);
  }
  root.BOOM_TENANT_WORKSPACE_UI={mount:mount};
})(window);
