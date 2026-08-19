#!/usr/bin/env python3
# LAB VOL. 5 — le cinque varianti dei cinque designer, in UNA pagina di
# confronto. Ogni variante resta un documento autonomo (iframe srcdoc:
# zero collisioni CSS/JS) che comunica la propria altezza al padre.
import html as H

SP = '/tmp/claude-0/-home-user-Boum-roma/23da0292-7660-5078-842d-6e153c49b7f8/scratchpad/'

VARIANTI = [
    ('biglietto', 'Il Biglietto II', '★ rifinito a mano',
     'La scelta portata a gioielleria: perforazione a fori PUNZONATI veri '
     '(ogni foro buca la carta e ha il labbro di luce sul bordo — su '
     'mobile lo strappo ora legge come un biglietto solo), stampa di '
     'sicurezza calcografica a doppia trama incrociata, lamina oro '
     'godronata, la SCIA che resta accesa dietro il punto in viaggio, '
     'filigrana a rosone in controluce e il timbro a inchiostro '
     '"WALKED IN PERSON · BOOM ROME" (un fatto vero, timbrato) '
     'sull\'ammiraglia. Al passaggio il biglietto si SOLLEVA di 3px '
     'oltre al tilt.',
     'Tutti i difetti dichiarati dalla v1 sono chiusi; nessun testo '
     'di vendita toccato.',
     'Il timbro vive solo sopra i 1020px — sotto, lo spazio non '
     'c\'è e si toglie invece di comprimersi.'),
    ('biglietto-v1', 'Il Biglietto (v1)', 'il punto di partenza',
     'La consegna originale del designer, per confronto diretto: '
     'tratteggio piatto al posto della punzonatura, trama singola, '
     'niente timbro né filigrana né scia.',
     'Già forte: rotta tipografica, talloncino, aggancio Wallet.',
     'Su mobile lo strappo leggeva come due card separate.'),
]

def leggi(n): return open(SP + n, encoding='utf-8').read()

palchi = []
for i, (cod, nome, tag, concept, pro, limite) in enumerate(VARIANTI):
    doc = leggi(f'variante-{cod}.html')
    # il documento comunica la propria altezza al padre
    sonda = ('<script>(function(){function m(){parent.postMessage('
             '{t:"vh",id:"' + cod + '",h:document.documentElement.scrollHeight},"*")}'
             'setInterval(m,700);addEventListener("load",m)})()</script>')
    if '</body>' in doc: doc = doc.replace('</body>', sonda + '</body>', 1)
    else: doc += sonda
    palchi.append(f'''
<section class="palco" id="{cod}">
  <div class="container">
    <div class="palco-testa">
      <span class="lettera">{i + 1}</span>
      <h2>{H.escape(nome)}</h2>
      <span class="tag{' oro' if i == 0 else ''}">{H.escape(tag)}</span>
      <p class="regola">{H.escape(concept)}</p>
    </div>
    <iframe class="palco-vetro" title="{H.escape(nome)}"
      data-v="{cod}" srcdoc="{H.escape(doc, quote=True)}"></iframe>
    <div class="verdetto">
      <div><b>Perché</b>{H.escape(pro)}</div>
      <div><b>Il limite</b>{H.escape(limite)}</div>
    </div>
  </div>
</section>''')

