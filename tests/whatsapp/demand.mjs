// tests/whatsapp/demand.mjs
// IL MISURATORE DELLA DOMANDA: prima di installare 48 risposte a mano, si
// misura quali servono. Ma una misura che sbaglia in silenzio è peggio di
// nessuna misura — decide dove spendi il tempo, e nessuno la ricontrolla.
//
//   node tests/whatsapp/demand.mjs
//
// LA GUARDIA PRINCIPALE (regola 1): ogni intenzione deve dimostrare di
// matchare almeno una frase vera. Nasce da due difetti REALI di questo file,
// trovati provandolo invece che leggendolo:
//   · `\b` in coda a una radice tronca (`residenz`, `disponibil`) non matcha
//     MAI — pretende un confine dove segue una lettera;
//   · `\\b` scritto in un pattern è un backslash letterale, non un confine:
//     il pattern diventa inerte.
// Entrambi sotto-contano in SILENZIO: il rapporto esce, sembra sano, e dice
// che nessuno chiede della residenza. Questa guardia li prende entrambi.

import WAD from '../../js/wa-demand-engine.js';
import WA from '../../js/whatsapp-replies.js';
import fs from 'node:fs';

let pass = 0, fail = 0;
const ok = (c, label, extra) => {
  if (c) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${label}`); }
  else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${label}${extra ? '\n      ' + extra : ''}`); }
};
const has = (arr, k) => arr.indexOf(k) >= 0;

// ---------------------------------------------------------------------------
console.log('\n\x1b[1m1. Ogni intenzione sa riconoscere una frase vera\x1b[0m');
const POSITIVES = {
  disponibilita:  'Hi, is this flat still available from September?',
  prezzo_totale:  'Quanto costa in tutto al mese, spese incluse?',
  commissione:    'Is there an agency fee? quanto prendete di commissione?',
  deposito:       'Quante mensilità di deposito servono?',
  visita:         'Vorrei visitare l appartamento, quando posso vederlo?',
  video_foto:     'Potete mandarmi altre foto o un video dell appartamento?',
  documenti:      'What documents do you need? I can provide payslips',
  contratto:      'Che tipo di contratto è? transitorio? quanti mesi minimo?',
  residenza:      'Posso prendere la residenza in questo appartamento?',
  burocrazia:     'I do not have a codice fiscale yet, and I need a bank account',
  zona_distanza:  'Quanto dista dalla Sapienza a piedi? c è la metro vicino?',
  arredo_servizi: 'È arredato? c è la lavatrice e l aria condizionata?',
  chi_abita:      'Saremmo in due, io e la mia ragazza, con un gatto',
  trattativa:     'Il prezzo è trattabile? è un po fuori budget',
  fiducia:        'Come faccio a sapere che non è una truffa? siete una vera agenzia?',
  pagamento:      'Come si paga il canone? bonifico o carta?',
  guasto:         'La caldaia non funziona, non c è acqua calda',
  uscita:         'Devo dare la disdetta, quando riavrò il deposito?',
  rinnovo:        'Vorrei rinnovare il contratto e restare un altro anno',
  prop_gestione:  'Ho un trilocale a Prati, sono il proprietario: come lavorate?',
  prop_canone:    'Quanto posso chiedere di affitto per il mio appartamento?',
  b2b:            'We are a company relocating our staff to Rome, invoice to the company',
};
for (const it of WAD.INTENTS) {
  const sample = POSITIVES[it.key];
  ok(!!sample, `${it.key}: ha una frase di prova`, 'ogni intenzione nuova va aggiunta a POSITIVES');
  if (sample) ok(has(WAD.classify(sample), it.key), `${it.key}: la riconosce`,
    `"${sample}" → [${WAD.classify(sample)}] — pattern inerte o troppo stretto`);
}

// ---------------------------------------------------------------------------
console.log('\n\x1b[1m2. Quello che NON deve riconoscere\x1b[0m');
// Un falso positivo qui non fa rumore: gonfia un conteggio e ti fa installare
// la risposta sbagliata per prima.
ok(!has(WAD.classify('We are relocating our business staff'), 'zona_distanza'),
  '"business" non diventa una domanda sui trasporti (bus)');
ok(!has(WAD.classify('the two flats are separate'), 'pagamento'),
  '"separate" non diventa un addebito SEPA');
