#!/usr/bin/env python3
# ld3 — L'APPLY CHE DIVENTA PRE-ACCORDO, E LA PELLICOLA.
#
#   1 · L'APPLY. Prima chiedeva nome, mail, data e «chi atterra»: da li non
#       esce un pre-accordo, esce una chat su WhatsApp. Ora raccoglie
#       esattamente il corpo di /api/apply-lead — che e la porta del
#       pipeline vero — piu le due cose che alla console servono per
#       premere «crea pre-accordo» senza richiamare nessuno: quanti
#       firmeranno il contratto e per quanto tempo.
#       E, alla fine, dice cosa succede DAVVERO dopo, con i tempi. Ogni
#       riga di quella schermata e un messaggio che Valentino non deve
#       piu scrivere a mano.
#
#   2 · LA PELLICOLA. Il video c'e per 2 case su 26: dove c'e si guarda,
#       dove non c'e la pagina lo dice e offre la cosa migliore — una
#       visita dal vivo con te che fai le domande. Mai un riquadro finto.
#       E il distintivo sulle foto si accende solo per le 18 case passate
#       davvero dalla pipeline: camminate, raddrizzate, riordinate per
#       stanza, doppioni tolti.
def leggi(n): return open(n, encoding='utf-8').read()
corpo = leggi('ld-corpo.html'); regia = leggi('ld-regia.html')
def uno(s, a, b, nome):
    assert s.count(a) == 1, 'NON TROVATO/DOPPIO: %s (%d)' % (nome, s.count(a))
    return s.replace(a, b)

# ── 1 · la pellicola, subito sotto la scena ─────────────────────────────
corpo = uno(corpo, '''    <div class="fatti coro" id="fatti"></div>''',
'''    <div class="pellicola coro" id="pellicola"></div>

    <div class="fatti coro" id="fatti"></div>''', 'pellicola')

# ── 2 · l'apply rifatto ─────────────────────────────────────────────────
i = corpo.index('      <form id="modApplica">')
j = corpo.index('      <div class="applica-fatto" id="applicaFatto">')
FORM = '''      <form id="modApplica" novalidate>

        <div class="ap-gruppo">
          <span class="ap-eti">1 · You</span>
          <div class="campo"><label for="apNome">Full name</label>
            <input id="apNome" name="nome" autocomplete="name" required></div>
          <div class="ap-due">
            <div class="campo"><label for="apMail">Email</label>
              <input id="apMail" name="email" type="email"
                autocomplete="email" required></div>
            <div class="campo"><label for="apTel">Phone (WhatsApp)</label>
              <input id="apTel" name="telefono" type="tel"
                autocomplete="tel" inputmode="tel"></div>
          </div>
        </div>

        <div class="ap-gruppo">
          <span class="ap-eti">2 · The stay</span>
          <div class="ap-due">
            <div class="campo"><label for="apQuando">Move-in date</label>
              <input id="apQuando" name="quando" type="date"></div>
            <div class="campo"><label for="apMesi">How long</label>
              <select id="apMesi" name="mesi">
                <option value="3">3 months</option>
                <option value="6">6 months</option>
                <option value="12" selected>12 months</option>
                <option value="18">18 months</option>
                <option value="24">24 months or more</option>
              </select></div>
          </div>
          <div class="ap-due">
            <div class="campo"><label for="apChi">Who's landing</label>
              <select id="apChi" name="chi">
                <option value="">—</option>
                <option value="solo">Just me</option>
                <option value="couple">Couple</option>
                <option value="family">Family</option>
                <option value="flatmates">Flatmates</option>
              </select></div>
            <div class="campo"><label for="apFirme">People who will sign</label>
              <select id="apFirme" name="firmatari">
                <option value="1">1</option><option value="2">2</option>
                <option value="3">3</option><option value="4">4</option>
                <option value="5">5 or more</option>
              </select></div>
          </div>
        </div>

        <div class="ap-gruppo">
          <span class="ap-eti">3 · The part landlords ask about</span>
          <p class="ap-perche">We ask now so we can tell you where you stand
            <b>before</b> you apply — not after you've hoped for two weeks.</p>
          <div class="ap-due">
            <div class="campo"><label for="apLavoro">Your situation</label>
              <select id="apLavoro" name="occupazione">
                <option value="">—</option>
                <option value="employed">Employed</option>
                <option value="self-employed">Self-employed</option>
                <option value="student">Student</option>
                <option value="relocating">Relocating for work</option>
              </select></div>
            <div class="campo"><label for="apReddito">Monthly income, net</label>
              <select id="apReddito" name="reddito">
                <option value="">Prefer not to say</option>
                <option value="under-1500">Under €1,500</option>
                <option value="1500-2500">€1,500 – €2,500</option>
                <option value="2500-4000">€2,500 – €4,000</option>
                <option value="over-4000">Over €4,000</option>
              </select></div>
          </div>
          <div class="campo"><label for="apGarante">Can you provide a
            guarantor?</label>
            <select id="apGarante" name="garante">
              <option value="">—</option>
              <option value="yes-italy">Yes, in Italy</option>
              <option value="yes-abroad">Yes, abroad</option>
              <option value="no">No</option>
              <option value="prepay">No — but I can prepay months</option>
            </select></div>
        </div>

        <input type="text" name="company" tabindex="-1" autocomplete="off"
          aria-hidden="true" class="ap-esca">

        <button class="btn btn-primary" type="submit">Send application</button>
        <p class="applica-nota">PREVIEW — nothing is sent from this page. On
          the live site this reaches a person and becomes your written
          pre-agreement.</p>
      </form>

'''
corpo = corpo[:i] + FORM + corpo[j:]

