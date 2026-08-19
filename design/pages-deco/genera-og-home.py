#!/usr/bin/env python3
# og-home.png GENERATA DAL REPO (pipeline og-reunion/executive): la card
# nel linguaggio del sito nuovo — tabellone Solari, oro #FFD700 — al posto
# di BOOMsocialprofile.png, un file che nel repo non e' MAI esistito.
import subprocess, os

CARD = '''<!DOCTYPE html><html><head><meta charset="utf-8"><style>
* { margin:0; padding:0; box-sizing:border-box; }
body { width:1200px; height:630px; background:#050505; overflow:hidden;
  font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; color:#fff;
  position:relative; }
.griglia { position:absolute; inset:0; opacity:.5;
  background-image:linear-gradient(rgba(255,215,0,.055) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,215,0,.055) 1px, transparent 1px);
  background-size:34px 26px; }
.velo { position:absolute; inset:0;
  background:radial-gradient(720px 400px at 28% 40%, rgba(255,215,0,.10), transparent 65%),
    linear-gradient(180deg, transparent 55%, rgba(0,0,0,.55)); }
.dentro { position:relative; z-index:2; padding:64px 76px; height:100%;
  display:flex; flex-direction:column; justify-content:space-between; }
.marchio { display:flex; align-items:center; gap:18px; }
.marchio span { font-weight:200; font-size:34px; letter-spacing:14px; }
.marchio i { font-style:normal; font-size:11px; letter-spacing:5px;
  color:#8a877e; text-transform:uppercase; padding-left:18px;
  border-left:1px solid rgba(255,215,0,.35); }
h1 { font-weight:200; font-size:88px; line-height:1.04; letter-spacing:-.5px; }
h1 b { color:#FFD700; font-weight:300; }
.flap { display:inline-flex; gap:6px; vertical-align:baseline; }
.flap i { font-style:normal; font-weight:400; background:#141416;
  border-radius:8px; padding:2px 12px 6px; color:#FFD700;
  box-shadow:inset 0 -14px 18px rgba(0,0,0,.55), 0 2px 0 rgba(0,0,0,.6);
  position:relative; }
.flap i::after { content:''; position:absolute; left:0; right:0; top:50%;
  height:2px; background:rgba(3,3,3,.8); }
.fondo { display:flex; align-items:center; justify-content:space-between;
  font-size:19px; color:#b9b5aa; letter-spacing:.4px; }
.fondo b { color:#fff; font-weight:500; }
.fondo .sito { color:#FFD700; letter-spacing:3px; font-size:17px; }
.punto { display:inline-block; width:9px; height:9px; border-radius:50%;
  background:#00FF88; margin-right:9px;
  box-shadow:0 0 14px rgba(0,255,136,.8); }
</style></head><body>
<div class="griglia"></div><div class="velo"></div>
<div class="dentro">
  <div class="marchio"><span>BOOM</span><i>Rome &middot; Move-in board</i></div>
  <h1>Get your <b>Rome</b> apartment<br>
    in <span class="flap"><i>D</i><i>A</i><i>Y</i><i>S</i></span>, not weeks.</h1>
  <div class="fondo">
    <span><span class="punto"></span><b>Rome rentals for internationals</b>
      &nbsp;&middot;&nbsp; sign from your phone &nbsp;&middot;&nbsp; every euro
      receipted</span>
    <span class="sito">BOOMROME.COM</span>
  </div>
</div>
</body></html>'''

qui = os.path.dirname(os.path.abspath(__file__))
open(os.path.join(qui, 'og-home-card.html'), 'w').write(CARD)
JS = '''
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const pg = await br.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await pg.goto('file://' + %r + '/og-home-card.html');
  await pg.waitForTimeout(250);
  await pg.screenshot({ path: '/home/user/Boum-roma/og-home.png',
    clip: { x: 0, y: 0, width: 1200, height: 630 } });
  await br.close();
  const { execSync } = require('child_process');
  console.log(execSync('file /home/user/Boum-roma/og-home.png').toString().trim());
})();
''' % qui
open(os.path.join(qui, 'og-home-shot.js'), 'w').write(JS)
subprocess.run(['node', os.path.join(qui, 'og-home-shot.js')], check=True)
