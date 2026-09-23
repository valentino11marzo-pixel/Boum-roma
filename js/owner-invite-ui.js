/* js/owner-invite-ui.js — L'INVITO DEL PROPRIETARIO, lato portal (solo admin).
 *
 * window.BOOM_OWNER_INVITE.open(propertyId) apre una finestra che:
 *   1. chiede al server il PIANO (POST /api/owner/invite op:'preview'): quale
 *      email e da dove viene (modificabile: cambiarla ricalcola il piano),
 *      se l'account di accesso esiste, cosa succede a ogni immobile, i
 *      conflitti e le conseguenze. Il piano non scrive niente.
 *   2. «Invia l'invito» esegue QUEL piano (previewHash): se nel frattempo è
 *      cambiato qualcosa il server risponde plan_changed e qui si mostra il
 *      piano nuovo, da riconfermare. Con un conflitto il bottone è spento.
 *      Revisione del 23/09/2026: correggere l'email SENZA ricalcolare
 *      mandava l'invito al vecchio indirizzo (il corpo non portava l'email,
 *      il server la ririceveva dalla scala e l'hash tornava). Ora, appena il
 *      campo diverge dall'email del piano, «Invia l'invito» si spegne e
 *      compare «Ricalcola il piano»; runInvite rilegge il campo e, se
 *      diverge, ricalcola invece di inviare; e il corpo dell'invito porta
 *      SEMPRE l'email che il piano ha mostrato.
 *   3. il risultato: cosa è stato collegato, se l'email è partita, e il
 *      messaggio WhatsApp già scritto (copia + wa.me quando c'è il numero).
 *   La conferma dell'account (23/09/2026): un account landlord creato dal
 *   portal porta solo lastLogin, e con quella prova debole le vecchie schede
 *   dello stesso proprietario restano bloccate (claim_needs_proof). Solo
 *   quando il piano dice proof 'weak' E c'è almeno un immobile bloccato per
 *   questo (o la conferma è già nel piano) compare la spunta «Confermo di
 *   conoscere questo proprietario e che l'account è suo» — SPENTA di default,
 *   mai accesa da sola. Accenderla ricalcola il piano con confirmAccount:true
 *   (hash suo); cambiare email la spegne; la conferma vale solo per l'account
 *   che l'admin aveva davanti quando l'ha data (st.confirmFor).
 *
 * Nessuna logica qui: ogni decisione è del server. La finestra vive fuori da
 * #modals (il livello mobile osserva quel contenitore) e non tocca lo stato
 * del portal. Ogni dato che arriva dal server passa da esc().
 */
