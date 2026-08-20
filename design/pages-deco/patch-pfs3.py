#!/usr/bin/env python3
# PFS 3.0 — LA SPINA DORSALE DI CONVERSIONE sulla pagina Property Finding.
# La pagina aveva organi buoni (finder, macchina coi numeri veri) ma zero
# porta: nessun form, nessuna Checkout — solo WhatsApp. Interventi:
#   1. IL CHECK-IN: il brief È un boarding pass compilabile (5 campi +
#      dettagli a scomparsa) → POST /api/create-checkout → Stripe €350.
#   2. FAQ VISIBILI: il FAQPage JSON-LD dichiarava 4 domande che la pagina
#      non mostrava (contenuto nascosto = sanzione + fonte incitabile).
#   3. Itinerario riscritto coi fatti veri (radar, Wallet pass, Magic Sign).
#   4. CTA hero+prezzo puntano al check-in; WhatsApp resta corsia quieta.
#   5. "trusted by 500+ expats" → la prova sociale canonica verificabile.
# Applica le STESSE modifiche a pf-body.html (sorgente) e
# property-finding.html (live): il builder sito è rimasto all'era v2 e
# ricostruire regredirebbe i link.
import sys

FILES = ['design/pages-deco/pf-body.html', 'property-finding.html']


def uno(s, ago, f):
    n = s.count(ago)
    if n != 1:
        print(f'FALLITO in {f}: {n} occorrenze di {ago[:64]!r}')
        sys.exit(1)