# la schermata dopo l'invio: cosa succede davvero, coi tempi
k = corpo.index('      <div class="applica-fatto" id="applicaFatto">')
l = corpo.index('      </div>\n    </div>\n\n    <div class="sale">')
FATTO = '''      <div class="applica-fatto" id="applicaFatto">
        <b>Sent. Here is exactly what happens now.</b>
        <ol class="ap-dopo">
          <li><b>Within 2 hours</b><span>A person — with a name — reads it and
            replies. If something rules you out for this landlord, you hear it
            straight away, not in two weeks.</span></li>
          <li><b>Your pre-agreement</b><span>A private link with these exact
            figures written into it: rent, deposit, fee, dates. Nothing new
            appears later.</span></li>
          <li><b>Your details, once</b><span>You fill them in on that page —
            you and any co-signers — and upload an ID. You never send documents
            over chat again.</span></li>
          <li><b>You sign from your phone</b><span>The landlord countersigns
            after you. We file the registration. Keys, and the pass in your
            Wallet.</span></li>
        </ol>
        <p class="applica-nota">PREVIEW — nothing was sent from this page.</p>
'''
corpo = corpo[:k] + FATTO + corpo[l:]

CSS = r'''
/* ── LA PELLICOLA: il video dove c'e, la verita dove non c'e ─────────── */
.pellicola { margin-top:clamp(14px,1.8vw,20px); }
.pel-fila { display:grid; gap:1px; background:var(--line-0);
  box-shadow:inset 0 0 0 1px var(--line-0); border-radius:14px;
  overflow:hidden; }
@media (min-width:820px){ .pel-fila { grid-template-columns:1fr 1fr; } }
.pel-v { display:flex; align-items:flex-start; gap:12px; padding:15px 17px;
  background:var(--card); }
.pel-v svg { width:19px; height:19px; flex:none; margin-top:1px;
  color:var(--gold); fill:none; stroke:currentColor; stroke-width:1.5;
  stroke-linecap:round; stroke-linejoin:round; }
.pel-v svg .pieno { fill:var(--gold); stroke:none; }
.pel-v b { display:block; font-size:12.5px; font-weight:500; color:var(--text);
  line-height:1.4; }
.pel-v span { display:block; margin-top:3px; font-size:11.5px; line-height:1.55;
  color:var(--text-4); }
.pel-v.azione { background:linear-gradient(150deg, rgba(255,215,0,.07),
  rgba(255,215,0,.012) 64%), var(--card);
  transition:background .3s var(--ease); }
.pel-v.azione:hover { background:linear-gradient(150deg, rgba(255,215,0,.13),
  rgba(255,215,0,.02) 64%), var(--card); }
.pel-v.azione em { font-style:normal; color:var(--gold); font-weight:500; }

/* il video: si carica solo quando lo chiedi — niente iframe a tradimento */
.pel-video { position:relative; margin-top:12px; border-radius:14px;
  overflow:hidden; background:var(--void); aspect-ratio:16/9;
  box-shadow:inset 0 0 0 1px var(--line); }
@media (max-width:640px){ .pel-video { aspect-ratio:4/3; } }
.pel-video iframe { position:absolute; inset:0; width:100%; height:100%;
  border:0; }
.pel-play { position:absolute; inset:0; display:grid; place-items:center;
  gap:12px; align-content:center; cursor:pointer; border:0; width:100%;
  background:radial-gradient(60% 60% at 50% 45%, rgba(255,215,0,.09),
    transparent 70%), var(--void); }
.pel-play i { width:62px; height:62px; border-radius:50%; display:grid;
  place-items:center; border:1px solid var(--line-gold-2);
  background:rgba(255,215,0,.08); transition:transform .3s var(--ease),
    background .3s var(--ease); }
.pel-play:hover i { transform:scale(1.06); background:rgba(255,215,0,.16); }
.pel-play i::after { content:''; width:0; height:0; margin-left:4px;
  border-left:15px solid var(--gold); border-top:9px solid transparent;
  border-bottom:9px solid transparent; }
.pel-play b { font-size:12.5px; font-weight:500; color:var(--text); }
.pel-play span { font-size:11px; color:var(--text-4); }

/* ── L'APPLY ──────────────────────────────────────────────────────────── */
.ap-gruppo { padding-top:16px; margin-top:16px;
  border-top:1px solid var(--line-0); }
.ap-gruppo:first-of-type { padding-top:0; margin-top:14px; border-top:0; }
.ap-eti { display:block; margin-bottom:10px; font-size:10px; font-weight:600;
  letter-spacing:.2em; text-transform:uppercase; color:var(--gold); }
.ap-due { display:grid; gap:0; }
@media (min-width:520px){ .ap-due { grid-template-columns:1fr 1fr;
  gap:0 14px; } }
.ap-perche { margin:-2px 0 10px; font-size:11.5px; line-height:1.55;
  color:var(--text-4); }
.ap-perche b { color:var(--text-2); font-weight:500; }
.ap-esca { position:absolute; left:-9999px; width:1px; height:1px;
  opacity:0; pointer-events:none; }

/* cosa succede dopo: ogni riga e un messaggio che non va piu scritto */
.ap-dopo { list-style:none; margin:14px 0 0; padding:0; counter-reset:d; }
.ap-dopo li { position:relative; padding:0 0 14px 34px; counter-increment:d; }
.ap-dopo li::before { content:counter(d); position:absolute; left:0; top:-1px;
  width:22px; height:22px; border-radius:50%; display:grid; place-items:center;
  font-size:10.5px; font-weight:600; color:var(--gold);
  background:rgba(255,215,0,.09); border:1px solid var(--line-gold-2); }
.ap-dopo li::after { content:''; position:absolute; left:11px; top:24px;
  bottom:4px; width:1px; background:var(--line-gold); }
.ap-dopo li:last-child { padding-bottom:0; }
.ap-dopo li:last-child::after { display:none; }
.ap-dopo b { display:block; font-size:12.5px; font-weight:500;
  color:var(--text); }
.ap-dopo span { display:block; margin-top:3px; font-size:11.5px;
  line-height:1.55; color:var(--text-4); }
'''
corpo = corpo.replace('</style>', CSS + '\n</style>', 1)
open('ld-corpo.html', 'w', encoding='utf-8').write(corpo)

