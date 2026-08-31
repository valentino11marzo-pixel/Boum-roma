#!/usr/bin/env python3
# og-board.png + og-meteo.png GENERATE DAL REPO (STUDIO_AVIATION, W4 —
# pipeline og-home/og-reunion/og-executive: card HTML -> headless -> PNG).
# La condivisione di /board e /meteo portava BOOMsocialprofile.png: ora
# porta il tabellone e il bollettino, nel linguaggio dello scalo.
# Si usa headless_shell (il chromium "vecchio" headless perde il footer a
# 630px esatti — la lezione di og-executive).
import os, struct, subprocess, sys, tempfile

QUI = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(QUI, '..', '..'))
# le card intermedie vivono in una dir temporanea: nel repo entra SOLO il
# PNG finale (rilanciare il generatore non lascia mai file non tracciati)
TMP = tempfile.mkdtemp(prefix='og-scalo-')

TESTA = '''<!DOCTYPE html><html><head><meta charset="utf-8"><style>
* { margin:0; padding:0; box-sizing:border-box; }
body { width:1200px; height:630px; background:#050505; overflow:hidden;
  font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; color:#FAFAFA;
  position:relative; }
.griglia { position:absolute; inset:0; opacity:.5;
  background-image:linear-gradient(rgba(255,215,0,.055) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,215,0,.055) 1px, transparent 1px);
  background-size:34px 26px; }
.velo { position:absolute; inset:0;
  background:radial-gradient(720px 400px at 30% 36%, rgba(255,215,0,.10), transparent 65%),
    linear-gradient(180deg, transparent 55%, rgba(0,0,0,.55)); }
.dentro { position:relative; z-index:2; padding:56px 72px; height:100%;
  display:flex; flex-direction:column; justify-content:space-between; }
.marchio { display:flex; align-items:center; gap:18px; }
.marchio span { font-weight:200; font-size:32px; letter-spacing:14px; }
.marchio i { font-style:normal; font-size:11px; letter-spacing:5px;
  color:#8a877e; text-transform:uppercase; padding-left:18px;
  border-left:1px solid rgba(255,215,0,.35); }
.fondo { display:flex; align-items:center; justify-content:space-between;
  font-size:18px; color:#b9b5aa; letter-spacing:.4px; }
.fondo b { color:#fff; font-weight:500; }
.fondo .sito { color:#FFD700; letter-spacing:3px; font-size:17px; }
.punto { display:inline-block; width:9px; height:9px; border-radius:50%;
  background:#00FF88; margin-right:9px;
  box-shadow:0 0 14px rgba(0,255,136,.8); }
'''

BOARD = TESTA + '''
h1 { font-weight:200; font-size:64px; line-height:1.06; letter-spacing:-.5px; }
h1 b { color:#FFD700; font-weight:300; }
.tab { margin-top:6px; background:#060606; border-radius:16px;
  box-shadow:inset 0 0 0 1px rgba(255,215,0,.16); padding:18px 26px; }
.tr { display:grid; grid-template-columns:150px 1fr 150px 170px; gap:26px;
  align-items:center; padding:12px 0; font-size:25px; font-weight:500;
  letter-spacing:.12em; border-bottom:1px solid rgba(255,255,255,.05); }
.tr:last-child { border-bottom:0; }
.tr span { font-family:inherit; color:#FFE55C; background:#141416;
  border-radius:7px; padding:3px 10px 5px; position:relative;
  box-shadow:inset 0 -12px 16px rgba(0,0,0,.55); display:inline-block; }
.tr span::after { content:''; position:absolute; left:0; right:0; top:50%;
  height:2px; background:rgba(3,3,3,.8); }
.tr .z { justify-self:start; }
.tr .ok { color:#00FF88; }
.tr .poi { color:#FFE55C; }
</style></head><body>
<div class="griglia"></div><div class="velo"></div>
<div class="dentro">
  <div class="marchio"><span>BOOM</span><i>Rome &middot; Live board</i></div>
  <h1>Every home in Rome,<br>on <b>the departures board</b>.</h1>
  <div class="tab">
    <div class="tr"><span>NOW</span><span class="z">TRASTEVERE</span><span>1BR</span><span class="ok">FREE</span></div>
    <div class="tr"><span>NOW</span><span class="z">PIGNETO</span><span>2BR</span><span class="ok">FREE</span></div>
    <div class="tr"><span class="poi">1 SEP</span><span class="z">PRATI</span><span>1BR</span><span class="poi">SOON</span></div>
  </div>
  <div class="fondo">
    <span><span class="punto"></span><b>Departures &amp; arrivals</b>
      &nbsp;&middot;&nbsp; updated like an airport</span>
    <span class="sito">BOOMROME.COM/BOARD</span>
  </div>
</div>
</body></html>'''

METEO = TESTA + '''
h1 { font-weight:200; font-size:62px; line-height:1.08; letter-spacing:-.5px; }
h1 b { color:#FFD700; font-weight:300; }
.righe { display:grid; grid-template-columns:repeat(3,1fr); gap:18px; margin-top:8px; }
.m { background:#0B0B0C; border-radius:14px; padding:22px 24px;
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.08); }
.m b { display:block; font-weight:200; font-size:46px; color:#FFD700;
  letter-spacing:-.5px; }
.m i { font-style:normal; display:block; margin-top:6px; font-size:15px;
  letter-spacing:2px; text-transform:uppercase; color:#8a877e; }
</style></head><body>
<div class="griglia"></div><div class="velo"></div>
<div class="dentro">
  <div class="marchio"><span>BOOM</span><i>Rome &middot; Market weather</i></div>
  <h1>How fast is Rome<br><b>renting</b> right now?</h1>
  <div class="righe">
    <div class="m"><b>&euro;/m&sup2;</b><i>median asked, by zone</i></div>
    <div class="m"><b>Days</b><i>to rent &middot; proven gone only</i></div>
    <div class="m"><b>Cuts</b><i>price drops, last 30 days</i></div>
  </div>
  <div class="fondo">
    <span><span class="punto"></span><b>Zone by zone, updated daily</b>
      &nbsp;&middot;&nbsp; below sample = no numbers</span>
    <span class="sito">BOOMROME.COM/METEO</span>
  </div>
</div>
</body></html>'''


def shell():
    for p in ('/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
              '/opt/pw-browsers/chromium/chrome-linux/headless_shell',
              '/opt/pw-browsers/chromium'):
        if os.path.isfile(p):
            return p
    sys.exit('headless_shell non trovato in /opt/pw-browsers')


def png_size(path):
    with open(path, 'rb') as f:
        head = f.read(24)
    if head[:8] != b'\x89PNG\r\n\x1a\n':
        sys.exit(path + ': non è un PNG')
    w, h = struct.unpack('>II', head[16:24])
    return w, h


def genera(nome, html):
    card = os.path.join(TMP, 'og-%s-card.html' % nome)
    out = os.path.join(ROOT, 'og-%s.png' % nome)
    open(card, 'w').write(html)
    subprocess.run([shell(), '--headless', '--disable-gpu', '--no-sandbox',
                    '--hide-scrollbars', '--force-device-scale-factor=1',
                    '--window-size=1200,630', '--screenshot=' + out,
                    'file://' + card], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    w, h = png_size(out)
    if (w, h) != (1200, 630):
        sys.exit('%s: %dx%d invece di 1200x630' % (out, w, h))
    print('og-%s.png ok (1200x630, %d byte)' % (nome, os.path.getsize(out)))


genera('board', BOARD)
genera('meteo', METEO)
