#!/usr/bin/env python3
# og-owners.png GENERATA DAL REPO — la card social di /owners.
#
# Stessa pipeline di og-board/og-meteo (design/scalo/genera-og-scalo.py):
# card HTML -> headless_shell -> PNG -> palette con sharp. Nel repo entra
# SOLO il PNG finale; la card intermedia vive in una dir temporanea.
#
# La pianta e il prezzo non sono ridisegnati né ricopiati qui:
#  - LA PIANTA è quella della pagina: il markup esce da
#    design/owners/pianta.mjs (riquadro(), la stessa funzione che il
#    costruttore mette in owners.html) e lo stile da design/owners/pianta.css,
#    fermati nello stato finale `.alzata` — la pianta alzata in oro, tutte le
#    stanze accese tranne le due luci spente (le ⚑ grigie). Uniche differenze,
#    di resa: il tratto a 1,1 px invece di 0,75 (la card si guarda
#    rimpicciolita) e i due soli cartellini delle luci spente, col testo di
#    pianta.json e la parola «spenta» (mai il solo colore), appoggiati al
#    punto delle etichette alzate della pagina (posizioni()).
#    Il riquadro si piazza dall'ingombro VERO della casa alzata, calcolato
#    da pianta.json con M: se la pianta cambia, la card si rimpagina da sola.
#  - IL PREZZO si legge da js/owner-offer.js (OFFER.primaLocazione), formattato
#    con la sua eur(). La frase «La paga l'inquilino» è vera solo se il
#    proprietario paga 0 e pagaInquilino è true: se l'offerta cambia, lo
#    script si ferma invece di stampare una card falsa.
# L'H1 è quello della pagina, scritto qui a mano: se cambia l'uno, va
# cambiato l'altro.
#
# Uso:  python3 design/owners/genera-og-owners.py [--card]
#       --card lascia la card HTML intermedia nella dir temporanea (e la dice)
import json, os, shutil, struct, subprocess, sys, tempfile

QUI = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(QUI, '..', '..'))
TMP = tempfile.mkdtemp(prefix='og-owners-')
OUT = os.path.join(ROOT, 'og-owners.png')
W, H = 1200, 630

# Il budget di tests/media/hosts.mjs per le card social (e di
# tests/owners/run.mjs): sopra i 120 KB una card pesa quanto una pagina.
BUDGET = 120 * 1024


# ------------------------------------------------------------- i dati veri
# Un aiutante Node in linea: importa pianta.mjs (ESM) e owner-offer.js (UMD)
# e stampa in JSON quello che serve alla card. Nessun file in più nel repo.
NODE = r'''
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const ROOT = process.env.OG_ROOT;
const P = await import(pathToFileURL(path.join(ROOT, 'design/owners/pianta.mjs')).href);
const J = JSON.parse(readFileSync(path.join(ROOT, 'design/owners/pianta.json'), 'utf8'));
const offer = createRequire(path.join(ROOT, 'package.json'))('./js/owner-offer.js');
const pos = Object.fromEntries(P.posizioni().map((q) => [q.stanza, q]));
// Le luci spente: le etichette che in pianta.json portano «spenta».
const spente = J.etichette.filter((e) => e.spenta).map((e) => ({ testo: e.testo, spenta: e.spenta, ...pos[e.stanza] }));
// L'ingombro VERO della pianta alzata, in % del riquadro: pavimento (stanze,
// balcone, portone, arredi, ante), teste dei muri tagliati e bandiere,
// proiettati con la stessa M della pagina (P2 di pianta.mjs, più l'altezza).
const [A, B, C, D, E, F] = P.M, VB = P.VIEWBOX, RAD = Math.PI / 180;
const Z = P.s * Math.sin(J.alzata.rotateX * RAD), T = J.alzata.taglio;
const pr = ([x, y], z = 0) => [A * x + C * y + E, B * x + D * y + F - Z * z];
const rp = (r) => [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]];
const pts = [];
J.stanze.forEach((q) => q.poli.forEach((p) => pts.push(pr(p))));
J.muri.forEach((r) => rp(r).forEach((p) => pts.push(pr(p), pr(p, T))));
Object.values(J.simboli).forEach((v) => { if (v && Array.isArray(v.r)) rp(v.r).forEach((p) => pts.push(pr(p))); });
J.porte.forEach((p) => { if (!p.arco) { const w = Math.hypot(p.battuta[0] - p.cardine[0], p.battuta[1] - p.cardine[1]); pts.push(pr([p.cardine[0] + p.verso[0] * w, p.cardine[1] + p.verso[1] * w])); } });
J.bandiere.forEach((b) => pts.push(pr(b.piede, J.alzata.bandiera.asta), pr([b.piede[0] + J.alzata.bandiera.drappo[0], b.piede[1]], J.alzata.bandiera.asta)));
const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
const ingombro = [(Math.min(...xs) - VB[0]) / VB[2], (Math.min(...ys) - VB[1]) / VB[3], (Math.max(...xs) - VB[0]) / VB[2], (Math.max(...ys) - VB[1]) / VB[3]];
process.stdout.write(JSON.stringify({
  riquadro: P.riquadro(),
  css: readFileSync(path.join(ROOT, 'design/owners/pianta.css'), 'utf8'),
  aspect: P.ASPECT,
  viewBox: VB,
  ingombro,
  spente,
  prima: offer.OFFER.primaLocazione,
  zeroEur: offer.eur(offer.OFFER.primaLocazione.provvigioneProprietario),
}));
'''


