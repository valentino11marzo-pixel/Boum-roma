// tests/contesto/run.mjs — LA MAPPA RESTA UNA MAPPA.
//
// Il 12/10/2026 CLAUDE.md aveva 6.155 righe (~130.000 token) che ogni
// sessione Claude rileggeva da capo prima della prima parola: il 1° giugno
// erano 138. Era cresciuto per una regola sola, scritta in AGENTS.md —
// «ogni cambiamento aggiunge 3-8 righe a CLAUDE.md» — applicata 331 volte da
// due agenti. Il dettaglio è stato spostato, senza perdere una riga, in
// docs/aree/<area>.md (scripts/aree-split.mjs); CLAUDE.md è tornato la mappa.
//
// Questa suite impedisce che ricresca e che le tre fonti si contraddicano:
//   1. CLAUDE.md sotto le 300 righe;
//   2. l'indice di CLAUDE.md e la cartella docs/aree coincidono, nei due sensi;
//   3. ORA.md ha ruoli, al massimo tre obiettivi e la lista «Non si fa»;
//   4. AGENTS.md (che Codex legge da solo) mette ORA.md sopra a tutto e manda
//      la documentazione in docs/aree, non in CLAUDE.md;
//   5. la divisione resta senza perdite e fallisce su una sezione senza area;
//   6. i .md restano fuori dal sito: con outputDirectory "." ogni file del
//      repo è una pagina, e www.boomrome.com/AGENTS.md rispondeva 200.
// Ogni controllo è una funzione pura, provata anche per mutazione qui sotto:
// un controllo che non morde passa sempre ed è peggio di nessun controllo.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dividi, AREE } from '../../scripts/aree-split.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('✗ FAIL ' + n); } };

export const MAX_RIGHE = 300;

export function righeMappa(claude) {
  return claude.replace(/\n$/, '').split('\n').length;
}

export function indiceAree(claude, fileAree) {
  const citati = new Set([...claude.matchAll(/docs\/aree\/([a-z0-9-]+\.md)/g)].map((m) => m[1]));
  const presenti = new Set(fileAree);
  return {
    mancanti: [...presenti].filter((f) => !citati.has(f)),   // file senza riga nell'indice
    fantasma: [...citati].filter((f) => !presenti.has(f)),   // riga che punta a un file che non c'è
  };
}