ok(!has(WAD.classify('Ho già pagato il canone ieri'), 'pagamento'),
  'chi dice di AVER pagato non sta chiedendo come si paga');
ok(WAD.classify('ok grazie').length === 0, '"ok grazie" non è una domanda');
ok(WAD.classify('👍').length === 0, 'un pollice non è una domanda');
ok(WAD.isNoise('  Perfetto, grazie mille!  '), 'il rumore è riconosciuto come tale');
const multi = WAD.classify('È ancora libero? e quanto costa tutto incluso?');
ok(has(multi, 'disponibilita') && has(multi, 'prezzo_totale'),
  'un messaggio che chiede due cose ne conta due');

// ---------------------------------------------------------------------------
console.log('\n\x1b[1m3. Si ordina per TEMPO RISPARMIATO, non per frequenza\x1b[0m');
// La regola che rende utile la classifica: una domanda che arriva spesso e si
// liquida in dieci secondi vale meno di una rara che ogni volta costa minuti.
const corpus = [];
for (let i = 0; i < 30; i++) corpus.push({ id: 'a' + i, text: 'È ancora libero?', at: Date.now() });
for (let i = 0; i < 10; i++) corpus.push({ id: 'b' + i, text: 'Che documenti servono? avete bisogno del garante?', at: Date.now() });
const m = WAD.measure(corpus, {
  minSample: 5,
  costOf: (covers) => (has(covers, 'endocs') ? 4 : 0.2),   // documenti costa 4 minuti, disponibilità 12 secondi
});
ok(m.intents[0].key === 'documenti',
  'la domanda cara batte quella frequente', `primo: ${m.intents[0].key}`);
ok(m.intents.find(i => i.key === 'disponibilita').count === 30,
  'i conteggi restano quelli veri (30 volte)');
ok(m.intents[0].minutesSaved === 40, 'il tempo risparmiato è contato (10 × 4 min)');

// una conversazione che ripete lo stesso tema conta UNA volta: è una risposta
// che avresti mandato una volta sola.
const rip = WAD.measure([{ id: 'x', text: 'il deposito? quanto è il deposito? deposito due mesi?', at: Date.now() }],
  { minSample: 1, costOf: () => 1 });
ok(rip.intents.find(i => i.key === 'deposito').count === 1,
  'tre volte "deposito" nella stessa chat = una conversazione');

// ---------------------------------------------------------------------------
console.log('\n\x1b[1m4. Sotto campione: i conteggi sì, le percentuali no\x1b[0m');
const thin = WAD.measure([{ id: '1', text: 'quanto costa in tutto?', at: Date.now() }],
  { minSample: 30, costOf: () => 1 });
ok(thin.sufficient === false, 'dichiara il campione insufficiente');
ok(thin.intents[0].share === null, 'nessuna percentuale su un caso solo');
ok(thin.intents[0].count === 1, 'il conteggio però resta, ed è un fatto');
ok(thin.totals.coverage === null, 'nemmeno la copertura si dichiara in percentuale');
ok(/campione/i.test(WAD.tgSummary(thin)), 'e il messaggio Telegram lo DICE');

// ---------------------------------------------------------------------------
console.log('\n\x1b[1m5. Le buche e l\'ignoto\x1b[0m');
const gapCorpus = [
  { id: 'g1', text: 'Posso prendere la residenza?', at: Date.now() },
  { id: 'g2', text: 'posso venire col cane?', at: Date.now() },
  { id: 'u1', text: 'Il portone ha il custode di notte? e il garage è compreso?', at: Date.now() },
];
// Il meccanismo si prova per MUTAZIONE: si scopre un'intenzione e deve
// comparire fra le buche. Legarlo a quali buche esistono OGGI renderebbe il
// test una fotografia — verde finché non scriviamo la risposta, rotto il
// giorno in cui la scriviamo, cioè esattamente al contrario.
const resIntent = WAD.INTENTS.find(i => i.key === 'residenza');
const realCovers = resIntent.covers;
resIntent.covers = [];
const g = WAD.measure(gapCorpus, { minSample: 1, costOf: () => 1, defaultMinutes: 3 });
resIntent.covers = realCovers;
ok(g.gaps.some(x => x.key === 'residenza'),
  'un\'intenzione scoperta finisce fra le buche (verificato per mutazione)');
ok(g.gaps.every(x => x.covers.length === 0),
  'nelle buche sta SOLO ciò che nessuna scorciatoia copre');
