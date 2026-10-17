// tests/faq/run.mjs — suite `faqtruth`
// LA FAQ DICE SOLO IL VERO, e porta al prodotto di cui parla.
//
// /faq e' il blocco piu' citato del sito: 38 domande dichiarate in un
// FAQPage che i motori di risposta ripetono parola per parola. Il reperto
// (ottobre 2026): la pagina prometteva supporto «24/7» e risposte «under 2
// minutes», contava «500+ tenants» e un «98% success rate» mai misurati
// (e un crawler senza JS leggeva «0 Tenants placed 0 % Success rate»),
// vendeva Deal Assistance a €250 (il catalogo dice €249), Property Finding
// con «5+ options within 10 days» (le Condizioni §4.2 dicono almeno 3 entro
// 15 giorni), un preavviso di uscita di «30 days» (i modelli di contratto
// dicono tre mesi, sei sul 3+2), una «lawyer contract review» da un'agenzia
// che non e' uno studio legale, PayPal mai integrato, e un link di nav a
// /pfs che risponde 404.
//
// Questa suite legge faq.html — il testo visibile E i JSON-LD — e pretende:
// niente di quella lista, i prezzi del catalogo vero, i preavvisi dei
// modelli veri, il FAQPage rigenerato dalle card (lo stesso script, in una
// copia isolata: niente scritto nel repo), e l'#organization con la
// ragione sociale vera.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const R = path.resolve(new URL('../..', import.meta.url).pathname);
let ok = 0, ko = 0;
const bene = (t) => { ok++; console.log('  \x1b[32m✓\x1b[0m ' + t); };
const male = (t) => { ko++; console.log('  \x1b[31m✗\x1b[0m ' + t); };
const check = (cond, t, why = '') => (cond ? bene(t) : male(t + (why ? '\n      ' + why : '')));

console.log('\n\x1b[1m▸ faqtruth\x1b[0m  /faq dice solo cio\' che codice, Condizioni e catalogo sostengono');

const html = fs.readFileSync(path.join(R, 'faq.html'), 'utf8');
const decode = (t) => t
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#39;|&rsquo;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const visible = decode(html
  .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<[^>]+>/g, ' '))
  .replace(/\s+/g, ' ');

const ld = [];
for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>\s*([\s\S]*?)\s*<\/script>/g)) {
  try { ld.push(JSON.parse(m[1])); } catch (e) { ld.push({ __bad: String(e.message).slice(0, 80) }); }
}
const nodes = ld.flatMap((d) => d['@graph'] || [d]);
const ldText = JSON.stringify(ld);

// ── 1 · i JSON-LD sono JSON ────────────────────────────────────────────
const rotti = ld.filter((d) => d.__bad);
check(ld.length > 0 && !rotti.length, `${ld.length} blocchi JSON-LD, tutti JSON validi`,
  rotti.map((d) => d.__bad).join(' | '));

