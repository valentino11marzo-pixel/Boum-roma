// scripts/wa-export.mjs — il documento delle risposte rapide si GENERA.
//
//   node scripts/wa-export.mjs          scrive docs/WHATSAPP_RISPOSTE_RAPIDE.md
//   node scripts/wa-export.mjs --check  dice solo se è allineato (esce 1 se no)
//
// I testi vivono in js/whatsapp-replies.js e in nessun altro posto. Questo
// script li impagina; tests/whatsapp/replies.mjs pretende che il file su disco
// sia identico a quello che uscirebbe adesso. Così un documento vecchio — che
// è peggio di nessun documento, perché sembra vero — non può sopravvivere a un
// cambio di prezzo.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WA from '../js/whatsapp-replies.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DOC_PATH = 'docs/WHATSAPP_RISPOSTE_RAPIDE.md';

const fence = (s) => '```\n' + s + '\n```';

export function renderDoc() {
  const L = [];
  const star = WA.REPLIES.filter((r) => r.star);

  L.push('# Risposte rapide WhatsApp Business — BOOM');
  L.push('');
  L.push('> **Generato da `js/whatsapp-replies.js`.** Non modificare questo file a mano:');
  L.push('> cambia il modulo e rilancia `node scripts/wa-export.mjs`.');
  L.push('> I testi vivono in una copia sola, letta anche dalla pagina `/risposte`');
  L.push('> (da cui si copiano col pollice) e dai test.');
  L.push('');
  const inst = WA.installed();
  const bench = WA.REPLIES.filter((r) => r.bench);
  L.push(`**${inst.length} risposte da caricare nell'app** — circa 10 minuti, una volta sola.`);
  L.push('');
  L.push(`Le altre ${bench.length} restano nel mazzo: vivono qui e su \`/risposte\`, si cercano e si`);
  L.push('copiano quando capita il caso raro, senza occupare uno slot nel telefono. L\'app ne accetta');
  L.push(`${WA.LIMITS.total} in tutto, ma installarne 50 significa non trovare più quella giusta:`);
  L.push('meglio poche, sapute a memoria.');
  L.push('');

  // ---------------------------------------------------------------- il metodo
  L.push('## Come funzionano (il minimo da sapere)');
  L.push('');
  L.push('In chat scrivi `/` e la scorciatoia: WhatsApp filtra man mano che digiti,');
  L.push('quindi non devi ricordarti niente a memoria — basta ricordare la **famiglia**');
  L.push('(la prima o le prime due lettere) e scorrere.');
  L.push('');
  L.push('| Prefisso | A chi parla | Come si scrive |');
  L.push('|---|---|---|');
  for (const f of WA.FAMILIES) {
    L.push(`| \`/${f.key}…\` | ${f.label} | ${f.note} |`);
  }
  L.push('');
  L.push('**I limiti veri dell\'app**, che è meglio conoscere prima di inventarne una tua:');
  L.push('');
  L.push(`- massimo **${WA.LIMITS.total} risposte rapide** in tutto;`);
  L.push(`- massimo **${WA.LIMITS.text} caratteri** per messaggio (l'app salva il troncato senza avvisare);`);
  L.push(`- scorciatoia fino a **${WA.LIMITS.shortcut} caratteri, senza spazi**;`);
  L.push('- a una risposta rapida puoi **allegare una foto o un PDF**: utile per il listino,');
  L.push('  la locandina per le università, la planimetria tipo.');
  L.push('');
  L.push('### La dottrina (perché sono scritte così)');
  L.push('');
  L.push('1. **Non si vende il servizio: si vende cosa saprai domani.** Nessuno compra una');
  L.push('   "visita virtuale" — compra il non mandare tremila euro a uno sconosciuto');
  L.push('   fidandosi delle sue fotografie.');
  L.push('2. **L\'ancora è la perdita, non il prezzo.** €49 non si confronta con zero: si');
  L.push('   confronta con la clausola d\'uscita che non hai letto. Ogni risposta dichiara');
  L.push('   contro cosa vende.');
  L.push('3. **Il prezzo sparisce dentro una transazione già in corso** — scalato dalla');
  L.push('   commissione, rimborsato se non consegniamo. Il cliente non spende: sposta.');
  L.push('4. **La prova è un meccanismo, mai un aggettivo.** "Filmo la casa all\'ingresso e');
  L.push('   all\'uscita" è una prova; "agenzia affidabile" lo scrive chiunque.');
  L.push('5. **Una porta sola, aperta una volta.** Chi insiste non è premium.');
  L.push('6. **Generosità asimmetrica:** il primo passo è gratis e vale davvero (la lettura');
  L.push('   del contratto, la visita video sulle nostre case), o quello a pagamento sa di esca.');
  L.push('7. **Prima persona singolare.** "Noi" è un ufficio; "io" è qualcuno che risponde.');
  L.push('');
  L.push('### Le tre regole di forma');
  L.push('');
  L.push('1. **Ogni messaggio finisce con una domanda o un\'azione.** Una risposta che informa');
  L.push('   e non chiede niente lascia la palla al cliente, e il cliente non la rilancia.');
  L.push('2. **I buchi da riempire sono `[MAIUSCOLO fra quadre]`.** Si vedono da lontano:');
  L.push('   un `[NOME]` partito così è l\'unico modo di far sembrare finto un messaggio scritto a mano.');
  L.push('   *Regola: non mandare mai un messaggio che contiene ancora una parentesi quadra.*');
  L.push('3. **Si concatenano.** Nessuna prova a dire tutto: due di fila fanno la risposta');
  L.push('   completa. `/enlead` + `/enprice` (chi sei, poi i numeri), `/engone` + `/enfind`');
  L.push('   (la casa è andata, poi cerchiamo noi), `/enbook` + `/enabroad` (la visita, e se');
  L.push('   è lontano quella video).');
  L.push('');

  // ------------------------------------------------------------ installazione
  L.push('## Come si installano');
  L.push('');
  L.push('**Android** → WhatsApp Business → ⋮ → *Strumenti per l\'attività* → **Risposte rapide** → **+**');
  L.push('→ incolla il messaggio, scrivi la scorciatoia, salva.');
  L.push('');
  L.push('**iPhone** → *Impostazioni* → *Strumenti per l\'attività* → **Risposte rapide** → **+**.');
  L.push('');
  L.push('**Desktop / Web** (la via più veloce per caricarle tutte: si incolla con Ctrl+V invece di');
  L.push('digitare sul telefono) → icona ⚙️ → *Strumenti per l\'attività* → **Risposte rapide**.');
  L.push('Si sincronizzano poi sul telefono da sole.');
  L.push('');
  L.push('Apri **`/risposte`** sul telefono (o sul computer, è la stessa pagina): ogni risposta ha');
  L.push('il tasto **Copia**. Copia → incolla nell\'app → scorciatoia → avanti.');
  L.push('');
  L.push(`### Le ${inst.length} da caricare`);
  L.push('');
  for (const r of inst) L.push(`- \`/${r.sc}\` — ${r.title}`);
  L.push('');
  L.push('Tutto il resto è nel mazzo qui sotto: si copia dalla pagina quando serve.');
  L.push('');

  // ------------------------------------------------------------- le risposte
  L.push('---');
  L.push('');
  L.push('## Le risposte');
  for (const f of WA.FAMILIES) {
    const items = WA.REPLIES.filter((r) => r.fam === f.key);
    L.push('');
    L.push(`### ${f.label} — ${items.length}`);
    L.push('');
    L.push(`*${f.note}*`);
    for (const r of items) {
      L.push('');
      L.push(`#### \`/${r.sc}\` · ${r.title}${r.star ? ' ⭐' : ''}${r.bench ? ' · 🪑 panchina' : ''}`);
      L.push('');
      L.push(`**Quando:** ${r.when}`);
      if (r.sell && r.sell.anchor) {
        L.push('');
        L.push(`**Vende contro:** ${r.sell.anchor}`
          + (r.sell.service ? ` — porta: \`${r.sell.service}\`` : ''));
      }
      L.push('');
      L.push(fence(r.text));
      const holes = [...new Set(WA.placeholdersIn(r.text))];
      if (holes.length) L.push(`<sub>Da riempire: ${holes.join(' · ')} — ${r.text.length} caratteri</sub>`);
      else L.push(`<sub>Pronta così com'è — ${r.text.length} caratteri</sub>`);
    }
  }
  L.push('');

  // --------------------------------------------------------------- automatici
  L.push('---');
  L.push('');
  L.push('## I due messaggi automatici');
  L.push('');
  L.push('Non sono risposte rapide: sono due impostazioni a parte (*Strumenti per l\'attività*');
  L.push('→ **Messaggio di benvenuto** e **Messaggio di assenza**), e non consumano gli slot.');
  L.push('Sono anche gli unici messaggi che partono **senza che tu li legga**: per questo non');
  L.push('possono contenere segnaposto.');
  for (const m of [WA.GREETING, WA.AWAY]) {
    L.push('');
    L.push(`### ${m.title}`);
    L.push('');
    L.push(`**Quando:** ${m.when}`);
    L.push('');
    L.push(fence(m.text));
  }
  L.push('');
  L.push('Per l\'assenza imposta l\'orario vero in cui non rispondi (es. 21:00–09:00 e la domenica):');
  L.push('un messaggio di assenza attivo 24 ore su 24 dice al cliente che non c\'è mai nessuno.');
  L.push('');

  // ---------------------------------------------------------------- etichette
  L.push('## Le etichette (il pipeline dentro WhatsApp)');
  L.push('');
  L.push('Le risposte rapide fanno risparmiare tempo; le etichette sono ciò che impedisce di');
  L.push('**perdere** una persona. Tienile poche: un\'etichetta che non guardi mai è rumore.');
  L.push('');
  L.push('| Etichetta | A cosa serve |');
  L.push('|---|---|');
  for (const l of WA.LABELS) L.push(`| ${l.name} | ${l.what} |`);
  L.push('');
  L.push('Le due che valgono più delle altre: **📄 Documenti** (è lì che muoiono le trattative,');
  L.push('non nel prezzo) e **❄️ Richiamare**, dove ogni chat deve avere una data nella nota —');
  L.push('senza data non richiami nessuno. Per una campagna vera di richiamo usa `/richiama`');
  L.push('sul bot: manda a tutti insieme con un tap, coi veti già applicati.');
  L.push('');

  // -------------------------------------------------------------------- link
  L.push('---');
  L.push('');
  L.push('## Libreria link');
  L.push('');
  L.push('Tutti verificati: un test controlla che ognuno sia una rotta vera del sito.');
  const groups = [...new Set(WA.LINKS.map((l) => l.group))];
  for (const g of groups) {
    L.push('');
    L.push(`### ${g}`);
    L.push('');
    L.push('| Link | Cosa è |');
    L.push('|---|---|');
    for (const l of WA.LINKS.filter((x) => x.group === g)) {
      L.push(`| \`${WA.SITE}${l.path}\` | ${l.what} |`);
    }
  }
  L.push('');
  L.push('### I link che NON si mettono in una risposta rapida');
  L.push('');
  L.push('Perché sono **personali**: valgono per una persona sola e li genera il portale o il bot');
  L.push('al momento. Nelle risposte della famiglia `/op…` stanno come `[LINK]`, e tu incolli.');
  L.push('');
  L.push('- pagina della visita del cliente (`/viewing?t=…`) — la genera la conferma;');
  L.push('- **Scheda** anagrafica (`/scheda?t=…`) — dal portale, Share Hub;');
  L.push('- **Magic Sign**, firma del contratto (`/sign?sign=…`) — dal portale o dalla console pre-accordo;');
  L.push('- **pre-accordo** (`/pre-agreement?t=…`) — dalla console;');
  L.push('- **link di pagamento** di una rata o fattura — bottone 💳 sulla riga, nel portale.');
  L.push('');

  // ----------------------------------------------------------- manutenzione
  L.push('---');
  L.push('');
  L.push('## Manutenzione');
  L.push('');
  L.push('- **Cambiare un testo o un prezzo:** `js/whatsapp-replies.js` → `node scripts/wa-export.mjs`');
  L.push('  → ricopia la risposta modificata nell\'app. `node tests/whatsapp/replies.mjs` dice subito');
  L.push('  se qualcosa non torna.');
  L.push('- **I prezzi sono agganciati** a `api/_catalog.js` dal test: se cambi il prezzo di un');
  L.push('  servizio nel catalogo e non qui, il test fallisce. È voluto — l\'alternativa è promettere');
  L.push('  €89 su WhatsApp e chiedere €99 su Stripe.');
  L.push('- **Da verificare una volta, tu:**');
  L.push('  - il link recensione in `/enrev` (`g.page/r/…/review`): aprilo e controlla che si apra');
  L.push('    la scatola delle stelle di BOOM. È lo stesso che deve stare in `REVIEW_URL` su Vercel.');
  L.push('  - `/enpay` cita il bonifico: in `/casa` compare solo se hai impostato `settings/payout`');
  L.push('    (beneficiario + IBAN) dalle impostazioni del portale.');
  L.push('- **Cose che già fa la macchina**, e che quindi non serve mandare a mano:');
  L.push('  la prima risposta a un lead (il Commerciale la propone su Telegram),');
  L.push('  i solleciti dei canoni (il Gestore), la richiesta di recensione (`/recensione` sul bot),');
  L.push('  le email del percorso inquilino (T-30, T-14, T-7, T-1, T+3).');
  L.push('  Le risposte rapide servono nella **conversazione**, che resta tua.');
  L.push('');
  return L.join('\n') + '\n';
}

// Non scrive niente quando è importato (i test lo importano per confrontare).
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const out = renderDoc();
  const file = path.join(ROOT, DOC_PATH);
  const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const lint = WA.lint();
  lint.errors.forEach((e) => console.error('  \x1b[31m✗\x1b[0m ' + e));
  lint.warnings.forEach((w) => console.warn('  \x1b[33m!\x1b[0m ' + w));
  if (!lint.ok) { console.error('\nRisposte non valide: documento non scritto.'); process.exit(1); }

  if (process.argv.includes('--check')) {
    if (before === out) { console.log(`${DOC_PATH} allineato.`); process.exit(0); }
    console.error(`${DOC_PATH} NON allineato: lancia "node scripts/wa-export.mjs".`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, out);
  console.log(`${DOC_PATH} scritto — ${WA.REPLIES.length} risposte, ${out.length} caratteri.`);
}
