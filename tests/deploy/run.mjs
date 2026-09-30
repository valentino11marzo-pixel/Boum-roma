// tests/deploy/run.mjs — cosa boomrome.com serve, e cosa no.
//
// Il 30/09/2026 https://www.boomrome.com/CLAUDE.md e
// /docs/portal-security-audit.md rispondevano 200: su Vercel ogni file del
// repo non escluso da .vercelignore è una URL pubblica, e la guida interna
// del sistema più l'elenco dei suoi punti deboli erano a una richiesta di
// distanza da chiunque. .vercelignore funzionava già (le preview-*.html
// davano 404 in produzione): mancavano le righe.
//
// Due direzioni, come sempre:
//   A. ciò che è interno resta ESCLUSO (ogni .md in radice, docs/, tests/,
//      bot/, homie-bridge/, design/, reference/, scripts/, le regole) —
//      i .md in radice si enumerano dal disco, così uno studio nuovo è
//      coperto senza toccare questo file;
//   B. ciò che il sito usa resta SERVITO: le pagine vive, e ogni file che
//      una pagina servita, il service worker o una funzione (import
//      relativi) chiama davvero. Un'esclusione troppo larga non dà errore
//      al deploy: dà una pagina senza script, scoperta dal cliente.
//
// Il matcher implementa la sintassi gitignore usata da .vercelignore
// (ancoraggio con «/», *, **, ?, directory che coprono il contenuto, «!»).
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };

// ── il matcher ──────────────────────────────────────────────────────────────
function toRule(line) {
    let p = line.replace(/\s+$/, '');
    if (!p || p.startsWith('#')) return null;
    let neg = false;
    if (p.startsWith('!')) { neg = true; p = p.slice(1); }
    if (p.endsWith('/')) p = p.slice(0, -1);
    const anchored = p.startsWith('/') || p.slice(0, -1).includes('/');
    if (p.startsWith('/')) p = p.slice(1);
    let rx = '';
    for (let i = 0; i < p.length; i++) {
        const c = p[i];
        if (c === '*' && p[i + 1] === '*') {
            if (p[i + 2] === '/') { rx += '(?:.*/)?'; i += 2; } else { rx += '.*'; i += 1; }
        } else if (c === '*') rx += '[^/]*';
        else if (c === '?') rx += '[^/]';
        else rx += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
    return { neg, re: new RegExp((anchored ? '^' : '^(?:.*/)?') + rx + '(?:/.*)?$') };
}
export function loadIgnore(text) { return text.split('\n').map(toRule).filter(Boolean); }
export function ignored(rules, rel) {
    let out = false;
    for (const r of rules) if (r.re.test(rel)) out = !r.neg;
    return out;
}

const rules = loadIgnore(readFileSync(path.join(ROOT, '.vercelignore'), 'utf8'));
const isIgn = (rel) => ignored(rules, rel);

console.log('── deploy: cosa boomrome.com serve');

// 0. Il matcher stesso: se sbaglia, tutto il resto è rumore.
{
    const t = loadIgnore('/*.md\napi/**/*.md\n/docs\npreview-*.html\n!/docs/pubblico.md');
    ok(ignored(t, 'CLAUDE.md') && !ignored(t, 'js/README.md'), 'matcher: «/*.md» copre solo la radice');
    ok(ignored(t, 'api/WALLET.md') && ignored(t, 'api/agent/README.md') && !ignored(t, 'api/listing.js'), 'matcher: «api/**/*.md» a ogni profondità');
    ok(ignored(t, 'docs/x/y.md') && !ignored(t, 'mydocs/a.md'), 'matcher: una directory copre il contenuto, e solo lei');
    ok(ignored(t, 'preview-index.html') && ignored(t, 'sub/preview-a.html'), 'matcher: pattern senza «/» a ogni profondità');
    ok(!ignored(t, 'docs/pubblico.md'), 'matcher: «!» riapre');
}

// A. Interno = escluso.
const rootMd = readdirSync(ROOT).filter((f) => f.endsWith('.md') && statSync(path.join(ROOT, f)).isFile());
ok(rootMd.includes('CLAUDE.md'), 'enumerazione dei .md in radice (CLAUDE.md trovato)');
for (const f of rootMd) ok(isIgn(f), `${f} non viene deployato`);
const INTERNAL = [
    'docs/portal-security-audit.md', 'docs/EGIDI_MIGRAZIONE.md', 'tests/run-all.mjs',
    'bot/boom_listing_wizard.py', 'homie-bridge/agent-os/bin/miniera.sh', 'design/pages-deco/anteprima.py',
    'reference/caf/2023_scheda_calcolo_canone_ARPE.docx', 'scripts/faq-schema.mjs', '.github/workflows/ci.yml',
    'firestore.rules', 'storage.rules', 'firebase.json', 'firestore.indexes.json', 'api/WALLET.md',
];
for (const f of INTERNAL) ok(isIgn(f), `${f} non viene deployato`);

// B. Vivo = servito.
const LIVE = [
    'index.html', 'portal.html', 'login.html', 'owners.html', 'apartments.html', 'apartment-detail.html',
    'tenant.html', 'sign.html', 'scheda.html', 'sw.js', 'llms.txt', 'sitemap.xml', 'robots.txt',
    'manifest.json', 'site.webmanifest', 'canone-manifest.json', 'package.json', 'package-lock.json',
    'vercel.json', 'api/package.json', 'api/listing.js', 'js/firebase-config.js', 'js/boom-portal.js',
    'css/boom-2026.css', 'assets/passes', 'pass-assets', 'boom-mark.svg',
];
for (const f of LIVE) ok(!isIgn(f), `${f} resta servito`);

// B2. Ogni file locale chiamato da ciò che si serve esiste nel deploy.
function walk(dir, acc = []) {
    for (const e of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        const rel = dir ? `${dir}/${e.name}` : e.name;
        if (e.isDirectory()) walk(rel, acc); else acc.push(rel);
    }
    return acc;
}
const served = walk('').filter((f) => !isIgn(f) && !f.startsWith('egidi/'));
let refs = 0;
const bad = [];
for (const f of served.filter((x) => /\.(html|css)$/.test(x) || x === 'sw.js' || /^js\/.+\.js$/.test(x))) {
    const s = readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of s.matchAll(/(?:src|href|content)=["'](\/[^"'#?\s]*)|url\(\s*["']?(\/[^"')#?\s]+)|["'](\/(?:js|css|assets|img|pass-assets|foto-catalogo)\/[^"'#?\s]+)["']/g)) {
        const rel = (m[1] || m[2] || m[3]).slice(1);
        if (!rel || rel.startsWith('/') || rel.startsWith('api/')) continue;
        const exists = existsSync(path.join(ROOT, rel)) || existsSync(path.join(ROOT, rel + '.html'));
        if (!exists) continue; // rotte, rewrite e redirect: non sono file
        refs++;
        if (isIgn(rel) || isIgn(rel + '.html')) bad.push(`${f} → /${rel}`);
    }
}
for (const f of served.filter((x) => x.startsWith('api/') && x.endsWith('.js'))) {
    const s = readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of s.matchAll(/(?:from\s+|import\(\s*|require\(\s*)["'](\.{1,2}\/[^"']+)["']/g)) {
        const rel = path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1]));
        refs++;
        if (isIgn(rel)) bad.push(`${f} → ${rel}`);
    }
}
ok(refs > 200, `riferimenti locali controllati: ${refs}`);
ok(bad.length === 0, `nessun file servito chiama un file escluso (${bad.slice(0, 5).join(' | ')})`);

console.log(`deploy: ${pass} ok, ${fail} falliti`);
process.exit(fail ? 1 : 0);