def dati():
    env = dict(os.environ, OG_ROOT=ROOT)
    r = subprocess.run(['node', '--input-type=module', '-e', NODE], cwd=ROOT,
                       env=env, capture_output=True, text=True,
                       stdin=subprocess.DEVNULL)
    if r.returncode != 0:
        sys.exit('lettura di pianta.mjs / owner-offer.js fallita: ' + r.stderr.strip())
    return json.loads(r.stdout)


def esc(s):
    return (s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))


# --------------------------------------------------------------- la card
def card(d):
    prima = d['prima']
    # La frase è vera solo così: il proprietario 0, la provvigione all'inquilino.
    if prima.get('provvigioneProprietario') != 0 or prima.get('pagaInquilino') is not True:
        sys.exit('owner-offer.js: la prima locazione non è più «0 € al proprietario, '
                 'la paga l\'inquilino» — riscrivi la riga della card prima di rigenerarla')
    zero = esc(d['zeroEur']).replace(' ', '&nbsp;')

    # I cartellini delle luci spente (due: serratura e cassaforte), dove la
    # pagina mette le loro etichette alzate; il richiamo parte dall'ancora
    # proiettata. Testo da pianta.json, con la parola «spenta».
    if len(d['spente']) != 2:
        sys.exit('pianta.json: attese 2 luci spente, trovate %d — la card dice «le due ⚑»'
                 % len(d['spente']))
    vb = d['viewBox']
    def pt(pct):
        return (vb[0] + pct[0] / 100 * vb[2], vb[1] + pct[1] / 100 * vb[3])
    # Sulla card i cartellini sono più grandi che in pagina (si leggono
    # rimpiccioliti): invece di centrarli sul punto, li si appoggia al punto
    # dal lato OPPOSTO all'ancora, così non coprono mai la loro bandiera.
    richiami, cartellini = '', ''
    for q in d['spente']:
        ax, ay = pt(q['ancoraAlzata'])
        tx, ty = pt((q['xa'], q['ya']))
        dx, dy = tx - ax, ty - ay
        if abs(dx) >= abs(dy):
            tr = ('0' if dx > 0 else '-100%', '-50%')
        else:
            tr = ('-50%', '0' if dy > 0 else '-100%')
        richiami += ('<path d="M%.1f %.1fL%.1f %.1f"/><circle cx="%.1f" cy="%.1f" r="7" '
                     'fill="#8a877e" stroke="none"/>' % (ax, ay, tx, ty, ax, ay))
        cartellini += ('<div class="lu" style="left:%.2f%%;top:%.2f%%;transform:translate(%s,%s)">'
                       '<b>%s</b><i>&#9873; %s spenta</i></div>'
                       % (q['xa'], q['ya'], tr[0], tr[1], esc(q['testo']), esc(q['spenta'])))

    return '''<!DOCTYPE html><html lang="it" class="js"><head><meta charset="utf-8"><style>
* { margin:0; padding:0; box-sizing:border-box; }
body { width:%(W)dpx; height:%(H)dpx; background:#050505; overflow:hidden;
  font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; color:#FAFAFA;
  position:relative; }
.griglia { position:absolute; inset:0; opacity:.5;
  background-image:linear-gradient(rgba(255,215,0,.055) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,215,0,.055) 1px, transparent 1px);
  background-size:34px 26px; }
.velo { position:absolute; inset:0;
  background:radial-gradient(640px 420px at 74%% 46%%, rgba(255,215,0,.09), transparent 66%%),
    linear-gradient(180deg, transparent 58%%, rgba(0,0,0,.5)); }
.dentro { position:absolute; left:64px; top:0; bottom:0; width:560px; z-index:3;
  padding:58px 0 54px; display:flex; flex-direction:column; justify-content:space-between; }
.occhiello { font:400 15px ui-monospace,'SF Mono',Menlo,Consolas,monospace;
  letter-spacing:4px; text-transform:uppercase; color:#FFD700; }
h1 { font-weight:200; font-size:46px; line-height:1.1; letter-spacing:-.5px; }
h1 b { color:#FFD700; font-weight:300; }
.riga { margin-top:24px; font-size:21px; line-height:1.4; color:#c9c5b9; max-width:470px; }
.riga b { color:#fff; font-weight:500; }
.centro { margin-bottom:34px; }
.fondo { font:400 16px ui-monospace,'SF Mono',Menlo,Consolas,monospace;
  letter-spacing:3px; color:#FFD700; display:flex; align-items:center; }
.punto { display:inline-block; width:9px; height:9px; border-radius:50%%;
  background:#00FF88; margin-right:12px; box-shadow:0 0 14px rgba(0,255,136,.8); }
/* ---- la pianta della pagina, pianta.css in linea ---- */
%(css)s
/* ---- la card: lo stato finale, tutte le luci accese tranne le due ⚑ ---- */
.tavola { position:absolute; z-index:2; }
.tavola .riquadro { --pp-l:rgba(255,215,0,.13);
  --r-porta:var(--pp-l); --r-cassaforte:var(--pp-l); --r-soggiorno:var(--pp-l);
  --r-cucina:var(--pp-l); --r-scrivania:var(--pp-l); --r-cassetta:var(--pp-l);
  --r-casa:var(--pp-l); }
.tavola .stanze, .tavola svg.alzata .ld { display:none; }
/* un tratto un filo più pieno: la card si guarda rimpicciolita */
.tavola svg.alzata path { stroke-width:1.1; }
#pp > g[stroke-width] { stroke-width:1.1px; }
.tavola .rich { position:absolute; left:0; top:0; width:100%%; height:100%%;
  overflow:visible; fill:none; stroke:#8a877e; stroke-width:1.2px; }
.tavola .lu { position:absolute; z-index:2;
  background:rgba(6,6,7,.92); border:1px solid rgba(138,135,126,.75);
  padding:5px 10px 6px; text-align:center; white-space:nowrap; }
.tavola .lu b { display:block; font:400 13px/1.3 ui-monospace,'SF Mono',Menlo,Consolas,monospace;
  letter-spacing:.12em; text-transform:uppercase; color:#FFD700; }
.tavola .lu i { display:block; font:400 15px/1.25 'Helvetica Neue',Helvetica,Arial,sans-serif;
  font-style:normal; color:#b9b5aa; }
.didas { position:absolute; z-index:3; right:56px; bottom:57px;
  font:400 12px ui-monospace,'SF Mono',Menlo,Consolas,monospace; letter-spacing:2.4px;
  text-transform:uppercase; color:#8a877e; }
</style></head><body>
<div class="griglia"></div><div class="velo"></div>
<div class="tavola" style="%(tavola)s">
  <div class="riquadro alzata">%(riquadro)s
    <svg class="rich" viewBox="%(vb)s" aria-hidden="true">%(richiami)s</svg>
    %(cartellini)s
  </div>
</div>
<div class="dentro">
  <p class="occhiello">BOOM · Proprietari · Roma</p>
  <div class="centro">
    <h1>Non ti chiediamo fiducia.<br>Ti diamo <b>le carte</b>.</h1>
    <p class="riga">1ª locazione: <b>%(zero)s di provvigione</b>. La paga l&rsquo;inquilino, e te lo diciamo.</p>
  </div>
  <p class="fondo"><span class="punto"></span>BOOMROME.COM/OWNERS</p>
</div>
<p class="didas">ESEMPIO — dati inventati</p>
</body></html>''' % {
        'W': W, 'H': H, 'css': d['css'], 'riquadro': d['riquadro'],
        'vb': ' '.join(str(v) for v in vb), 'richiami': richiami,
        'cartellini': cartellini, 'zero': zero, 'tavola': tavola(d)[0],
    }