PAGINA = '''<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Banchina Lab</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap">
<style>
:root { --gold:#FFD700; --black:#030303; --text:#FAFAFA;
  --text-2:rgba(250,250,250,.72); --text-3:rgba(250,250,250,.5);
  --line-0:rgba(255,255,255,.04); --line:rgba(255,255,255,.08);
  --ease:cubic-bezier(.16,1,.3,1);
  --sans:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;
  --display:'Helvetica Neue',Helvetica,Arial,sans-serif; color-scheme:dark; }
* { margin:0; padding:0; box-sizing:border-box; }
body { background:var(--black); color:var(--text); font-family:var(--sans);
  font-weight:300; -webkit-font-smoothing:antialiased; overflow-x:hidden; }
.container { width:100%; max-width:1280px; margin:0 auto;
  padding:0 clamp(18px,3vw,40px); }
.lab-capo { padding:clamp(48px,7vh,88px) 0 clamp(16px,2.6vw,30px); }
.lab-capo .eti { font-size:10px; font-weight:600; letter-spacing:.26em;
  text-transform:uppercase; color:var(--gold); }
.lab-capo h1 { margin-top:14px; font-family:var(--display); font-weight:200;
  font-size:clamp(30px,4.4vw,52px); line-height:1.08; letter-spacing:-.02em;
  max-width:26ch; }
.lab-capo h1 b { color:var(--gold); font-weight:300; }
.lab-capo p { margin-top:14px; max-width:74ch; font-size:14px;
  color:var(--text-3); line-height:1.6; }
.palco { padding:clamp(34px,4.6vw,60px) 0; border-top:1px solid var(--line-0); }
.palco-testa { display:flex; align-items:baseline; gap:14px; flex-wrap:wrap;
  margin-bottom:16px; }
.palco-testa .lettera { font-family:var(--display); font-weight:200;
  font-size:clamp(30px,3.6vw,44px); color:var(--gold); line-height:1; }
.palco-testa h2 { font-family:var(--display); font-weight:250;
  font-size:clamp(20px,2.5vw,28px); letter-spacing:-.01em; }
.palco-testa .tag { font-size:9px; font-weight:700; letter-spacing:.18em;
  text-transform:uppercase; color:var(--text-3); padding:5px 11px;
  border-radius:100px; box-shadow:inset 0 0 0 1px var(--line); }
.palco-testa .tag.oro { color:#141005; background:var(--gold);
  box-shadow:none; }
.palco-testa .regola { width:100%; font-size:12.5px; color:var(--text-3);
  max-width:80ch; line-height:1.65; }
.studio { margin-top:22px; border:1px solid var(--line-0);
  border-radius:16px; padding:clamp(16px,2vw,24px); }
.studio .st-eti { display:block; font-size:10px; font-weight:600;
  letter-spacing:.22em; text-transform:uppercase; color:var(--gold);
  margin-bottom:12px; }
.st-griglia { display:grid; gap:12px 22px;
  grid-template-columns:repeat(auto-fit,minmax(290px,1fr));
  font-size:12px; color:var(--text-3); line-height:1.6; }
.st-griglia b { display:block; color:var(--text-2); font-weight:600;
  font-size:11.5px; margin-bottom:2px; }
.palco-vetro { width:100%; height:1400px; border:0; border-radius:18px;
  background:#060607; box-shadow:inset 0 0 0 1px var(--line-0);
  display:block; }
.verdetto { margin-top:14px; display:grid; gap:6px 22px;
  grid-template-columns:repeat(auto-fit,minmax(300px,1fr));
  font-size:12px; color:var(--text-3); line-height:1.6; }
.verdetto b { color:var(--gold); font-weight:600; font-size:10px;
  letter-spacing:.18em; text-transform:uppercase; display:block;
  margin-bottom:2px; }
</style>
</head>
<body>
<header class="lab-capo">
  <div class="container">
    <span class="eti">— Banchina Lab · vol. 11 — il Biglietto II</span>
    <h1>Lo stesso biglietto, <b>rifinito a mano</b>.</h1>
    <p>Hai scelto il Biglietto: eccolo portato al livello sopra —
      punzonatura vera, calcografia a doppia trama, lamina godronata,
      scia sulla rotta, filigrana e il timbro dell\'agenzia (un fatto
      vero: ogni casa camminata di persona). Sotto, la v1 per vedere
      la distanza.</p>
  </div>
</header>
''' + '\\n'.join(palchi) + '''
<script>
addEventListener('message', function (e) {
  var d = e.data || {};
  if (d.t !== 'vh' || !d.id || !(d.h > 200)) return;
  var f = document.querySelector('iframe[data-v="' + d.id + '"]');
  if (f) f.style.height = Math.min(d.h + 24, 4200) + 'px';
});
</script>
</body>
</html>'''

open(SP + 'esplora-banchina.html', 'w', encoding='utf-8').write(PAGINA)
print('lab5:', len(PAGINA) // 1024, 'KB ·', len(palchi), 'palchi')