(function (root) {
  'use strict';
  if (!root || !root.document) return;
  var doc = root.document;
  var ENDPOINT = '/api/owner/invite';

  var esc = function (v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var SOURCE = {
    users: 'scheda utente', landlords: 'anagrafica proprietari', 'property.ownerEmail': 'scheda immobile',
    'contract.landlordEmail': 'contratto', manual: 'inserita a mano'
  };
  var ACTION = { bind: 'Collegato ora', keep: 'Già suo', claim: 'Riunito dalla vecchia scheda', blocked: 'Bloccato' };
  var CONSEQ = {
    rendiconto_starts: 'Dal prossimo 1° del mese riceverà il rendiconto mensile di questi immobili.',
    alias_merge: 'Le vecchie schede con la stessa email vengono riunite al nuovo account (non si cancellano).',
    role_upgrade: 'Il ruolo «owner» della scheda diventa «landlord».',
    account_confirmed: 'Confermi tu che l’account è suo: da questo invito vale come provato.',
    claim_needs_proof: 'Le vecchie schede con la stessa email NON si riuniscono: l’account trovato ha solo un accesso al portale, non un invito né un primo ingresso nell’archivio registrati. Verifica a mano che sia davvero del proprietario.'
  };
  var ERR = {
    forbidden: 'Solo un amministratore può invitare un proprietario.',
    invalid_or_expired_token: 'Sessione scaduta: ricarica la pagina.',
    bad_email: 'L’email non sembra valida.',
    no_email: 'Nessuna email trovata per questo proprietario: scrivila qui sopra.',
    property_not_found: 'Immobile non trovato.',
    role_conflict: 'Questa email appartiene a un utente che non è un proprietario: non si può invitare.',
    ambiguous_profiles: 'Più schede proprietario con questa email hanno già un accesso: vanno riunite a mano prima.',
    auth_without_profile: 'Esiste già un account di accesso con questa email, ma non riesco a collegarlo a una scheda. Chiedi al proprietario di fare «Primo accesso» su /login e di aprire /proprietario una volta, poi riprova.',
    nothing_to_bind: 'Tutti gli immobili sono di un altro proprietario: non c’è niente da collegare.',
    plan_changed: 'Il piano è cambiato nel frattempo: ricontrolla e conferma di nuovo.',
    signup_failed: 'Non riesco a creare l’account adesso. Riprova tra poco.',
    commit_failed: 'Il salvataggio non è riuscito: nulla è stato collegato. Riprova.',
    read_failed: 'Non riesco a leggere i dati adesso. Riprova tra poco.',
    preview_required: 'Serve prima il piano: ricarica la finestra.'
  };
  var errText = function (code) { return ERR[code] || ('Errore (' + String(code || 'sconosciuto').slice(0, 60) + ').'); };   // testo nudo: chi lo stampa passa da esc()

  var st = null;   // { el, ids, email, resend, confirmAccount, confirmFor, preview, busy, canSend, trigger, result, note }

  // La conseguenza della conferma coi nomi veri (account e email del piano).
  function conseqText(c, p) {
    if (c === 'account_confirmed' && p && p.accountConfirmation) {
      return 'L’admin conferma che l’account ' + p.accountConfirmation.usersDocId + ' appartiene a ' + p.accountConfirmation.email
        + ': da questo invito vale come provato, e resta scritto sulla scheda (authUid, accountConfirmedAt/By) e nel registro attività.';
    }
    return CONSEQ[c] || c;
  }
  // La spunta si offre solo dove serve: account provato dal solo lastLogin e
  // almeno un immobile fermo per questo (o la conferma già nel piano, così la
  // si può anche togliere).
  function confirmable(p) {
    var acc = (p && p.account) || {};
    if (acc.proof !== 'weak' || !acc.usersDocId) return false;
    return !!acc.confirmed || (p.properties || []).some(function (x) { return x.action === 'blocked' && x.reason === 'claim_needs_proof'; });
  }
  // La conferma viaggia solo per l'account su cui l'admin l'ha data.
  function confirmOn() {
    return !!(st && st.confirmAccount && st.preview && st.preview.account && st.preview.account.usersDocId && st.preview.account.usersDocId === st.confirmFor);
  }

  function injectStyle() {
    if (doc.getElementById('oinv-style')) return;
    var s = doc.createElement('style');
    s.id = 'oinv-style';
    s.textContent = [
      '.oinv{position:fixed;inset:0;z-index:10050;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.72);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}',
      '.oinv-box{width:min(620px,100%);max-height:calc(100dvh - 32px);overflow:auto;background:var(--bg-card,#0A0A0A);border:1px solid var(--border,rgba(255,255,255,.08));border-radius:16px;color:var(--text,#fff);font:300 14px/1.55 "Helvetica Neue",Helvetica,Inter,Arial,sans-serif;padding:22px 22px 18px;box-shadow:0 18px 56px rgba(0,0,0,.45)}',
      '.oinv-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}',
      '.oinv-head h2{margin:0;font-size:18px;font-weight:300;letter-spacing:.02em}',
      '.oinv-eyebrow{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--gold,#D4AF37);margin:0 0 4px}',
      '.oinv-x{background:none;border:1px solid var(--border,rgba(255,255,255,.08));color:var(--text-secondary,#999);border-radius:10px;min-width:44px;min-height:44px;font-size:18px;cursor:pointer}',
      '.oinv-sec{border-top:1px solid var(--border,rgba(255,255,255,.08));padding:12px 0}',
      '.oinv-label{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-secondary,#999);margin:0 0 6px}',
      '.oinv-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}',
      '.oinv-row input[type=email]{flex:1 1 220px;min-height:44px;font-size:16px;background:var(--bg-input,#1A1A1A);color:var(--text,#fff);border:1px solid var(--border,rgba(255,255,255,.12));border-radius:10px;padding:0 12px}',
      '.oinv-btn{min-height:44px;padding:0 16px;border-radius:10px;border:1px solid var(--border,rgba(255,255,255,.12));background:var(--bg-elevated,#141414);color:var(--text,#fff);cursor:pointer;font:inherit;text-decoration:none;display:inline-flex;align-items:center;gap:6px}',
      '.oinv-btn[disabled]{opacity:.45;cursor:not-allowed}',
      '.oinv-primary{background:var(--gold,#D4AF37);color:#1A1407;border-color:var(--gold,#D4AF37);font-weight:500}',
      '.oinv-note{font-size:12.5px;color:var(--text-secondary,#999);margin:6px 0 0}',
      '.oinv-warn{border:1px solid rgba(255,138,112,.35);background:rgba(255,138,112,.08);color:#FFB3A2;border-radius:10px;padding:10px 12px;margin:8px 0}',
      '.oinv-ok{border:1px solid rgba(74,222,158,.3);background:rgba(74,222,158,.07);color:#8FE8BF;border-radius:10px;padding:10px 12px;margin:8px 0}',
      '.oinv-table{width:100%;border-collapse:collapse;font-size:13px}',
      '.oinv-table td{padding:7px 4px;border-bottom:1px solid var(--border,rgba(255,255,255,.06));vertical-align:top}',
      '.oinv-chip{display:inline-block;font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid var(--border,rgba(255,255,255,.12));white-space:nowrap}',
      '.oinv-chip.bind,.oinv-chip.claim{border-color:rgba(212,175,55,.45);color:var(--gold,#D4AF37)}',
      '.oinv-chip.blocked{border-color:rgba(255,138,112,.45);color:#FF8A70}',
      '.oinv-foot{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;padding-top:12px}',
      '.oinv ul{margin:6px 0 0;padding-left:18px}'
    ].join('\n');
    doc.head.appendChild(s);
  }

  async function token() {
    var fb = root.firebase;
    var u = fb && fb.auth && fb.auth().currentUser;
    if (!u) throw Object.assign(new Error('no_user'), { code: 'invalid_or_expired_token' });
    return u.getIdToken();
  }

  async function call(body) {
    var t = await token();
    var r = await root.fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
      body: JSON.stringify(body)
    });
    var data = null;
    try { data = await r.json(); } catch (_) { data = null; }
    return { status: r.status, data: data || { ok: false, error: 'bad_response' } };
  }

  function close() {
    if (!st) return;
    var trigger = st.trigger;
    doc.removeEventListener('keydown', onKey, true);
    if (st.el && st.el.parentNode) st.el.parentNode.removeChild(st.el);
    doc.body.style.overflow = st.prevOverflow || '';
    st = null;
    if (trigger && trigger.focus) try { trigger.focus({ preventScroll: true }); } catch (_) {}
  }
  function onKey(e) { if (e.key === 'Escape' && st && !st.busy) { e.preventDefault(); close(); } }

  function propertyRows(props) {
    return '<table class="oinv-table"><tbody>' + props.map(function (p) {
      var what = ACTION[p.action] || p.action;
      var note = p.action === 'claim' ? ' <span class="oinv-note">(scheda ' + esc(p.currentOwnerId) + (p.auto ? ', trovata con la stessa email' : '') + ')</span>'
        : p.action === 'blocked' && p.reason === 'claim_needs_proof' ? ' <span class="oinv-note">(scheda ' + esc(p.currentOwnerId) + ') non si riunisce senza un account provato</span>'
        : p.action === 'blocked' ? ' <span class="oinv-note">di un altro proprietario: non si riassegna</span>' : '';
      return '<tr><td>' + esc(p.label || p.id) + (p.emailMismatch ? '<div class="oinv-note">⚠ l’email sulla scheda immobile è diversa</div>' : '')
        + '</td><td><span class="oinv-chip ' + esc(p.action) + '">' + esc(what) + '</span>' + note + '</td></tr>';
    }).join('') + '</tbody></table>';
  }

  function render() {
    if (!st) return;
    var p = st.preview, html = '';
    html += '<div class="oinv-head"><div><p class="oinv-eyebrow">Archivio del proprietario</p><h2 id="oinv-title">Invita il proprietario</h2></div>'
      + '<button type="button" class="oinv-x" data-oinv="close" aria-label="Chiudi">×</button></div>';
    if (st.note) html += '<div class="oinv-warn" role="status">' + esc(st.note) + '</div>';

    if (st.result) {
      var r = st.result;
      var lines = [];
      lines.push(r.createdAuth ? 'Account di accesso creato.' : 'Account di accesso già esistente.');
      if (r.accountConfirmed) lines.push('Account confermato da te: resta scritto sulla scheda e nel registro attività.');
      if (r.bound && r.bound.length) lines.push(r.bound.length + (r.bound.length === 1 ? ' immobile collegato.' : ' immobili collegati.'));
      if (r.claimed && r.claimed.length) lines.push(r.claimed.length + (r.claimed.length === 1 ? ' immobile riunito dalla vecchia scheda.' : ' immobili riuniti dalle vecchie schede.'));
      if (r.kept && r.kept.length) lines.push(r.kept.length + (r.kept.length === 1 ? ' immobile era già suo.' : ' immobili erano già suoi.'));
      if (r.blocked && r.blocked.length) lines.push(r.blocked.length + (r.blocked.length === 1 ? ' immobile bloccato (di un altro proprietario).' : ' immobili bloccati (di un altro proprietario).'));
      lines.push(r.emailSent ? 'Email d’invito inviata.' : r.emailSkipped === 'already_sent' ? 'Email non rimandata: l’invito era già partito.' : 'Email NON partita (' + esc(r.emailError || 'errore') + '): manda il messaggio WhatsApp.');
      var phone = st.preview && st.preview.owner && st.preview.owner.phone ? String(st.preview.owner.phone).replace(/\D/g, '') : '';
      html += '<div class="oinv-ok" role="status"><strong>Invito registrato.</strong><ul>' + lines.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul></div>'
        + '<div class="oinv-sec"><p class="oinv-label">Messaggio WhatsApp</p><p class="oinv-note" id="oinv-wa">' + esc(r.whatsappText) + '</p>'
        + '<div class="oinv-row" style="margin-top:8px"><button type="button" class="oinv-btn" data-oinv="copy">Copia messaggio WhatsApp</button>'
        + (phone.length >= 8 ? '<a class="oinv-btn" target="_blank" rel="noopener" href="https://wa.me/' + esc(phone) + '?text=' + encodeURIComponent(r.whatsappText) + '">Apri WhatsApp ↗</a>' : '')
        + (r.uid ? '<a class="oinv-btn" target="_blank" rel="noopener" href="/proprietario?as=' + encodeURIComponent(r.uid) + '">Vista proprietario ↗</a>' : '')
        + '</div></div>'
        + '<div class="oinv-foot"><button type="button" class="oinv-btn oinv-primary" data-oinv="close">Fatto</button></div>';
      st.el.querySelector('.oinv-box').innerHTML = html;
      return;
    }

    // Mentre si ricalcola con un'email nuova il campo mostra QUELLA, non la
    // vecchia del piano precedente (che sparirebbe sotto le dita).
    var email = st.busy && st.email ? st.email : p && p.owner ? p.owner.email : (st.email || '');
    html += '<div class="oinv-sec"><p class="oinv-label">Email del proprietario</p><div class="oinv-row">'
      + '<input type="email" id="oinv-email" autocomplete="off" spellcheck="false" value="' + esc(email) + '" aria-label="Email del proprietario">'
      + '<button type="button" class="oinv-btn" data-oinv="recalc">Ricalcola</button></div>'
      + (p && p.owner ? '<p class="oinv-warn" id="oinv-dirty" role="status" hidden>L’email è cambiata: il piano qui sotto è per <strong>' + esc(p.owner.email) + '</strong>. «Ricalcola il piano» prima di inviare.</p>' : '')
      + (p && p.owner ? '<p class="oinv-note">Presa da: ' + esc(SOURCE[p.owner.emailSource] || p.owner.emailSource) + (p.owner.name ? ' · ' + esc(p.owner.name) : '') + (p.owner.phone ? ' · ' + esc(p.owner.phone) : '') + '</p>' : '')
      + '</div>';

    if (st.busy && !p) {
      html += '<div class="oinv-sec"><p class="oinv-note" role="status">Calcolo il piano…</p></div>';
    } else if (p) {
      var acc = p.account || {};
      html += '<div class="oinv-sec"><p class="oinv-label">Account di accesso</p><p>'
        + (acc.usersDocId ? 'Già presente (' + esc(acc.usersDocId) + ')' : acc.state === 'absent' ? 'Nessun account: lo creiamo noi alla conferma.' : acc.state === 'exists' ? 'Esiste un account con questa email.' : 'Stato non verificabile adesso: si decide alla conferma.')
        + '</p>'
        + (confirmable(p)
          ? '<label class="oinv-row oinv-confirm"><input type="checkbox" data-oinv="confirm" ' + (confirmOn() ? 'checked' : '') + '> Confermo di conoscere questo proprietario e che l’account è suo</label>'
            + '<p class="oinv-note">L’account ha solo un accesso al portale: senza la tua conferma le vecchie schede con la stessa email restano bloccate. La conferma resta scritta a tuo nome.</p>'
          : '')
        + '</div>';
      if (p.conflict) html += '<div class="oinv-warn" role="alert">' + esc(errText(p.conflict.error)) + (p.conflict.role ? ' (ruolo: ' + esc(p.conflict.role) + ')' : '') + '</div>';
      html += '<div class="oinv-sec"><p class="oinv-label">Immobili</p>' + propertyRows(p.properties || []) + '</div>';
      if (p.consequences && p.consequences.length) {
        html += '<div class="oinv-sec"><p class="oinv-label">Cosa succede</p><ul>' + p.consequences.map(function (c) { return '<li>' + esc(conseqText(c, p)) + '</li>'; }).join('') + '</ul></div>';
      }
      html += '<div class="oinv-sec"><p class="oinv-label">Email d’invito</p>'
        + (p.willSendEmail
          ? '<p>Partirà a <strong>' + esc(email) + '</strong>: «Il suo archivio BOOM è attivo», senza indirizzi né importi.</p>'
          : '<p>L’invito era già partito.</p><label class="oinv-row"><input type="checkbox" data-oinv="resend" ' + (st.resend ? 'checked' : '') + '> Rimanda l’email</label>')
        + '</div>';
    }
    var canSend = !!(p && p.previewHash && !p.conflict && (p.properties || []).some(function (x) { return x.action !== 'blocked'; }));
    st.canSend = canSend;
    html += '<div class="oinv-foot"><button type="button" class="oinv-btn" data-oinv="close">Annulla</button>'
      + '<button type="button" class="oinv-btn oinv-primary" data-oinv="send" ' + (canSend && !st.busy ? '' : 'disabled') + '>' + (st.busy && p ? 'Invio…' : 'Invia l’invito') + '</button></div>';
    st.el.querySelector('.oinv-box').innerHTML = html;
    syncDirty();
  }

  // Il campo email diverge dal piano mostrato? (spazi e maiuscole non contano:
  // il server confronta così.) Senza un piano non c'è niente da proteggere.
  function emailDirty() {
    if (!st || !st.preview || !st.preview.owner || st.result) return false;
    var input = st.el.querySelector('#oinv-email');
    if (!input) return false;
    return String(input.value || '').trim().toLowerCase() !== String(st.preview.owner.email || '').trim().toLowerCase();
  }
  // Aggiorna i soli bottoni e l'avviso, senza ridisegnare (il cursore resta
  // dov'è mentre si scrive).
  function syncDirty() {
    if (!st || st.result) return;
    var dirty = emailDirty();
    var send = st.el.querySelector('[data-oinv="send"]');
    var rc = st.el.querySelector('[data-oinv="recalc"]');
    var note = st.el.querySelector('#oinv-dirty');
    if (send) send.disabled = !!(dirty || !st.canSend || st.busy);
    if (rc) { rc.textContent = dirty ? 'Ricalcola il piano' : 'Ricalcola'; rc.classList.toggle('oinv-primary', dirty); }
    if (note) note.hidden = !dirty;
  }

  async function runPreview() {
    if (!st) return;
    st.busy = true; render();
    var body = { op: 'preview', propertyIds: st.ids };
    if (st.email) body.email = st.email;
    if (confirmOn()) body.confirmAccount = true;
    try {
      var out = await call(body);
      if (!st) return;
      if (out.status === 200 && out.data.ok) { st.preview = out.data; st.note = null; }
      else { st.preview = null; st.note = errText(out.data.error); }
    } catch (e) {
      if (st) { st.preview = null; st.note = errText(e && e.code ? e.code : 'read_failed'); }
    }
    if (st) { st.busy = false; render(); }
    // Un piano confermato per un account che non è quello su cui l'admin ha
    // spuntato (i dati sono cambiati sotto): si toglie e si ricalcola senza.
    if (st && foreignConfirmation()) { st.confirmAccount = false; st.confirmFor = null; return runPreview(); }
  }
  function foreignConfirmation() {
    var acc = st && st.preview && st.preview.account;
    return !!(acc && acc.confirmed && acc.usersDocId !== st.confirmFor);
  }

  async function runInvite() {
    if (!st || !st.preview || st.busy) return;
    // Mai un piano vecchio: se il campo non è più l'email del piano si
    // ricalcola, e l'invio resta una scelta da rifare sul piano nuovo.
    if (emailDirty()) { recalc(); return; }
    var sentTo = st.preview.owner && st.preview.owner.email;
    if (!sentTo) return;
    st.busy = true; render();
    // L'email che il piano ha MOSTRATO viaggia nel corpo: il server esegue
    // per quell'indirizzo, e se il piano non è più quello risponde plan_changed.
    var body = { op: 'invite', propertyIds: st.ids, previewHash: st.preview.previewHash, resend: !!st.resend, email: sentTo };
    if (confirmOn()) body.confirmAccount = true;
    try {
      var out = await call(body);
      if (!st) return;
      if (out.status === 200 && out.data.ok) { st.result = out.data; st.note = null; }
      else if (out.data.error === 'plan_changed' && out.data.preview) {
        st.preview = out.data.preview; st.note = errText('plan_changed');
        if (foreignConfirmation()) { st.confirmAccount = false; st.confirmFor = null; st.busy = false; return runPreview(); }
      }
      else { st.note = errText(out.data.error); }
    } catch (e) {
      if (st) st.note = errText(e && e.code ? e.code : 'read_failed');
    }
    if (st) { st.busy = false; render(); }
  }

  function copy(text) {
    var done = function () { if (st) { st.note = null; var b = st.el.querySelector('[data-oinv="copy"]'); if (b) b.textContent = 'Copiato ✓'; } };
    try {
      if (root.navigator && root.navigator.clipboard && root.isSecureContext) { root.navigator.clipboard.writeText(text).then(done, fallback); return; }
    } catch (_) {}
    fallback();
    function fallback() {
      try {
        var ta = doc.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        doc.body.appendChild(ta); ta.select();
        var ok = doc.execCommand && doc.execCommand('copy');
        doc.body.removeChild(ta);
        if (ok) { done(); return; }
      } catch (_) {}
      root.prompt && root.prompt('Copia il messaggio:', text);
    }
  }

  function onClick(e) {
    if (!st) return;
    if (e.target === st.el && !st.busy) { close(); return; }
    var t = e.target.closest ? e.target.closest('[data-oinv]') : null;
    if (!t) return;
    var what = t.getAttribute('data-oinv');
    if (what === 'close') { if (!st.busy) close(); }
    else if (what === 'recalc') recalc();
    else if (what === 'send') runInvite();
    else if (what === 'copy' && st.result) copy(st.result.whatsappText || '');
  }
  function onChange(e) {
    if (!st) return;
    var t = e.target;
    if (t && t.getAttribute && t.getAttribute('data-oinv') === 'resend') { st.resend = !!t.checked; }
    if (t && t.getAttribute && t.getAttribute('data-oinv') === 'confirm' && !st.busy) {
      var acc = st.preview && st.preview.account;
      st.confirmAccount = !!t.checked;
      st.confirmFor = st.confirmAccount && acc ? acc.usersDocId : null;
      runPreview();
    }
  }
  function recalc() {
    var input = st && st.el.querySelector('#oinv-email');
    var v = input ? String(input.value || '').trim() : '';
    var current = st.preview && st.preview.owner ? st.preview.owner.email : '';
    // L'email trovata dalla scala resta «trovata»: diventa manuale solo se cambia.
    st.email = v && (v !== current || st.email) ? v : null;
    // Un'email diversa può portare un ALTRO account: la conferma non la segue.
    if (v.toLowerCase() !== String(current || '').trim().toLowerCase()) { st.confirmAccount = false; st.confirmFor = null; }
    runPreview();
  }
  function onKeyInput(e) { if (e.key === 'Enter' && e.target && e.target.id === 'oinv-email') { e.preventDefault(); recalc(); } }
  function onInput(e) { if (e.target && e.target.id === 'oinv-email') syncDirty(); }

  function open(propertyId) {
    if (typeof propertyId !== 'string' || !propertyId) return;
    if (st) close();
    injectStyle();
    var el = doc.createElement('div');
    el.className = 'oinv';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'oinv-title');
    el.innerHTML = '<div class="oinv-box"></div>';
    st = { el: el, ids: [propertyId], email: null, resend: false, confirmAccount: false, confirmFor: null, preview: null, busy: false, result: null, note: null, canSend: false,
      trigger: doc.activeElement, prevOverflow: doc.body.style.overflow };
    el.addEventListener('click', onClick);
    el.addEventListener('change', onChange);
    el.addEventListener('keydown', onKeyInput);
    el.addEventListener('input', onInput);
    doc.addEventListener('keydown', onKey, true);
    doc.body.appendChild(el);
    doc.body.style.overflow = 'hidden';
    runPreview().then(function () {
      var x = st && st.el.querySelector('#oinv-email');
      if (x && x.focus) try { x.focus({ preventScroll: true }); } catch (_) {}
    });
  }

  root.BOOM_OWNER_INVITE = { open: open, close: close };
})(typeof window !== 'undefined' ? window : undefined);
