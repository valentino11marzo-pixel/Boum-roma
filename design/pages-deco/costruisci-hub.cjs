// PFS HUB — il confronto che si LEGGE: per ogni variante uno screenshot
// a pagina intera (reveal forzati, animazioni spente — la lezione degli
// iframe neri) dentro un visore scorrevole, il verdetto, e il bottone
// verso la pagina VIVA in preview. Niente iframe: niente reveal morti,
// niente tagli d'altezza.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');

const SP = __dirname + '/';
const PREVIEW = 'https://boum-roma-git-claude-boom-home-background-'
  + 'wqektx-valentino-boom.vercel.app';

const VARIANTI = [
  ['colloquio', 'Il Colloquio 5.0', '★ la messa in scena definitiva',
   '/preview-pfs-colloquio',
   "L'interrogatorio in sette atti (domande manifesto a zigzag, lead distillate, colpi giganti 100% · 24–72h · 96 · 4.9★ · 0 · §4.2 · 24h) che ha assorbito i pezzi migliori del Volo: nell'atto sul mercato il TABELLONE SOLARI con il buon annuncio che scade in loop (BOARDING → LAST CALL → GONE), nell'atto sulla macchina il finder VERO seguito dalla CAMMINATA col timbro REJECTED sulla casa da 82. Più la pillola d'imbarco persistente che compare a metà lettura e sparisce vicino alla cassa. In piu' nella 5.0: numerale in filigrana dietro la domanda, la domanda che si svela a tendina, la SCIA a fine atto (✓ Answered → la prossima domanda) e il REGISTRO FINALE: le sette obiezioni sbarrate in oro una a una — «Nothing left standing. Five lines — and we hunt.» Ticket-hero intatto, clausole verbatim, degrado statico completo.",
   'Il formato che converte (la conversazione) + la prova che si guarda (tabellone, timbro, finder) + la via alla cassa sempre a un tap.',
   "La pagina più ricca del lotto: ogni claim resta agganciato a fonti pubbliche — va mantenuta con la stessa disciplina."],
  ['volo', 'Il Volo', 'la regia cinematica',
   '/preview-pfs-volo',
   "Non racconta il servizio: LO FA VEDERE in tre scene guidate dallo scroll. LE PARTENZE — il mercato di Roma come tabellone Solari, sei righe brutali da fonti pubblicate e il buon annuncio che SCADE sotto gli occhi (BOARDING → LAST CALL → GONE, «went while you scrolled»). IL RADAR — la macchina lavora: 14 contatti, i sotto-60 svaniscono, l'agenzia sbarrata, tre d'oro coi punteggi, poi 96/giorno · 50·30·20 · soglia 60. LA CAMMINATA — il timbro REJECTED sulla casa da 82 («damp behind the wardrobe»). Poi il kit toccabile (app DEMO, zecca del pass), la scatola nera (100% + tabella anti-truffa + §4.2 verbatim + fee dichiarata) e la verifica. Ticket-hero intatto; senza JS o reduced-motion la pagina resta completa e statica.",
   'La perdita si guarda invece di leggersi — design, ingegneria e persuasione nello stesso gesto; chi scorre vede il prodotto lavorare.',
   "Le scene chiedono scroll vero: su artifact si valuta dallo screenshot, il giudizio finale va dato sulla pagina viva."],
  ['caccia', 'La Caccia', 'la mia tesi d\'origine',
   '/preview-pfs-caccia',
   "Il servizio non si descrive: SI FA VEDERE. Una caccia si svolge giorno per giorno mentre scorri — il brief e la chiamata dei 15 minuti, il radar che si arma con gli orari veri, 14 candidati di cui 11 muoiono sotto soglia, la casa BOCCIATA a piedi col motivo, la shortlist coi punteggi sul telefono, il pass Wallet da coniare col tuo nome, la firma dal telefono. Chiude la garanzia §4.2.",
   'Spiega, prova e vende nello stesso gesto; due reperti sono il prodotto vero (finder interattivo, app col codice DEMO).',
   'È la più lunga: la storia chiede scroll. Le cifre della caccia campione sono dichiarate rappresentative.'],
  ['terminale', 'Il Terminale', 'la pagina È il prodotto',
   '/preview-pfs-terminale',
   "Atterri DENTRO l'app del cliente: mazzo di card campione (badge SAMPLE) con punteggi derivati SOLO dai pesi di produzione, chip del brief toggleabili (togli il budget e la card sopra soglia si accende), card-veto «agency relisting». Il form vero subito sotto.",
   'Massima densità tech: il prodotto si tocca al primo secondo.',
   "Un'app campione in homepage è un'arma a doppio taglio: se non incanta, sa di recita."],
  ['dossier', 'Il Dossier', 'la pagina È il deliverable',
   '/preview-pfs-dossier',
   'Sfogli esattamente ciò che compri: il dossier del giorno 3 — copertina col brief, le 3 case con punteggio e le note di chi le ha CAMMINATE, la pagina degli scarti coi motivi, il conto trasparente con la garanzia. Tutto dichiarato campione.',
   "L'intangibile diventa un oggetto costoso da tenere in mano prima di pagare.",
   'Un documento chiede lettura: su mobile va dosato con cura.'],

  ['attuale', 'PFS 6.0', 'il riferimento (in preview)',
   '/property-finding',
   "La pagina com'è ora sul branch: form-hero che si assembla, conto, regola anti-truffa, macchina col finder, toccabile, verifica, filo del volo.",
   "L'architettura provata dai tre studi, già collaudata end-to-end.",
   'Descrive più che mostrare: è il punto che le varianti attaccano.'],
];