# ── 3 · la regia ────────────────────────────────────────────────────────
regia = uno(regia, '''  /* ── il racconto e ciò che c'è dentro ───────────────────────────────── */''',
'''  /* ── LA PELLICOLA ────────────────────────────────────────────────────
     Il video esiste per due case su ventisei. Dove c'e si guarda; dove
     non c'e la pagina lo dice e offre la visita dal vivo — mai un
     riquadro vuoto che finge. Il distintivo sulle foto si accende solo
     per le case passate davvero dalla pipeline di /api/photos/enhance. */
  (function () {
    var pel = document.getElementById('pellicola');
    if (!pel) return;
    var n = immagini.length;
    var v = [];
    v.push('<div class="pel-v"><svg viewBox="0 0 24 24" aria-hidden="true">'
      + '<path d="M12 3l7 2.8v5.4c0 4.1-3 7.1-7 8.3-4-1.2-7-4.2-7-8.3V5.8z"/>'
      + '<path d="M8.6 11.6l2.3 2.3 4.3-4.9"/></svg><span><b>Walked and '
      + 'photographed by us</b><span>' + n + ' photo' + (n === 1 ? '' : 's')
      + ' of this exact flat — nothing borrowed from a portal, nothing from '
      + 'a render.</span></span></div>');
    if (c.fotoCurate) {
      v.push('<div class="pel-v"><svg viewBox="0 0 24 24" aria-hidden="true">'
        + '<path d="M4 16l5-6 4 4.5L16 11l4 5"/><rect x="3" y="4.5" '
        + 'width="18" height="15" rx="2"/><circle cx="8.6" cy="9" r="1.2" '
        + 'class="pieno"/></svg><span><b>Ordered by room, not by upload '
        + 'date</b><span>Straightened, colour-corrected and de-duplicated, '
        + 'then sorted living → kitchen → bedrooms → bathroom, floor plans '
        + 'last. So the first photo is the room you actually care '
        + 'about.</span></span></div>');
    }
    pel.innerHTML = '<div class="pel-fila">' + v.join('') + '</div>';

    if (c.video) {
      var id = (c.video.match(/(?:shorts\/|v=|youtu\.be\/|embed\/)([\w-]{6,})/)
                || [])[1];
      if (id) {
        var box = document.createElement('div');
        box.className = 'pel-video';
        box.innerHTML = '<button type="button" class="pel-play">'
          + '<i aria-hidden="true"></i><b>Watch the walkthrough</b>'
          + '<span>Filmed inside this flat · loads only when you press</span>'
          + '</button>';
        box.querySelector('.pel-play').addEventListener('click', function () {
          box.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/'
            + id + '?autoplay=1&rel=0&modestbranding=1" title="Video tour of '
            + (c.nome || 'this apartment') + '" allow="accelerometer; '
            + 'autoplay; encrypted-media; picture-in-picture" '
            + 'allowfullscreen></iframe>';
        });
        pel.appendChild(box);
      }
    } else {
      var a = document.createElement('a');
      a.className = 'pel-v azione';
      a.href = 'VIRTUAL_URL';
      a.style.marginTop = '12px';
      a.style.borderRadius = '14px';
      a.style.boxShadow = 'inset 0 0 0 1px var(--line-gold)';
      a.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">'
        + '<rect x="3.5" y="6.5" width="12" height="11" rx="2"/>'
        + '<path d="M15.5 11l5-2.6v7.2l-5-2.6z"/>'
        + '<circle cx="7.2" cy="10.2" r="1.1" class="pieno"/></svg>'
        + '<span><b>No walkthrough video for this one yet — have a better '
        + 'one.</b><span>A live tour of this exact flat, with you asking the '
        + 'questions and the red flags said out loud. <em>€89</em>, credited '
        + 'to your fee if you rent it.</span></span>';
      pel.appendChild(a);
    }
  })();

  /* ── il racconto e ciò che c'è dentro ───────────────────────────────── */''',
'pellicola js')

