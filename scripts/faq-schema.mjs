// scripts/faq-schema.mjs
// IL FAQPage SI GENERA DALLA PAGINA, non si scrive a parte.
//
// Il reperto: faq.html dichiarava DUE FAQPage (Google ne sceglie uno a caso
// o li ignora entrambi) con nove domande, di cui SEI non esistevano come
// testo visibile — erano parafrasi ottimizzate per il motore di domande che
// la pagina pone con altre parole («How fast can I move in?» contro «How
// fast can I REALLY move in?»). E' il markup che Google sanziona come
// contenuto nascosto. Intanto le 38 domande VERE della pagina non erano
// dichiarate affatto.
//
// Qui il markup si DERIVA dalle card: domanda = <h3>, risposta = .q-content.
// Non puo' divergere, e la superficie dichiarata passa da 9 a 38.
//
//   node scripts/faq-schema.mjs [--dry]
import fs from 'node:fs';
import path from 'node:path';

const R = path.resolve(new URL('..', import.meta.url).pathname);
const DRY = process.argv.includes('--dry');
const F = path.join(R, 'faq.html');
let s = fs.readFileSync(F, 'utf8');

const piano = (h) => h
  .replace(/<script[\s\S]*?<\/script>/g, ' ')
  .replace(/<div class="q-related"[\s\S]*?<\/div>\s*<\/div>/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#39;|&rsquo;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ').trim();

const voci = [];
for (const m of s.matchAll(/<div class="q-card[^"]*"[^>]*>([\s\S]*?)(?=<div class="q-card|<\/section>|<footer)/g)) {
  const blocco = m[1];
  const q = blocco.match(/<h3>([\s\S]*?)<\/h3>/);
  const a = blocco.match(/<div class="q-content">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/);
  if (!q || !a) continue;
  const dom = piano(q[1]);
  let ris = piano(a[1]);
  if (!dom || !ris) continue;
  if (ris.length > 900) ris = ris.slice(0, 897).replace(/\s+\S*$/, '') + '…';
  voci.push({ '@type': 'Question', name: dom,
              acceptedAnswer: { '@type': 'Answer', text: ris } });
}
if (voci.length < 10) { console.error('Solo ' + voci.length + ' domande estratte: non scrivo nulla.'); process.exit(1); }

// ogni domanda dichiarata DEVE esistere come testo visibile: e' la regola
// per cui questo script esiste, quindi si verifica prima di scrivere
const vis = piano(s);
const orfane = voci.filter((v) => !vis.includes(v.name));
if (orfane.length) { console.error('Domande non visibili: ' + orfane.map((o) => o.name).join(' | ')); process.exit(1); }

const blocco = '<script type="application/ld+json">\n'
  + JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage',
                     '@id': 'https://www.boomrome.com/faq#faq',
                     mainEntity: voci }, null, 0)
  + '\n</script>';

// via TUTTI i FAQPage esistenti, dentro e fuori i marcatori
let tolti = 0;
s = s.replace(/[ \t]*<script type="application\/ld\+json"[^>]*>\s*([\s\S]*?)\s*<\/script>\n?/g,
  (tutto, corpo) => {
    try { const d = JSON.parse(corpo); if (d['@type'] === 'FAQPage') { tolti++; return ''; } } catch { /* non JSON: resta */ }
    return tutto;
  });
const ago = '</title>';
s = s.replace(ago, ago + '\n' + blocco);

console.log(`${voci.length} domande dalla pagina · ${tolti} FAQPage vecchi rimossi`);
if (DRY) { console.log('(anteprima — niente scritto)'); process.exit(0); }
fs.writeFileSync(F, s);

// ── LE ALTRE PAGINE: si taglia alle domande VERE ────────────────────────
// Undici pagine dichiaravano 34 domande che non pongono — services.html
// ne dichiarava QUATTRO senza avere una FAQ. Qui non si inventa markup:
// si tiene cio' che la pagina dice davvero, e una FAQ che non esiste
// smette di essere dichiarata. Meno markup e piu' vero e' un guadagno,
// non una perdita: una FAQ fantasma e' un rischio di penalizzazione e una
// citazione che il lettore non ritrova.
const piano2 = (h) => h
  .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#39;|&rsquo;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ');

let tocc = 0, tagliate = 0, tolte = 0;
for (const nome of fs.readdirSync(R)) {
  if (!nome.endsWith('.html') || nome === 'faq.html' || nome.startsWith('preview-')) continue;
  const p = path.join(R, nome);
  let t = fs.readFileSync(p, 'utf8');
  if (!t.includes('"FAQPage"')) continue;
  const vis = piano2(t);
  let cambiato = false;
  t = t.replace(/([ \t]*)<script type="application\/ld\+json"([^>]*)>\s*([\s\S]*?)\s*<\/script>(\n?)/g,
    (tutto, sp, att, corpo, fine) => {
      let d; try { d = JSON.parse(corpo); } catch { return tutto; }
      const nodi = d['@graph'] || [d];
      let mut = false;
      for (const nodo of nodi) {
        if (nodo['@type'] !== 'FAQPage' || !Array.isArray(nodo.mainEntity)) continue;
        const buone = nodo.mainEntity.filter((q) => vis.includes(q.name));
        if (buone.length === nodo.mainEntity.length) continue;
        tagliate += nodo.mainEntity.length - buone.length;
        nodo.mainEntity = buone;
        mut = true;
      }
      if (!mut) return tutto;
      cambiato = true;
      const resta = nodi.filter((x) => x['@type'] !== 'FAQPage' || (x.mainEntity || []).length >= 2);
      if (!resta.length) { tolte++; return ''; }
      const fuori = d['@graph'] ? { ...d, '@graph': resta } : resta[0];
      return `${sp}<script type="application/ld+json"${att}>\n${JSON.stringify(fuori)}\n${sp}</script>${fine}`;
    });
  if (cambiato) { tocc++; if (!DRY) fs.writeFileSync(p, t); }
}
console.log(`${tocc} altre pagine · ${tagliate} domande fantasma tolte · ${tolte} FAQPage senza domande vere rimossi`);