// E l'invariante vero, quello che si vuole tenere: le domande che i clienti
// fanno DAVVERO hanno tutte una risposta. Se domani aggiungiamo un'intenzione
// senza scriverne il testo, questo test lo dice subito.
const scoperte = WAD.INTENTS.filter(i => !i.covers.length).map(i => i.key);
ok(scoperte.length === 0,
  'nessuna intenzione misurata resta senza una risposta pronta',
  'scoperte: ' + scoperte.join(', '));
ok(g.unmatchedSamples.length >= 1 && /custode|garage/i.test(g.unmatchedSamples[0].text),
  'ciò che il motore non sa nominare esce con le parole vere',
  'una classificazione silenziosa è indistinguibile da un difetto');
ok(g.totals.unmatched >= 1, 'e viene contato, non fatto sparire');

// ---------------------------------------------------------------------------
console.log('\n\x1b[1m6. I corpus: solo le parole del CLIENTE\x1b[0m');
const threads = [{
  row: { chatId: '39333@c.us', firstInText: 'Ciao, è libero a settembre?', inSample: 'quanto costa?', lastInText: '', lastTs: Date.now() },
  role: 'lead', contract: false, viewing: true,
}];
const fromT = WAD.corpusFromThreads(threads);
ok(fromT.length === 1 && /libero a settembre/.test(fromT[0].text), 'i thread danno il testo in ingresso');
ok(fromT[0].converted === true, 'e portano con sé l\'esito (visita/contratto)');
ok(!/lastOutText/.test(JSON.stringify(fromT)), 'le NOSTRE uscite non entrano nel testo misurato');
const fromA = WAD.corpusFromActions([{ id: 'a1', payload: { message: 'Ciao, quanto costa? te lo dico io' } }]);
ok(fromA[0].source === 'nostra-uscita', 'le bozze approvate stanno in un corpus separato ed etichettato');
const wired = fs.readFileSync(new URL('../../api/homie/miniera.js', import.meta.url), 'utf8');
const iMeasure = wired.indexOf('WADEMAND.measure(');
const iActions = wired.indexOf('corpusFromActions');
ok(iMeasure > 0, 'lo studio della Miniera chiama davvero il misuratore');
ok(iActions < 0 || wired.slice(iMeasure - 400, iMeasure).indexOf('corpusFromActions') < 0,
  'e non gli passa mai le nostre uscite come se fossero domande dei clienti');

// ---------------------------------------------------------------------------
console.log('\n\x1b[1m7. La mappa punta a risposte che esistono\x1b[0m');
const shortcuts = new Set(WA.REPLIES.map(r => r.sc));
for (const it of WAD.INTENTS) {
  for (const sc of it.covers) {
    ok(shortcuts.has(sc), `${it.key} → /${sc} esiste`,
      'una scorciatoia rinominata lascerebbe la mappa a puntare nel vuoto');
  }
}
const first = WAD.firstRow(m, 5);
ok(first.length > 0 && first.every(sc => shortcuts.has(sc)),
  'la prima fila suggerita è fatta di scorciatoie vere');