CSS_ANCORA = ".prezzoP-cta .pf-voce { font-size:13.5px; }"
CSS = CSS_ANCORA + """

/* ══ IL CHECK-IN — il brief È un boarding pass: si compila e si vola ═══ */
.ckt { position:relative; display:grid;
  grid-template-columns:38px minmax(0,1fr) 10px clamp(270px,26vw,330px);
  background:linear-gradient(168deg,#16130a,#0A0908 72%); border-radius:20px;
  overflow:hidden; box-shadow:inset 0 0 0 1px var(--line-gold),
    0 40px 90px -46px rgba(0,0,0,.95); }
.ckt::after { content:''; position:absolute; inset:6px; border-radius:15px;
  pointer-events:none; box-shadow:0 0 0 1px rgba(255,215,0,.14); }
.ckt::before { content:''; position:absolute; inset:0; pointer-events:none;
  opacity:.5; background:
    repeating-linear-gradient(115deg, rgba(255,215,0,.05) 0 1px,
      transparent 1px 9px),
    repeating-linear-gradient(63deg, rgba(255,215,0,.05) 0 1px,
      transparent 1px 14px);
  -webkit-mask:radial-gradient(120% 130% at 0% 0%, #000 20%, transparent 62%);
  mask:radial-gradient(120% 130% at 0% 0%, #000 20%, transparent 62%); }
.ck-banda { position:relative; display:grid; place-items:center;
  overflow:hidden; background:
    repeating-linear-gradient(0deg, rgba(0,0,0,.16) 0 1px, transparent 1px 3px),
    linear-gradient(180deg,#7a5f16,#f6e27a 14%,#8a6d1f 32%,#fdf0a8 48%,
      #b8942b 63%,#f6e27a 78%,#6b5716 100%); }
.ck-banda em { font-style:normal; writing-mode:vertical-rl;
  transform:rotate(180deg); font-size:8.5px; font-weight:800;
  letter-spacing:.34em; text-transform:uppercase; color:#141005;
  white-space:nowrap; }
.ck-corpo { position:relative; padding:clamp(18px,2.4vw,28px); min-width:0; }
.ck-rotta { display:flex; align-items:center; gap:12px;
  font-family:var(--display); font-weight:250;
  font-size:clamp(21px,2.2vw,27px); letter-spacing:.06em; line-height:1; }
.ck-rotta b { font-weight:250; }
.ck-rotta b:last-child { color:var(--gold);
  text-shadow:0 0 22px rgba(255,215,0,.16); }
.ck-tratta { position:relative; flex:1 1 40px; min-width:34px; height:15px; }
.ck-tratta::before { content:''; position:absolute; left:0; right:0;
  top:7px; height:1px; background:repeating-linear-gradient(90deg,
    rgba(250,250,250,.34) 0 5px, transparent 5px 10px); }
.ck-tratta::after { content:''; position:absolute; left:0; top:7px;
  height:1px; width:0; opacity:0;
  background:linear-gradient(90deg, transparent, var(--gold));
  animation:ckScia 8s var(--ease) infinite; }
.ck-aereo { position:absolute; top:0; width:15px; height:15px; opacity:0;
  animation:ckVolo 8s var(--ease) infinite; }
.ck-aereo svg { display:block; width:100%; height:100%;
  transform:rotate(90deg); fill:var(--gold);
  filter:drop-shadow(0 0 5px rgba(255,215,0,.35)); }
@keyframes ckVolo { 0% { left:0; opacity:0; } 7% { opacity:1; }
  52% { left:calc(100% - 15px); } 84% { left:calc(100% - 15px); opacity:1; }
  100% { left:calc(100% - 15px); opacity:0; } }
@keyframes ckScia { 0% { width:0; opacity:0; } 7% { opacity:.42; }
  52% { width:100%; } 84% { width:100%; opacity:.42; }
  100% { width:100%; opacity:0; } }
.ck-campi { margin-top:18px; display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px 14px; }
.ck-campo { display:flex; flex-direction:column; gap:6px; min-width:0; }
.ck-campo.tutto { grid-column:1/-1; }
.ck-campo label { font-size:9.5px; font-weight:700; letter-spacing:.2em;
  text-transform:uppercase; color:var(--text-3); }
.ck-campo input, .ck-campo select, .ck-campo textarea { width:100%;
  padding:12px 13px; font:inherit; font-size:14px; color:var(--text);
  background:rgba(255,255,255,.04); border:0; border-radius:4px;
  box-shadow:inset 0 0 0 1px var(--line); outline:none;
  transition:box-shadow .3s ease; }
.ck-campo input:focus, .ck-campo select:focus, .ck-campo textarea:focus {
  box-shadow:inset 0 0 0 1px rgba(255,215,0,.5); }
.ck-campo textarea { min-height:74px; resize:vertical; }
.ck-piu { margin-top:14px; background:none; border:0; padding:0;
  font:inherit; font-size:12.5px; color:var(--gold); letter-spacing:.04em;
  cursor:pointer; }
.ck-extra { display:none; }
.ckt.aperto .ck-extra { display:flex; }
.ck-perf { position:relative; background:
    radial-gradient(circle 3px at 50% 50%, var(--black) 97%, transparent),
    radial-gradient(circle 3.4px at calc(50% + 1px) 50%,
      rgba(255,255,255,.13) 97%, transparent);
  background-size:10px 14px; background-repeat:repeat-y;
  background-position:center; }
.ck-perf::before, .ck-perf::after { content:''; position:absolute;
  width:20px; height:20px; border-radius:50%; background:var(--black);
  box-shadow:inset 0 0 0 1px var(--line); left:calc(50% - 10px); }
.ck-perf::before { top:-11px; } .ck-perf::after { bottom:-11px; }
.ck-stub { position:relative; display:flex; flex-direction:column;
  justify-content:center; padding:clamp(18px,2.2vw,26px);
  background:linear-gradient(200deg,#121009,#080807 70%); }
.ck-quota { display:flex; align-items:center; gap:14px; }
.ck-quota b { font-family:var(--display); font-weight:250; color:var(--gold);
  font-size:clamp(30px,2.6vw,38px); text-shadow:0 0 18px rgba(255,215,0,.16);
  font-variant-numeric:tabular-nums; }
.ck-barcode { flex:1; height:30px; min-width:40px; opacity:.45; background:
    repeating-linear-gradient(90deg, rgba(250,250,250,.75) 0 2px,
      transparent 2px 4px),
    repeating-linear-gradient(90deg, rgba(250,250,250,.5) 0 1px,
      transparent 1px 7px, rgba(250,250,250,.5) 7px 10px,
      transparent 10px 13px); }
.ck-sotto { margin:4px 0 14px; font-size:7px; font-weight:600;
  letter-spacing:.3em; text-transform:uppercase; color:var(--text-3); }
.ck-vai { display:inline-flex; align-items:center; justify-content:center;
  gap:9px; min-height:46px; width:100%; padding:0 20px; border:0;
  border-radius:100px; background:var(--gold); color:#0A0A05; font:inherit;
  font-size:13px; font-weight:700; cursor:pointer;
  transition:transform .3s ease, box-shadow .3s ease;
  box-shadow:0 10px 26px -12px rgba(255,215,0,.45); }
.ck-vai:hover { transform:translateY(-1px); }
.ck-vai:active { transform:translateY(0) scale(.98); }
.ck-vai[disabled] { opacity:.6; cursor:wait; }
.ck-garanzia { margin-top:11px; display:flex; gap:8px; font-size:10.5px;
  line-height:1.5; color:var(--text-3); }
.ck-garanzia::before { content:'✓'; color:var(--gold); }
.ck-garanzia b { color:var(--text-2); }
.ck-alt { margin-top:12px; font-size:11.5px; color:var(--text-3); }
.ck-alt a { color:var(--text-2); text-decoration:underline;
  text-underline-offset:3px; }
.ck-err { display:none; margin-top:10px; font-size:12px; color:#FF6B4A; }
.ckt.rotto .ck-err { display:block; }
@media (max-width:900px){
  .ckt { grid-template-columns:30px minmax(0,1fr); }
  .ck-banda { grid-row:1; }
  .ck-corpo { grid-column:2; }
  .ck-perf { grid-column:1/-1; height:10px; width:auto;
    background-image:
      radial-gradient(circle 3px at 50% 50%, var(--black) 97%, transparent),
      radial-gradient(circle 3.4px at 50% calc(50% + 1px),
        rgba(255,255,255,.13) 97%, transparent);
    background-size:14px 10px; background-repeat:repeat-x; }
  .ck-perf::before { top:calc(50% - 10px); left:-11px; }
  .ck-perf::after { top:calc(50% - 10px); left:auto; right:-11px;
    bottom:auto; }
  .ck-stub { grid-column:1/-1; }
  .ck-campi { grid-template-columns:1fr; }
}
/* le FAQ visibili: il FAQPage smette di dichiarare cio' che non si vede */
.pf-faq { display:grid; gap:10px; max-width:860px; }
.pf-faq details { background:var(--card);
  box-shadow:inset 0 0 0 1px var(--line-0); padding:0 18px;
  border-radius:4px; }
.pf-faq summary { cursor:pointer; list-style:none; display:flex;
  justify-content:space-between; gap:14px; align-items:baseline;
  padding:16px 0; font-size:15px; font-weight:500; }
.pf-faq summary::-webkit-details-marker { display:none; }
.pf-faq summary::after { content:'+'; color:var(--gold); font-size:18px;
  flex:none; transition:transform .3s ease; }
.pf-faq details[open] summary::after { transform:rotate(45deg); }
.pf-faq p { padding:0 0 16px; font-size:13.5px; line-height:1.65;
  color:var(--text-2); max-width:64ch; }
@media (prefers-reduced-motion:reduce){
  .ck-aereo { animation:none; left:calc(100% - 15px); opacity:1; }
  .ck-tratta::after { animation:none; width:100%; opacity:.4; }
}"""