// ── 2 · niente di quello che la pagina non puo' dimostrare ─────────────
const VIETATE = [
  [/500\+/, '«500+» (inquilini mai contati)'],
  [/24\/7/, '«24/7» (supporto in orario d\'ufficio)'],
  [/under 2 minutes|Min response/i, 'tempo di risposta in minuti'],
  [/€250\b/, '€250 (Deal Assistance costa €249)'],
  [/5\+ curated|within 10 days/i, 'PFS «5+ in 10 giorni» (Condizioni §4.2: almeno 3 entro 15)'],
  [/PayPal/i, 'PayPal (mai integrato)'],
  [/Lawyer contract/i, '«lawyer contract review» (agenzia, non studio legale)'],
  [/30 days(’|')? (written )?notice/i, 'preavviso di 30 giorni (i modelli dicono 3 mesi, 6 sul 3+2)'],
  [/whichever is lower/i, 'la vecchia regola provvigione «whichever is lower»'],
  [/verified reviews/i, '«verified reviews»'],
  [/95% approval|Over 40%|70% of international|€80\/month|Average savings|fully insured/i, 'statistica mai misurata / assicurazione mai stipulata'],
  [/€150\/doc|€60\/mo/, 'prezzi concierge che il menu non ha'],
  [/in English and Italian/i, '«contratti in inglese e italiano» (il modello e\' italiano, spiegato in inglese)'],
  [/same working day/i, 'promessa «same working day» (mai esistita su questa pagina)'],
  [/Tenants placed|Success rate/i, 'il vecchio contatore della striscia'],
  [/check each match before/i, '«we check each match» (il punteggio spinge da solo nel mazzo, api/pfs/_ingest.js)'],
  [/verified tenant pool|roommates from our/i, 'un servizio di abbinamento coinquilini che non esiste'],
  [/3× rent/, 'la regola «reddito 3× il canone» (il modulo vero accetta garante o mesi anticipati)'],
  [/student lease at most 36/i, 'lo studenti presentato come scadenza secca (art. 1 del modello C: si rinnova da solo)'],
  [/(?:reply|replies|response|respond)[^.]{0,30}\b(?:within|under|in)\s+\d+\s*(?:h|hrs?|hours?|min|minutes?)\b/i, 'tempo di risposta numerico (decisione del fondatore: nessuno)'],
  [/\b\d+\s*(?:h|hours?|minutes?)\b[^.]{0,12}\b(?:reply|replies|response)\b/i, 'tempo di risposta numerico nella striscia'],
];
for (const [re, cosa] of VIETATE) {
  const v = visible.match(re), j = ldText.match(re);
  check(!v && !j, `assente: ${cosa}`,
    [v && `testo visibile: «…${visible.slice(Math.max(0, v.index - 40), v.index + 60)}…»`,
     j && `JSON-LD: «…${ldText.slice(Math.max(0, j.index - 40), j.index + 60)}…»`].filter(Boolean).join('\n      '));
}
check(!/AggregateRating|"@type":\s*"Review"/.test(ldText), 'nessuno schema AggregateRating/Review');

// ── 3 · i link: niente apex, niente /pfs (404) ─────────────────────────
const hrefs = [...html.matchAll(/\shref="([^"]*)"/g)].map((m) => m[1]);
const apex = hrefs.filter((h) => /^https?:\/\/boomrome\.com(?:[/?#]|$)/i.test(h));
check(!apex.length, 'nessun href verso l\'apex https://boomrome.com (redirect evitabile)', apex.join(' · '));
const pfs = hrefs.filter((h) => /^(?:https?:\/\/(?:www\.)?boomrome\.com)?\/pfs(?:[/?#]|$)/i.test(h));
check(!pfs.length, 'nessun href a /pfs (risponde 404)', pfs.join(' · '));
for (const need of ['/property-finding', '/virtual-viewing', '/contract-check-express', '/concierge']) {
  check(hrefs.some((h) => h === need || h.startsWith(need + '#') || h.startsWith(need + '?')),
    `c'e' un link a ${need}`);
}
for (const f of ['property-finding', 'virtual-viewing', 'contract-check-express', 'concierge', 'deal-assistance',
                 'deposit-recovery', 'remote-move-pack', 'book', 'services', 'blog', 'privacy', 'terms', 'apartments']) {
  if (!hrefs.includes('/' + f)) continue;
  check(fs.existsSync(path.join(R, f + '.html')), `/${f} esiste come pagina (${f}.html)`);
}
const fab = html.match(/<a class="wa-fab"[^>]*>/);
check(!!fab && /aria-label="Message BOOM on WhatsApp"/.test(fab[0]), 'il bottone WhatsApp flottante ha un nome accessibile');

// ── 4 · le frasi che devono esserci ────────────────────────────────────
for (const need of ['€249', '22% VAT', "3 months' notice"]) {
  check(visible.includes(need), `il testo visibile dice «${need}»`);
}

// ── 5 · la striscia e' statica: nessun contatore da 0 ───────────────────
check(!/\sdata-target\s*=/.test(html), 'nessun elemento con data-target (il crawler senza JS leggeva «0»)');
check(!/animateTrust|TRUST COUNTER/.test(html), 'lo script del contatore non c\'e\' piu\'');
check(/AdE<\/div><div class="trust-label">Registered leases/.test(html) && /4\.9★/.test(html),
  'la striscia porta fatti statici (4.9★ · AdE · 48h · EN)');

// ── 6 · i prezzi sono quelli del catalogo ──────────────────────────────
const { CATALOG } = await import(pathToFileURL(path.join(R, 'api/_catalog.js')).href);
const NOMI = {
  'Virtual Viewing': 'virtual-viewing',
  'Deal Assistance': 'deal-assistance',
  'Contract Check Express': 'contract-check-express',
  'Move-in Pack': 'movein-pack',
  'Cleaning Premium': 'cleaning-premium',
  'Deposit Recovery': 'deposit-recovery',
  'Remote Move Pack': 'remote-move-pack',
};
const faqLd = nodes.find((n) => n['@type'] === 'FAQPage');
const testi = [['testo visibile', visible],
  ['FAQPage', (faqLd?.mainEntity || []).map((q) => q.name + ' ' + q.acceptedAnswer?.text).join(' ')]];
for (const [nome, k] of Object.entries(NOMI)) {
  const eur = CATALOG[k]?.eur;
  const visti = [], sbagliati = [];
  for (const [dove, t] of testi) {
    for (const m of t.matchAll(new RegExp(nome.replace(/[-]/g, '\\-'), 'g'))) {
      // la finestra: dopo il nome, fino alla fine della frase o 45 caratteri
      let w = t.slice(m.index + nome.length, m.index + nome.length + 45);
      const fine = w.search(/[.!?](?:\s|$)/);
      if (fine >= 0) w = w.slice(0, fine);
      const p = w.match(/€\s?([\d.,]+)/);
      if (!p) continue;
      const n = Number(p[1].replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.'));
      (n === eur ? visti : sbagliati).push(`${dove}: «${nome}${w}»`);
    }
  }
  if (sbagliati.length) male(`${nome}: prezzo diverso dal catalogo (€${eur})\n      ${sbagliati.join('\n      ')}`);
  else if (visti.length) bene(`${nome} costa €${eur} come nel catalogo (${visti.length} menzioni col prezzo)`);
}
// le card dei servizi: ogni cifra in euro e' uno dei prezzi del catalogo
const carta = (id) => (html.match(new RegExp(`id="${id}"[\\s\\S]*?<\\/div><\\/div><\\/div>`)) || [''])[0];
for (const [id, ks] of [['q-deal-assist', ['deal-assistance', 'contract-check-express']],
                        ['q-virtual-view', ['virtual-viewing']],
                        ['q-concierge', ['movein-pack', 'cleaning-premium']]]) {
  const cifre = [...carta(id).matchAll(/€\s?(\d+)/g)].map((m) => Number(m[1]));
  const ammessi = new Set([...ks.map((k) => CATALOG[k].eur), 15, 40, 120, 200, 390]); // + menu concierge.html
  const fuori = cifre.filter((n) => !ammessi.has(n));
  check(cifre.length && !fuori.length, `#${id}: ogni cifra in euro e' un prezzo vero (${cifre.map((n) => '€' + n).join(' · ')})`,
    fuori.length ? 'fuori catalogo: ' + fuori.map((n) => '€' + n).join(', ') : 'nessuna cifra in euro');
}
const piatto = (f) => decode(fs.readFileSync(path.join(R, f), 'utf8')
  .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
const concierge = piatto('concierge.html');
check(/SIM setup\W{1,4}€40\b/i.test(concierge) && /Healthcare enrol?lment\W{1,4}€120\b/i.test(concierge)
      && /Visa support\W{1,4}€200\b/i.test(concierge) && /tasks (?:start at|from) €15\b/i.test(concierge)
      && /around €390\b/i.test(concierge),
  'il menu di concierge.html dice ancora SIM €40 · sanita\' €120 · visto €200 · da €15 · ~€390');
for (const k of ['virtual-viewing', 'deal-assistance', 'contract-check-express', 'movein-pack', 'cleaning-premium']) {
  check(visible.includes('€' + CATALOG[k].eur), `il prezzo di ${k} (€${CATALOG[k].eur}) e' in pagina`);
}
// Property Finding non sta nel catalogo: il prezzo e la garanzia sono le Condizioni §4.2
const terms = piatto('terms.html');
const s42 = terms.slice(terms.indexOf('4.2 Property Finding'), terms.indexOf('4.3 '));
check(s42.length > 50 && /€350/.test(s42) && /at least 3\b/i.test(s42) && /\b15 (?:calendar )?days\b/i.test(s42),
  'le Condizioni §4.2 dicono ancora €350, almeno 3, 15 giorni (la base delle risposte PFS)');
const pfsCard = (html.match(/id="q-pfs-what"[\s\S]*?<\/div><\/div><\/div>/) || [''])[0];
check(/€350/.test(pfsCard) && /At least 3 options/.test(pfsCard) && /within 15 days/.test(pfsCard) && /Terms §4\.2/.test(pfsCard),
  'la card Property Finding dice €350, almeno 3 opzioni, 15 giorni, Condizioni §4.2');

// ── 7 · la provvigione: regola A, IVA dentro, conto che torna ──────────
const ex = visible.match(/Example at €([\d,]+)\/month with a one-month deposit: €([\d,]+) \+ €([\d,]+) \+ €([\d,]+) \(fee €([\d,]+) \+ 22% VAT\) = €([\d,]+)/);
const num = (x) => Number(String(x).replace(/,/g, ''));
if (!ex) male('l\'esempio «Example at €… with a one-month deposit» non si trova');
else {
  const rent = num(ex[1]);
  const fee = Math.round(rent * 12 * 0.10), feeVat = Math.round(rent * 12 * 0.10 * 1.22);
  check(num(ex[2]) === rent && num(ex[3]) === rent && num(ex[5]) === fee && num(ex[4]) === feeVat
        && num(ex[6]) === rent + rent + feeVat,
    `l'esempio torna: €${rent} + €${rent} + €${feeVat} (10% di un anno + 22% IVA) = €${rent * 2 + feeVat}`,
    ex[0]);
}
check(/10% of one year's rent plus 22% VAT/.test(visible), 'la regola della provvigione e\' «10% di un anno + 22% IVA», una volta');
const create = fs.readFileSync(path.join(R, 'api/preagreement/create.js'), 'utf8');
check(/num\(m\.feePct, 10\)/.test(create) && /rent \* 12 \* feePct \/ 100/.test(create),
  'e\' la regola che il codice addebita (api/preagreement/create.js: 10% di 12 mensilita\')');

// ── 8 · i preavvisi sono quelli dei modelli di contratto ───────────────
const cpdf = fs.readFileSync(path.join(R, 'js/contract-pdf.js'), 'utf8');
const tre = (cpdf.match(/recedere[^`]{0,120}almeno tre mesi prima/g) || []).length;
const sei = (cpdf.match(/recedere[^`]{0,120}almeno sei mesi prima/g) || []).length;
check(tre >= 2 && sei >= 1, `i modelli dicono ancora tre mesi (B, C: ${tre}) e sei mesi (3+2: ${sei})`);
const extend = (html.match(/id="q-extend-leave"[\s\S]*?<\/div><\/div><\/div>/) || [''])[0];
check(/3 months' notice/.test(extend) && /6 months \(3\+2/.test(extend) && /registered letter/.test(extend),
  'la card «extend or leave» dice 3 mesi (transitorio, studenti) e 6 (3+2), per raccomandata');

// ── 9 · il FAQPage e' quello che le card generano ──────────────────────
// Lo stesso scripts/faq-schema.mjs, in una copia isolata: si confronta il
// file che produrrebbe con quello che c'e'. Niente viene scritto nel repo.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'faqtruth-'));
try {
  fs.mkdirSync(path.join(tmp, 'scripts'));
  fs.copyFileSync(path.join(R, 'scripts/faq-schema.mjs'), path.join(tmp, 'scripts/faq-schema.mjs'));
  fs.copyFileSync(path.join(R, 'faq.html'), path.join(tmp, 'faq.html'));
  const r = spawnSync(process.execPath, [path.join(tmp, 'scripts/faq-schema.mjs')], { encoding: 'utf8' });
  const regen = fs.readFileSync(path.join(tmp, 'faq.html'), 'utf8');
  check(r.status === 0 && regen === html,
    'il FAQPage e\' in sincronia con le card (scripts/faq-schema.mjs non cambierebbe nulla)',
    r.status !== 0 ? (r.stderr || r.stdout).trim() : 'rigenerare: il FAQPage non corrisponde piu\' alle card');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
const cards = (html.match(/<div class="q-card /g) || []).length;
const qs = faqLd?.mainEntity || [];
check(qs.length === cards && cards === 38, `il FAQPage dichiara ${qs.length} domande per ${cards} card`);
const tronche = qs.filter((q) => /…$/.test(q.acceptedAnswer?.text || ''));
check(!tronche.length, 'nessuna risposta del FAQPage tagliata a 900 caratteri (dichiarata = visibile, intera)',
  tronche.map((q) => q.name).join(' | '));
const fantasmi = qs.filter((q) => !visible.includes(q.name));
check(!fantasmi.length, 'ogni domanda dichiarata e\' un <h3> visibile', fantasmi.map((q) => q.name).join(' | '));

// ── 10 · l'#organization e' la societa' vera ───────────────────────────
const org = nodes.find((n) => n['@id'] === 'https://www.boomrome.com/#organization');
check(!!org && org.legalName === 'Egidi Immobiliare S.r.l.', '#organization: legalName «Egidi Immobiliare S.r.l.»');
check(!!org && org.vatID === 'IT17322991005' && org.telephone === '+39-331-325-1961',
  '#organization: vatID IT17322991005 e telefono +39-331-325-1961');
const a = org?.address || {};
check(a.streetAddress === 'Via dei Coronari 181/184' && a.postalCode === '00186'
      && a.addressLocality === 'Roma' && a.addressRegion === 'RM' && a.addressCountry === 'IT',
  '#organization: Via dei Coronari 181/184, 00186 Roma RM IT');

console.log(ko ? `  \x1b[31mLa FAQ dice ancora qualcosa che non regge\x1b[0m — ${ok} passed, ${ko} failed`
               : `  \x1b[32mLa FAQ dice solo il vero\x1b[0m — ${ok} passed, 0 failed`);
process.exit(ko ? 1 : 0);
