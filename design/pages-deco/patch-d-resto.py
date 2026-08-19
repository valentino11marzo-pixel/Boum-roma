#!/usr/bin/env python3
# D · il resto: FAQ visibile in coda alla home (STESSA fonte del JSON-LD),
# eventi analytics sul funnel (finora c'era solo il config: zero eventi),
# fetchpriority sull'elemento LCP del detail.
import shutil

def leggi(n): return open(n, encoding='utf-8').read()
def scrivi(n, s): open(n, 'w', encoding='utf-8').write(s)
def uno(s, ago, dove):
    assert s.count(ago) == 1, f'{dove}: {s.count(ago)}'

# ── 1 · boomTrack negli organi condivisi ─────────────────────────────────
d = leggi('deco-organi.html'); shutil.copy('deco-organi.html', 'deco-organi.html.bakD')
ARMA = "  window.__decoArmato = true;"
uno(d, ARMA, 'organi armato')
d = d.replace(ARMA, ARMA + '''
  /* il funnel si misura: eventi GA4 col consenso gia' regolato dal
     consent-mode — finora c'era solo il config, zero eventi */
  window.boomTrack = function (n, p) {
    try { gtag('event', n, p || {}); } catch (e) {}
  };''')
scrivi('deco-organi.html', d)

# ── 2 · home: find_homes al submit ───────────────────────────────────────
p = leggi('pt.html'); shutil.copy('pt.html', 'pt.html.bakD')
SUB = """      if (b) pezzi.push('budget=' + b);
      if (c) pezzi.push('chi=' + c);"""
uno(p, SUB, 'pt submit')
p = p.replace(SUB, SUB + """
      if (window.boomTrack) boomTrack('find_homes',
        { budget: b || '', dal: scelta ? iso(scelta) : '', chi: c || '' });""")
scrivi('pt.html', p)

# ── 3 · detail: apply / hold / whatsapp + LCP ────────────────────────────
r = leggi('ld-regia.html'); shutil.copy('ld-regia.html', 'ld-regia.html.bakD')
IMG = "  img.decoding = 'async';"
uno(r, IMG, 'img principale')
r = r.replace(IMG, IMG + """
  /* l'elemento LCP della pagina: la rete lo tratta da protagonista */
  img.setAttribute('fetchpriority', 'high');""")

AP = """      f.style.display = 'none';
      var sotto = document.getElementById('applicaSotto');"""
uno(r, AP, 'apply fatto')
r = r.replace(AP, """      if (window.boomTrack) boomTrack('apply_submit',
        { item_id: c.id || '', intent: c.libera ? 'apply' : 'waitlist' });
""" + AP)

PR = """      var nome = f.querySelector('#prNome').value.trim(),
          mail = f.querySelector('#prMail').value.trim(),
          tel = f.querySelector('#prTel').value.trim();
      if (!nome || !mail || !tel) return;"""
uno(r, PR, 'presa submit')
r = r.replace(PR, PR + """
      if (window.boomTrack) boomTrack('hold_start', { item_id: c.id || '' });""")

WA = "    wa.href = 'https://wa.me/393313251961?text=' + encodeURIComponent(msg);"
uno(r, WA, 'wa contesto')
r = r.replace(WA, WA + """
    wa.addEventListener('click', function () {
      if (window.boomTrack) boomTrack('whatsapp_click', { item_id: c.id || '' });
    });""")
scrivi('ld-regia.html', r)

# ── 4 · discovery: card_open ─────────────────────────────────────────────
a = leggi('ad-regia.html'); shutil.copy('ad-regia.html', 'ad-regia.html.bakD')
MURO = "  muro.addEventListener('click', function (e) {"
uno(a, MURO, 'muro click')
a = a.replace(MURO, """  muro.addEventListener('click', function (e) {
    var carta = e.target.closest('a.casa-p');
    if (carta && window.boomTrack)
      boomTrack('card_open', { item_id: carta.dataset.id || '' });
  });
""" + MURO)
scrivi('ad-regia.html', a)

# ── 5 · la FAQ visibile in coda alla home (fonte: TESTA.FAQ_HOME) ────────
b = leggi('costruisci-portale.py'); shutil.copy('costruisci-portale.py', 'costruisci-portale.py.bakD')
GANCIO = "    OG = TESTA.blocco_home("
uno(b, GANCIO, 'blocco home')
FAQ_PY = '''    # la FAQ del JSON-LD diventa VISIBILE in coda alla pagina: markup che
    # afferma cio' che la pagina non mostra e' contenuto nascosto (regola
    # GEO gia' pinnata su Reunion) — una fonte sola, mai due verita'
    import html as _html
    _faq = TESTA.FAQ_HOME['mainEntity']
    _voci = ''.join(
        '<details class="faq-v"' + (' open' if _i == 0 else '') + '><summary>'
        + _html.escape(_q['name']) + '</summary><p>'
        + _html.escape(_q['acceptedAnswer']['text']) + '</p></details>'
        for _i, _q in enumerate(_faq))
    FAQ_HTML = ("""
<section class="sezione" id="faq">
  <style>
  .faq-casa { margin-top:22px; display:grid; gap:1px; background:var(--line-0);
    border:1px solid var(--line-0); border-radius:14px; overflow:hidden; }
  .faq-v { background:var(--bg-card, #0A0A0A); padding:16px 19px; }
  .faq-v summary { cursor:pointer; list-style:none; font-size:13.5px;
    font-weight:500; color:var(--text); line-height:1.4; position:relative;
    padding-right:26px; }
  .faq-v summary::-webkit-details-marker { display:none; }
  .faq-v summary::after { content:'+'; position:absolute; right:2px; top:50%;
    transform:translateY(-50%); color:var(--gold); font-size:16px;
    font-weight:300; transition:transform .25s var(--ease); }
  .faq-v[open] summary::after { transform:translateY(-50%) rotate(45deg); }
  .faq-v p { margin:8px 0 0; font-size:12.5px; line-height:1.65;
    color:var(--text-2); max-width:70ch; }
  </style>
  <div class="container">
    <div class="sale">
      <span class="eyebrow"><i></i>Before you ask</span>
      <h2 class="titolo">Quick <span class="hl">answers</span>.</h2>
    </div>
    <div class="faq-casa sale">""" + _voci + """</div>
  </div>
</section>
""")
    h = h.replace('<footer class="piede">', FAQ_HTML + '<footer class="piede">', 1)
'''
b = b.replace(GANCIO, FAQ_PY + GANCIO)
scrivi('costruisci-portale.py', b)
print('D resto: boomTrack + eventi + FAQ home + fetchpriority')
