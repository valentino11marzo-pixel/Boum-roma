/* Admin-only evidence workspace. API owns persistence; browser state is ephemeral. */
(function(root) {
  'use strict';
  const E=typeof module==='object'&&module.exports?require('./invoice-reconciliation-engine.js'):root.BOOM_INVOICE_RECONCILIATION;
  const tabs=[['invoices','Fatture Zucchetti'],['cases','Dati e verifiche'],['payments','Incassi Stripe'],['settlements','Stripe → Sella'],['costs','Costi Stripe'],['sources','Fonti']];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>v===null?'Non disponibile':new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(v/100);
  const date=v=>v?new Date(v+'T12:00:00Z').toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric'}):'Da verificare';
  const badge=(label,tone='')=>`<span class="fi-badge ${tone}">${esc(label)}</span>`;
  const table=(headers,rows)=>rows.length?`<div class="fi-scroll"><table><thead><tr>${headers.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(c=>`<tr>${c.map(t=>`<td>${t}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:'<p class="fi-empty">Nessuna voce corrisponde ai filtri.</p>';
  const source=(d,id)=>esc(d.sources.find(s=>s.id===id)?.label||'Fonte non disponibile');
  const card=(label,value,note)=>`<div class="fi-stat"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`;
  function content(d,view,q,filter) {
    const includes=r=>JSON.stringify(r).toLocaleLowerCase('it-IT').includes(q.toLocaleLowerCase('it-IT'));
    if(view==='invoices')return table(['Documento / cliente','Totale','Esito fiscale','Incasso','Fonte'],d.invoices.filter(includes).filter(r=>filter==='all'||r.status===filter).map(r=>[
      `<strong>${esc(r.number)} · ${esc(r.party)}</strong><small>${date(r.date)}</small>`,money(r.amountCents),badge(E.fiscalLabels[r.status],r.status==='rejected'?'fi-alert':'')+(r.errors.length?`<small>Codici: ${esc(r.errors.join(', '))}</small>`:''),badge(E.paymentLabels[r.paymentStatus])+`<small>${esc(r.paymentEvidence)}</small>`,source(d,r.sourceId)
    ]));
    if(view==='cases')return d.cases.filter(includes).map(r=>`<article class="fi-case"><div><p class="fi-eyebrow">${r.invoiceId?'Documento '+esc(d.invoices.find(i=>i.id===r.invoiceId)?.number):'Operazione da classificare'}</p><h3>${esc(r.party)}</h3><p>${esc(r.issue)}</p></div><div><strong>Prossimo passo</strong><p>${esc(r.nextAction)}</p><details><summary>Evidenze disponibili</summary><p>${esc(r.evidence)}</p><small>${source(d,r.sourceId)}</small></details></div></article>`).join('')||'<p class="fi-empty">Nessuna verifica corrisponde alla ricerca.</p>';
    if(view==='payments')return `<p class="fi-help">Date UTC del CSV. Rimborsi cumulati riportati nell’esportazione. Lordo, rimborsi e commissioni restano separati; un candidato di abbinamento non certifica la copertura della fattura. Sono inclusi anche i tentativi e le date fuori dal periodo del riepilogo.</p>`+table(['Data / cliente','Lordo','Rimborsi','Commissioni','Incasso e classificazione','Riscontro'],d.payments.filter(includes).map(r=>[`${date(r.date)}<strong>${esc(r.party)}</strong><small>${esc(r.id)}</small>`,money(r.amountCents),money(r.refundCents),money(r.feeCents),badge(r.captured?'Acquisito':'Senza incasso',r.captured?'':'fi-muted')+`<small>${esc(r.status)} · ${esc(r.classification)}</small>`,`<p>${esc(r.note)}</p>${r.invoiceCandidate?badge('Candidato: '+d.invoices.find(i=>i.id===r.invoiceCandidate)?.number):''}<small>${source(d,r.sourceId)}</small>`]));
    if(view==='settlements')return `<p class="fi-help">Riscontro per importo, data e causale. L’identificativo payout non è verificato nel testo banca. Questi trasferimenti non si sommano di nuovo agli incassi dei clienti.</p>`+table(['Payout / data','Netto Stripe','Movimento Sella','Esito'],d.settlements.filter(includes).map(r=>[`${esc(r.id)}<small>${date(r.date)}</small>`,money(r.netCents),money(r.bankNetCents)+`<small>${esc(r.bankRef||'Riferimento mancante')}</small>`,badge(r.bankNetCents!==null&&r.bankRef&&r.netCents===r.bankNetCents?'Importo riscontrato':'Da verificare')+`<small>${esc(r.note)}</small>`]));
    if(view==='costs')return `<p class="fi-help">Fatture passive del servizio Stripe. Confronto con le commissioni del CSV e gli altri costi identificati. Il costo già trattenuto non diventa un nuovo pagamento. Trattamento contabile da confermare con la commercialista.</p>`+table(['Fattura / periodo','Totale PDF','Commissioni carte','Altri costi','IVA nel PDF','Differenza'],d.costs.filter(includes).map(r=>[`${esc(r.id)}<small>${esc(r.period)} · ${source(d,r.sourceId)}</small>`,money(r.amountCents),money(r.cardFeeCents),money(r.otherFeeCents),money(r.vatCents),money(r.amountCents-r.cardFeeCents-r.otherFeeCents-r.vatCents)]));
    return table(['Fonte','Metodo e limiti','Controllata il'],d.sources.filter(includes).map(r=>[esc(r.label),esc(r.method),date(r.checkedOn)]));
  }
  function render(state) {
    const d=state.preview?.data||state.snapshot?.data;
    const heading=`<header class="fi-header"><div><p class="fi-eyebrow">AMMINISTRAZIONE · BOOM</p><h1>Fatture BOOM</h1><p>Fatture, incassi e dati da completare, nello stesso posto.</p></div><div class="fi-actions"><button class="btn btn-secondary" data-fi="refresh" ${state.busy?'disabled':''}>Rileggi archivio</button><label class="btn btn-secondary">Importa riconciliazione<input aria-label="Importa riconciliazione" type="file" accept=".json,application/json" data-fi-file ${state.busy?'disabled':''}></label>${d?'<button class="btn btn-secondary" data-fi="export">Esporta dati</button>':''}</div></header>`;
    const warning=state.error?`<p class="fi-notice fi-alert" role="alert">${esc(state.error)}</p>`:'';
    const loading=state.busy?'<p role="status" class="fi-notice">Caricamento in corso…</p>':'';
    if(!d)return heading+warning+loading+`<div class="fi-empty"><h2>${state.busy?'Lettura dell’archivio':'Nessuna riconciliazione importata'}</h2><p>Importa il prospetto verificato: vedrai prima l’anteprima, poi potrai archiviarlo. Le registrazioni interne sono disponibili qui sotto.</p></div>`;
    const s=E.summary(d), isPreview=!!state.preview;
    const notice=`<div class="fi-notice ${isPreview?'fi-preview':''}" role="status"><strong>${isPreview?'Anteprima da confermare':'Archivio delle evidenze'} · ${esc(d.company)}</strong><p>Fonti controllate al ${date(d.asOf)}. Riepilogo incassi dal ${date(d.periodStart)} al ${date(d.periodEnd)}. Questa lettura non aggiorna Zucchetti, Stripe o Sella.</p>${isPreview?'<p>La conferma archivia questo prospetto. Non emette fatture, non modifica gli incassi e non invia comunicazioni.</p><div class="fi-actions"><button class="btn" data-fi="confirm">Conferma importazione</button><button class="btn btn-secondary" data-fi="cancel">Annulla anteprima</button></div>':''}${state.message?`<p>${esc(state.message)}</p>`:''}</div>`;
    const stats=`<div class="fi-stats">${card('Fatture Zucchetti',s.invoiceCount,'Esito fiscale separato dall’incasso')}${card('Scartate',s.rejectedCount,money(s.rejectedCents)+' · da risolvere')}${card('Mancata consegna',s.undeliveredCount,'Esito distinto dallo scarto')}${card('Stripe → Sella',s.matchedCount+'/'+s.settlementCount,money(s.settlementNetCents)+' netto trasferimenti')}${card('Costi Stripe documentati',money(s.costCents),d.costs.length+' fatture passive')}</div>`;
    const financial=`<p class="fi-help">Nel periodo: ${s.capturedCount} incassi su ${s.attemptCount} tentativi · lordo ${money(s.grossCents)} · rimborsi nell’export ${money(s.refundCents)} · commissioni note ${money(s.feeCents)}${s.unknownFeeCount?' · '+s.unknownFeeCount+' costi mancanti':''}. ${s.unmatchedCount?s.unmatchedCount+' trasferimenti da verificare.':''}</p>`;
    const nav=`<nav class="fi-tabs" aria-label="Viste fatturazione">${tabs.map(([id,label])=>`<button type="button" data-fi-tab="${id}" aria-current="${state.tab===id?'page':'false'}">${esc(label)}${id==='cases'?' ('+s.caseCount+')':''}</button>`).join('')}</nav>`;
    const tools=`<div class="fi-filters"><label>Cerca<input class="form-input" type="search" aria-label="Cerca nella riconciliazione" data-fi-search value="${esc(state.search)}" placeholder="Cliente, numero, riferimento…"></label>${state.tab==='invoices'?`<label>Esito fiscale<select class="form-input" data-fi-status aria-label="Esito fiscale"><option value="all">Tutti gli esiti</option>${Object.entries(E.fiscalLabels).map(([v,l])=>`<option value="${v}" ${state.filter===v?'selected':''}>${l}</option>`).join('')}</select></label>`:''}</div>`;
    return heading+warning+loading+notice+stats+financial+nav+tools+`<div data-fi-results>${content(d,state.tab,state.search,state.filter)}</div><details class="fi-limits"><summary>Ambito e limiti del prospetto</summary><p>${esc(d.note)}</p></details>`;
  }
  let active=null;
  function mount(host,options) {
    if(!host)return;
    const state={snapshot:null,preview:null,tab:'invoices',search:'',filter:'all',busy:false,error:'',message:''};
    const instance={host,options,state};active=instance;
    const current=()=>active===instance && host.isConnected && options.authorized();
    const draw=()=>{if(current())host.innerHTML=render(state);};
    const request=async(body)=>{
      const token=await options.token();if(!current())throw new Error('session_changed');
      const res=await fetch('/api/accounting/reconciliation',{method:body?'POST':'GET',cache:'no-store',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
      const data=await res.json();if(!res.ok||!data.ok)throw new Error(data.error||'request_failed');return data;
    };
    const refresh=async()=>{if(state.busy||state.preview)return;state.busy=true;state.error='';state.message='';draw();try{const r=await request();if(current())state.snapshot=r.snapshot;}catch(_){if(current())state.error='Lettura non riuscita. Gli eventuali dati precedenti restano visibili; riprova con Rileggi archivio.';}finally{state.busy=false;draw();}};
    host.addEventListener('click',async event=>{
      const tab=event.target.closest('[data-fi-tab]');if(tab&&current()){state.tab=tab.dataset.fiTab;state.search='';draw();return;}
      const button=event.target.closest('[data-fi]');if(!button||!current()||state.busy)return;
      const action=button.dataset.fi;
      if(action==='refresh'){if(state.preview){state.error='Chiudi o conferma l’anteprima prima di rileggere l’archivio.';draw();}else await refresh();}
      if(action==='cancel'){state.preview=null;state.error='';state.message='';draw();}
      if(action==='export'){
        const d=state.preview?.data||state.snapshot?.data;if(!d)return;
        const blob=new Blob([JSON.stringify(d,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='BOOM-riconciliazione-'+d.asOf+'.json';a.click();URL.revokeObjectURL(url);
      }
      if(action==='confirm'&&state.preview){
        state.busy=true;state.error='';draw();try {
          const r=await request({action:'import',data:state.preview.data,digest:state.preview.digest,confirmed:true});
          if(current()){state.snapshot=r.snapshot;state.preview=null;state.message=r.duplicate?'Questo prospetto era già archiviato: nessun duplicato creato.':'Prospetto archiviato. Nessuna fattura o registrazione di incasso modificata.';}
        }catch(_){if(current())state.error='Importazione non confermata. L’anteprima resta disponibile: puoi riprovare senza creare duplicati.';}finally{state.busy=false;draw();}
      }
    });
    host.addEventListener('input',event=>{if(!event.target.matches('[data-fi-search]')||!current())return;state.search=event.target.value;const d=state.preview?.data||state.snapshot?.data;if(d)host.querySelector('[data-fi-results]').innerHTML=content(d,state.tab,state.search,state.filter);});
    host.addEventListener('change',async event=>{
      if(!current())return;
      if(event.target.matches('[data-fi-status]')){state.filter=event.target.value;draw();return;}
      if(!event.target.matches('[data-fi-file]')||state.busy)return;
      const file=event.target.files?.[0];if(!file)return;state.busy=true;state.error='';state.message='';draw();
      try {
        if(file.size>550000)throw new Error('file_too_large');
        const checked=E.normalize(JSON.parse(await file.text()));if(!checked.ok)throw new Error('invalid_snapshot');
        const preview=await request({action:'preview',data:checked.data});if(current()){state.preview=preview;state.tab='invoices';state.search='';state.filter='all';}
      }catch(_){if(current())state.error='File non importato: serve un prospetto BOOM valido, con fonti, importi in centesimi e riferimenti univoci (massimo 550 KB). Nessun dato è stato scritto.';}finally{state.busy=false;draw();}
    });
    draw();return refresh();
  }
  const api={render,content,mount};if(typeof module==='object'&&module.exports)module.exports=api;else root.BOOM_INVOICE_WORKSPACE=api;
})(typeof globalThis!=='undefined'?globalThis:this);
