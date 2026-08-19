#!/usr/bin/env python3
# LOTTO 12c — LA CURA SAFARI + IL PULSO ALZATO.
#
# Il «doppio caricamento» su Safari, alla radice: html.vivo (il sipario
# delle entrate) veniva aggiunto da deco-organi IN CODA alla pagina.
# Chromium parsa tutto prima del primo paint e il difetto non si vede;
# Safari dipinge PROGRESSIVAMENTE: pagina visibile → lo script in coda
# la nasconde → le entrate la rifanno comparire. Tre mosse:
#   1. il sipario si arma in TESTA (prima del primo paint), con rete:
#      se gli organi in coda non si armano entro 3s, si riapre da solo
#      (disciplina Safari-audit: mai una pagina appendibile a un loader);
#   2. l'hero entra in PURO CSS (keyframes su .dentro-subito): il primo
#      quadro non aspetta mai la coda del documento;
#   3. i flip Solari smettono di dipendere da animationend (che Safari
#      spesso non spara su animazioni impostate nello stesso frame del
#      display:block): reflow forzato + timer di riserva al passo vero
#      (140/210ms, non 300/400) — Safari va al ritmo di Chromium.
# E il pulso d'oro: cresta luminosa, corsa completa, oro che regge.
import shutil

def leggi(n): return open(n, encoding='utf-8').read()
def scrivi(n, s): open(n, 'w', encoding='utf-8').write(s)
def uno(s, ago, dove):
    assert s.count(ago) == 1, f'{dove}: attese 1, trovate {s.count(ago)} di {ago[:70]!r}'

# ── 1 · pt.html: sipario in testa + entrata CSS dell'hero ────────────────
p = leggi('pt.html'); shutil.copy('pt.html', 'pt.html.bak12c')

uno(p, '</style>', 'pt style unico') if p.count('</style>') == 1 else None
i = p.index('</style>') + len('</style>')
SIPARIO = '''
<script>
/* Il sipario si arma PRIMA del primo paint. Aggiunto in coda (deco-organi)
   arrivava DOPO su Safari, che dipinge progressivamente: pagina intera →
   nascosta → rientrata animata = «doppio caricamento». Senza JS la classe
   non nasce e tutto resta visibile; se gli organi in coda non si armano
   entro 3s il sipario si riapre da solo. */
document.documentElement.classList.add('vivo');
setTimeout(function () {
  if (!window.__decoArmato)
    document.documentElement.classList.remove('vivo');
}, 3000);
</script>'''
p = p[:i] + SIPARIO + p[i:]

VECCHIO_CORO = '''html.vivo .coro > * { opacity:0; transform:translateY(24px); }'''
uno(p, VECCHIO_CORO, 'pt coro base')
p = p.replace(VECCHIO_CORO, VECCHIO_CORO + '''
/* il primo quadro entra DA SOLO, in puro CSS: col sipario armato in testa
   non puo' dipendere dagli organi in coda al documento (Safari li
   raggiunge tardi). Le animazioni vincono sulle dichiarazioni normali,
   quindi questi keyframes scavalcano il nascondiglio del sipario. */
@keyframes vieniSu { from { opacity:0; transform:translateY(24px); }
  to { opacity:1; transform:none; } }
@keyframes titoloSu {
  from { clip-path:inset(-8% -8% 108% -8%); transform:translateY(30px); }
  to { clip-path:inset(-8% -8% -12% -8%); transform:none; } }
html.vivo .coro.dentro-subito > * {
  animation:vieniSu .8s var(--ease) .12s both; }
html.vivo .coro.dentro-subito > :nth-child(2){ animation-delay:.19s; }
html.vivo .coro.dentro-subito > :nth-child(3){ animation-delay:.26s; }
html.vivo .coro.dentro-subito > :nth-child(4){ animation-delay:.33s; }
html.vivo .coro.dentro-subito > :nth-child(5){ animation-delay:.4s; }
html.vivo .coro.dentro-subito > :nth-child(6){ animation-delay:.47s; }
html.vivo .coro.dentro-subito .titolo, html.vivo .coro.dentro-subito .hero-title {
  animation:titoloSu .9s var(--ease) .12s both; }
@media (prefers-reduced-motion:reduce){
  html.vivo .coro.dentro-subito > *,
  html.vivo .coro.dentro-subito .titolo,
  html.vivo .coro.dentro-subito .hero-title { animation:none; opacity:1;
    transform:none; clip-path:none; } }''')

