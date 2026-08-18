// scripts/wa-voce-locale.mjs — LA TUA VOCE, MISURATA.
//
//   node scripts/wa-voce-locale.mjs ~/storico.json
//
// PERCHÉ ESISTE. Il primo scanner conta cosa chiedono i CLIENTI. Serviva a
// sapere quali risposte scrivere — ma non a scriverle: le prime 14 sono uscite
// con la voce di chi le ha redatte, non con quella di chi le manda, e infatti
// all'operatore sono sembrate inutili. Questo legge l'altro lato: i messaggi
// che scrive LUI. Quattro cose, tutte impossibili da indovinare da fuori:
//
//  1. QUANTO SEI LUNGO DAVVERO. Se i tuoi messaggi stanno sui 200 caratteri,
//     una risposta rapida da 800 non è "completa": è un muro che nessuno
//     legge, ed è il primo sospetto sul perché quelle scritte non servivano.
//  2. COSA RISPONDI A CIASCUNA DOMANDA. Si accoppia ogni messaggio del cliente
//     (classificato con la STESSA grammatica del misuratore) con la tua prima
//     risposta: escono le tue frasi vere, tema per tema.
//  3. QUALI MESSAGGI RIPETI. Le tue risposte rapide di fatto già esistono —
//     le riscrivi a mano ogni volta. Qui si vedono, con quante volte.
//  4. COME VENDI OGGI. Quante volte nomini ciascun servizio e a che prezzo:
//     se non lo nomini mai, l'upsell non è "da migliorare", è da introdurre.
//
// Tutto locale, nessuna rete, nessun modello. Gli esempi passano da scrub():
// il rapporto si incolla in chat e non deve portarsi dietro i clienti.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { readInput, bodyOf, isOut, chatOf, tsOf, scrub } from './_wacli.mjs';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const WAD = require(path.join(HERE, '..', 'js', 'wa-demand-engine.js'));

const DAYS = Number(process.env.GIORNI || 180);
const D = 24 * 3600 * 1000;
const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim();

/* ── i servizi, come li nomina un umano di corsa ───────────────────────── */
const SERVIZI = [
  { key: 'property finding', re: /\b(property finding|ricerca (personalizzata|casa per)|€ ?350|350 ?€)\b/i },
  { key: 'virtual viewing',  re: /\b(virtual viewing|visita video|video (tour|viewing)|€ ?89|89 ?€)\b/i },
  { key: 'deal assistance',  re: /\b(deal assistance|revisione (del )?contratto|contract review|€ ?249|249 ?€)\b/i },
  { key: 'contract check',   re: /\b(contract check|controllo (del )?contratto|€ ?49|49 ?€)\b/i },
  { key: 'remote move pack', re: /\b(remote move|pacchetto (a )?distanza|€ ?299|299 ?€)\b/i },
  { key: 'deposit recovery', re: /\b(deposit recovery|recupero (del )?deposito|art\.? ?1590|€ ?99|99 ?€)\b/i },
  { key: 'concierge',        re: /\b(concierge|codice fiscale|utenze|residenza|sim card)\b/i },
  { key: 'canone concordato',re: /\b(canone concordato|cedolare|€ ?349|349 ?€)\b/i },
  { key: 'referral',         re: /\b(referral|porta un amico|€ ?50 (a te|each)|refer)\b/i },
  { key: 'link del sito',    re: /boomrome\.com/i },
];

/* ── lettura ───────────────────────────────────────────────────────────── */
let msgs;
try { msgs = readInput(); }
catch (e) { console.error('ERRORE: ' + e.message); process.exit(1); }

const now = Date.now();
const chats = new Map();
for (const m of msgs) {
  const chat = chatOf(m);
  if (!chat || /@g\.us|@broadcast|status@/i.test(chat)) continue;
  const ts = tsOf(m);
  if (ts && now - ts > DAYS * D) continue;
  const body = clean(bodyOf(m));
  if (!body) continue;
  if (!chats.has(chat)) chats.set(chat, []);
  chats.get(chat).push({ ts, out: isOut(m), body });
}
for (const arr of chats.values()) arr.sort((a, b) => a.ts - b.ts);

