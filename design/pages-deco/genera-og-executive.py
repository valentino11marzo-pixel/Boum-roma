#!/usr/bin/env python3
# LA CARD SOCIAL DI /executive, generata dal repo (og-executive.png).
#
# IL REPERTO CHE L'HA FATTA NASCERE (15/10/2026). La card che gira su
# WhatsApp e LinkedIn quando qualcuno condivide /executive prometteva il
# transitorio da 1 a 18 mesi (in inglese, sul primo chip) mentre la pagina
# era gia' stata corretta: con BOOM si affitta da 3 mesi in su (decisione del
# fondatore). La sorgente della card non era nel repo
# (CLAUDE.md la dava per «generata dal repo», ma l'HTML non e' mai stato
# committato), e una guardia testuale non legge le immagini: la promessa
# vecchia viaggiava accanto all'og:description nuova, e nessun test cadeva.
#
# Due regole, le stesse delle card dei servizi (genera-og-servizi.py, dove i
# prezzi si leggono dal catalogo):
#   1. LA DURATA SI LEGGE DALLA PAGINA, non si ricopia: la fascia del
#      transitorio e' quella dell'og:description di executive.html. Se la
#      pagina scendesse sotto i 3 mesi la card si rifiuta di nascere — si
#      corregge la pagina, non la card.
#   2. LA CARD DICHIARA IL TESTO CON CUI E' NATA: un PNG non si cerca col
#      grep, quindi il testo stampato viaggia nel PNG stesso (chunk iTXt
#      «Description», piu' «Software» = questo file). tests/executive lo
#      legge e lo confronta con la pagina; una card fatta a mano, senza
#      firma, la' cade.
#
# Il marchio (i cerchi sonori oro) si legge dal <symbol id="boomMark"> della
# pagina: una copia sola.
#
#   python3 design/pages-deco/genera-og-executive.py
import json, os, re, struct, subprocess, zlib

QUI = os.path.dirname(os.path.abspath(__file__))
RADICE = os.path.dirname(os.path.dirname(QUI))
SORGENTE = 'design/pages-deco/genera-og-executive.py'
pagina = open(os.path.join(RADICE, 'executive.html'), encoding='utf-8').read()

og = re.search(r'<meta property="og:description" content="([^"]*)"', pagina)
fascia = og and re.search(r'\((\d{1,2})\s*[–-]\s*(\d{1,2}) months\)', og.group(1))
if not fascia:
    raise SystemExit('executive.html: nell\'og:description non trovo la fascia del '
                     'transitorio «(N–M months)» da cui la card legge la durata')
if int(fascia.group(1)) < 3:
    raise SystemExit('executive.html promette il transitorio da %s mesi: con BOOM si '
                     'affitta da 3 mesi in su. Si corregge la pagina, non la card.'
                     % fascia.group(1))
DURATA = '%s–%s months' % (fascia.group(1), fascia.group(2))

grad = re.search(r'<linearGradient id="goldGrad"[\s\S]*?</linearGradient>', pagina)
marchio = re.search(r'<symbol id="boomMark"[\s\S]*?</symbol>', pagina)
if not (grad and marchio):
    raise SystemExit('executive.html: manca il marchio (#goldGrad / #boomMark)')

# Le parole della card sono quelle della pagina: il titolo (og:title), le tre
# prove dell'hero e della description, e la riga «A distanza» della scheda
# («a tenancy can close before you land»). La card vecchia diceva «Most
# files close before landing»: un «most» che nessun dato del repo misura.
TITOLO = ('Rome, for people who', 'come here to work.')
PROVE = (('Transitional lease', DURATA + ' · registered'),
         ('', 'Live video viewings · instant slots'),
         ('', 'E-signed · receipts your employer accepts'))
SITO = 'boomrome.com/executive'
NOTA = 'A tenancy can close before you land.'

STILE = '''* { margin:0; padding:0; box-sizing:border-box; }
body { width:1200px; height:630px; background:#050505; overflow:hidden;
  font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; color:#fff;
  position:relative; }
.griglia { position:absolute; inset:0;
  background-image:linear-gradient(rgba(255,215,0,.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,215,0,.035) 1px, transparent 1px);
  background-size:80px 80px;
  -webkit-mask-image:radial-gradient(ellipse at 40% 55%, #000 0%, transparent 72%);
  mask-image:radial-gradient(ellipse at 40% 55%, #000 0%, transparent 72%); }
.oro { position:absolute; width:720px; height:720px; right:-210px; top:-330px;
  border-radius:50%; background:radial-gradient(circle, rgba(255,215,0,.13) 0%, transparent 68%); }
.viola { position:absolute; width:560px; height:560px; left:-240px; bottom:-300px;
  border-radius:50%; background:radial-gradient(circle, rgba(99,91,255,.10) 0%, transparent 68%); }
.angolo { position:absolute; width:86px; height:86px; border:0 solid rgba(255,215,0,.30); }
.angolo.a1 { left:20px; top:20px; border-top-width:1px; border-left-width:1px; }
.angolo.a2 { right:20px; bottom:20px; border-bottom-width:1px; border-right-width:1px; }
.lockup { position:absolute; left:74px; top:56px; display:flex; align-items:center; }
.lockup svg { width:38px; height:38px; }
.lockup .boom { font-weight:300; font-size:25px; letter-spacing:7px; margin-left:20px; }
.lockup .fil { width:1px; height:32px; background:rgba(255,215,0,.35); margin:0 18px 0 22px; }
.lockup .desk { font-size:12px; letter-spacing:4.2px; color:#FFD700; text-transform:uppercase;
  line-height:1.7; font-weight:500; }
h1 { position:absolute; left:70px; top:152px; font-weight:300; font-size:68px;
  line-height:1.07; letter-spacing:-.6px; }
h1 b { display:block; color:#FFD700; font-weight:300; }
.prove { position:absolute; left:70px; top:337px; display:flex; gap:12px; }
.prova { height:42px; display:flex; align-items:center; gap:10px; padding:0 21px;
  border:1px solid rgba(255,255,255,.12); border-radius:100px; background:rgba(255,255,255,.025);
  font-size:15px; color:rgba(255,255,255,.74); white-space:nowrap; }
.prova i { width:8px; height:8px; border-radius:50%; background:#3ddc97;
  box-shadow:0 0 10px rgba(61,220,151,.7); flex:none; }
.prova.oro-c i { background:#FFD700; box-shadow:0 0 10px rgba(255,215,0,.7); }
.prova b { color:#FFD700; font-weight:400; margin-right:4px; }
.filo { position:absolute; left:70px; right:70px; top:527px; height:1px; background:rgba(255,255,255,.10); }
.sito { position:absolute; left:70px; top:548px; font-size:22px; color:#FFD700; letter-spacing:.4px; }
.nota { position:absolute; right:70px; top:556px; font-size:15px; color:rgba(255,255,255,.52); }'''