# ── 2 · il pulso d'oro: cresta, corsa completa, oro che regge ────────────
VECCHIO_PULSO = '''          var eta = (t - od.via) / (od.batte ? 2600 : 900);
          if (eta > 1.4) continue;
          var da = Math.abs(Math.hypot(x - od.x, y - od.y)
            - eta * MIN * (od.batte ? .72 : .5));
          var vo = Math.max(0, 1 - da / (MIN * .09));
          E[i] = Math.max(E[i], vo * (1.2 - eta));
          if (od.batte) {
            /* la banda piena del mosaico: ogni cella sulla cresta si
               accende d'oro, e l'anello sfuma mentre si allarga */
            AU[i] = Math.max(AU[i], vo * vo * (1 - eta * .5) * .85);
          } else if (vo > .9 && Math.random() < .015) AU[i] = .8;'''
uno(p, VECCHIO_PULSO, 'pt pulso')
p = p.replace(VECCHIO_PULSO, '''          var eta = (t - od.via) / (od.batte ? 3000 : 900);
          if (eta > 1.4) continue;
          var da = Math.abs(Math.hypot(x - od.x, y - od.y)
            - eta * MIN * (od.batte ? 1.05 : .5));
          var vo = Math.max(0, 1 - da / (MIN * (od.batte ? .12 : .09)));
          E[i] = Math.max(E[i], vo * (1.2 - eta));
          if (od.batte) {
            /* la banda piena del mosaico, alzata: una CRESTA stretta e
               incandescente guida l'onda, la banda dietro tiene l'oro
               piu' a lungo, e la corsa attraversa TUTTO il campo invece
               di morire a meta' — un battito, di quelli che si sentono */
            var vc = Math.max(0, 1 - da / (MIN * .035));
            E[i] = Math.max(E[i], vc * 1.15 * (1 - eta * .3));
            AU[i] = Math.max(AU[i],
              vo * vo * (1 - eta * .35) * .9,
              vc * (1 - eta * .25));
          } else if (vo > .9 && Math.random() < .015) AU[i] = .8;''')
scrivi('pt.html', p)

# ── 3 · solari-engine: il flip non dipende piu' da animationend ──────────
s = leggi('solari-engine.html'); shutil.copy('solari-engine.html', 'solari-engine.html.bak12c')
VECCHIO_BOT = """      self.lbEl.style.display = 'block';
      self.lbEl.style.animation = 'flBot 150ms cubic-bezier(.3,1.35,.6,1) forwards';
      self.lbEl.onanimationend = finishBot;
      setTimeout(finishBot, 400);"""
uno(s, VECCHIO_BOT, 'engine bot')
s = s.replace(VECCHIO_BOT, """      self.lbEl.style.display = 'block';
      /* Safari spesso NON spara animationend quando l'animazione nasce
         nello stesso frame del display:block: reflow forzato, e il timer
         di riserva va al passo VERO dell'animazione (prima 400ms: ogni
         flip su Safari durava il triplo, e il tabellone «caricava due
         volte») */
      void self.lbEl.offsetWidth;
      self.lbEl.style.animation = 'flBot 150ms cubic-bezier(.3,1.35,.6,1) forwards';
      self.lbEl.onanimationend = finishBot;
      setTimeout(finishBot, 210);""")
VECCHIO_TOP = """    this.ltEl.style.display = 'block';
    this.ltEl.style.animation = 'flTop 90ms cubic-bezier(.55,0,.85,.36) forwards';
    this.ltEl.onanimationend = finishTop;
    setTimeout(finishTop, 300);"""
uno(s, VECCHIO_TOP, 'engine top')
s = s.replace(VECCHIO_TOP, """    this.ltEl.style.display = 'block';
    void this.ltEl.offsetWidth;
    this.ltEl.style.animation = 'flTop 90ms cubic-bezier(.55,0,.85,.36) forwards';
    this.ltEl.onanimationend = finishTop;
    setTimeout(finishTop, 140);""")
scrivi('solari-engine.html', s)

# ── 4 · deco-organi: la coda dichiara di essersi armata ──────────────────
d = leggi('deco-organi.html'); shutil.copy('deco-organi.html', 'deco-organi.html.bak12c')
ARMA = "  R.classList.add('vivo');"
uno(d, ARMA, 'organi vivo')
d = d.replace(ARMA, ARMA + """
  /* letto dalla rete di sicurezza del sipario in testa alla pagina */
  window.__decoArmato = true;""")
scrivi('deco-organi.html', d)

print('lotto 12c: sipario in testa + hero CSS-only + flip senza animationend + pulso alzato')