TRUST_ANCORA = """<b>4.9</b> · trusted by 500+ expats</p>"""
TRUST = """<b>4.9 on Google</b> · 47 reviews · licensed agency —
        <b>Egidi Immobiliare S.r.l.</b></p>"""

HERO_CTA_ANCORA = '<a class="btn btn-primary" href="#prezzo">Get your expert</a>'
HERO_CTA = '<a class="btn btn-primary" href="#checkin">Start the hunt · €350</a>'

AEREO_SVG = ('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.5 '
             '15.5v-2l-8-5V3c0-.83-.67-1.5-1.5-1.5S10.5 2.17 10.5 3v5.5l-8 '
             '5v2l8-2.5v5.5l-2 1.5V21l3.5-1 3.5 1v-1.5l-2-1.5v-5.5l8 2.5z"/>'
             '</svg>')

PERCHE_ANCORA = '<!-- ══ PERCHÉ FUNZIONA — verbatim ════════════════════════════════════════ -->'
CHECKIN = """<!-- ══ IL CHECK-IN — la porta: il brief e' un boarding pass ══════════════ -->
<section class="section" id="checkin">
  <div class="container">
    <div class="sale">
      <span class="eyebrow"><i></i>Check-in · First class</span>
      <h2 class="titolo">Board <span class="hl">the hunt</span>.</h2>
      <p class="sotto">Five lines and you're on. Your expert reads this exact
        brief, the search starts within 24 hours — and the €350 comes back
        the day we deliver.</p>
    </div>
    <form class="ckt sale" id="ckForm" style="margin-top:clamp(22px,3vw,34px)" novalidate>
      <span class="ck-banda" aria-hidden="true"><em>First class · Property Finding</em></span>
      <div class="ck-corpo">
        <div class="ck-rotta" aria-hidden="true"><b>ABROAD</b>
          <span class="ck-tratta"><i class="ck-aereo">""" + AEREO_SVG + """</i></span>
          <b>ROME</b></div>
        <div class="ck-campi">
          <div class="ck-campo"><label for="ckNome">Passenger · full name</label>
            <input id="ckNome" name="name" autocomplete="name" required></div>
          <div class="ck-campo"><label for="ckMail">Email</label>
            <input id="ckMail" name="email" type="email" autocomplete="email" required></div>
          <div class="ck-campo"><label for="ckTel">WhatsApp / phone</label>
            <input id="ckTel" name="phone" type="tel" autocomplete="tel" required></div>
          <div class="ck-campo"><label for="ckBudget">Monthly budget (€)</label>
            <input id="ckBudget" name="budget" inputmode="numeric" placeholder="1.500"></div>
          <div class="ck-campo tutto"><label for="ckQuando">Move-in</label>
            <input id="ckQuando" name="move_in_date" type="month"></div>
          <div class="ck-campo ck-extra"><label for="ckBeds">Bedrooms</label>
            <select id="ckBeds" name="bedrooms"><option value="">—</option>
              <option>Studio</option><option>1</option><option>2</option>
              <option>3+</option></select></div>
          <div class="ck-campo ck-extra"><label for="ckZone">Preferred areas</label>
            <input id="ckZone" name="preferred_areas" placeholder="Trastevere, Prati…"></div>
          <div class="ck-campo tutto ck-extra"><label for="ckMust">Must-haves</label>
            <input id="ckMust" name="must_haves" placeholder="Balcony, elevator, pet-friendly…"></div>
          <div class="ck-campo tutto ck-extra"><label for="ckNote">Anything else</label>
            <textarea id="ckNote" name="additional_info"></textarea></div>
        </div>
        <button type="button" class="ck-piu" id="ckPiu" aria-expanded="false">+
          More details (bedrooms, areas, must-haves)</button>
        <input type="text" name="company" tabindex="-1" autocomplete="off"
          aria-hidden="true" style="position:absolute;left:-9999px">
      </div>
      <span class="ck-perf" aria-hidden="true"></span>
      <div class="ck-stub">
        <div class="ck-quota"><b>€350</b><span class="ck-barcode" aria-hidden="true"></span></div>
        <div class="ck-sotto">BOOM·ROME · FIRST · PF-0350</div>
        <button class="ck-vai" type="submit" id="ckVai">Start the hunt ·
          €350&nbsp;<i style="font-style:normal">→</i></button>
        <p class="ck-garanzia"><span><b>Zero risk:</b> deducted on success,
          refunded in full if we don't deliver.</span></p>
        <p class="ck-err" id="ckErr" role="alert"></p>
        <p class="ck-alt">Prefer to talk first?
          <a href="https://wa.me/393313251961" target="_blank"
            rel="noopener">WhatsApp us</a> — a named human replies.</p>
      </div>
    </form>
  </div>
</section>

""" + PERCHE_ANCORA