def esc(t):
    return t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def html():
    prove = ''
    for i, (etichetta, testo) in enumerate(PROVE):
        cls = 'prova oro-c' if etichetta else 'prova'
        testa = '<b>%s</b> · ' % esc(etichetta) if etichetta else ''
        prove += '<span class="%s"><i></i>%s%s</span>' % (cls, testa, esc(testo))
    return '''<!DOCTYPE html><html><head><meta charset="utf-8">
<style>%s</style></head><body>
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>%s%s</defs></svg>
<div class="griglia"></div><div class="oro"></div><div class="viola"></div>
<i class="angolo a1"></i><i class="angolo a2"></i>
<div class="lockup"><svg aria-hidden="true"><use href="#boomMark"/></svg>
  <span class="boom">BOOM</span><span class="fil"></span><span class="desk">Executive<br>Roma</span></div>
<h1>%s<b>%s</b></h1>
<div class="prove">%s</div>
<div class="filo"></div>
<div class="sito">%s</div><div class="nota">%s</div>
</body></html>''' % (STILE, grad.group(0), marchio.group(0), esc(TITOLO[0]), esc(TITOLO[1]),
                     prove, esc(SITO), esc(NOTA))


# Il testo che la card stampa, nell'ordine in cui si legge: e' quello che il
# PNG dichiara di se'.
TESTO = '\n'.join(['BOOM · Executive Roma', ' '.join(TITOLO)]
                  + [(e + ' · ' if e else '') + t for e, t in PROVE] + [SITO, NOTA])


def itxt(chiave, testo):
    # chunk iTXt: chiave, \0, non compresso (0, 0), lingua vuota \0,
    # chiave tradotta vuota \0, testo UTF-8
    dati = chiave.encode('latin-1') + b'\x00\x00\x00\x00\x00' + testo.encode('utf-8')
    return (struct.pack('>I', len(dati)) + b'iTXt' + dati
            + struct.pack('>I', zlib.crc32(b'iTXt' + dati) & 0xffffffff))


def firma(percorso):
    b = open(percorso, 'rb').read()
    assert b[:8] == b'\x89PNG\r\n\x1a\n', 'non e\' un PNG'
    iend = b.rindex(b'IEND') - 4                 # lunghezza (4 byte) + IEND + CRC
    pezzi = itxt('Description', TESTO) + itxt('Software', SORGENTE)
    open(percorso, 'wb').write(b[:iend] + pezzi + b[iend:])


card = os.path.join(QUI, 'og-executive-card.html')
open(card, 'w', encoding='utf-8').write(html())
uscita = os.path.join(RADICE, 'og-executive.png')

JS = '''
const { loadChromium, launchOptions } = require(%r);
(async () => {
  const chromium = await loadChromium();
  if (!chromium) throw new Error('playwright non trovato: serve per scattare la card');
  const br = await chromium.launch(await launchOptions());
  const pg = await br.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await pg.goto('file://' + %s);
  await pg.waitForTimeout(250);
  const grezzo = await pg.screenshot({ clip: { x: 0, y: 0, width: 1200, height: 630 } });
  // Due tinte e del testo: quantizzata resta identica e sta nel budget delle
  // card social (tests/media/hosts.mjs, 120 KB).
  await require('sharp')(grezzo)
    .png({ compressionLevel: 9, palette: true, quality: 92, effort: 10 })
    .toFile(%s);
  await br.close();
})();
''' % (os.path.join(RADICE, 'tests/_browser.cjs'), json.dumps(card), json.dumps(uscita))
sp = os.path.join(QUI, 'og-executive-shot.js')
open(sp, 'w').write(JS)
try:
    subprocess.run(['node', sp], check=True, cwd=RADICE)
finally:
    os.remove(sp)
    os.remove(card)
firma(uscita)
print('og-executive.png — %s' % DURATA)
