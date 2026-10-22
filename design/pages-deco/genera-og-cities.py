#!/usr/bin/env python3
# LE CARD SOCIAL DELLE PAGINE CITTÀ, generate dal repo (stessa pipeline di
# genera-og-servizi.py: card HTML → Chromium 1200×630 → PNG).
#
# Una pagina città si inoltra su WhatsApp prima ancora di essere letta: la
# card è la prima cosa che la persona vede. Si costruisce dai DATI della
# città (cities/<slug>.json) — il titolo, il prezzo più basso fra i servizi,
# la riga di prova — così non può dire un prezzo diverso dalla pagina.
#
# Senza `sharp` nel sandbox, la quantizzazione la fa Pillow: la card è due
# tinte e del testo, a palette resta identica e sta sotto i 120 KB del
# budget «card social» di tests/media/hosts.mjs.
import json, os, re, subprocess, sys

QUI = os.path.dirname(os.path.abspath(__file__))
RADICE = os.path.dirname(os.path.dirname(QUI))
CITTA = os.path.join(RADICE, 'cities')

STILE = '''* { margin:0; padding:0; box-sizing:border-box; }
body { width:1200px; height:630px; background:#050505; overflow:hidden;
  font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; color:#fff;
  position:relative; }
.griglia { position:absolute; inset:0; opacity:.5;
  background-image:linear-gradient(rgba(255,215,0,.055) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,215,0,.055) 1px, transparent 1px);
  background-size:34px 26px; }
.velo { position:absolute; inset:0;
  background:radial-gradient(760px 420px at 26% 42%, rgba(255,215,0,.11), transparent 66%),
    linear-gradient(180deg, transparent 52%, rgba(0,0,0,.6)); }
.dentro { position:relative; z-index:2; padding:60px 76px; height:100%;
  display:flex; flex-direction:column; justify-content:space-between; }
.marchio { display:flex; align-items:center; gap:18px; }
.marchio span { font-weight:200; font-size:32px; letter-spacing:14px; }
.marchio i { font-style:normal; font-size:11px; letter-spacing:5px;
  color:#8a877e; text-transform:uppercase; padding-left:18px;
  border-left:1px solid rgba(255,215,0,.35); }
h1 { font-weight:200; font-size:74px; line-height:1.06; letter-spacing:-.6px;
  max-width:14ch; }
h1 b { color:#FFD700; font-weight:300; }
/* la città sul tabellone: celle nere, filo d'oro — la cella Solari ferma */
.tab { display:inline-flex; gap:6px; vertical-align:-4px; }
.tab i { font-style:normal; display:inline-block; width:58px; height:84px;
  line-height:84px; text-align:center; font-size:62px; font-weight:300;
  color:#FFE55C; background:linear-gradient(180deg,#17171A 49.5%,#040404 50%,#0E0E10 50.5%,#111114);
  border-radius:6px; box-shadow:inset 0 0 0 1px rgba(239,235,223,.06), 0 6px 18px rgba(0,0,0,.6); }
.prezzo { position:absolute; right:76px; top:132px; text-align:right; }
.prezzo u { display:block; text-decoration:none; font-size:12px;
  letter-spacing:5px; color:#8a877e; text-transform:uppercase;
  margin-bottom:6px; }
.prezzo s { display:block; text-decoration:none; font-size:82px;
  font-weight:200; color:#FFD700; line-height:1; }
.fondo { font-size:19px; color:#b9b5aa; letter-spacing:.3px;
  display:flex; align-items:center; justify-content:space-between; gap:30px; }
.fondo b { color:#fff; font-weight:500; }
.sito { color:#FFD700; letter-spacing:3px; font-size:17px; white-space:nowrap; }
.punto { display:inline-block; width:9px; height:9px; border-radius:50%;
  background:#00FF88; margin-right:9px;
  box-shadow:0 0 14px rgba(0,255,136,.8); }'''


def card(c):
    parola = re.sub(r'[^A-Z]', '', c.get('word', c['city']).upper())
    celle = ''.join(f'<i>{ch}</i>' for ch in parola)
    # every desk shows its list prices (v1.1, 14/10); a waitlist card says the
    # desk is opening next to the "from", because the card has no room for
    # the sentence the page carries ("charged only when the desk opens")
    da = min(p['price'] for p in c['pricing']['plans'])
    da_label = 'from' if c.get('mode') == 'search' else 'opening &middot; from'
    prezzo = f'<div class="prezzo"><u>{da_label}</u><s>&euro;{da}</s></div>'
    # the proof line says only what every desk page says too (the v1.2
    # `machine` strip it used to read is gone, and with it "dossier 24h ·
    # apply <1h" — speed promises the pages dropped on 21/10 and the card
    # kept repeating on every WhatsApp share). The yellow line is the first
    # sentence of the page's own lead.
    # a waitlist desk does not attend viewings yet: its card says what it
    # does today (it takes a file), the selling desks what they deliver
    prova = ('tenant side · flat fees · viewing attended · contract checked'
             if c.get('mode') == 'search' else 'tenant side · flat fees · your file open today')
    em = re.split(r'(?<=[.!?])\s', c['hero']['lead'].strip())[0].replace('<', '&lt;')
    return f'''<!DOCTYPE html><html><head><meta charset="utf-8">
<style>{STILE}</style></head><body>
<div class="griglia"></div><div class="velo"></div>
<div class="dentro">
  <div class="marchio"><span>BOOM</span><i>{c['city']} &middot; {c['nav']['desk']}</i></div>
  <h1>Your home in<br><span class="tab">{celle}</span><br><b>{em}</b></h1>
  {prezzo}
  <div class="fondo">
    <span><span class="punto"></span>{prova}</span>
    <span class="sito">BOOMROME.COM/{c['slug'].upper()}</span>
  </div>
</div></body></html>'''


lavoro = []
for f in sorted(os.listdir(CITTA)):
    if not f.endswith('.json') or f.startswith('_'):
        continue
    c = json.load(open(os.path.join(CITTA, f), encoding='utf-8'))
    if sys.argv[1:] and c['slug'] not in sys.argv[1:]:
        continue
    p = os.path.join(QUI, f"og-{c['slug']}-card.html")
    open(p, 'w', encoding='utf-8').write(card(c))
    lavoro.append((p, os.path.join(RADICE, f"og-{c['slug']}.png")))

JS = '''
const { loadChromium, launchOptions } = require(%r);
const LAV = %s;
(async () => {
  const chromium = await loadChromium();
  if (!chromium) { console.error('playwright non disponibile'); process.exit(2); }
  const br = await chromium.launch(await launchOptions());
  for (const [src, out] of LAV) {
    const pg = await br.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    await pg.goto('file://' + src);
    await pg.waitForTimeout(220);
    await pg.screenshot({ path: out + '.raw.png', clip: { x: 0, y: 0, width: 1200, height: 630 } });
    await pg.close();
  }
  await br.close();
})();
''' % (os.path.join(RADICE, 'tests/_browser.cjs'), json.dumps(lavoro))
sp = os.path.join(QUI, 'og-cities-shot.js')
open(sp, 'w').write(JS)
subprocess.run(['node', sp], check=True)
from PIL import Image
for p, out in lavoro:
    im = Image.open(out + '.raw.png').convert('RGB')
    im.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(out, optimize=True)
    os.remove(out + '.raw.png')
    os.remove(p)
    print('  %s  %d KB' % (os.path.basename(out), os.path.getsize(out) // 1024))
os.remove(sp)
print(len(lavoro), 'card città generate')
