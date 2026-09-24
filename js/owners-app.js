/* js/owners-app.js — /owners viva, dopo 'load' e dopo owners-pianta.js.
   UMD: in Node solo funzioni pure. Niente loop, niente letture di layout. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.BOOM_OWNERS_APP = api; api.avvia(); }
})(typeof window !== 'undefined' ? window : globalThis, (W) => {
  'use strict';
  const TEL = '+39 331 325 1961';
  const MSG = {
    fName: 'Scrivi il tuo nome: ti chiamiamo per nome.',
    fPhone: 'Serve un numero con almeno 8 cifre, anche con il prefisso (+39…).',
    fEmail: 'Questa email non sembra completa: controllala o lasciala vuota.',
    fOrgName: 'Scrivi il nome della società: così ti rispondiamo per iscritto alla persona giusta.'
  };

  // ── puro
  const str = (s) => (s == null ? '' : String(s));
  const clip = (s, n) => str(s).trim().slice(0, n);
  const esc = (s) => str(s).replace(/[&<>"]/g, (c) => '&#' + c.charCodeAt(0) + ';');
  const eur = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €';   // mai toLocaleString
  const leggiMq = (v) => { const n = parseInt(str(v).trim(), 10); return n >= 15 && n <= 1000 ? n : 0; };
  // «Prati · C40» → «Prati»; ripiego per un nome del motore: «SAN LORENZO» → «San Lorenzo»
  const titleZone = (nome) => str(nome).replace(/\s*·\s*[A-Z]{1,2}\d+\s*$/, '').trim().split(' ').map((w) => /[a-z]|^EUR$/.test(w) ? w
    : w.toLowerCase().replace(/(^|[-'(])(\S)/g, (m, a, b) => a + b.toUpperCase())).join(' ');
  // «C40 · PRATI · 70 M²», ≤ 22 caratteri
  function targa(zona, mq) {
    const cod = str(zona.cod || zona).toUpperCase(), a = cod + ' · ', b = ' · ' + mq + ' M²', n = 22 - a.length - b.length;
    let nome = str(zona.nome).replace(/\(.*?\)/g, '').trim().toUpperCase();
    const m = /^(.*\S)[ -]/.exec(nome.slice(0, n + 1));
    if (nome.length > n) nome = m && m[1].length >= n / 2 ? m[1] : nome.slice(0, n - 1).trim() + '.';
    return (nome && n > 1 ? a + nome + b : cod + b).slice(0, 22);
  }
  const targaAperta = (max) => ('FINO A ' + eur(max) + '/MESE').slice(0, 22);
  const testa = (nome, cod, mq) => `<p><b>${esc(nome)} (zona ${esc(cod)}), ${mq} m²:</b> `;
  const esitoChiuso = (nome, cod, mq) => testa(nome, cod, mq) + "il tetto per la tua zona lo calcoliamo sulla scheda ufficiale. La nostra tabella delle zone la sta ricontrollando l'associazione, e finché non l'ha confermata un numero qui non te lo scriviamo. Lasciaci il numero e te lo diciamo al telefono. <a href=\"#uscita\">Richiamami ↓</a></p>";
  const testoManda = (nome, cod, mq, max) => `Casa a Roma, ${nome} (zona ${cod}), ${mq} m²: a canone concordato fino a ${eur(max)} al mese, con almeno 7 delle 20 dotazioni dell'accordo. Stima BOOM, da confermare con la scheda: https://www.boomrome.com/owners?z=${cod}&mq=${mq}`;
  const esitoAperto = (nome, cod, mq, max) => testa(nome, cod, mq) + `a canone concordato fino a ${eur(max)} al mese, se la casa ha almeno 7 delle 20 dotazioni dell'accordo; con meno il tetto scende, e le spunti <a href="#scrivania">alla scrivania ↓</a>. Il tetto lo fissa l'accordo di Roma per i contratti che facciamo. Con l'attestazione di rispondenza, la cedolare al 10% ti lascia ${eur(max * 0.9)} al mese e l'IMU scende del 25%. Se a libero la tua casa vale di più, un 4+4 rende di più: non lo facciamo, e te lo diciamo adesso. <span class="timbro">STIMA · DA CONFERMARE CON LA SCHEDA</span></p>` +
    `<p class="manda"><a class="condividi" href="https://wa.me/?text=${encodeURIComponent(testoManda(nome, cod, mq, max))}" target="_blank" rel="noopener">Manda questi numeri a chi decide con te</a></p>`;
  const controlla = (id, v, co) => (v = str(v).trim(), id === 'fName' ? !!v
    : id === 'fPhone' ? /^\d{8,}$/.test(v.replace(/[\s.\-+()/]/g, ''))
      : id === 'fEmail' ? !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) : !co || !!v);
  // s = { name, phone, email, where, casa:{cod,nome,mq,max?}|null, vol, co, orgName, msg, gar, company }
  function ownersPayload(s = {}) {
    const c = s.casa && s.casa.cod ? s.casa : null;
    const parti = c ? [c.mq + ' m²', c.max > 0 && `max stimato ${eur(c.max)}/mese con almeno 7 dotazioni (stima)`] : [];
    parti.push(s.gar && 'Garanzia: interessato', clip(s.msg, 300));
    return {
      kind: 'owner', lang: 'it', name: clip(s.name, 120), phone: clip(s.phone, 40), email: clip(s.email, 160),
      org: clip(c ? c.cod + ' ' + str(c.nome).toUpperCase() : s.where, 160),
      role: s.co ? clip(s.orgName, 120) : '',
      volume: ['2-5', '6-20', 'oltre 20'].includes(s.vol) ? s.vol : '',
      message: parti.filter(Boolean).join(' · ').slice(0, 600),
      company: clip(s.company, 200)
    };
  }

  // ── la pagina
  function avvia() {
    const D = W.document;
    if (!D || W.BOOM_OWNERS) return;
    const H = D.documentElement, P = W.BOOM_PIANTA, $ = (id) => D.getElementById(id);
    const ogni = (sel, f) => D.querySelectorAll(sel).forEach(f);
    const fai = (f) => { try { f(); } catch (e) { console.error('[owners]', e); } };
    const on = (id, ev, f) => $(id) && $(id).addEventListener(ev, f);
    if (typeof W.boomTrack !== 'function') W.boomTrack = (n, p) => { if (typeof W.gtag === 'function') W.gtag('event', n, p); };
    const track = (n, p = { source_page: 'owners' }) => { try { W.boomTrack(n, p); } catch (e) { } };
    const fermo = () => H.classList.contains('still') || matchMedia('(prefers-reduced-motion: reduce)').matches;
    const alzata = () => !P || !!(P.alzata && P.alzata());
    const alza = (innesco) => !!(P && P.alza(innesco));
    let casa = null, chipOn = false, ultima = '';

    // ── la targhetta: 22 celle (solari-engine.html ridotto; animate+cancel)
    const celle = [];
    const anta = (el, da, a, ms, ease, dopo) => {
      let fatto = 0;
      el.style.display = 'block';
      const x = el.animate([{ transform: `rotateX(${da}deg)` }, { transform: `rotateX(${a}deg)` }], { duration: ms, easing: ease, fill: 'forwards' });
      const fine = () => { if (fatto++) return; x.cancel(); el.style.display = 'none'; dopo(); };
      x.onfinish = fine;
      setTimeout(fine, ms + 70);   // riserva: la scheda nascosta non finisce le animazioni
    };
    class Cella {
      constructor(host) {
        const el = host.appendChild(D.createElement('span'));
        el.className = 'fc';
        el.innerHTML = '<i><b></b></i><i class="sb"><b></b></i><i class="lt"><b></b></i><i class="lb"><b></b></i><s></s>';
        [this.st, this.sb, this.lt, this.lb] = [...el.children].map((i) => i.firstChild);
        this.set(' ');
      }
      set(c) { this.cur = this.dst = this.st.textContent = this.sb.textContent = c; }
      // un solo scatto per lettera cambiata: l'anta alta cade, la bassa sale
      go(c) {
        this.dst = c;
        if (this.busy || c === this.cur) return;
        if (!D.body.animate) return this.set(c);
        this.busy = true;
        this.lt.textContent = this.cur; this.st.textContent = this.lb.textContent = c;
        anta(this.lt.parentNode, 0, -90, 110, 'ease-in', () => anta(this.lb.parentNode, 90, 0, 170, 'ease-out', () => {
          this.sb.textContent = this.cur = c; this.busy = false; this.go(this.dst);
        }));
      }
    }
    let giro = 0;   // una scritta nuova annulla gli scatti ancora in attesa della vecchia
    const tg = (txt, frase, gira) => {
      const g = ++giro;
      if (frase && $('tgTxt')) $('tgTxt').textContent = frase;
      gira = gira && !fermo();
      celle.forEach((c, i) => {
        const ch = txt[i] || ' ';
        if (!gira) { if (c.busy) c.dst = ch; else c.set(ch); }
        else if (c.dst !== ch) setTimeout(() => g === giro && c.go(ch), i * 30);
      });
    };
    fai(() => {
      const host = $('tgCells'), txt = host.textContent.trim().toUpperCase();
      host.textContent = '';
      for (let i = 0; i < 22; i++) celle.push(new Cella(host));
      host.classList.add('fl');
      tg(txt);
    });

    // ── l'esito: l'esempio resta invisibile sotto, l'altezza non scende
    const esito = (html) => {
      const e = $('esito'); if (!e) return;
      let v = e.querySelector('.esito-vivo');
      if (!v) {
        const g = D.createElement('div');
        g.className = 'fantasma'; g.setAttribute('aria-hidden', 'true');
        g.append(...e.childNodes);
        v = D.createElement('div'); v.className = 'esito-vivo';
        e.append(g, v); e.classList.add('vivo');
      }
      v.innerHTML = html;
    };
    const conMotore = (cb) => {   // il motore del canone, solo a cancello aperto
      if (W.BOOM_CANONE) return cb(W.BOOM_CANONE);
      const sc = D.head.appendChild(D.createElement('script'));
      sc.onload = sc.onerror = () => cb(W.BOOM_CANONE);
      sc.src = '/js/canone-engine.js';
    };
    const chip = () => {
      const c = $('fCasa'), w = $('fWhere');
      if (!c) return;
      c.hidden = !chipOn;
      if (w) (w.closest('.campo') || w).hidden = chipOn;
      if (chipOn && $('fCasaTxt')) $('fCasaTxt').textContent = `La tua casa: ${casa.nome} (${casa.cod}) · ${casa.mq} m²` + (casa.max ? ` · massimo stimato ${eur(casa.max)}/mese — stima` : '');
    };

    // ── il cartiglio
    const zona = $('zona'), mq = $('mq');
    let ultimaZ = '';
    const opzione = (cod) => (cod && cod !== '__wa' && [...zona.options].find((o) => o.value === cod)) || null;
    function calcola(gesto) {
      const cod = zona.value, o = opzione(cod), n = leggiMq(mq.value), chiave = cod + '|' + n;
      if (mq.value.trim() && !n) {
        if (gesto) { mq.setAttribute('aria-invalid', 'true'); esito('<p>Scrivi i metri quadri calpestabili: un numero intero fra 15 e 1000.</p>'); ultima = ''; }
        return;
      }
      mq.removeAttribute('aria-invalid');
      if (!o || !n || chiave === ultima) return;
      ultima = chiave;
      const nome = titleZone(o.textContent), frase = `La tua casa: zona ${cod} ${nome}, ${n} metri quadri`;
      casa = { cod, nome, mq: n, max: 0 };
      chipOn = true;
      if (gesto) {
        track('owners_calcolo', { zona: cod });
        try { const u = new URL(location.href); u.searchParams.set('z', cod); u.searchParams.set('mq', n); history.replaceState(history.state, '', u.pathname + u.search + u.hash); } catch (e) { }
        if (!alzata()) alza('cartiglio');
      }
      const chiuso = () => { esito(esitoChiuso(nome, cod, n)); chip(); tg(targa(casa, n), frase, gesto); };
      if (H.dataset.canone !== 'aperto') return chiuso();
      conMotore((C) => {
        if (chiave !== ultima) return;
        try { casa.max = Math.round(C.computeCanone({ zona: C.ZONES.find((z) => z.cod === cod), mq: n, tipo: 'stud', parIdx: [0, 1, 2, 3, 4, 5, 6] }).cMax) || 0; } catch (e) { }
        if (!casa.max) return chiuso();
        esito(esitoAperto(nome, cod, n, casa.max)); chip();
        tg(targaAperta(casa.max), `${frase}: a canone concordato fino a ${eur(casa.max)} al mese, stima da confermare con la scheda`, gesto);
      });
    }
    fai(() => {
      const q = new URLSearchParams(location.search), z = str(q.get('z')).toUpperCase(), m = leggiMq(q.get('mq'));
      if (opzione(z)) zona.value = ultimaZ = z;
      if (m) mq.value = m;
      calcola(false);   // ?z=&mq= compila, ma NON alza
      zona.addEventListener('change', () => {
        if (zona.value !== '__wa') { ultimaZ = zona.value; return calcola(true); }
        open('https://wa.me/393313251961?text=' + encodeURIComponent("Ciao, sono un proprietario: la mia casa a Roma è in via … e non trovo la zona nell'elenco."), '_blank', 'noopener');
        zona.value = ultimaZ;
      });
      mq.addEventListener('change', () => calcola(true));
      mq.addEventListener('blur', () => calcola(true));
      on('cartiglio', 'submit', (e) => { e.preventDefault(); calcola(true); });
    });

    // ── il gesto: la coda, il bottone, le etichette
    const daBottone = () => { if (alza('bottone') && !casa) tg('ESEMPIO · C40 · 70 M²', '', true); };
    fai(() => {
      const q = W.__ownQ || [];
      on('alza', 'click', daBottone);
      on('riquadro', 'click', (e) => {
        const a = e.target.closest('.et'), id = a && str(a.getAttribute('href')).slice(1), t = id && $(id);
        if (!t || alzata()) return;
        e.preventDefault();
        const tastiera = e.detail === 0, su = alza('stanza');
        setTimeout(() => {
          t.scrollIntoView({ block: 'start' });
          try { history.pushState(null, '', '#' + id); } catch (x) { }
          if (tastiera) { const h = t.querySelector('h2') || t; h.tabIndex = -1; h.focus({ preventScroll: true }); }
        }, su && !fermo() ? 1100 : 0);
      });
      if (q.includes('bottone')) daBottone();
      q.length = 0;
    });

    // ── il modulo
    fai(() => {
      const F = $('ownForm'), co = $('fCo'), org = $('fOrgName'), btn = $('fSend'), t0 = btn.textContent;
      const v = (id) => ($(id) ? $(id).value : ''), ck = (id) => !!($(id) && $(id).checked);
      const errore = (t) => $('formErr') && ($('formErr').textContent = t);
      let invio = false, giu = 0;   // il blur causato dal bottone non valida: l'errore sposterebbe il bottone
      btn.addEventListener('pointerdown', () => { giu = Date.now(); });
      const segna = (id, msg) => {
        const el = $(id), db = str(el.getAttribute('aria-describedby'));
        if (msg) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
        if (msg && !db.includes('err-')) el.setAttribute('aria-describedby', (db + ' err-' + id).trim());
        if ($('err-' + id)) $('err-' + id).textContent = msg;
      };
      const giusto = (id) => { const ok = controlla(id, v(id), ck('fCo')); segna(id, ok ? '' : MSG[id]); return ok; };
      const mostra = (el) => { const d = el.closest('details'); if (d) d.open = true; el.focus(); };
      Object.keys(MSG).forEach((id) => {
        const el = $(id), rosso = () => el.getAttribute('aria-invalid') === 'true';
        if (!el) return;
        el.addEventListener('blur', () => { if ((el.value.trim() || rosso()) && Date.now() - giu > 900) giusto(id); });
        el.addEventListener('input', () => { if (rosso() && controlla(id, el.value, ck('fCo'))) segna(id, ''); });
      });
      const societa = () => { (org.closest('.campo') || org).hidden = !co.checked; if (!co.checked) segna('fOrgName', ''); };
      if (co && org) { co.addEventListener('change', societa); societa(); }
      on('fCasaTogli', 'click', () => { chipOn = false; chip(); if ($('fWhere')) $('fWhere').focus(); });
      chip();
      const chiudi = (t) => { invio = false; btn.disabled = false; btn.textContent = t0; errore(t); };
      const rete = () => chiudi(`Non è partito. Riprova, oppure chiamaci al ${TEL}.`);
      const ricevuto = (nome) => {
        const d = D.createElement('div');
        d.className = 'ricevuto';
        d.innerHTML = `<h3 tabindex="-1">Ricevuto, ${esc(nome.split(/\s+/)[0])}.</h3><p>Ti chiamiamo in giornata lavorativa dal <a href="tel:+393313251961">${TEL}</a>: salvalo, così sai chi è. Se non rispondi, ti scriviamo su WhatsApp. Niente entro domani? Scrivi a <a href="mailto:hello@boom-rome.com">hello@boom-rome.com</a>.</p><p><a href="/sign?demo=landlord">Intanto: prova a firmare come proprietario (esempio) →</a></p>`;
        F.replaceWith(d);
        d.firstChild.focus();
        track('generate_lead', { channel: 'form', source_page: 'owners' });
        track('sign_up', { method: 'owner_form' });
      };
      F.addEventListener('submit', (e) => {
        e.preventDefault();
        if (invio) return;
        const primo = Object.keys(MSG).filter((id) => $(id) && !giusto(id)).map($)[0];
        if (primo) { errore('Controlla i campi evidenziati.'); return mostra(primo); }
        const p = ownersPayload({ name: v('fName'), phone: v('fPhone'), email: v('fEmail'), where: v('fWhere'), casa: chipOn ? casa : null,
          vol: v('fVol'), co: ck('fCo'), orgName: v('fOrgName'), msg: v('fMsg'), gar: ck('fGar'), company: v('fCompany') });
        invio = true; errore(''); btn.disabled = true; btn.textContent = 'Invio…';
        fetch('/api/partners/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) })
          .then((r) => r.json().catch(() => ({})).then((j) => [r.status, j || {}]))
          .then(([s, j]) => {
            if (s === 429) return chiudi('Troppi invii da questa connessione in pochi minuti. Chiamaci o scrivici su WhatsApp: ti rispondiamo lo stesso.');
            if (s !== 400) return s > 199 && s < 300 ? ricevuto(p.name) : rete();
            chiudi('Controlla i campi evidenziati.');
            const id = /email/i.test(JSON.stringify(j)) || (j.error === 'contact_required' && p.email) ? 'fEmail' : j.error === 'contact_required' && 'fPhone';
            if (id) { segna(id, MSG[id]); mostra($(id)); }
          }, rete);
      });
    });

    // ── la barra bassa: dopo la soglia, mai sopra l'uscita
    fai(() => {
      const b = $('barra'), vis = {};
      if (!b) return;
      const io = new IntersectionObserver((es) => {
        es.forEach((e) => { vis[e.target.id] = e.isIntersecting; });
        b.classList.toggle('su', !vis.soglia && !vis.uscita);
      });
      io.observe($('soglia')); io.observe($('uscita'));
    });

    // ── i portafogli
    fai(() => {
      const pf = $('portafogli');
      const carica = () => { if (pf.open) ogni('#portafogli img[data-src]', (i) => { i.src = i.dataset.src; i.removeAttribute('data-src'); }); };
      const perHash = () => { if (location.hash === '#portafogli') pf.open = true; carica(); };
      pf.addEventListener('toggle', carica);
      W.addEventListener('hashchange', perHash);
      perHash();
    });
    on('linkPortafogli', 'click', () => {
      const pf = $('portafogli'), vol = $('fVol'), d = vol && vol.closest('details');
      if (pf) pf.open = true;
      if (vol) vol.value = '2-5';
      if (d) d.open = true;
    });

    // ── la stanza accesa (da 1100 px) e il primo sguardo a ogni stanza
    fai(() => {
      const mm = matchMedia('(min-width:1100px)'), visti = {};
      const io = new IntersectionObserver((es) => es.forEach((e) => {
        const id = e.target.closest('.stanza').id;
        if (!e.isIntersecting) return;
        if (!visti[id]) { visti[id] = 1; track('owners_stanza_' + id); }
        if (!mm.matches) return;
        if ($('riquadro')) $('riquadro').dataset.accesa = id;
        if (P && P.accendi) P.accendi(id);
      }), { threshold: 0.4 });
      ogni('.stanza h2', (h) => io.observe(h));
    });

    // ── ⏸ (#fCasaTogli ha la classe .ferma ma non aria-pressed)
    fai(() => {
      const sync = () => ogni('.ferma[aria-pressed]', (b) => b.setAttribute('aria-pressed', H.classList.contains('still')));
      ogni('.ferma[aria-pressed]', (b) => b.addEventListener('click', () => {
        try { if (H.classList.toggle('still')) localStorage.setItem('boom:still', '1'); else localStorage.removeItem('boom:still'); } catch (e) { }
        sync();
      }));
      sync();
    });

    // ── share → wa.me → appunti, e gli eventi
    D.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a'), h = a ? str(a.getAttribute('href')) : '', nav = navigator;
      if (!a) return;
      if (a.classList.contains('condividi')) {
        if (!nav.share) return;
        e.preventDefault();
        const t = decodeURIComponent(h.split('text=')[1]);
        return nav.share({ text: t }).catch((x) => x && x.name !== 'AbortError' && nav.clipboard && nav.clipboard.writeText(t).catch(() => { }));
      }
      if (a.classList.contains('carta-apri')) track('owners_foglio_aperto', { carta: str((a.closest('[data-carta]') || a).dataset.carta) });
      if (h.startsWith('/sign?demo')) track('demo_firma');
      if (h.startsWith('tel:')) track('tap_tel');
      if (h.includes('wa.me')) track('tap_wa');
    }, true);

    W.BOOM_OWNERS = true;
  }

  return { ownersPayload, titleZone, targa, targaAperta, esitoChiuso, esitoAperto, testoManda, controlla, leggiMq, eur, MSG, avvia };
});