# l'apply: il corpo esatto di /api/apply-lead, dichiarato
i = regia.index("  /* ── L'APPLY")
j = regia.index('  /* ── le altre case')
vecchio = regia[i:j]
NUOVO = r'''  /* ── L'APPLY ─────────────────────────────────────────────────────────
     Raccoglie il corpo ESATTO di /api/apply-lead — la porta del pipeline
     vero — piu le due cose che alla console servono per creare il
     pre-accordo senza richiamare nessuno: quanti firmano e per quanto.
     Dichiarato PREVIEW: la richiesta si vede in console, non parte. */
  (function () {
    var f = document.getElementById('modApplica');
    if (!f) return;
    var eti = [].slice.call(document.querySelectorAll('.passi .passo-eti'));
    var gruppi = [].slice.call(f.querySelectorAll('.ap-gruppo'));
    function pieno(g) {
      return [].slice.call(g.querySelectorAll('input, select')).some(
        function (x) { return String(x.value || '').trim(); });
    }
    function stato() {
      gruppi.forEach(function (g, i) {
        var e = eti[i]; if (!e) return;
        e.classList.toggle('fatto', pieno(g));
        e.classList.toggle('ora', !pieno(g)
          && (i === 0 || pieno(gruppi[i - 1])));
      });
    }
    f.addEventListener('input', stato); f.addEventListener('change', stato);
    /* la durata scelta nel conto arriva gia compilata qui */
    document.addEventListener('boom:durata', function (e) {
      var m = f.querySelector('#apMesi');
      if (m) { m.value = String(e.detail); stato(); }
    });
    if (c.dal) { var q = f.querySelector('#apQuando'); if (q) q.value = c.dal; }
    stato();

    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!f.querySelector('#apNome').value.trim()
          || !f.querySelector('#apMail').value.trim()) {
        (f.querySelector('#apNome').value.trim()
          ? f.querySelector('#apMail') : f.querySelector('#apNome')).focus();
        return;
      }
      var d = new FormData(f);
      /* il corpo di /api/apply-lead, campo per campo */
      var corpo = {
        name: d.get('nome'), email: d.get('email'), phone: d.get('telefono'),
        listingId: c.id, listingName: c.nome, listingPrice: c.prezzo,
        zone: c.zona, kind: c.libera ? 'apply' : 'waitlist',
        waitlist: !c.libera,
        income: d.get('reddito'), guarantor: d.get('garante'),
        household: d.get('chi'), occupation: d.get('occupazione'),
        moveIn: d.get('quando'), durationMonths: Number(d.get('mesi')) || null,
        /* in piu, per il pre-accordo: quante firme ci saranno */
        signers: Number(d.get('firmatari')) || 1,
        company: d.get('company')          /* esca per i robot */
      };
      console.info('[PREVIEW] POST /api/apply-lead →', corpo);
      document.getElementById('applica').classList.add('inviato');
      var fatto = document.getElementById('applicaFatto');
      if (fatto) fatto.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  })();

'''
regia = regia[:i] + NUOVO + regia[j:]

# la durata del conto avvisa l'apply
regia = uno(regia, "      tasti.forEach(function (t) {\n        t.classList.toggle('on', Number(t.dataset.m) === m); });",
"""      tasti.forEach(function (t) {
        t.classList.toggle('on', Number(t.dataset.m) === m); });
      /* chi ha scelto la durata qui non deve ridirla nell'apply */
      document.dispatchEvent(new CustomEvent('boom:durata', { detail: m }));""",
'evento durata')

assert 'apply-lead' in regia and 'pel-fila' in regia
open('ld-regia.html', 'w', encoding='utf-8').write(regia)
print('ld3 · apply → pre-accordo · pellicola: video dove c\'e, verita dove no')