// ---------------------------------------------------------------------------
// Il giro VERO lato Mac: si guida lo script come lo lancerà Homie, su un
// export wacli finto. Conta perché il suo output si INCOLLA in chat: se si
// portasse dietro i recapiti dei clienti, il difetto sarebbe già uscito di
// casa quando te ne accorgi.
console.log('\n\x1b[1m8. Il misuratore locale (quello che lancia Homie)\x1b[0m');
{
  const os = await import('node:os');
  const { execFileSync } = await import('node:child_process');
  const path = await import('node:path');
  const t = Math.floor(Date.now() / 1000) - 3600;
  // I NOMI VERI dei campi di wacli (visti sul Mac, 2026-08): PascalCase, e il
  // testo a volte solo in DisplayText. Il dizionario camelCase della prima
  // versione trovava la lista e non riconosceva un solo campo.
  const msgs = [
    { ChatJID: '39331@s.whatsapp.net', Timestamp: t, FromMe: false, Text: 'È ancora libero? quanto costa tutto incluso?' },
    { ChatJID: '39332@s.whatsapp.net', Timestamp: t, FromMe: false, Text: 'Posso prendere la residenza? scrivimi a mario.rossi@gmail.com o +39 333 1234567' },
    { ChatJID: '39334@s.whatsapp.net', Timestamp: t, FromMe: false, Text: '', DisplayText: 'Che documenti servono?' },
    { ChatJID: '120363@g.us', Timestamp: t, FromMe: false, Text: 'gruppo: quanto costa il deposito?' },
    { ChatJID: '39333@s.whatsapp.net', Timestamp: t, FromMe: true, Text: 'te lo dico io quanto costa il deposito' },
  ];
  // LA FORMA VERA di wacli, vista sul Mac in produzione (2026-08): i messaggi
  // NON stanno al primo livello ma dentro data.messages. La prima versione del
  // lettore si fermava con un errore e scaricava sull'operatore un lavoro che
  // è del codice — qui la forma resta pinnata.
  const f = path.join(os.tmpdir(), 'boom-wa-domanda-test.json');
  fs.writeFileSync(f, JSON.stringify({ success: true, data: { fts: true, messages: msgs } }));
  const out = execFileSync(process.execPath,
    [new URL('../../scripts/wa-domanda-locale.mjs', import.meta.url).pathname, f],
    { encoding: 'utf8' });
  ok(/conversazioni lette: 3/.test(out),
    'legge i campi PascalCase di wacli; gruppo e nostra uscita restano fuori',
    'un gruppo o una nostra frase dentro la misura la falsano da sole');
  ok(/documenti/i.test(out), 'un messaggio col testo solo in DisplayText non si perde');
  ok(!/mario\.rossi@gmail\.com/.test(out) && !/333 1234567/.test(out),
    'il rapporto NON contiene email né telefoni dei clienti');
  ok(/\[email\]/.test(out) && /\[telefono\]/.test(out), 'i recapiti sono sostituiti, non tagliati via muti');
  ok(/\/enprice|\/enhomes|\/endocs/.test(out),
    'accanto a ogni domanda stampa la scorciatoia che le risponde');
  const json = out.slice(out.indexOf('{', out.indexOf('--- JSON')));
  let parsed = null;
  try { parsed = JSON.parse(json); } catch (e) { /* resta null */ }
  ok(parsed && Array.isArray(parsed.classifica), 'in coda c\'è un JSON valido, incollabile così com\'è');
  // e le altre forme che wacli può usare a seconda della versione
  const alt = path.join(os.tmpdir(), 'boom-wa-domanda-baileys.json');
  fs.writeFileSync(alt, JSON.stringify({ data: { messages: [
    { key: { remoteJid: '39331@c.us', fromMe: false }, message: { conversation: 'quanto costa tutto incluso?' }, timestamp: t },
    { key: { remoteJid: '39331@c.us', fromMe: true }, message: { conversation: 'te lo dico io' }, timestamp: t },
  ] } }));
  const outAlt = execFileSync(process.execPath,
    [new URL('../../scripts/wa-domanda-locale.mjs', import.meta.url).pathname, alt], { encoding: 'utf8' });
  ok(/conversazioni lette: 1/.test(outAlt), 'legge anche la forma key.remoteJid / message.conversation');
  fs.unlinkSync(alt);

  // Una forma che NON riconosce deve insegnare, non lasciare indovinare: nei
  // nomi dei campi c'è tutto ciò che serve per aggiustarla in un giro solo.
  const bad = path.join(os.tmpdir(), 'boom-wa-domanda-ignota.json');
  fs.writeFileSync(bad, JSON.stringify({ data: { messages: [{ weirdText: 'ciao', weirdChat: 'x@c.us' }] } }));
  let err = '';
  try { execFileSync(process.execPath,
    [new URL('../../scripts/wa-domanda-locale.mjs', import.meta.url).pathname, bad],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { err = String(e.stderr || ''); }
  ok(/weirdText/.test(err) && /weirdChat/.test(err),
    'una forma sconosciuta stampa i nomi VERI dei campi trovati',
    'senza, il giro dopo è un altro tentativo alla cieca');
  fs.unlinkSync(bad);

  fs.unlinkSync(f);
}

console.log('\n────────────────────────────────────────────────');
console.log(`\x1b[1mResult: ${pass} passed, ${fail} failed\x1b[0m`);
if (fail) process.exit(1);
console.log('\x1b[32mLa misura non sotto-conta in silenzio, non gonfia, e dice quando non sa.\x1b[0m');