const mine = [];
const pairs = [];                       // { intent, domanda, risposta }
for (const arr of chats.values()) {
  for (let i = 0; i < arr.length; i++) {
    const m = arr[i];
    if (m.out) { mine.push(m); continue; }
    if (WAD.isNoise(m.body)) continue;
    const keys = WAD.classify(m.body);
    if (!keys.length) continue;
    const reply = arr.slice(i + 1).find((x) => x.out && (!x.ts || !m.ts || x.ts - m.ts < D));
    if (!reply || WAD.isNoise(reply.body)) continue;
    keys.forEach((k) => pairs.push({ intent: k, domanda: m.body, risposta: reply.body }));
  }
}

if (!mine.length) {
  console.error('ERRORE: non ho trovato nessun messaggio TUO (in uscita) in questo export.');
  console.error('Serve un campo tipo FromMe/fromMe/direction sui messaggi: controlla il primo record.');
  process.exit(1);
}

/* ── 1. come scrivi ────────────────────────────────────────────────────── */
const vere = mine.filter((m) => !WAD.isNoise(m.body));
const lens = vere.map((m) => m.body.length).sort((a, b) => a - b);
const pct = (p) => lens[Math.min(lens.length - 1, Math.floor(lens.length * p))] || 0;
const conLink = vere.filter((m) => /https?:\/\//.test(m.body)).length;
const conEmoji = vere.filter((m) => /[\u{1F300}-\u{1FAFF}☀-➿]/u.test(m.body)).length;

/* ── 2. le tue frasi, tema per tema ────────────────────────────────────── */
const perIntent = new Map();
for (const p of pairs) {
  if (!perIntent.has(p.intent)) perIntent.set(p.intent, []);
  perIntent.get(p.intent).push(p.risposta);
}

/* ── 3. i messaggi che ripeti (le tue risposte rapide di fatto) ─────────
 * NON per firma esatta: due messaggi identici tranne il mese o la zona
 * ("libero da settembre" / "da ottobre") sono lo STESSO messaggio riscritto,
 * ed è esattamente ciò che si vuole scoprire. Quindi somiglianza vera
 * (parole in comune ≥60%), che i pezzi variabili non la spostano. */
const parole = (t) => new Set(clean(t).toLowerCase()
  .replace(/https?:\/\/\S+/g, ' ').replace(/[\d€.,;:!?()"'’-]/g, ' ')
  .split(/\s+/).filter((w) => w.length > 2));
function simile(a, b) {
  let comuni = 0;
  for (const w of a) if (b.has(w)) comuni++;
  return comuni / Math.max(1, Math.min(a.size, b.size));
}
const gruppi = [];
for (const m of vere.filter((x) => x.body.length >= 40).sort((a, b) => b.body.length - a.body.length)) {
  const set = parole(m.body);
  if (set.size < 5) continue;
  const g = gruppi.find((x) => Math.abs(x.set.size - set.size) <= x.set.size * 0.6 && simile(x.set, set) >= 0.6);
  if (g) { g.volte++; continue; }
  gruppi.push({ set, volte: 1, esempio: m.body });
}
const ripetuti = gruppi.filter((g) => g.volte >= 2).sort((a, b) => b.volte - a.volte);

/* ── 4. come vendi oggi ────────────────────────────────────────────────── */
const vendite = SERVIZI.map((s) => ({
  key: s.key,
  volte: vere.filter((m) => s.re.test(m.body)).length,
})).sort((a, b) => b.volte - a.volte);

/* ── rapporto ──────────────────────────────────────────────────────────── */
const CORTO = !!process.env.CORTO;

if (CORTO) {
  const C = [];
  C.push('=== LA TUA VOCE (estratto) ===');
  C.push(`${chats.size} conversazioni · ${mine.length} tuoi messaggi · ultimi ${DAYS} giorni`);
  C.push(`LUNGHEZZA: metà sotto ${pct(0.5)} car · 3 su 4 sotto ${pct(0.75)} · max ${lens[lens.length - 1]} · link nel ${Math.round((conLink / vere.length) * 100)}%`);
  C.push('RIPETUTI:');
  if (!ripetuti.length) C.push('  (nessuno: riscrivi ogni volta da zero)');
  ripetuti.slice(0, 6).forEach((r, n) => C.push(`  ${n + 1}) ${r.volte}× ${scrub(r.esempio).slice(0, 130)}`));
  C.push('VENDI: ' + vendite.filter((v) => v.volte > 0).map((v) => `${v.key} ${v.volte}`).join(' · ')
    + (vendite.every((v) => !v.volte) ? 'mai nominato nessun servizio' : ''));
  C.push('MAI NOMINATI: ' + (vendite.filter((v) => !v.volte).map((v) => v.key).join(', ') || 'nessuno'));
  C.push('TUE RISPOSTE TIPO:');
  [...perIntent.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 5).forEach(([k, v]) => {
    const it = WAD.INTENTS.find((x) => x.key === k);
    C.push(`  [${it ? it.label : k}] ${scrub(v[0]).slice(0, 120)}`);
  });
  console.log(C.join('\n'));
  process.exit(0);
}

const L = [];
L.push('=== LA TUA VOCE — misura locale ===');
L.push(`finestra: ultimi ${DAYS} giorni · conversazioni: ${chats.size} · tuoi messaggi: ${mine.length}`);
L.push('');
L.push('1) COME SCRIVI');
L.push(`   lunghezza dei tuoi messaggi: metà sotto ${pct(0.5)} caratteri · 3 su 4 sotto ${pct(0.75)} · 9 su 10 sotto ${pct(0.9)}`);
L.push(`   il più lungo che mandi: ${lens[lens.length - 1]} caratteri`);
L.push(`   con un link: ${Math.round((conLink / vere.length) * 100)}% · con emoji: ${Math.round((conEmoji / vere.length) * 100)}%`);
L.push('');
L.push('2) COSA RISPONDI, TEMA PER TEMA (le tue frasi vere)');
[...perIntent.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 12).forEach(([k, v]) => {
  const it = WAD.INTENTS.find((x) => x.key === k);
  L.push(`   [${it ? it.label : k}] — ${v.length} volte`);
  v.sort((a, b) => b.length - a.length).slice(0, 2).forEach((t) => L.push('     · ' + scrub(t).slice(0, 220)));
});
L.push('');
L.push('3) I MESSAGGI CHE RIPETI (le tue risposte rapide, riscritte a mano ogni volta)');
if (!ripetuti.length) L.push('   nessuno ricorrente: scrivi ogni volta da zero.');
ripetuti.slice(0, 15).forEach((r, n) => {
  L.push(`   ${n + 1}. ${r.volte}× — ${scrub(r.esempio).slice(0, 220)}`);
});
L.push('');
L.push('4) COME VENDI OGGI (quante volte lo nomini)');
vendite.forEach((v) => L.push(`   ${String(v.volte).padStart(4)} × ${v.key}`));
L.push('');
L.push('--- JSON ---');
L.push(JSON.stringify({
  finestraGiorni: DAYS, conversazioni: chats.size, tuoiMessaggi: mine.length,
  lunghezza: { p50: pct(0.5), p75: pct(0.75), p90: pct(0.9), max: lens[lens.length - 1] },
  conLinkPct: Math.round((conLink / vere.length) * 100),
  perTema: [...perIntent.entries()].map(([k, v]) => ({
    intent: k, volte: v.length,
    esempi: v.slice(0, 2).map((t) => scrub(t).slice(0, 200)),
  })),
  ripetuti: ripetuti.slice(0, 15).map((r) => ({ volte: r.volte, esempio: scrub(r.esempio).slice(0, 200) })),
  vendite,
}, null, 1));
console.log(L.join('\n'));