const LOCALI = { volo: '/home/user/Boum-roma/preview-pfs-volo.html',
  caccia: 'pfs-caccia.html', terminale: 'pfs-terminale.html',
  dossier: 'pfs-dossier.html', colloquio: '/home/user/Boum-roma/preview-pfs-colloquio.html',
  attuale: '/home/user/Boum-roma/property-finding.html' };

(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const shots = {};
  for (const [cod] of VARIANTI) {
    const file = LOCALI[cod].startsWith('/') ? LOCALI[cod] : SP + LOCALI[cod];
    if (!fs.existsSync(file)) { console.log('MANCA', file); continue; }
    const pg = await br.newPage({ viewport: { width: 1180, height: 900 } });
    await pg.route(/fonts\.(googleapis|gstatic)\.com|firebasestorage/, r => r.abort());
    await pg.goto('file://' + file, { waitUntil: 'domcontentloaded' });
    await pg.waitForTimeout(1600);
    await pg.addStyleTag({ content:
      `*, *::before, *::after { animation:none !important;
         transition:none !important; }
       html.vivo .sale, .sale, .coro > *, .bolla, .giorno
         { opacity:1 !important; transform:none !important; }
       #ckForm.arma .ck-banda, #ckForm.arma .ck-corpo > *,
       #ckForm.arma .ck-perf, #ckForm.arma .ck-stub
         { opacity:1 !important; transform:none !important; }
       .regola2.arma > div { opacity:1 !important; transform:none !important; }
       .salta, .rotta-filo, .scroll-progress { display:none !important; }
       .nav { position:absolute !important; }` });
    await pg.evaluate(() => document.documentElement.classList.remove('cine'));
    await pg.waitForTimeout(700);
    const buf = await pg.screenshot({ fullPage: true, type: 'jpeg', quality: 58 });
    shots[cod] = 'data:image/jpeg;base64,' + buf.toString('base64');
    console.log(cod, Math.round(buf.length / 1024) + 'KB');
    await pg.close();
  }
  await br.close();

  const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  let palchi = '';
  VARIANTI.forEach(([cod, nome, tag, url, concept, pro, limite], i) => {
    if (!shots[cod]) return;
    palchi += `
<section class="palco">
  <div class="testa">
    <span class="lettera">${i + 1}</span>
    <div class="testa-testi">
      <h2>${esc(nome)} <span class="tag${i === 0 ? ' oro' : ''}">${esc(tag)}</span></h2>
      <p>${esc(concept)}</p>
    </div>
    <a class="apri" href="${PREVIEW}${url}" target="_blank" rel="noopener">Apri la pagina viva ↗</a>
  </div>
  <div class="visore" tabindex="0" aria-label="Anteprima ${esc(nome)}: scorri dentro">
    <img src="${shots[cod]}" alt="La pagina ${esc(nome)} per intero" loading="lazy">
    <span class="visore-hint">scorri qui dentro ↓</span>
  </div>
  <div class="verdetto">
    <div><b>Perché</b>${esc(pro)}</div>
    <div><b>Il limite</b>${esc(limite)}</div>
  </div>
</section>`;
  });

  const pagina = `<title>PFS Lab</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap">
<style>
:root { --oro:#FFD700; --nero:#050505; --carta:#0D0D0F; --testo:#FAFAFA;
  --testo2:rgba(250,250,250,.72); --testo3:rgba(250,250,250,.5);
  --filo:rgba(255,255,255,.08); --filo0:rgba(255,255,255,.04);
  --display:'Helvetica Neue',Helvetica,Arial,sans-serif;
  --sans:'Inter',-apple-system,sans-serif; color-scheme:dark; }
* { margin:0; padding:0; box-sizing:border-box; }
body { background:var(--nero); color:var(--testo); font-family:var(--sans);
  font-weight:300; -webkit-font-smoothing:antialiased; }
.colonna { max-width:1180px; margin:0 auto; padding:0 22px 90px; }
header { padding:clamp(48px,8vh,90px) 0 clamp(20px,3vh,34px); }
.eti { font-size:10px; font-weight:600; letter-spacing:.28em;
  text-transform:uppercase; color:var(--oro); }
h1 { margin-top:14px; font-family:var(--display); font-weight:200;
  font-size:clamp(32px,5vw,54px); line-height:1.06; letter-spacing:-.02em; }
h1 b { color:var(--oro); font-weight:300; }
header p { margin-top:14px; max-width:76ch; font-size:14px;
  color:var(--testo3); line-height:1.65; }
header p b { color:var(--testo2); font-weight:600; }
.palco { margin-top:clamp(36px,5vh,60px); padding-top:clamp(24px,3vh,36px);
  border-top:1px solid var(--filo0); }
.testa { display:flex; align-items:flex-start; gap:18px; flex-wrap:wrap; }
.lettera { font-family:var(--display); font-weight:200;
  font-size:clamp(34px,4vw,48px); color:var(--oro); line-height:1; }
.testa-testi { flex:1 1 420px; min-width:0; }
.testa-testi h2 { font-family:var(--display); font-weight:250;
  font-size:clamp(21px,2.6vw,29px); letter-spacing:-.01em;
  display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.tag { font-size:9px; font-weight:700; letter-spacing:.18em;
  text-transform:uppercase; color:var(--testo3); padding:5px 11px;
  border-radius:100px; box-shadow:inset 0 0 0 1px var(--filo); }
.tag.oro { color:#141005; background:var(--oro); box-shadow:none; }
.testa-testi p { margin-top:8px; font-size:13px; color:var(--testo3);
  line-height:1.65; max-width:80ch; }
.apri { flex:none; display:inline-flex; align-items:center; padding:12px 20px;
  font-size:12.5px; font-weight:700; color:#141005; background:var(--oro);
  border-radius:100px; text-decoration:none; }
.visore { position:relative; margin-top:18px; height:min(72vh,760px);
  overflow-y:auto; border-radius:14px; background:var(--carta);
  box-shadow:inset 0 0 0 1px var(--filo0); scrollbar-width:thin;
  scrollbar-color:rgba(255,215,0,.35) transparent; }
.visore img { display:block; width:100%; height:auto; }
.visore-hint { position:sticky; bottom:12px; left:0; margin-left:14px;
  display:inline-block; padding:6px 12px; font-size:10px; font-weight:700;
  letter-spacing:.14em; text-transform:uppercase; color:var(--testo2);
  background:rgba(5,5,5,.8); border-radius:100px;
  box-shadow:inset 0 0 0 1px var(--filo); backdrop-filter:blur(6px);
  -webkit-backdrop-filter:blur(6px); pointer-events:none; }
.verdetto { margin-top:12px; display:grid; gap:6px 22px;
  grid-template-columns:repeat(auto-fit,minmax(300px,1fr));
  font-size:12px; color:var(--testo3); line-height:1.6; }
.verdetto b { color:var(--oro); font-weight:600; font-size:10px;
  letter-spacing:.18em; text-transform:uppercase; display:block;
  margin-bottom:2px; }
</style>
<div class="colonna">
<header>
  <span class="eti">— PFS Lab · le reimmaginazioni del flagship</span>
  <h1>Il servizio non si descrive.<br><b>Si fa vedere.</b></h1>
  <p>Cinque pagine complete. Ogni visore qui sotto contiene la pagina
    INTERA come immagine — <b>scorri dentro il riquadro</b> per sfogliarla
    — e il bottone oro apre la <b>pagina viva</b> sul preview, con
    animazioni, filo del volo e form funzionante. La prima è il vincitore, con i gioielli montati dentro.</p>
</header>
${palchi}
</div>`;

  fs.writeFileSync(SP + 'pfs-lab.html', pagina);
  console.log('hub:', Math.round(pagina.length / 1024) + 'KB ·',
    Object.keys(shots).length, 'palchi');
})();
