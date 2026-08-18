// tests/backup/run.mjs — IL BACKUP: la parte che decide se è affidabile.
//
// Il valore di un backup non è che gira: è che DICE la verità su cosa ha
// salvato. Qui si prova la logica pura (manifest, rilevamento troncamento,
// le collezioni core comprese) senza rete, e le giunzioni sulla sorgente:
// il cron è dichiarato, la regola Storage esiste, il maxDuration c'è.
// Più l'anti-regressione dei cron ciechi (audit P1.2): ogni cron con un
// heartbeat lo deve avere davvero.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('✗ FAIL ' + n); } };

// ── Logica pura (import diretto del modulo) ─────────────────────────────
const mod = await import('../../api/ops/backup.js');
const { COLLECTIONS_CORE, COLLECTIONS_FULL, manifestOf } = mod;

ok(Array.isArray(COLLECTIONS_CORE) && COLLECTIONS_CORE.length >= 8, 'CORE non vuoto');
for (const critical of ['contracts', 'payments', 'users', 'properties', 'preAgreements'])
  ok(COLLECTIONS_CORE.includes(critical), `CORE include "${critical}" (il dato che conta)`);
ok(COLLECTIONS_FULL.length > COLLECTIONS_CORE.length, 'FULL è un superset di CORE');
ok(COLLECTIONS_CORE.every((c) => COLLECTIONS_FULL.includes(c)), 'FULL contiene tutto CORE');

// manifest: conteggi e total
const m1 = manifestOf({ contracts: [1, 2, 3], payments: [1, 1], users: [] }, 5000);
ok(m1.total === 5, 'manifest: total somma tutte le collezioni');
ok(m1.rows.find((r) => r.name === 'contracts').count === 3, 'manifest: conteggio per collezione');
ok(m1.truncated.length === 0, 'manifest: nessun troncamento sotto il limite');

// truncation: count === limit ⇒ potrebbe esserci di più ⇒ va segnalato
const big = Array.from({ length: 10 }, (_, i) => i);
const m2 = manifestOf({ payments: big }, 10);
ok(m2.truncated.includes('payments'), 'manifest: count == limit è segnalato come troncato');
ok(m2.rows.find((r) => r.name === 'payments').truncated === true, 'manifest: flag truncated sulla riga');
const m3 = manifestOf({ payments: big.slice(0, 9) }, 10);
ok(m3.truncated.length === 0, 'manifest: count < limit non è troncato');

// ── Giunzioni sulla sorgente ────────────────────────────────────────────
const vercel = JSON.parse(read('vercel.json'));
const crons = (vercel.crons || []).map((c) => c.path);
ok(crons.includes('/api/ops/backup'), 'il cron /api/ops/backup è dichiarato in vercel.json');
ok(!!(vercel.functions || {})['api/ops/backup.js']?.maxDuration, 'backup ha un maxDuration');

const storage = read('storage.rules');
ok(/match \/backups\/\{allPaths=\*\*\}\s*\{\s*allow read, write: if isAdmin\(\)/.test(storage),
  'storage.rules: backups/ è admin-only in lettura e scrittura');

const src = read('api/ops/backup.js');
ok(src.includes("reportEmployeeHealth(EMPLOYEE") && src.includes("EMPLOYEE = 'backup'"),
  'il backup scrive un heartbeat (teamHealth/backup)');
ok(src.includes('backup-${day}') || src.includes('`backup-${day}`'),
  'idempotenza per giorno (fsCreate heartbeat/backup-<giorno>)');
ok(src.includes('PITR'), 'il manifest ricorda il limite (PITR per il DR totale) — onestà dichiarata');

// ── Anti-regressione P1.2: heartbeat aggiunto ai cron ciechi chiave ─────
// reminder-cron e notify-pending erano i due più critici senza battito.
const reminder = read('api/reminder-cron.js');
ok(/teamHealth|reportEmployeeHealth|reportHealth|heartbeat/.test(reminder),
  'reminder-cron ora scrive un heartbeat (era cieco — incassa gli affitti)');
const notify = read('api/telegram/notify-pending.js');
ok(/teamHealth|reportEmployeeHealth|reportHealth|heartbeat/.test(notify),
  'notify-pending ora scrive un heartbeat (era cieco — gira ogni minuto)');

console.log('');
console.log(fail ? `${pass} passed, ${fail} failed` : `Il backup dice la verità — ${pass} passed, 0 failed`);
process.exit(fail ? 1 : 0);