# Dove sta la pianta nella card: la metà destra. Il riquadro ha il rapporto
# fisso della pagina (ASPECT) ma il disegno non lo riempie: si piazza il
# riquadro in modo che l'INGOMBRO VERO della casa alzata (calcolato da
# pianta.json con M) stia intero nel box qui sotto, il più grande possibile e
# centrato. Il riquadro può sbordare dalla card; la casa no.
BOX = (592, 92, 1170, 506)   # x0, y0, x1, y1 in px della card


def tavola(d):
    x0, y0, x1, y1 = d['ingombro']            # frazioni del riquadro
    a = d['aspect']                            # larghezza / altezza
    bw, bh = BOX[2] - BOX[0], BOX[3] - BOX[1]
    w = min(bw / (x1 - x0), bh * a / (y1 - y0))
    h = w / a
    left = BOX[0] + (bw - (x1 - x0) * w) / 2 - x0 * w
    top = BOX[1] + (bh - (y1 - y0) * h) / 2 - y0 * h
    casa = (left + x0 * w, top + y0 * h, left + x1 * w, top + y1 * h)
    if casa[0] < BOX[0] - .5 or casa[2] > BOX[2] + .5 or casa[1] < BOX[1] - .5 or casa[3] > BOX[3] + .5:
        sys.exit('la pianta non sta nel suo box: %r' % (casa,))
    return 'left:%.1fpx; top:%.1fpx; width:%.1fpx;' % (left, top, w), casa


