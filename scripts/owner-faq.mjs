// scripts/owner-faq.mjs
// IL FAQPage DELLE PAGINE PROPRIETARI SI GENERA DALLA PAGINA.
//
// La regola di scripts/faq-schema.mjs (faq.html), estesa alle pagine dei
// proprietari: ogni domanda dichiarata ai motori DEVE essere una <details>
// visibile in #faq, con la stessa risposta parola per parola. Scritto a mano,
// il markup diverge al primo ritocco della pagina — e una domanda che la
// pagina non mostra è contenuto nascosto (Google lo sanziona, un motore di
// risposta cita una frase introvabile).
//
// Domanda = <summary> (la parte italiana se la pagina è bilingue),
// risposta = il testo della <div class="a"> senza tag. Il JSON va SOLO fra i
// marcatori <!-- FAQLD:START … --> e <!-- FAQLD:END -->: fuori non si tocca.
//
//   node scripts/owner-faq.mjs [--check]     (--check: non scrive, esce 1 se diverge)
import fs from 'node:fs';
import path from 'node:path';

const R = path.resolve(new URL('..', import.meta.url).pathname);
const CHECK = process.argv.includes('--check');
export const FILES = ['canone.html', 'pacchetto-concordato.html', 'owners.html'];

// Un tag si toglie SENZA spazio (altrimenti «<a>Pacchetto</a>, 349» diventa
// «Pacchetto , 349»); solo un a capo vale uno spazio.
const piano = (h) => String(h)
  .replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#39;|&rsquo;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&reg;/g, '®')
  .replace(/\s+/g, ' ').trim();

/** Le domande visibili di #faq, nella forma del FAQPage. */
export function faqItems(html) {
  const m0 = html.match(/<section\b[^>]*\bid="faq"/);
  if (!m0) return [];
  const i = m0.index;
  const sec = html.slice(i, html.indexOf('</section>', i));
  const out = [];
  for (const m of sec.matchAll(/<details>\s*<summary>([\s\S]*?)<\/summary>\s*<div class="a">([\s\S]*?)<\/div>\s*<\/details>/g)) {
    const it = (x) => { const k = x.match(/<span class="l-it">([\s\S]*?)<\/span>/); return k ? k[1] : x; };
    let q = m[1], a = m[2];
    if (/class="l-it"/.test(q)) q = it(q);
    if (/class="l-it"/.test(a)) {
      // la risposta italiana: tutto ciò che sta nella span l-it di primo livello
      const k = a.match(/<span class="l-it">([\s\S]*?)<\/span><span class="l-en">/);
      a = k ? k[1] : it(a);
    }
    out.push({ '@type': 'Question', name: piano(q), acceptedAnswer: { '@type': 'Answer', text: piano(a) } });
  }
  return out;
}

export function faqJson(items) {
  return '{"@context":"https://schema.org","@type":"FAQPage","inLanguage":"it","mainEntity":[\n' +
    items.map((v) => ' ' + JSON.stringify(v)).join(',\n') + '\n]}';
}

const RE = /(<!-- FAQLD:START[\s\S]*?-->\s*<script type="application\/ld\+json">\n)([\s\S]*?)(\n\s*<\/script>\s*<!-- FAQLD:END -->)/;

export function rebuild(html) {
  const items = faqItems(html);
  if (items.length < 4) throw new Error('troppo poche domande visibili: ' + items.length);
  if (!RE.test(html)) throw new Error('marcatori FAQLD assenti');
  return html.replace(RE, (_, a, __, c) => a + faqJson(items) + c);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let bad = 0;
  for (const f of FILES) {
    const p = path.join(R, f);
    const s = fs.readFileSync(p, 'utf8');
    if (!RE.test(s)) { console.log(`· ${f}: nessun marcatore FAQLD, salto`); continue; }
    const out = rebuild(s);
    if (out === s) { console.log(`✓ ${f}: già allineato (${faqItems(s).length} domande)`); continue; }
    if (CHECK) { console.log(`✗ ${f}: il FAQPage non corrisponde alle domande visibili`); bad++; continue; }
    fs.writeFileSync(p, out);
    console.log(`✎ ${f}: FAQPage rigenerato (${faqItems(out).length} domande)`);
  }
  process.exit(bad ? 1 : 0);
}
