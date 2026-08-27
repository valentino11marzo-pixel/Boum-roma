#!/usr/bin/env python3
# IL MOTORE DELLA CONSOLE — una copia sola per tutte le pagine servizio.
# Prende la pagina «Services 2.0» pristina e ne sostituisce il corpo con
# il REGISTRO del patto e la CONSOLE delle obiezioni; hero, cassa, nav,
# piede e dati strutturati restano INTATTI. Le domande del FAQPage
# diventano <summary> VISIBILI dentro la console e la vecchia sezione FAQ
# sparisce invece di duplicarle.
import sys


def uno(s, ago, dove):
    n = s.count(ago)
    if n != 1:
        print(f'FALLITO in {dove}: {n} occorrenze di {ago[:70]!r}')
        sys.exit(1)


def riga(i, rid, tema, dom, colpo, dida, lead, dets, prove='',
         rep_eti='', rep=''):
    corpo = '\n      '.join(f'<p class="r-det">{d}</p>' for d in dets)
    chips = f'\n      <div class="prove">{prove}</div>' if prove else ''
    rh = ''
    if rep:
        rh = (f'\n      <div class="reperto-eti"><b>Exhibit</b>'
              f'<span>{rep_eti}</span></div>\n      {rep}')
    apre = ' open' if i == 0 else ''
    return f"""<details class="riga" id="{rid}"{apre}>
      <summary>
        <span class="r-num">{i + 1:02d}</span>
        <span class="r-tema">{tema}</span>
        <span class="r-q">{dom}</span>
        <span class="r-cifra"><span class="r-colpo">{colpo}</span>
          <span class="r-colpo-eti">{dida}</span></span>
        <span class="r-azione"><span class="r-apri"></span>
          <span class="r-piu" aria-hidden="true"></span></span>
      </summary>
      <div class="r-corpo">
      <p class="r-lead">{lead}</p>
      {corpo}{chips}
      <div class="r-strumenti"><button type="button" class="r-link"
        data-q="{rid}">Copy the link to this answer</button></div>{rh}
      </div>
    </details>"""



def _piano(html):
    """Il testo di una risposta come lo legge un umano: niente tag,
    niente doppi spazi, virgolette dritte (finisce dentro un JSON)."""
    import re, html as _h
    t = re.sub(r'<[^>]+>', ' ', html)
    t = _h.unescape(t)
    t = t.replace('\u201c', '"').replace('\u201d', '"')
    t = t.replace('\u2018', "'").replace('\u2019', "'")
    t = re.sub(r'\s+', ' ', t)
    t = re.sub(r'\s+([,.;:!?])', r'\1', t)
    return t.strip()

