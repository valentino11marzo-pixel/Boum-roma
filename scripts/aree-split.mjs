// scripts/aree-split.mjs — sposta la storia di CLAUDE.md in docs/aree/, una
// sezione per volta, senza riscrivere nulla.
//
// Nato il 12/10/2026: CLAUDE.md era arrivato a 6.155 righe (~130.000 token)
// che ogni sessione Claude rileggeva da capo prima della prima parola. Il
// CLAUDE.md nuovo è la MAPPA; il dettaglio di ogni area vive in
// docs/aree/<area>.md e si legge solo quando si lavora su quell'area.
//
//   node scripts/aree-split.mjs <CLAUDE-completo.md> [cartella-uscita]
//
// Serve nella transizione: un ramo nato prima del 12/10 che aggiunge righe al
// vecchio CLAUDE.md si porta rigenerando docs/aree dal SUO CLAUDE.md completo
// (`git show <ramo>:CLAUDE.md > /tmp/c.md`) e confrontando il risultato.
// Due garanzie, entrambe controllate qui sotto:
//   1. ogni sezione ha un'area — una sezione nuova senza area fa FALLIRE lo
//      script invece di finire da qualche parte in silenzio;
//   2. l'unione delle uscite è il file di partenza riga per riga, salvo le
//      due righe di prosa che cominciavano con ``` (aprivano un falso blocco
//      di codice: su GitHub dieci sezioni comparivano come codice).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// L'ordine delle aree è l'ordine dell'indice in CLAUDE.md. `sezioni` sono
// inizi di titolo, confrontati con il titolo della sezione (spazi compattati).
export const AREE = [
  { file: 'infrastruttura.md', titolo: 'Infrastruttura — stack, struttura, deploy, variabili d\'ambiente, CI, guasti di classe, convenzioni',
    sezioni: ['# BOOM Roma — Project Guide', '## Tech Stack', '## File Structure', '## Key Files', '## Brand & Design', '## Deployment',
      '## Environment Variables (Vercel)', '## API Endpoints', '### GET `/api/reminder-cron`', '### Le regole IN VIGORE',
      '### La CI rossa che nessuno leggeva', '### Le tre reti del server', '### I tre guasti del 4/10/2026',
      '### Le tre letture risparmiate', '## Conventions', '## Common Tasks'] },
  { file: 'proposte.md', titolo: 'Proposte (pre-agreement) e lucchetto sull\'immobile',
    sezioni: ['### Pre-agreement suite', '### Il lucchetto sull\'immobile'] },
  { file: 'contratti.md', titolo: 'Contratti — Scheda, dizionario dei campi, modelli A/B/C, completamento e revisione',
    sezioni: ['### La Scheda (`/scheda`', '### Il Dizionario del contratto', '### Contratto studenti', '### Il terzo modello: 3+2',
      '### ✎ Completa i dati', '### 📤 La versione corretta'] },
  { file: 'firma.md', titolo: 'Firma — Magic Sign, chiavi di firma, co-firma, mandati, firma completa, email del contratto',
    sezioni: ['### Co-firma multi-conduttore', '### POST `/api/magic-sign/lookup`', '### POST `/api/magic-sign/submit`',
      '### Le chiavi di firma fuori dal contratto', '### Watchdog firme', '### La firma completa che non muore a metà',
      '### Il ciclo email del contratto', '### 🖊 Firma ora', '### Il mandato a firmare del conduttore', '### ✍️ Firmo io',
      '### 🏠 Il mandato scritto del proprietario'] },
  { file: 'pagamenti.md', titolo: 'Pagamenti — Stripe, bonifico, SEPA, cadenza delle rate, link di pagamento, canoni per unità',
    sezioni: ['### POST `/api/service-checkout`', '### Il bonifico gratuito', '### Il canone automatico SEPA', '### Rent cadence',
      '### GET/POST `/api/payments/recover-checkouts`', '### One-tap buy from an email', '### Canoni per unità e ricavi BOOM',
      '### Link di pagamento Stripe'] },
  { file: 'fiscale.md', titolo: 'Fisco e proprietari — Fascicolo Fiscale, iter ASPI, Valutazione, rendiconto, conservazione, banca',
    sezioni: ['### Il Fascicolo Fiscale', '### L\'iter ASPI', '### La Valutazione BOOM', '### Rendiconto proprietario',
      '### Conservazione', '## La Banca'] },
  { file: 'inquilino.md', titolo: 'Inquilino — /casa, journey, verbale di consegna, inventario dal video',
    sezioni: ['### Tenant lifecycle', '### Journey consapevole', '### Verbale di consegna chiavi', '### L\'inventario dal video'] },
  { file: 'lead-whatsapp.md', titolo: 'Lead e WhatsApp — ingresso dei contatti, Lead Brain, WhatsApp, richiamo, risposte rapide, Miniera',
    sezioni: ['### POST `/api/homie/inbound`', '### POST `/api/homie/action`', '### GET/POST `/api/leads/scan-inbox`',
      '### Lingua delle risposte', '### GET/POST `/api/leads/brain`', '### POST `/api/apply-lead`', '### POST `/api/search/save`',
      '### GET `/api/search/matcher`', '### POST `/api/homie/wa-outbox`', '### POST `/api/homie/message`',
      '### GET/POST `/api/leads/match-listing`', '### GET/POST `/api/leads/richiamo`', '### Le risposte rapide di WhatsApp',
      '### GET/POST `/api/homie/miniera`'] },
  { file: 'segretaria-squadra.md', titolo: 'La Squadra, la scala della fiducia e la Segretaria (Oggi)',
    sezioni: ['## La Squadra', '### L\'ORGANIGRAMMA', '### LA SCALA DELLA FIDUCIA', '### LA SEGRETARIA'] },
  { file: 'visite.md', titolo: 'Visite — ciclo visita, disponibilità, Regista, pass Wallet',
    sezioni: ['### POST `/api/generate-pass`', '### Il ciclo visita', '### Il Regista'] },
  { file: 'telefono.md', titolo: 'Telefono — il Centralino e la Receptionist',
    sezioni: ['### Il Centralino'] },
  { file: 'catalogo.md', titolo: 'Catalogo — bot Telegram (wizard), feed e Pubblicista, foto, date di disponibilità, pre-blocco, pin',
    sezioni: ['### POST `/api/wizard/publish`', '### POST `/api/wizard/describe`', '### GET/POST `/api/wizard/health`',
      '### POST `/api/wizard/interpret`', '### GET/POST `/api/wizard/video-radar`', '### POST `/api/wizard/transcribe`',
      '### POST `/api/wizard/upload`', '### GET `/api/feed/immobiliare.xml', '### Il Pubblicista', '### `/api/photos/enhance`',
      '## Le date di disponibilità', '## La corsia del pre-blocco', '## Precisione dei pin'] },
  { file: 'sito.md', titolo: 'Sito pubblico — Réunion, Executive, Meteo, SEO/GEO, foto, scorrimento, anteprime',
    sezioni: ['### BOOM La Réunion', '### BOOM Executive', '### GET `/api/meteo`', '### POST `/api/media/caption`',
      '## Le foto sono nostre', '## L\'anteprima E\' la pagina', '## La casa in ordine — SEO/GEO', '## Lo scorrimento',
      '## Il catalogo dichiara i suoi prezzi'] },
  { file: 'pfs-radar.md', titolo: 'PFS e mercato — radar PFS, occhi di Homie, Perito, Radar 2.0, Scatto e Contatto',
    sezioni: ['### GET/POST `/api/homie/searches`', '### POST `/api/homie/property`', '### POST `/api/admin/match-test`',
      '## PFS Radar', '## Il Perito', '## Il Radar 2.0', '## Lo Scatto + Il Contatto'] },
  { file: 'ai-documenti.md', titolo: 'AI e documenti — Centrale AI, Doc Parser, Innesto, Scrivano, Smistatore, Bonifica',
    sezioni: ['### POST `/api/parse-docs`', '### La Centrale AI', '### POST `/api/documents/share`', '### POST `/api/share/lookup`',
      '### POST `/api/documents/ocr`', '### Dati: LA BONIFICA + L\'INNESTO', '### POST `/api/portal/ingest`', '### LO SCRIVANO',
      '## Lo Smistatore'] },
  { file: 'portal.md', titolo: 'Portal e portali — Portal 2.0, mobile/desktop, dati aziendali, fascicolo immobile, accesso e Safari',
    sezioni: ['### Portal 2.0', '### Dati aziendali (IBAN)', '### Fascicolo operativo immobile', '## Portals (logged-in surfaces)'] },
];