# ------------------------------------------------------------- la foto
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
    return struct.unpack('>II', head[16:24])


def quantizza(src, dst):
    js = ("const s=require('sharp');"
          "s(%r).png({palette:true,quality:90,effort:10,compressionLevel:9})"
          ".toFile(%r).then(()=>{},e=>{console.error(e.message);process.exit(1)});" % (src, dst))
    r = subprocess.run(['node', '-e', js], cwd=ROOT, capture_output=True,
                       text=True, stdin=subprocess.DEVNULL)
    if r.returncode != 0:
        sys.exit('quantizzazione fallita (serve sharp: npm ci): ' + r.stderr.strip())


def main():
    d = dati()
    html = os.path.join(TMP, 'og-owners-card.html')
    grezzo = os.path.join(TMP, 'og-owners-grezzo.png')
    finale = os.path.join(TMP, 'og-owners.png')
    with open(html, 'w', encoding='utf-8') as f:
        f.write(card(d))
    subprocess.run([shell(), '--headless', '--disable-gpu', '--no-sandbox',
                    '--hide-scrollbars', '--force-device-scale-factor=1',
                    # niente antialias subpixel: frange colorate sul testo
                    # che, rimpicciolite dalle anteprime, sporcano il bianco
                    '--disable-lcd-text',
                    '--window-size=%d,%d' % (W, H), '--screenshot=' + grezzo,
                    'file://' + html], check=True, stdin=subprocess.DEVNULL,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if not os.path.isfile(grezzo):
        sys.exit('headless_shell non ha scritto lo screenshot')
    quantizza(grezzo, finale)
    # Il PNG entra nel repo SOLO dopo i controlli: un giro fallito non lascia
    # mai una card rotta al posto di quella buona.
    w, h = png_size(finale)
    if (w, h) != (W, H):
        sys.exit('og-owners.png: %dx%d invece di %dx%d' % (w, h, W, H))
    n = os.path.getsize(finale)
    if n > BUDGET:
        sys.exit('og-owners.png: %d byte — sopra il budget social di %d' % (n, BUDGET))
    shutil.copyfile(finale, OUT + '.tmp')
    os.replace(OUT + '.tmp', OUT)
    if '--card' in sys.argv:
        print('card intermedia: ' + html)
    else:
        shutil.rmtree(TMP, ignore_errors=True)
    print('og-owners.png ok (%dx%d, %d byte, sotto budget)' % (w, h, n))


if __name__ == '__main__':
    main()
