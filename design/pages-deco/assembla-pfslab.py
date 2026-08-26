#!/usr/bin/env python3
# PFS LAB — le reimmaginazioni della pagina Property Finding, in UNA
# pagina di confronto (stesso schema del Banchina Lab: iframe srcdoc,
# zero collisioni, sonda d'altezza).
import html as H

SP = '/tmp/claude-0/-home-user-Boum-roma/23da0292-7660-5078-842d-6e153c49b7f8/scratchpad/'

VARIANTI = [
    ('caccia', 'La Caccia', '★ la mia, onesta e brutale',
     'La tesi: la pagina attuale DESCRIVE il servizio; per spiegare «in '
     'cosa consiste» bisogna FARLO VEDERE. Il centro della pagina è UNA '
     'caccia che si svolge giorno per giorno mentre scorri: il brief che '
     'arriva e la chiamata di 15 minuti, il radar che si arma (96 '
     'scan/giorno, orari di produzione), i 14 candidati di cui 11 '
     'muoiono sotto soglia 60, la casa BOCCIATA a piedi col motivo '
     '(«umidità dietro l\'armadio» — la camera non te l\'avrebbe detto), '
     'la shortlist sul telefono con i punteggi, la visita live col pass '
     'Wallet da coniare col TUO nome, la firma dal telefono. Chiude la '
     'garanzia: «se il giorno 15 arriva senza 3 opzioni, i €350 tornano '
     'sulla carta — Terms §4.2». Onestà dichiarata in testa: caccia '
     'rappresentativa, i meccanismi sono il sistema vero.',
     'Spiega, prova e vende nello stesso gesto: ogni giorno è un pezzo '
     'di scetticismo smontato con un REPERTO — due dei quali sono il '
     'prodotto vero (il finder interattivo, l\'app col codice DEMO).',
     'Più lunga delle altre: la storia chiede scroll. E i dettagli della '
     'caccia campione (zone, cifre) sono dichiarati rappresentativi — '
     'appena ci sono i clienti citabili, una caccia VERA li sostituisce.'),
    ('terminale', 'Il Terminale', 'la pagina È il prodotto',
     'La tesi opposta: niente racconto — atterri DENTRO l\'app del '
     'cliente. Il mazzo di card campione con punteggio in mano subito, '
     'i criteri come chip, e «Make it real · €350» che apre il '
     'check-in vero.',
     'Massima densità tech: il prodotto si tocca al primo secondo.',
     'Un\'app finta in homepage è un\'arma a doppio taglio: se il '
     'campione non incanta, l\'inganno percepito costa più del wow.'),
    ('attuale', 'PFS 6.0 (attuale)', 'il riferimento in preview',
     'La pagina come è ora sul branch: form-hero che si assembla, '
     'conto, regola anti-truffa, macchina col finder, toccabile, '
     'verifica, filo del volo.',
     'L\'architettura provata dai tre studi, già collaudata.',
     'Descrive più che mostrare: è il punto che le due varianti '
     'attaccano.'),
]


def leggi(n):
    return open(SP + n, encoding='utf-8').read()


palchi = []
for i, (cod, nome, tag, concept, pro, limite) in enumerate(VARIANTI):
    doc = leggi(f'pfs-{cod}.html')
    sonda = ('<script>(function(){function m(){parent.postMessage('
             '{t:"vh",id:"' + cod + '",h:document.documentElement.scrollHeight},"*")}'
             'setInterval(m,700);addEventListener("load",m)})()</script>')
    if '</body>' in doc:
        doc = doc.replace('</body>', sonda + '</body>', 1)
    else:
        doc += sonda
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
<title>PFS Lab</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
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
  max-width:88ch; line-height:1.65; }
.palco-vetro { width:100%; height:1600px; border:0; border-radius:18px;
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
    <span class="eti">— PFS Lab · le reimmaginazioni del flagship</span>
    <h1>Il servizio non si descrive.<br><b>Si fa vedere.</b></h1>
    <p>Tre pagine complete a confronto. La prima è la mia tesi più
      onesta: una caccia vera che si svolge giorno per giorno sotto gli
      occhi del lettore — ogni giorno un reperto, due dei quali sono il
      prodotto vero. La seconda è la tesi opposta (atterri dentro
      l'app). La terza è la 6.0 attuale come riferimento. Scrolla dentro
      ogni vetro: sono pagine vive.</p>
  </div>
</header>
''' + '\\n'.join(palchi) + '''
<script>
addEventListener('message', function (e) {
  var d = e.data || {};
  if (d.t !== 'vh' || !d.id || !(d.h > 200)) return;
  var f = document.querySelector('iframe[data-v="' + d.id + '"]');
  if (f) f.style.height = Math.min(d.h + 24, 5200) + 'px';
});
</script>
</body>
</html>'''

open(SP + 'pfs-lab.html', 'w', encoding='utf-8').write(PAGINA)
print('pfs-lab:', len(PAGINA) // 1024, 'KB ·', len(palchi), 'palchi')
