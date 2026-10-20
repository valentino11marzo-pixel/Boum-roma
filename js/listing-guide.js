/* Listing intake: same Portal fields and save operation, no model or second catalogue. */
(function(root) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const titles = ['Casa', 'Condizioni', 'Foto e testo', 'Controlla'];
  function mount(form, options) {
    if (!form || form._listingGuide) return;
    const modal = form.closest('.modal'), body = form.closest('.modal-body');
    let step = 0, preparing = false, saving = false, approved = false, attempted = false, disposed = false;
    const photos = [], panels = [...form.querySelectorAll('[data-lg-step]')];
    const active = () => !disposed && form.isConnected;
    const allowed = () => active() && options.allowed();
    const busy = () => preparing || saving;
    const value = name => form.elements.namedItem(name)?.value || '';
    form.noValidate = true;
    const progress = document.createElement('nav'); progress.className = 'lg-progress'; progress.setAttribute('aria-label', 'Passaggi nuova casa');
    progress.innerHTML = titles.map((t,i) => `<button type="button" data-lg-go="${i}"><span>${i+1}</span>${t}</button>`).join('');
    body.before(progress);
    const notice = document.createElement('p'); notice.className = 'lg-status'; notice.setAttribute('role','status'); notice.setAttribute('aria-live','polite');
    body.prepend(notice);
    const review = document.createElement('section'); review.dataset.lgStep = '3'; review.className = 'lg-review'; form.append(review); panels.push(review);
    const photoPanel = panels.find(p => p.querySelector('#imageFileInput'));
    photoPanel.innerHTML = `<h4>Quali foto mostriamo?</h4><p>La prima è la copertina. Aggiungi fino a 24 foto, poi scegli l’ordine.</p>
      <label class="lg-picker">Aggiungi foto<input type="file" accept="image/*" multiple aria-label="Aggiungi foto"></label>
      <div class="lg-gallery"></div><input type="hidden" name="image"><input type="hidden" name="imageUrl">`;
    const gallery = photoPanel.querySelector('.lg-gallery');
    const footer = modal.querySelector('.modal-footer');
    footer.innerHTML = '<button type="button" class="btn btn-secondary" data-lg-back>Chiudi</button><span class="lg-count"></span><button type="button" class="btn" data-lg-next>Continua</button>';
    const next = footer.querySelector('[data-lg-next]'), back = footer.querySelector('[data-lg-back]');
    // Keep legacy extra fields available without making them mandatory questions.
    const links = panels.find(p => p.querySelector('[name="file"]'));
    if (links) { const details = document.createElement('details'); details.className='lg-extra'; details.innerHTML='<summary>Pagina personalizzata (facoltativa)</summary>'; while(links.firstChild) details.append(links.firstChild); links.append(details); }
    form.querySelector('[name="price"]').inputMode = 'numeric';
    form.querySelector('[name="availableMode"]').addEventListener('change', dateMode);
    function dateMode() {
      const input = form.elements.namedItem('availableFromDate');
      input.disabled = value('availableMode') !== 'date'; input.required = !input.disabled;
    }
    dateMode();
    for (const label of form.querySelectorAll('.form-label')) {
      const input = label.parentElement.querySelector('input:not([type="hidden"]),select,textarea');
      if (input) { input.id ||= 'lg-' + input.name; label.htmlFor = input.id; }
    }
    function message(text) { notice.textContent = text; }
    function show(n) {
      step = n;
      panels.forEach(p => { p.hidden = Number(p.dataset.lgStep) !== n; });
      [...progress.children].forEach((b,i) => { b.setAttribute('aria-current', i===n ? 'step':'false'); b.disabled = busy() || attempted || i>n; });
      back.textContent = n ? 'Indietro' : 'Chiudi'; back.disabled = busy() || attempted;
      next.textContent = n===3 ? (attempted ? 'Riprova pubblicazione' : 'Pubblica sul sito BOOM') : 'Continua'; next.disabled = busy();
      footer.querySelector('.lg-count').textContent = `${n+1} / 4`;
      body.scrollTop = 0;
      if (n===3) renderReview();
    }
    function validate(n) {
      for (const panel of panels.filter(p => Number(p.dataset.lgStep)===n)) {
        for (const input of panel.querySelectorAll('input,select,textarea')) {
          if (input.required && !String(input.value).trim() || !input.checkValidity()) {
            show(n); input.reportValidity(); input.focus(); message('Completa il campo indicato prima di continuare.'); return false;
          }
        }
      }
      if (n===2 && !photos.length) { show(2); message('Aggiungi almeno una foto prima di pubblicare.'); return false; }
      return true;
    }
    function renderPhotos() {
      gallery.innerHTML = photos.map((p,i) => `<article class="lg-photo"><img src="${esc(p.preview)}" alt="Foto ${i+1}"/><div class="lg-photo-name">${i===0?'Copertina':`Foto ${i+1}`}</div><div class="lg-photo-actions">
        <button type="button" data-photo="cover" data-index="${i}" ${i===0?'disabled':''} aria-label="Usa foto ${i+1} come copertina">★</button>
        <button type="button" data-photo="left" data-index="${i}" ${i===0?'disabled':''} aria-label="Sposta foto ${i+1} prima">←</button>
        <button type="button" data-photo="right" data-index="${i}" ${i===photos.length-1?'disabled':''} aria-label="Sposta foto ${i+1} dopo">→</button>
        <button type="button" data-photo="remove" data-index="${i}" aria-label="Rimuovi foto ${i+1}">×</button></div></article>`).join('');
    }
    function lock(flag) {
      for (const el of modal.querySelectorAll('input,select,textarea,button')) {
        if (flag) { el.dataset.lgDisabled = String(el.disabled); el.disabled = true; }
        else if ('lgDisabled' in el.dataset) { el.disabled = el.dataset.lgDisabled === 'true'; delete el.dataset.lgDisabled; }
      }
      if (!flag) show(step);
    }
    photoPanel.querySelector('input[type=file]').addEventListener('change', async event => {
      if (busy() || attempted || !allowed()) return;
      const files = [...event.target.files]; event.target.value = '';
      if (files.length + photos.length > 24) { message('Massimo 24 foto: rimuovine una o selezionane meno.'); return; }
      preparing = true; lock(true); const failed = [];
      try {
        for (let i=0;i<files.length;i++) {
          if (!allowed()) break;
          message(`Preparazione foto ${i+1} di ${files.length}…`);
          try {
            const blob = await root.BOOM_SMARTLINK_PHOTO.prepare(files[i]);
            if (!allowed()) break;
            photos.push({blob, preview:URL.createObjectURL(blob), key:crypto.randomUUID()});
          } catch (_) { failed.push(files[i].name); }
        }
        if (active()) {
          renderPhotos();
          message(failed.length ? `${failed.length} foto non aggiunte: ${failed.join(', ')}. Usa JPG, PNG o WebP fino a 25 MB e riprova.` : `${photos.length} foto pronte. Non ancora pubblicate.`);
        }
      } finally { preparing = false; if(active()) lock(false); }
    });
    gallery.addEventListener('click', event => {
      const b = event.target.closest('[data-photo]'); if (!b || busy() || attempted || !allowed()) return;
      const i = Number(b.dataset.index), action = b.dataset.photo;
      if (!photos[i]) return;
      if (action==='remove') URL.revokeObjectURL(photos.splice(i,1)[0].preview);
      if (action==='cover') photos.unshift(photos.splice(i,1)[0]);
      if (action==='left' && i>0) [photos[i-1],photos[i]] = [photos[i],photos[i-1]];
      if (action==='right' && i<photos.length-1) [photos[i+1],photos[i]] = [photos[i],photos[i+1]];
      renderPhotos();
    });
    function renderReview() {
      const d = root.BOOM_DISPO.writePatch(root.BOOM_DISPO.parseAvailability(value('availableMode')==='now' ? 'Subito' : value('availableMode')==='date' ? value('availableFromDate') : 'da concordare'),'');
      const availability = root.BOOM_DISPO.catalogState({...d,status:value('status')});
      const bedrooms = value('bedrooms'), furnished = form.elements.namedItem('furnished');
      const facts = [ ['Zona',value('zone')],['Indirizzo',value('address')||'Da completare'],['Canone',Number(value('price')).toLocaleString('it-IT')+' € / mese'],['Disponibilità',availability.label],['Camere',bedrooms===''?'Non dichiarate':bedrooms==='0'?'Monolocale':bedrooms],['Arredo',furnished?.selectedOptions[0]?.textContent||'Non dichiarato'],['Superficie',value('sqm') ? value('sqm')+' m²' : 'Non dichiarata'] ];
      review.innerHTML = `<h3>${esc(value('name'))}</h3><div class="lg-review-photos">${photos.map((p,i)=>`<img src="${esc(p.preview)}" alt="${i?'Foto '+(i+1):'Copertina'}">`).join('')}</div><dl>${facts.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl><p>${esc(value('description') || 'Descrizione da completare.')}</p><div class="lg-publish-note">Confermi dati e foto: saranno pubblici sul sito BOOM. Questa operazione non invia l’annuncio a Idealista o Immobiliare.it.</div>`;
    }
    async function advance() {
      if (busy()) return;
      if (!allowed()) { message('Accesso amministratore da verificare. Riapri il modulo dopo aver effettuato l’accesso.'); return; }
      if (!validate(step)) return;
      message('');
      if (step<3) { show(step+1); return; }
      for(let n=0;n<3;n++) if(!validate(n)) return;
      saving = true; lock(true);
      try {
        for(let i=0;i<photos.length;i++) {
          if (!allowed()) throw new Error('Accesso cambiato. Nessun annuncio pubblicato da questo modulo.');
          if (!photos[i].url) { message(`Caricamento foto ${i+1} di ${photos.length}…`); photos[i].url = await options.upload(photos[i].blob,photos[i].key); }
        }
        if (!allowed()) throw new Error('Accesso cambiato: riapri il modulo.');
        form.elements.namedItem('image').value = photos[0].url;
        attempted = true; approved = true; form.inert = true;
        // FormData omits disabled controls: unlock before the synchronous save capture.
        lock(false); message('Pubblicazione in corso…');
        const promise = options.save(form); lock(true); await promise;
        if (active()) message('Esito non confermato. Riprova: verrà usata la stessa casa, senza duplicarla.');
      } catch (error) { if(active()) message(error.message || 'Caricamento non riuscito. Le foto pronte restano qui: riprova.'); }
      finally {
        saving = false; approved = false;
        if(active()) { lock(false); form.inert = attempted; }
      }
    }
    next.addEventListener('click', advance);
    back.addEventListener('click', () => { if(busy()||attempted)return; if(step)show(step-1);else options.close(); });
    progress.addEventListener('click', event => { const b=event.target.closest('[data-lg-go]'); if(b&&!busy()&&!attempted&&Number(b.dataset.lgGo)<=step)show(Number(b.dataset.lgGo)); });
    form.addEventListener('submit',event=>{ event.preventDefault();event.stopImmediatePropagation();advance(); },true);
    modal.addEventListener('keydown',event=>{
      if(event.key==='Escape' && busy()){event.preventDefault();event.stopPropagation();}
      if(event.key!=='Tab')return;
      const controls=[...modal.querySelectorAll('button,input,select,textarea,summary')].filter(el=>!el.disabled&&el.getClientRects().length);
      const first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    });
    form._listingGuide = {
      busy, ready:()=>approved&&allowed(),
      photos:()=>({images:photos.map(p=>p.url),imagesOriginal:photos.map(p=>p.url)}),
      saved:()=>{saving=false;},
      dispose:()=>{disposed=true;photos.forEach(p=>URL.revokeObjectURL(p.preview));}
    };
    show(0); form.querySelector('[name="name"]').focus();
  }
  root.BOOM_LISTING_GUIDE = {mount};
})(typeof window !== 'undefined' ? window : globalThis);