PASSI_ANCORA = """      <div class="passo4"><b>01</b><span>Share your requirements</span></div>
      <div class="passo4"><b>24h</b><span>We activate the search</span></div>
      <div class="passo4"><b>02</b><span>Curated options &amp; viewings</span></div>
      <div class="passo4"><b>03</b><span>Secure &amp; move in</span></div>"""
PASSI = """      <div class="passo4"><b>01</b><span>Check-in — five lines and the
        €350. Your expert calls, the search arms within 24h.</span></div>
      <div class="passo4"><b>02</b><span>The hunt — our off-market network,
        plus every portal watched day and night and scored on your
        brief.</span></div>
      <div class="passo4"><b>03</b><span>Viewings — walked in person, live
        on video if you're abroad. Confirmed visits arrive as an Apple
        Wallet pass.</span></div>
      <div class="passo4"><b>04</b><span>Keys — we negotiate the terms, you
        sign the registered contract from your phone.</span></div>"""

PREZZO_CTA_ANCORA = ('        <a class="btn btn-primary" href="https://wa.me/'
  '393313251961" target="_blank" rel="noopener">Get your expert</a>')
PREZZO_CTA = '        <a class="btn btn-primary" href="#checkin">Start the hunt · €350</a>'

FOOTER_ANCORA = '<footer class="footer">'
FAQ_E_SCRIPT = """<!-- ══ FAQ — le stesse quattro del markup FAQPage, ORA VISIBILI ══════════ -->
<section class="section section-dark" id="faq">
  <div class="container">
    <div class="sale">
      <span class="eyebrow"><i></i>Questions, answered straight</span>
      <h2 class="titolo">Before <span class="hl">you board</span>.</h2>
    </div>
    <div class="pf-faq sale" style="margin-top:clamp(22px,3vw,34px)">
      <details><summary>What if you don't find anything?</summary>
        <p>The €350 is fully refundable if we do not deliver a match. You
          risk nothing.</p></details>
      <details><summary>Is the €350 an extra cost?</summary>
        <p>No — it is deducted from your first month's rent when we secure
          your apartment, so it effectively disappears.</p></details>
      <details><summary>Can you really access off-market apartments?</summary>
        <p>Yes. After 6+ years in Rome we work directly with landlords and
          building administrators, so you see places that never reach the
          public portals.</p></details>
      <details><summary>I'm not in Italy yet — does it still work?</summary>
        <p>Perfectly. We handle the viewings on video and manage everything
          remotely — contract and utilities included.</p></details>
    </div>
  </div>
</section>

<script>
/* IL CHECK-IN: dal boarding pass alla Checkout Stripe. Best-effort sul
   tracking (gtag puo' non esserci), MAI sulla rotta dei soldi. */
(function () {
  'use strict';
  var form = document.getElementById('ckForm');
  if (!form) return;
  function traccia(n, p) { try { gtag('event', n, p || {}); } catch (e) {} }
  var piu = document.getElementById('ckPiu');
  piu.addEventListener('click', function () {
    var aperto = form.classList.toggle('aperto');
    piu.setAttribute('aria-expanded', aperto ? 'true' : 'false');
    piu.textContent = aperto ? '− Fewer details'
      : '+ More details (bedrooms, areas, must-haves)';
  });
  if ('IntersectionObserver' in window) {
    var visto = false;
    new IntersectionObserver(function (v, o) {
      if (visto) return;
      if (!v.some(function (x) { return x.isIntersecting; })) return;
      visto = true; o.disconnect();
      traccia('pfs_checkin_view', { design: 'biglietto' });
    }, { threshold: .35 }).observe(form);
  }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    form.classList.remove('rotto');
    var dati = {};
    ['name', 'email', 'phone', 'budget', 'move_in_date', 'bedrooms',
     'preferred_areas', 'must_haves', 'additional_info', 'company']
      .forEach(function (k) {
        var el = form.querySelector('[name="' + k + '"]');
        if (el && el.value) dati[k] = el.value;
      });
    if (!dati.name || !dati.email || !dati.phone
        || dati.email.indexOf('@') < 0) {
      form.classList.add('rotto');
      document.getElementById('ckErr').textContent =
        'Name, email and phone are required — that is how your expert ' +
        'reaches you.';
      return;
    }
    var b = document.getElementById('ckVai');
    b.disabled = true; b.textContent = 'Opening secure checkout…';
    traccia('pfs_checkin_submit', { price: 350 });
    fetch('/api/create-checkout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dati)
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.url) { location.href = j.url; return; }
      throw new Error('no_url');
    }).catch(function () {
      traccia('pfs_checkin_error', {});
      b.disabled = false;
      b.innerHTML = 'Start the hunt · €350&nbsp;' +
        '<i style="font-style:normal">\\u2192</i>';
      form.classList.add('rotto');
      document.getElementById('ckErr').textContent =
        "Something didn't go through — try again, or write to us on " +
        'WhatsApp below.';
    });
  });
})();
</script>

""" + FOOTER_ANCORA

for f in FILES:
    s = open(f, encoding='utf-8').read()
    for a, b in ((CSS_ANCORA, CSS), (TRUST_ANCORA, TRUST),
                 (HERO_CTA_ANCORA, HERO_CTA), (PERCHE_ANCORA, CHECKIN),
                 (PASSI_ANCORA, PASSI), (PREZZO_CTA_ANCORA, PREZZO_CTA),
                 (FOOTER_ANCORA, FAQ_E_SCRIPT)):
        uno(s, a, f)
        s = s.replace(a, b)
    # verifiche finali
    for ago in ('id="ckForm"', 'create-checkout', 'pf-faq', 'id="checkin"'):
        uno(s, ago, f) if ago in ('id="ckForm"', 'id="checkin"') else None
    assert '500+' not in s, f
    open(f, 'w', encoding='utf-8').write(s)
    print(f, '→ PFS 3.0 montato,', len(s) // 1024, 'KB')