export function obiettivi(ora) {
  const m = ora.match(/^## Obiettivi[^\n]*\n([\s\S]*?)(?=^## )/m);
  if (!m) return -1;
  return [...m[1].matchAll(/^\d+\. \*\*/gm)].length;
}

export function oraCompleto(ora) {
  return /^## Ruoli/m.test(ora) && /^## Obiettivi/m.test(ora) && /^## Non si fa/m.test(ora) && obiettivi(ora) >= 1;
}

export function agentsCoerente(agents) {
  const comandaOra = /ORA\.md`?[^\n]*\n?[^\n]*Vince su\s+tutto/.test(agents) || /Vince su\s+tutto[\s\S]{0,200}ORA\.md/.test(agents);
  const docAree = /3-8 righe[\s\S]{0,80}docs\/aree/.test(agents);
  const vecchiaRegola = /righe nella sezione giusta di `CLAUDE\.md`/.test(agents);
  return comandaOra && docAree && !vecchiaRegola;
}

export function mdFuoriDalSito(vercelignore) {
  return vercelignore.split('\n').map((l) => l.trim()).includes('*.md');
}

// ── 1 · la mappa resta corta ────────────────────────────────────────────
const claude = read('CLAUDE.md');
const n = righeMappa(claude);
ok(n <= MAX_RIGHE, `CLAUDE.md ha ${n} righe (massimo ${MAX_RIGHE}): la storia va in docs/aree, non qui`);
ok(/ORA\.md/.test(claude) && /docs\/aree/.test(claude), 'CLAUDE.md rimanda a ORA.md e a docs/aree');

// ── 2 · indice e cartella coincidono ────────────────────────────────────
const fileAree = readdirSync(join(ROOT, 'docs/aree')).filter((f) => f.endsWith('.md'));
ok(fileAree.length >= 10, `docs/aree contiene le aree (${fileAree.length} file) — una cartella vuota passerebbe sempre`);
const idx = indiceAree(claude, fileAree);
ok(idx.mancanti.length === 0, `ogni file di docs/aree ha la sua riga nell'indice di CLAUDE.md${idx.mancanti.length ? ' — mancano: ' + idx.mancanti.join(', ') : ''}`);
ok(idx.fantasma.length === 0, `ogni riga dell'indice punta a un file che esiste${idx.fantasma.length ? ' — fantasma: ' + idx.fantasma.join(', ') : ''}`);
ok(AREE.every((a) => fileAree.includes(a.file)), 'ogni area dello script di divisione esiste in docs/aree');

// ── 3 · ORA.md ──────────────────────────────────────────────────────────
ok(existsSync(join(ROOT, 'ORA.md')), 'ORA.md esiste');
const ora = read('ORA.md');
ok(oraCompleto(ora), 'ORA.md ha Ruoli, Obiettivi e «Non si fa»');
const k = obiettivi(ora);
ok(k >= 1 && k <= 3, `ORA.md ha ${k} obiettivi (al massimo tre)`);
ok(existsSync(join(ROOT, '.claude/skills/lunedi/SKILL.md')) && /^name: lunedi$/m.test(read('.claude/skills/lunedi/SKILL.md')), 'la skill /lunedi citata in ORA.md esiste');
ok(existsSync(join(ROOT, 'docs/TRIAGE_2026-10-12.md')), 'il triage citato in ORA.md esiste');

// ── 4 · AGENTS.md, letto da Codex ───────────────────────────────────────
const agents = read('AGENTS.md');
ok(agentsCoerente(agents), 'AGENTS.md: ORA.md vince su tutto, la documentazione va in docs/aree, nessuna regola che rimandi righe a CLAUDE.md');
ok(/Costruisce Claude/.test(agents) && /Codex\s+rivede/.test(agents), 'AGENTS.md dichiara i ruoli: costruisce Claude, Codex rivede');

// ── 5 · la divisione resta senza perdite ────────────────────────────────
{
  const sorgente = ['# BOOM Roma — Project Guide', 'intro', '## Tech Stack', 'stack', '```', '# commento dentro un recinto: non è un titolo', '```',
    '### Il Centralino (x)', 'telefono', ''].join('\n');
  const r = dividi(sorgente);
  const tel = r.uscite.find((u) => u.file === 'telefono.md');
  ok(r.righe === sorgente.split('\n').length && tel && tel.testo.includes('telefono'), 'divisione: ogni riga finisce in un file d\'area, e il commento nel recinto non diventa una sezione');
  let morso = false;
  try { dividi(sorgente + '\n## Una sezione nuova senza area\nx\n'); } catch (e) { morso = /senza area/.test(String(e.message)); }
  ok(morso, 'divisione: una sezione senza area FA FALLIRE lo script (mai una riga persa in silenzio)');
}

// ── 6 · i documenti interni non diventano pagine del sito ───────────────
const vercelignore = read('.vercelignore');
ok(mdFuoriDalSito(vercelignore), '.vercelignore esclude *.md: ORA.md, il triage e docs/aree non diventano pagine di www.boomrome.com');

// ── mutazioni: ogni controllo deve mordere ─────────────────────────────
ok(righeMappa('x\n'.repeat(MAX_RIGHE + 1)) > MAX_RIGHE, 'mutazione: una mappa di 301 righe viene vista');
ok(indiceAree('vedi docs/aree/a.md', ['a.md', 'b.md']).mancanti[0] === 'b.md', 'mutazione: un file d\'area senza indice viene visto');
ok(indiceAree('vedi docs/aree/a.md e docs/aree/z.md', ['a.md']).fantasma[0] === 'z.md', 'mutazione: una riga d\'indice senza file viene vista');
ok(obiettivi('## Obiettivi\n1. **a**\n2. **b**\n3. **c**\n4. **d**\n## Altro\n') === 4, 'mutazione: quattro obiettivi vengono contati');
ok(!agentsCoerente(agents.replace(/docs\/aree\/<area>\.md`, nello stile/, '`CLAUDE.md`, nello stile')), 'mutazione: la vecchia regola «righe in CLAUDE.md» viene vista');
ok(!agentsCoerente(agents.replace(/Vince su\s+tutto/g, 'Conta')), 'mutazione: un AGENTS.md che non mette ORA.md sopra a tutto viene visto');
ok(!mdFuoriDalSito(vercelignore.replace(/^\*\.md$/m, '')), 'mutazione: un .vercelignore senza *.md viene visto');

console.log(`\nContesto: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
