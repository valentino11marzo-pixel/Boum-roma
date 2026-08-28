#!/usr/bin/env python3
# LE CARD SOCIAL DEI SERVIZI, generate dal repo (stessa pipeline di
# og-home/og-reunion/og-executive).
#
# IL REPERTO CHE LE HA FATTE NASCERE: 50 pagine pubbliche dichiaravano
# `BOOMsocialprofile.png` come og:image — un file che nel repo non e' MAI
# esistito. Cioe': ogni inoltro su WhatsApp, LinkedIn, Slack o iMessage di
# meta' del sito mostrava una card VUOTA. Per un'attivita' che cresce
# passando di telefono in telefono, e' il difetto piu' caro che ci fosse.
#
# Una card generica avrebbe tappato il buco. Queste fanno il lavoro: ogni
# servizio porta la propria promessa e il proprio PREZZO, letti da
# api/_catalog.js — cosi' la card non puo' dire un prezzo diverso dalla
# pagina, e chi riceve il link sa cosa gli stai mandando prima di aprirlo.
import json, os, re, subprocess

QUI = os.path.dirname(os.path.abspath(__file__))
RADICE = os.path.dirname(os.path.dirname(QUI))

# I prezzi si LEGGONO dal catalogo, non si ricopiano.
cat = open(os.path.join(RADICE, 'api/_catalog.js'), encoding='utf-8').read()
EUR = {m.group(1): m.group(2)
       for m in re.finditer(r"'([a-z-]+)':\s*\{\s*eur:\s*(\d+)", cat)}

# nome file · occhiello · titolo (b = oro) · riga di prova · prezzo
CARD = [
    ('og-deal-assistance', 'Deal Assistance', 'You found it.<br><b>We make it safe.</b>',
     'Clause-by-clause review in English · landlord verified · first pass in 24h',
     EUR['deal-assistance']),
    ('og-virtual-viewing', 'Virtual Viewing', 'We walk it.<br><b>You decide.</b>',
     'Live video tour you direct · HD photos · honest written report',
     EUR['virtual-viewing']),
    ('og-contract-check-express', 'Contract Check Express',
     'Send the contract.<br><b>Sleep tonight.</b>',
     'Traffic-light verdict in 24h · credited in full on Deal Assistance',
     EUR['contract-check-express']),
    ('og-deposit-recovery', 'Deposit Recovery', 'Your deposit<br><b>is not a tip.</b>',
     'Formal demand under art. 1590 c.c. · 20% only on what comes back',
     EUR['deposit-recovery']),
    ('og-remote-move-pack', 'Remote Move Pack', 'Rent in Rome<br><b>before you land.</b>',
     'Two live viewings · contract review · arrival setup',
     EUR['remote-move-pack']),
    ('og-concierge', 'BOOM Concierge', 'The landing,<br><b>handled.</b>',
     'Codice fiscale · utilities · SIM · residency · a human on WhatsApp', None),
    # Il titolo della PAGINA e' piu' lungo: su una card a 1200px andava su
    # quattro righe e finiva addosso al prezzo. Una card non e' la pagina.
    ('og-property-finding', 'Property Finding', 'Good flats go fast.<br><b>Yours needs a hunter.</b>',
     '3 options in 15 days or the fee back (Terms §4.2) · off-market included',
     '350'),
    # La guida che si inoltra: era l'unica pagina PENSATA per passare di
    # telefono in telefono, ed era senza card. Qui il prezzo non c'e'
    # perche' non ce n'e' uno — il posto lo prende la parola che conta.
    ('og-welcome-to-rome', 'Welcome to Rome Kit', 'Everything nobody<br><b>tells you.</b>',
     'Codice fiscale · residency · tessera sanitaria · SIM · bank · transport',
     None),
]

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
  max-width:15.5ch; }
h1 b { color:#FFD700; font-weight:300; }
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


def html(occhiello, titolo, prova, eur):
    if eur:
        blocco = f'<div class="prezzo"><u>from</u><s>&euro;{eur}</s></div>'
    elif occhiello == 'Welcome to Rome Kit':
        blocco = '<div class="prezzo"><u>the guide</u><s>free</s></div>'
    else:
        blocco = '<div class="prezzo"><u>per task</u><s>quote</s></div>'
    return f'''<!DOCTYPE html><html><head><meta charset="utf-8">
<style>{STILE}</style></head><body>
<div class="griglia"></div><div class="velo"></div>
<div class="dentro">
  <div class="marchio"><span>BOOM</span><i>Rome &middot; {occhiello}</i></div>
  <h1>{titolo}</h1>{blocco}
  <div class="fondo">
    <span><span class="punto"></span>{prova}</span>
    <span class="sito">BOOMROME.COM</span>
  </div>
</div></body></html>'''


lavoro = []
for nome, occ, tit, prova, eur in CARD:
    p = os.path.join(QUI, nome + '-card.html')
    open(p, 'w', encoding='utf-8').write(html(occ, tit, prova, eur))
    lavoro.append((p, os.path.join(RADICE, nome + '.png')))

JS = '''
const { loadChromium, launchOptions } = require(%r);
const LAV = %s;
(async () => {
  const chromium = await loadChromium();
  const br = await chromium.launch(await launchOptions());
  for (const [src, out] of LAV) {
    const pg = await br.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    await pg.goto('file://' + src);
    await pg.waitForTimeout(220);
    // Lo screenshot grezzo di questa card pesa ~175 KB: la nostra stessa
    // guardia (tests/media/hosts.mjs, budget «card social» 120 KB) l'ha
    // bocciata, che e' esattamente il suo mestiere. La card e' due tinte e
    // del testo: quantizzata resta identica e pesa un terzo.
    const grezzo = await pg.screenshot({ clip: { x: 0, y: 0, width: 1200, height: 630 } });
    await require('sharp')(grezzo)
      .png({ compressionLevel: 9, palette: true, quality: 92, effort: 10 })
      .toFile(out);
    await pg.close();
    console.log('  ' + out.split('/').pop());
  }
  await br.close();
})();
''' % (os.path.join(RADICE, 'tests/_browser.cjs'), json.dumps(lavoro))
sp = os.path.join(QUI, 'og-servizi-shot.js')
open(sp, 'w').write(JS)
subprocess.run(['node', sp], check=True)
for p, _ in lavoro:
    os.remove(p)
os.remove(sp)
print(len(lavoro), 'card social generate')