def costruisci(spec, css, piede_prove):
    """spec: dizionario della pagina. Ritorna l'HTML finale."""
    src, out = spec['base'], spec['out']
    s = open(src, encoding='utf-8').read()
    n = len(spec['righe'])

    # 1 · il foglio di stile della console
    ANCORA = '<style>main{padding-top:206px}.fam{top:112px}</style>'
    if s.count(ANCORA) != 1:
        # alcune pagine hanno un padding diverso: si cerca la forma generica
        import re
        m = re.search(r'<style>main\{padding-top:\d+px\}\.fam\{top:\d+px\}</style>', s)
        assert m, f'{out}: ancora del padding non trovata'
        ANCORA = m.group(0)
    s = s.replace(ANCORA, ANCORA[:-len('</style>')] + '\n' + css + '</style>')

    # 2 · via il corpo vecchio (HOW IT WORKS → MORE)
    D0 = '  <section class="rv">\n    <div class="sec-h"><span class="num">'
    i0 = s.index(D0)
    # si taglia FINO all'inizio della sezione MORE (che resta): la FAQ
    # vecchia sta in mezzo e deve sparire — le sue domande vivono ora
    # nella console, e due copie della stessa risposta sono due verita'.
    D1M = '<span class="num">MORE</span>'
    i1 = s.rindex('  <section class="rv">', 0, s.index(D1M))
    righe = '\n        '.join(
        riga(i, *r) for i, r in enumerate(spec['righe']))
    seg = ''.join('<i></i>' for _ in range(n))
    NUOVO = f"""  <!-- ══ IL REGISTRO — il patto in un respiro ═════════════════════════ -->
  <section class="registro" id="registro">
    <div class="container">
      <p class="reg-eti">{spec['registro_eti']}</p>
      <div class="libro">
        {spec['registro']}
      </div>
      <p class="reg-nota">{spec['registro_nota']}</p>
    </div>
  </section>

  <!-- ══ LA CONSOLE — le obiezioni le apre chi legge ═══════════════════ -->
  <section class="rv" id="console">
    <div class="container">
      <div class="sez-capo">
        <span class="num">The interrogation</span>
        <h2>{spec['console_h2']}</h2>
        <p>{spec['console_sotto']}</p>
      </div>
      <div class="console pulsa" id="cons">
        <div class="cs-capo">
          <span class="cs-stato" id="csStato"><b>0</b>/{n} answered</span>
          <span class="cs-seg" id="csSeg" aria-hidden="true">{seg}</span>
          <span class="cs-invito">Tap any question to open the answer</span>
          <span class="cs-tasti" aria-hidden="true"><kbd>1</kbd>–<kbd>{n}</kbd>
            open · <kbd>esc</kbd> close</span>
          <button type="button" class="cs-tutto" id="csTutto"
            aria-expanded="false">Open all</button>
        </div>
        {righe}
        <div class="cs-basta" id="csBasta">
          <p>{spec['basta']}</p>
          {spec['cta_basta']}
        </div>
      </div>
    </div>
  </section>

  <!-- ══ LA CHIUSURA ═══════════════════════════════════════════════════ -->
  <section class="chiusa" id="chiusura">
    <div class="container">
      <h2>{spec['chiusa_h2']}</h2>
      {spec['cta_chiusa']}
      <p class="chiusa-nota">{spec['chiusa_nota']}</p>
    </div>
  </section>

"""
    s = s[:i0] + NUOVO + s[i1:]

    # 3 · la vecchia barra puntava a #pay, sezione che non esiste piu'
    V = ("  var bar=document.getElementById('paybar'),"
         "hero=document.querySelector('.hero'),"
         "pay=document.getElementById('pay');")
    if s.count(V) == 1:
        s = s.replace(V, V + "\n  if(!bar||!hero||!pay)return;"
                           "   /* la console ha la sua barra */")

    # 4 · il piede porta le prove verificabili
    uno(s, spec['piede_ancora'], out)
    s = s.replace(spec['piede_ancora'], spec['piede_ancora'] + piede_prove)

    # 5 · la barra della cassa + la regia
    pre = spec['pref']
    s = s.replace('</body>', f"""
<div class="hud" id="hud" aria-label="{spec.get('hud_eti', 'Your progress and the checkout')}">
  <span class="hud-stato" id="hudStato">{n} questions · <b>tap one</b></span>
  {spec['cta_hud']}
</div>
<script>
/* LA CONSOLE — il progresso e' del visitatore. Righe <details> native:
   senza JS restano perfettamente apribili. */
(function () {{
  'use strict';
  var cons = document.getElementById('cons');
  if (!cons) return;
  var N = {n}, PRE = '{pre}';
  var righe = [].slice.call(cons.querySelectorAll('.riga'));
  var seg = [].slice.call(cons.querySelectorAll('#csSeg i'));
  var stato = document.getElementById('csStato');
  var basta = document.getElementById('csBasta');
  var hudS = document.getElementById('hudStato');
  var CHIAVE = 'boom_' + PRE + '_lette', viste = {{}};
  function lette() {{
    try {{ return JSON.parse(localStorage.getItem(CHIAVE) || '[]'); }}
    catch (e) {{ return []; }} }}
  function ricorda(id) {{
    try {{ var v = lette(); if (v.indexOf(id) < 0) {{ v.push(id);
      localStorage.setItem(CHIAVE, JSON.stringify(v.slice(-12))); }} }}
    catch (e) {{}} }}
  lette().forEach(function (id) {{
    var r = document.getElementById(id); if (r) r.classList.add('letta'); }});
  function conta() {{
    righe.forEach(function (r, i) {{
      if (r.open) r.classList.add('risposta');
      seg[i].classList.toggle('acceso', r.classList.contains('risposta'));
    }});
    var f = righe.filter(function (r) {{
      return r.classList.contains('risposta'); }}).length;
    stato.innerHTML = '<b>' + f + '</b>/' + N + ' answered';
    if (hudS) hudS.innerHTML = f
      ? '<b>' + f + '</b>/' + N + ' answered — the evidence is open'
      : N + ' questions · <b>tap one</b>';
    if (f >= 2) basta.classList.add('viva');
  }}
  righe.forEach(function (r) {{
    r.addEventListener('toggle', function () {{
      if (r.open) {{
        r.classList.add('letta'); ricorda(r.id);
        try {{ history.replaceState(null, '', '#' + r.id); }} catch (e) {{}}
        if (!viste[r.id]) {{ viste[r.id] = 1;
          try {{ gtag('event', 'svc_q_open',
            {{ q: r.id, page: PRE }}); }} catch (e) {{}} }}
      }}
      cons.classList.remove('pulsa');
      conta();
    }});
  }});
  if (innerWidth < 900 && !location.hash && righe[0]) righe[0].open = false;
  conta();

  function apriDaHash(scorri) {{
    var id = (location.hash || '').replace('#', '');
    if (id.indexOf(PRE) !== 0) return;
    var r = document.getElementById(id);
    if (!r) return;
    r.open = true;
    if (scorri) setTimeout(function () {{
      r.scrollIntoView({{ behavior: 'smooth', block: 'start' }}); }}, 120);
  }}
  apriDaHash(true);
  addEventListener('hashchange', function () {{ apriDaHash(true); }});

  var tutto = document.getElementById('csTutto');
  if (tutto) tutto.addEventListener('click', function () {{
    var apri = righe.some(function (r) {{ return !r.open; }});
    righe.forEach(function (r) {{ r.open = apri; }});
    tutto.textContent = apri ? 'Close all' : 'Open all';
    tutto.setAttribute('aria-expanded', apri ? 'true' : 'false');
    conta();
  }});

  addEventListener('keydown', function (ev) {{
    var t = ev.target || {{}}, tag = (t.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select'
      || t.isContentEditable || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.key === 'Escape') {{
      righe.forEach(function (r) {{ r.open = false; }}); conta(); return; }}
    var k = parseInt(ev.key, 10);
    if (!(k >= 1 && k <= N)) return;
    var r = righe[k - 1]; if (!r) return;
    ev.preventDefault(); r.open = !r.open; conta();
    if (r.open) r.scrollIntoView({{ behavior: 'smooth', block: 'start' }});
  }});

  [].forEach.call(document.querySelectorAll('.r-link'), function (b) {{
    b.addEventListener('click', function () {{
      var url = location.origin + location.pathname + '#' + b.dataset.q;
      var fine = function () {{
        var era = b.textContent; b.textContent = 'Link copied';
        setTimeout(function () {{ b.textContent = era; }}, 2200);
        try {{ gtag('event', 'svc_q_share',
          {{ q: b.dataset.q, page: PRE }}); }} catch (e) {{}}
      }};
      if (navigator.clipboard && navigator.clipboard.writeText) {{
        navigator.clipboard.writeText(url).then(fine, function () {{
          window.prompt('Copy this link', url); }});
      }} else {{
        var i = document.createElement('input');
        i.value = url; document.body.appendChild(i); i.select();
        try {{ document.execCommand('copy'); fine(); }}
        catch (e) {{ window.prompt('Copy this link', url); }}
        document.body.removeChild(i);
      }}
    }});
  }});

  /* le prove interne si scaldano prima del tap */
  var caldi = {{}};
  [].forEach.call(document.querySelectorAll('.r-corpo a[href^="/"]'),
    function (a) {{
      a.addEventListener('pointerenter', function () {{
        var h = a.getAttribute('href');
        if (!h || caldi[h]) return; caldi[h] = 1;
        var l = document.createElement('link');
        l.rel = 'prefetch'; l.href = h; document.head.appendChild(l);
      }}, {{ once: true }});
    }});
}})();
</script>
<script>
/* IL REGISTRO + LA BARRA */
(function () {{
  'use strict';
  var reg = document.querySelector('.registro');
  if (reg && !matchMedia('(prefers-reduced-motion: reduce)').matches
    && 'IntersectionObserver' in window) {{
    new IntersectionObserver(function (v, o) {{
      if (!v.some(function (x) {{ return x.isIntersecting; }})) return;
      o.disconnect(); reg.classList.add('viva');
    }}, {{ threshold: .35 }}).observe(reg);
    setTimeout(function () {{ reg.classList.add('viva'); }}, 2500);
  }} else if (reg) {{ reg.classList.add('viva'); }}

  var hud = document.getElementById('hud');
  var fine = document.getElementById('chiusura');
  if (!hud || !fine || !('IntersectionObserver' in window)) return;
  var vicino = false;
  function mostra() {{
    hud.classList.toggle('su', scrollY > innerHeight * .8 && !vicino); }}
  new IntersectionObserver(function (vs) {{
    vs.forEach(function (v) {{ vicino = v.intersectionRatio > .45; }});
    mostra();
  }}, {{ threshold: [0, .25, .45, .7] }}).observe(fine);
  addEventListener('scroll', mostra, {{ passive: true }});
  var pb = document.getElementById('paybar');
  if (pb) pb.style.display = 'none';
}})();
</script>
</body>""")

    # 5b · le sostituzioni dichiarate dalla pagina
    for vecchia, nuova in spec.get('sostituzioni', []):
        uno(s, vecchia, out)
        s = s.replace(vecchia, nuova)

    # 6 · LA RISPOSTA DICHIARATA E' LA RISPOSTA MOSTRATA
    # Il JSON-LD delle pagine base porta le vecchie risposte: dopo la
    # console un motore leggerebbe una cosa e il visitatore un'altra —
    # e su deal-assistance quella cosa era la media «€600+», che non
    # sappiamo dimostrare. Le risposte si riscrivono dal testo VERO.
    import json, re
    risp = {}
    for r in spec['righe']:
        dom, lead, dets = r[2], r[5], r[6]
        capo = _piano(lead)
        if capo and capo[-1] not in '.!?:':
            capo += '.'
        risp[dom] = _piano(capo + ' ' + ' '.join(dets))
    m = None
    for c in re.finditer(r'<script type="application/ld\+json">\s*(.*?)\s*</script>',
                         s, re.S):
        if '"FAQPage"' in c.group(1):
            m = c
            break
    assert m, f'{out}: FAQPage assente'
    d = json.loads(m.group(1))
    scon = [q['name'] for q in d['mainEntity'] if q['name'] not in risp]
    assert not scon, f'{out}: FAQ orfane → {scon}'
    for q in d['mainEntity']:
        q['acceptedAnswer']['text'] = risp[q['name']]
    s = s[:m.start(1)] + json.dumps(d, ensure_ascii=False) + s[m.end(1):]

    # 7 · verifiche
    ld = [q['name'] for q in d['mainEntity']]
    vis = re.findall(r'<span class="r-q">([^<]+)</span>', s)
    orfane = [q for q in ld if q not in vis]
    assert not orfane, f'{out}: FAQ orfane → {orfane}'
    for ago in ('id="registro"', 'id="console"', 'id="chiusura"',
                'id="cons"', 'id="csBasta"', 'id="hud"'):
        uno(s, ago, out)
    assert s.count('<details class="riga') == n, f'{out}: righe'
    assert '<div class="faq">' not in s, f'{out}: vecchia FAQ ancora qui'
    assert 'HOW IT WORKS' not in s, f'{out}: sezione vecchia'
    assert s.index('id="registro"') < s.index('id="console"') \
        < s.index('id="chiusura"'), f'{out}: ordine'
    return s
