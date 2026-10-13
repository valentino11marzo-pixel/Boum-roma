// tests/rendiconto/tempo.mjs — il tempo del giro e la promessa del recap
// (revisione del 13/10/2026 del ramo S6).
//
// Il difetto: ogni proprietario prenotava il caso peggiore intero (30s)
// PRIMA di cominciare, e il giro smetteva di prendere proprietari a 24s su 60:
// con 12 proprietari e Gmail a 3s ne partivano 8, gli altri «rimandati» — e
// col cron mensile nessuno li rimandava. LE REGOLE:
//  - si chiede il tempo a ogni passo: poco per le letture, EMAIL_MS + margine
//    prima dello stato e di nuovo prima di archivio ed email;
//  - con Gmail normale, 12 proprietari partono tutti nello stesso giro;
//  - dal primo rimandato in poi non si legge più nessuno (il tempo non torna);
//  - l'archivio ha il tetto di ciò che resta oltre l'email, e se non c'è si
//    salta: l'email parte, col PDF in allegato;
//  - il recap promette «riprova domani da solo» SOLO se domani c'è un giro
//    del cron (CRON_DAYS == vercel.json), e parla a parole: mai ?force=1.
// Orologio finto (le email «costano» il tempo che diciamo). EMAIL_MS è
// quello di produzione (15s). Dati inventati. Uso: node tests/rendiconto/tempo.mjs
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
register('./loader.mjs', import.meta.url);

process.env.FIREBASE_API_KEY = 'k'; process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c'; process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj'; process.env.CRON_SECRET = 'cron-test-secret';
process.env.GMAIL_USER = 'sistema@example.invalid'; process.env.GMAIL_APP_PASS = 'x';
process.env.ADMIN_NOTIFY_EMAIL = 'operatore@example.invalid';
process.env.TELEGRAM_BOT_TOKEN = 'tg-test'; process.env.TELEGRAM_CHAT_ID = '1';
delete process.env.RENDICONTO_EMAIL_MS;