const INTESTAZIONE = (titolo) => [
  `# ${titolo}`,
  '',
  '> Dettaglio e storia di quest\'area, spostati da CLAUDE.md il 12/10/2026 senza',
  '> riscrivere nulla: stesse sezioni, stesso ordine. Le novità dell\'area si',
  '> aggiungono QUI (3-8 righe nella sezione giusta: cos\'era, cosa cambia, dove',
  '> sta il test). La mappa del sistema è in `CLAUDE.md`, le priorità in `ORA.md`.',
  '',
  '',
].join('\n');

const compatta = (s) => s.replace(/\s+/g, ' ').trim();
// Un recinto di codice vero: ``` con al massimo un tag di linguaggio, nient'altro.
const RECINTO = /^\s{0,3}```[\w-]*\s*$/;

export function normalizza(testo) {
  let n = 0;
  const fuori = testo.replace(/^(\s{0,3})```json(?=[, ])/gm, (_, sp) => { n++; return `${sp}\`\` \`\`\`json \`\``; });
  return { testo: fuori, sostituzioni: n };
}

export function sezioni(testo) {
  const righe = testo.split('\n');
  const blocchi = [];
  let recinto = false;
  righe.forEach((r, i) => {
    if (RECINTO.test(r)) recinto = !recinto;
    if (!recinto && (/^#{1,3} /.test(r) || i === 0)) blocchi.push({ da: i, titolo: r });
  });
  return blocchi.map((b, k) => ({ ...b, a: k + 1 < blocchi.length ? blocchi[k + 1].da : righe.length, righe }));
}

export function dividi(testo) {
  const { testo: norm, sostituzioni } = normalizza(testo);
  const blocchi = sezioni(norm);
  const perArea = new Map(AREE.map((a) => [a.file, []]));
  const senzaArea = [], doppie = [];
  for (const b of blocchi) {
    const t = compatta(b.titolo);
    const aree = AREE.filter((a) => a.sezioni.some((p) => t.startsWith(compatta(p))));
    if (aree.length === 0) senzaArea.push(t);
    else if (aree.length > 1) doppie.push(`${t} → ${aree.map((a) => a.file).join(', ')}`);
    else perArea.get(aree[0].file).push(b);
  }
  if (senzaArea.length || doppie.length) {
    const msg = [
      senzaArea.length ? `Sezioni senza area (aggiungile in AREE):\n  ${senzaArea.join('\n  ')}` : '',
      doppie.length ? `Sezioni con più aree:\n  ${doppie.join('\n  ')}` : '',
    ].filter(Boolean).join('\n');
    throw new Error(msg);
  }
  // Garanzia 2: ogni riga finisce in esattamente un blocco.
  const totale = norm.split('\n').length;
  const coperte = blocchi.reduce((s, b) => s + (b.a - b.da), 0);
  if (coperte !== totale) throw new Error(`righe coperte ${coperte} ≠ righe del file ${totale}`);
  const uscite = AREE.map((a) => {
    const corpo = perArea.get(a.file).map((b) => b.righe.slice(b.da, b.a).join('\n')).join('\n');
    return { file: a.file, titolo: a.titolo, testo: INTESTAZIONE(a.titolo) + corpo.replace(/\n*$/, '\n'), sezioni: perArea.get(a.file).length };
  });
  return { uscite, blocchi: blocchi.length, righe: totale, sostituzioni };
}

const ingresso = process.argv[2];
if (ingresso) {
  const cartella = process.argv[3] || 'docs/aree';
  const { uscite, blocchi, righe, sostituzioni } = dividi(readFileSync(ingresso, 'utf8'));
  mkdirSync(cartella, { recursive: true });
  for (const u of uscite) writeFileSync(join(cartella, u.file), u.testo);
  console.log(`${righe} righe, ${blocchi} sezioni, ${sostituzioni} righe-recinto normalizzate → ${uscite.length} file in ${cartella}`);
  for (const u of uscite) console.log(`  ${u.file.padEnd(24)} ${String(u.sezioni).padStart(3)} sezioni  ${String(u.testo.split('\n').length).padStart(5)} righe  ~${Math.round(u.testo.length / 3.5 / 1000)}k token`);
}
