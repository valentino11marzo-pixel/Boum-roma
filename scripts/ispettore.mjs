// scripts/ispettore.mjs — L'ISPETTORE: nessun bottone morto in produzione.
//
// Nato dallo STUDIO_ARSENALE_II: la segnalazione «il pfs command ha problemi»
// non aveva indirizzo, e l'unico modo onesto di rispondere era MISURARE.
// Cerca tre classi di rottura che l'occhio non vede e che i test di logica
// non toccano, su OGNI pagina admin:
//   1. bottoni morti  — un handler inline chiama una funzione mai definita
//                       (la classe del bug «d'Oro»: il tap non fa nulla);
//   2. API fantasma   — una fetch punta a /api/… che non esiste più;
//   3. id orfani      — getElementById su un elemento che nessuno crea.
//
// Gli elementi creati a RUNTIME contano come esistenti (boom-portal crea il
// loader, il pannello di recupero, l'overlay 🐞): si raccolgono anche gli id
// assegnati da codice, altrimenti l'ispettore griderebbe al lupo e verrebbe
// spento — che è il modo classico di perdere un guardiano.
//
// Uso:  node scripts/ispettore.mjs [--json]
// Esce 1 se trova qualcosa: è un cancello di CI, non un rapporto.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
export const PAGES = [
  'pfs-command.html', 'radar.html', 'banca.html', 'team.html', 'salute.html',
  'photo-lab.html', 'manuale.html', 'risposte.html', 'scheda-canone.html',
  'pre-agreement-admin.html', 'media-studio.html', 'boom_doc_parser.html',
  'verbale.html', 'watermark-studio.html', 'chiamate.html',
];
const BUILTIN = new Set(['window', 'event', 'location', 'document', 'this', 'void', 'alert', 'confirm',
  'prompt', 'history', 'navigator', 'parent', 'console', 'if', 'return', 'var', 'let', 'const', 'for',
  'while', 'switch', 'catch', 'new', 'typeof', 'true', 'false', 'null', 'JSON', 'Object', 'Array',
  'String', 'Number', 'Math', 'Date', 'Boolean', 'setTimeout', 'setInterval', 'parseInt', 'parseFloat',
  'encodeURIComponent', 'decodeURIComponent', 'fetch', 'Promise', 'Set', 'Map', 'RegExp', 'isNaN']);

const apiExists = (p) => {
  const clean = p.replace(/[?#].*$/, '').replace(/\/$/, '');
  if (!clean.startsWith('/api/')) return true;
  const rel = clean.slice(1);
  return ['.js', '/index.js', '.xml.js', ''].some((suf) => fs.existsSync(path.join(ROOT, rel + suf)));
};

export function inspect(page) {
  const fp = path.join(ROOT, page);
  if (!fs.existsSync(fp)) return { page, missing: true, deadFns: [], deadApi: [], deadIds: [] };
  const src = fs.readFileSync(fp, 'utf8');

  let code = [...src.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join('\n');
  for (const m of src.matchAll(/<script[^>]*src="(\/js\/[^"]+)"/gi)) {
    const jp = path.join(ROOT, m[1]);
    if (fs.existsSync(jp)) code += '\n' + fs.readFileSync(jp, 'utf8');
  }

  const defined = new Set(['BoomPortal', 'firebase', 'db', 'auth', 'storage', 'Chart', 'JSZip', 'jspdf', 'html2canvas']);
  for (const m of code.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)) defined.add(m[1]);
  for (const m of code.matchAll(/(?:window\.|var\s+|let\s+|const\s+)([A-Za-z_$][\w$]*)\s*=/g)) defined.add(m[1]);
  for (const m of code.matchAll(/([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?(?:function|\()/g)) defined.add(m[1]);

  const deadFns = new Map();
  // Le stringhe dentro un handler NON sono codice: «setXDoc('…transitional
  // need (work contract)')» non chiama need(). Un ispettore che grida al
  // lupo viene spento, e allora non protegge più niente: si spogliano i
  // letterali prima di cercare le chiamate.
  const noStrings = (h) => h.replace(/'[^']*'/g, "''").replace(/`[^`]*`/g, '``');
  for (const m of src.matchAll(/on(?:click|change|input|submit|load)="([^"]+)"/g)) {
    const h = noStrings(m[1]);
    for (const call of h.matchAll(/(?:^|[;(\s])([A-Za-z_$][\w$]*)\s*\(/g)) {
      const fn = call[1];
      if (BUILTIN.has(fn) || defined.has(fn)) continue;
      const idx = h.indexOf(fn + '(');
      if (idx > 0 && h[idx - 1] === '.') continue;
      deadFns.set(fn, (deadFns.get(fn) || 0) + 1);
    }
  }

  const deadApi = new Set();
  for (const m of code.matchAll(/fetch\(\s*['"`](\/api\/[^'"`\s?#]+)/g)) if (!apiExists(m[1])) deadApi.add(m[1]);

  // gli id: quelli nel markup PIÙ quelli creati a runtime da qualunque codice
  const ids = new Set([...src.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  for (const m of code.matchAll(/id="([\w-]+)"/g)) ids.add(m[1]);
  for (const m of code.matchAll(/\.id\s*=\s*['"]([\w-]+)['"]/g)) ids.add(m[1]);
  for (const m of code.matchAll(/id:\s*['"]([\w-]+)['"]/g)) ids.add(m[1]);
  const deadIds = new Set();
  for (const m of code.matchAll(/getElementById\(\s*['"]([\w-]+)['"]\s*\)/g)) if (!ids.has(m[1])) deadIds.add(m[1]);

  return { page, missing: false, deadFns: [...deadFns.keys()], deadApi: [...deadApi], deadIds: [...deadIds] };
}

export function inspectAll() { return PAGES.map(inspect); }

if (process.argv[1] && process.argv[1].endsWith('ispettore.mjs')) {
  const res = inspectAll();
  if (process.argv.includes('--json')) { console.log(JSON.stringify(res, null, 2)); }
  let bad = 0;
  for (const r of res) {
    const n = r.deadFns.length + r.deadApi.length + r.deadIds.length + (r.missing ? 1 : 0);
    if (!n) { console.log(`✓ ${r.page}`); continue; }
    bad += n;
    console.log(`✗ ${r.page}`);
    if (r.missing) console.log('   FILE ASSENTE');
    if (r.deadFns.length) console.log('   bottoni → funzioni non definite: ' + r.deadFns.join(', '));
    if (r.deadApi.length) console.log('   fetch → API inesistenti: ' + r.deadApi.join(', '));
    if (r.deadIds.length) console.log('   getElementById su id che nessuno crea: ' + r.deadIds.join(', '));
  }
  console.log(bad ? `\n✗ ispettore: ${bad} problemi` : '\n✓ ispettore: tutte le pagine pulite');
  process.exit(bad ? 1 : 0);
}
