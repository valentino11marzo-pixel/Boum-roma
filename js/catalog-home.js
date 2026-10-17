/* One house from AdminFlats. Existing editors own every mutation. */
(function(root) {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const button = (label,action,primary=false) => `<button type="button" class="ch-button${primary?' ch-primary':''}" data-ch-action="${action}">${esc(label)}</button>`;
  const stamp = value => {
    const d = new Date(value); return value && Number.isFinite(d.getTime()) ? d.toLocaleString('it-IT',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Rome'}) : 'Data non registrata';
  };
  const availabilityLabel = value => value.state === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value.iso || '')
    ? 'Libera dal '+new Date(value.iso+'T12:00:00Z').toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Rome'}) : value.label;
  let generation = 0;
  function open(options) {
    const state = options.state();
    if (state.profile?.role !== 'admin') return;
    const listing = state.listings.find(l=>l.id===options.id), host = document.getElementById('modals');
    if (!listing || !host) return;
    const origin = document.activeElement, ticket = ++generation;
    const relation = root.BOOM_CATALOG_HOME_ENGINE.connections(listing,state);
    const availability = root.BOOM_DISPO.catalogState(listing);
    const money = Number(listing.price) > 0 ? Number(listing.price).toLocaleString('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0})+' / mese' : 'Canone da verificare';
    const owner = relation.owner;
    const ownerText = relation.ownerKind === 'account' ? 'Profilo proprietario collegato alla casa.' : relation.ownerKind === 'contact' ? 'Contatto in rubrica. L’accesso all’area proprietario non è attestato.' : 'Proprietario da collegare o verificare.';
    host.innerHTML = `<div class="modal-overlay active ch-overlay"><div class="ch-dialog" role="dialog" aria-modal="true" aria-labelledby="ch-title" tabindex="-1">
      <header class="ch-header"><div><p class="ch-eyebrow">CATALOGO CASE</p><h2 id="ch-title">${esc(listing.name || 'Casa senza nome')}</h2><p>${esc(listing.address || listing.zone || 'Indirizzo da completare')}</p></div><button class="ch-close" data-ch-action="close" aria-label="Chiudi scheda">×</button></header>
      <div class="ch-content">
        <section class="ch-summary" aria-label="Situazione della casa"><div><p class="ch-eyebrow">DISPONIBILITÀ BOOM</p><h3 id="ch-availability">${esc(availabilityLabel(availability))}</h3><p id="ch-availability-detail">${esc(availability.detail)}</p><small id="ch-availability-stamp">Ultima modifica: ${esc(stamp(listing.availabilityUpdatedAt))}</small></div><div class="ch-price">${esc(money)}</div></section>
        <div class="ch-actions">${button('Aggiorna disponibilità','availability',true)}${button('Modifica casa','edit')}</div>
        <section class="ch-section"><div class="ch-section-heading"><h3>Gestione e proprietario</h3><span class="ch-tag">${relation.state === 'linked' ? 'Collegata' : 'Da completare'}</span></div>
          <p class="ch-name">${esc(relation.label)}</p><p>${esc(relation.detail)}</p>
          ${relation.state === 'linked' ? `<div class="ch-owner"><span class="ch-eyebrow">PROPRIETARIO</span><strong>${esc(owner?.name || owner?.fullName || 'Da verificare')}</strong><p>${esc(ownerText)}</p></div>
          <div class="ch-actions">${button('Apri fascicolo della casa','property')}${relation.ownerKind === 'account' ? button('Apri profilo proprietario','owner') : ''}</div>` : '<p class="ch-note">Il collegamento richiede l’identità esatta della casa; nome e indirizzo possono coincidere tra unità diverse.</p>'}
        </section>
        <section class="ch-section"><div class="ch-section-heading"><h3>Annunci sui portali</h3>${button('Rileggi stato','reload')}</div><p>Esito dell’ultimo invio, confrontato con il catalogo BOOM.</p><div id="ch-channels" role="status" aria-live="polite" aria-busy="true"><p>Lettura delle ricevute…</p></div></section>
        <section class="ch-section"><h3>Foto e altre azioni</h3><div class="ch-actions">${button('Foto, video e testi','media')}${button('Duplica casa','duplicate')}${button('Elimina casa','remove')}</div></section>
      </div><footer class="ch-footer">${button('Torna al catalogo','close')}</footer>
    </div></div>`;
    const overlay = host.querySelector('.ch-overlay'), dialog = host.querySelector('.ch-dialog');
    const valid = () => ticket === generation && overlay.isConnected && options.state().profile?.role === 'admin';
    function close() { if (overlay.isConnected) overlay.remove(); generation++; if (origin?.isConnected) origin.focus(); }
    async function reload() {
      const target = overlay.querySelector('#ch-channels');
      const request = Symbol(); target._request = request;
      target.setAttribute('aria-busy','true'); target.innerHTML = '<p>Lettura delle ricevute…</p>';
      try {
        const token = await options.token();
        const response = await fetch('/api/publisher/status?id='+encodeURIComponent(listing.id),{headers:{Authorization:'Bearer '+token},cache:'no-store'});
        const data = await response.json();
        if (!valid() || target._request !== request) return;
        if (!response.ok || !data.ok || data.id !== listing.id) throw new Error('read_failed');
        overlay.querySelector('#ch-availability').textContent = availabilityLabel(data.availability);
        overlay.querySelector('#ch-availability-detail').textContent = data.availability.detail;
        overlay.querySelector('#ch-availability-stamp').textContent = 'Ultima modifica: '+stamp(data.availabilityUpdatedAt);
        target.innerHTML = data.channels.map(channel=>{
          const label = channel.portal === 'idealista' ? 'Idealista' : 'Immobiliare.it';
          return `<article class="ch-channel"><div class="ch-section-heading"><h4>${label}</h4><span class="ch-tag">${esc(channel.label)}</span></div><p>${esc(channel.detail)}</p><small>${esc(stamp(channel.recordedAt))}</small><p class="ch-note">${channel.enabled === true ? 'Invii abilitati nelle impostazioni.' : channel.enabled === false ? 'Invii automatici disattivati.' : 'Impostazioni degli invii da verificare.'}</p>${channel.remoteUrl ? `<a class="ch-button" href="${esc(channel.remoteUrl)}" target="_blank" rel="noopener noreferrer">Apri annuncio su ${label}</a>` : '<small>Link dell’annuncio non disponibile.</small>'}</article>`;
        }).join('') + `<p class="ch-note">Ricevute lette il ${esc(stamp(data.readAt))} · ora di Roma</p>`;
      } catch (_) {
        if (!valid() || target._request !== request) return;
        target.innerHTML = '<p class="ch-read-error">Stato dei portali non disponibile. Premi «Rileggi stato» per riprovare.</p>';
      } finally { if (valid() && target._request === request) target.setAttribute('aria-busy','false'); }
    }
    overlay.addEventListener('click',event=>{
      if (event.target === overlay) return close();
      const action = event.target.closest('[data-ch-action]')?.dataset.chAction;
      if (!action) return;
      if (action === 'close') return close();
      if (!valid()) return close();
      if (action === 'reload') return reload();
      const current = options.state().listings.find(l=>l.id===options.id);
      if (!current) return close();
      if (action === 'property' || action === 'owner') {
        const check = root.BOOM_CATALOG_HOME_ENGINE.connections(current,options.state());
        if (check.state !== 'linked' || check.property.id !== relation.property?.id ||
          action === 'owner' && (check.ownerKind !== 'account' || check.owner.id !== relation.owner?.id)) return open(options);
        close(); return options.actions[action](action === 'property' ? check.property.id : check.owner.id);
      }
      if (options.actions[action]) { close(); options.actions[action](current.id); }
    });
    dialog.addEventListener('keydown',event=>{
      if (event.key === 'Escape') {event.preventDefault();event.stopPropagation();close();}
      if (event.key !== 'Tab') return;
      const items = [...dialog.querySelectorAll('button,a[href]')].filter(el=>!el.disabled);
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {event.preventDefault();last.focus();}
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {event.preventDefault();first.focus();}
    });
    dialog.focus(); reload();
  }
  root.BOOM_CATALOG_HOME = {open};
}(typeof window !== 'undefined' ? window : globalThis));
