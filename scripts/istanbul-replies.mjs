// scripts/istanbul-replies.mjs
// IN CHE LINGUA RISPONDIAMO A CHI ARRIVA DA /istanbul — in un posto solo.
//
// La pagina è in turco, ma oggi risponde Valentino, in inglese o in italiano.
// A İstanbul c'è un partner, e NON è confermato chi risponderebbe in turco:
// la pagina non può promettere risposte in turco, e il giorno in cui il
// fondatore lo conferma la frase deve cambiare OVUNQUE la stessa sera — la
// riga sotto la porta, la prima domanda della FAQ (e quindi il FAQPage che
// se ne genera), la riga «Dil» della scheda in breve, availableLanguage del
// canale del servizio (ServiceChannel) nei dati strutturati e la riga di
// llms.txt. Il contactPoint dell'azienda NON si tocca: è il numero di
// Valentino, uguale su ogni pagina, e il turco (se arriva) arriverà dal
// partner di İstanbul. Una frase scritta a mano in sei
// punti diverge al primo ritocco; una frase nascosta col CSS in pagina la
// leggerebbe comunque un motore. Quindi: l'interruttore è QUI, e questo
// script riscrive i sei punti.
//
//   node scripts/istanbul-replies.mjs           riscrive istanbul.html + llms.txt
//   node scripts/istanbul-replies.mjs --check   non scrive, esce 1 se divergono
//
// Nella pagina la frase sta fra <!--R:tr--> … <!--/R--> e <!--R:en--> … <!--/R-->;
// in llms.txt è la riga «- Replies: …» della sezione İstanbul.
// tests/istanbul/run.mjs pretende che a interruttore spento nessun testo
// (visibile, JSON-LD, llms.txt) prometta risposte in turco, e che la pagina
// sia allineata a questo file.
import fs from 'node:fs';
import path from 'node:path';
import { rebuild } from './owner-faq.mjs';

const R = path.resolve(new URL('..', import.meta.url).pathname);

// ── L'INTERRUTTORE ────────────────────────────────────────────────────────
// Si accende SOLO quando il fondatore conferma chi risponde in turco. Accenderlo
// non fa scrivere in turco la macchina (api/_lang.js e i prompt non hanno un
// ramo 'tr'): cambia solo ciò che la pagina promette.
export const TURKISH_REPLIES = false;

const SETS = {
  off: {
    langs: ['en', 'it'],
    tr: 'Yazışma dili İngilizce ya da İtalyanca.',
    en: 'We write in English or Italian.',
    llms: '- Replies: in English or Italian. The page is in Turkish; Turkish replies are not offered.',
  },
  on: {
    langs: ['tr', 'en', 'it'],
    tr: 'Yazışma dili Türkçe, İngilizce ya da İtalyanca.',
    en: 'We write in Turkish, English or Italian.',
    llms: '- Replies: in Turkish, English or Italian.',
  },
};
export const REPLIES = TURKISH_REPLIES ? SETS.on : SETS.off;
export const REPLIES_OFF = SETS.off;
export const REPLIES_ON = SETS.on;

const MARK = /<!--R:(tr|en)-->[\s\S]*?<!--\/R-->/g;

// availableLanguage non è una proprietà di RealEstateAgent né di Service
// (schema.org): sul Service sta dentro il suo ServiceChannel, ed è l'UNICO
// che questo script riscrive.
const CHANNEL = /("@type":"ServiceChannel"[^}]*?"availableLanguage":)\[[^\]]*\]/g;

/** istanbul.html con la frase del config in ogni punto, e il FAQPage rifatto. */
export function syncPage(html, set = REPLIES) {
  let out = html.replace(MARK, (_, l) => `<!--R:${l}-->${set[l]}<!--/R-->`);
  out = out.replace(CHANNEL, (_, a) => `${a}${JSON.stringify(set.langs)}`);
  return rebuild(out, 'tr');
}

/** llms.txt con la riga «- Replies:» della sezione İstanbul dal config. */
export function syncLlms(txt, set = REPLIES) {
  const i = txt.indexOf('## BOOM İstanbul → Roma');
  if (i < 0) throw new Error('llms.txt: sezione «## BOOM İstanbul → Roma» assente');
  const j = txt.indexOf('\n## ', i + 1);
  const sec = txt.slice(i, j < 0 ? txt.length : j);
  if (!/^- Replies:.*$/m.test(sec)) throw new Error('llms.txt: riga «- Replies:» assente nella sezione İstanbul');
  return txt.slice(0, i) + sec.replace(/^- Replies:.*$/m, set.llms) + (j < 0 ? '' : txt.slice(j));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const CHECK = process.argv.includes('--check');
  let bad = 0;
  for (const [f, fn] of [['istanbul.html', syncPage], ['llms.txt', syncLlms]]) {
    const p = path.join(R, f);
    const s = fs.readFileSync(p, 'utf8');
    const out = fn(s);
    if (out === s) { console.log(`✓ ${f}: allineato (risposte in turco: ${TURKISH_REPLIES ? 'sì' : 'no'})`); continue; }
    if (CHECK) { console.log(`✗ ${f}: non corrisponde a scripts/istanbul-replies.mjs`); bad++; continue; }
    fs.writeFileSync(p, out);
    console.log(`✎ ${f}: riscritto`);
  }
  process.exit(bad ? 1 : 0);
}