const F = await import('./_fake.mjs');
F.install();
const mod = await import('../../api/owners/rendiconto.js');
let passed = 0, failed = 0; const bad = [];
const check = (n, c) => { c ? passed++ : (failed++, bad.push(n)); console.log((c ? 'PASS ' : 'FAIL ') + n); };
const mails = () => globalThis.__mails || [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MONTH = '2026-07', NOW = new Date('2026-08-03T06:10:00Z');

const vBudget = (total) => { let t = 0; return { tick: (ms) => { t += ms; }, left: () => Math.max(0, total - t), afford: (c) => t + Math.max(0, c || 0) <= total }; };
function seed(n) {
  F.reset();
  for (let o = 0; o < n; o++) {
    const id = String(o).padStart(2, '0');
    F.put(`users/own${id}`, { role: 'landlord', name: `Proprietaria ${id}`, email: `p${id}@example.invalid` });
    F.put(`properties/p${id}`, { ownerId: `own${id}`, address: `Via Finta ${o + 1}`, name: `Casa ${id}` });
    F.put(`contracts/c${id}`, { propertyId: `p${id}`, tenantName: `Inquilino ${id}`, rent: 1000, status: 'active' });
    F.put(`payments/pay_c${id}_${MONTH}`, { contractId: `c${id}`, propertyId: `p${id}`, amount: 1000, month: MONTH, dueDate: MONTH + '-05', status: 'paid', paidDate: MONTH + '-04', paidVia: 'bonifico' });
  }
}

// ═══ 1. Dodici proprietari, Gmail a 3s: partono tutti ═════════════════════
{
  seed(12);
  const b = vBudget(54000);                 // 60s di funzione meno i 6s del recap
  globalThis.__mailHook = () => { b.tick(3000); };
  const out = await mod.run({ monthOverride: MONTH, budget: b, now: NOW });
  check('12 proprietari, email a 3s: 12 partiti nello stesso giro, nessuno rimandato (prima 8)', out.counts.sent === 12 && out.counts.deferred === 0 && mails().length === 12);
  globalThis.__mailHook = null;
}

// ═══ 2. Il tempo non torna: dal primo rimandato non si legge più nessuno ══
{
  seed(6);
  const b = vBudget(54000);
  globalThis.__mailHook = () => { b.tick(16000); };
  const out = await mod.run({ monthOverride: MONTH, budget: b, now: NOW });
  const readOf = (pid) => F.queries.some((q) => q.filter && Array.isArray(q.filter.value) && q.filter.value.includes(pid));
  const deferred = out.results.filter((x) => x.skipped === 'deferred').map((x) => x.ownerId);
  check('email a 16s: 3 partiti, 3 rimandati', out.counts.sent === 3 && out.counts.deferred === 3);
  check('…i rimandati dopo il primo non sono nemmeno letti, e nessuno stato scritto per loro',
    deferred.length === 3 && deferred.slice(1).every((o) => !readOf('p' + o.slice(3))) && deferred.every((o) => !F.store.has(`rendiconti/${o}_${MONTH}`)));
  // Il giro di domani dipende dal cron VERO (dal 13/10/2026 «10 6 1-5 * *»):
  // il 3 agosto domani c'è un giro, l'ultimo giorno no — il recap lo dice.
  const againWords = mod.autoRetryTomorrow(NOW) ? 'riprova domani da solo' : 'rilancia «Esegui ora» nella Squadra';
  check('…il recap li conta, a parole', F.telegrams.some((t) => t.includes('⏳ 3 rimandati per tempo: ' + againWords)));
  globalThis.__mailHook = null;
}

// ═══ 3. L'archivio col tetto di ciò che resta oltre l'email ══════════════
{
  // Un budget in cui l'email ci sta ma l'archivio no: si salta l'archivio,
  // mai l'email (il PDF è in allegato).
  seed(1);
  const out = await mod.run({ monthOverride: MONTH, budget: { afford: () => true, left: () => 16500 }, now: NOW });
  const r = out.results[0];
  check('archivio senza tempo: saltato e detto, l\'email parte col PDF', out.counts.sent === 1 && r.url == null && /mancanza di tempo/.test(r.storageWarn)
    && F.storageFiles.size === 0 && mails()[0].attachments[0].content.slice(0, 4).toString() === '%PDF');
  // Con 1,2s per l'archivio (left − EMAIL_MS − 1s) uno Storage lento viene
  // tagliato lì, non ai 10s di sempre.
  seed(1);
  globalThis.__storageHook = async () => { await sleep(3000); return null; };
  const t0 = Date.now();
  const out2 = await mod.run({ monthOverride: MONTH, budget: { afford: () => true, left: () => 17200 }, now: NOW });
  const ms = Date.now() - t0;
  check('archivio lento: tagliato al tempo che resta (≈1,2s, non 10s), l\'email parte', out2.counts.sent === 1 && /storage_timeout/.test(out2.results[0].storageWarn) && ms < 2900);
  globalThis.__storageHook = null;
  await sleep(1900);   // lo Storage finto finisce il suo giro prima del test dopo
}

// ═══ 4. La promessa del recap segue il cron VERO ══════════════════════════
const vercel = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
const cron = (vercel.crons || []).find((c) => c.path === '/api/owners/rendiconto');
function domDays(field) {
  if (field === '*') return Array.from({ length: 31 }, (_, i) => i + 1);
  return field.split(',').flatMap((part) => {
    const [a, b] = part.split('-').map(Number);
    return b ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : [a];
  });
}
const days = cron ? domDays(cron.schedule.trim().split(/\s+/)[2]) : null;
check('CRON_DAYS (la promessa del recap) == i giorni del cron in vercel.json', !!days && JSON.stringify([...mod.CRON_DAYS].sort((a, b) => a - b)) === JSON.stringify(days));
{
  let ok = true;
  for (let d = 1; d <= 31; d++) {
    const now = new Date(Date.UTC(2026, 9, d, 8, 0));   // ottobre 2026, ora di Roma = stesso giorno
    const tomorrow = d === 31 ? 1 : d + 1;
    if (mod.autoRetryTomorrow(now) !== mod.CRON_DAYS.includes(tomorrow)) { ok = false; console.log('  giorno', d); }
  }
  check('autoRetryTomorrow: vero solo quando domani è un giorno di cron (fine mese compreso)', ok);
  // Ora di Roma, non UTC: il 31 ottobre alle 23:30 UTC a Roma è già il 1° novembre.
  check('…il giorno è quello di Roma (31/10 23:30 UTC = 1/11 a Roma)', mod.autoRetryTomorrow(new Date('2026-10-31T23:30:00Z')) === mod.CRON_DAYS.includes(2));
}
{
  // Il testo, attraverso un giro vero con un proprietario non partito.
  const dayBefore = (() => { const d = mod.CRON_DAYS.find((x) => x > 1); return d ? new Date(Date.UTC(2026, 7, d - 1, 8)) : new Date(Date.UTC(2026, 6, 31, 8)); })();
  const dayOff = (() => { for (let d = 2; d <= 27; d++) if (!mod.CRON_DAYS.includes(d + 1)) return new Date(Date.UTC(2026, 7, d, 8)); return null; })();
  for (const [name, now, want] of [['domani c\'è un giro', dayBefore, /riprova domani da solo, o «Esegui ora» nella Squadra/], ['domani nessun giro', dayOff, /\(rilancia «Esegui ora» nella Squadra\)/]]) {
    seed(1);
    globalThis.__mailHook = () => { const e = new Error('smtp down'); e.code = 'EAUTH'; throw e; };
    await mod.run({ monthOverride: MONTH, now });
    const t = F.telegrams.find((x) => /Non partito/.test(x)) || '';
    check(`recap del non partito (${name}): ${want}`, want.test(t) && (name.startsWith('domani nessun') ? !/domani/.test(t) : true));
    globalThis.__mailHook = null;
  }
}

// ═══ 5. L'esito incerto: parole, mai parametri ═══════════════════════════
{
  seed(1);
  globalThis.__mailHook = () => { const e = new Error('timeout'); e.code = 'ETIMEDOUT'; throw e; };
  await mod.run({ monthOverride: MONTH, now: NOW });
  const t = F.telegrams.find((x) => /Esito incerto/.test(x)) || '';
  check('esito incerto: «controlla la posta inviata; se non è partito, premi «Rimanda» nel Palazzo», nessun ?force=1',
    /controlla la posta inviata; se non è partito, premi «Rimanda» nel Palazzo/.test(t) && !/force|ownerId|\?/.test(t));
  globalThis.__mailHook = null;
}

console.log(`\nRendiconto · tempo: ${passed} passed, ${failed} failed`);
if (failed) { console.log('FALLITI: ' + bad.join(' | ')); process.exit(1); }
process.exit(0);
