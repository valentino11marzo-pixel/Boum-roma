// tests/agentos/forwarder.mjs — L'ORECCHIO non deve mai perdere un messaggio.
//
// wa-forwarder.sh è vissuto un mese FUORI da git, solo sul disco del Mac
// mini, e portava tre difetti che spiegano il sintomo dell'operatore («non
// si aggiorna live da WhatsApp, e ad alcuni avevo già risposto»):
//   1. il cursore avanzava anche quando wacli falliva o l'invio falliva —
//      quei messaggi sparivano per sempre;
//   2. i messaggi senza testo (note vocali, foto) venivano buttati;
//   3. i gruppi diventavano lead con numero «group:12036…».
//
// Qui lo script VERO gira in una sandbox, con un wacli finto e un server
// che risponde come gli si dice. Niente asserzioni sui commenti: si guarda
// il cursore sul disco, che è il fatto.
//
// Esegui: node tests/agentos/forwarder.mjs

import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, chmodSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';

let fails = 0;
const ok = (name, cond, detail) => {
  console.log(cond ? `PASS ${name}` : `FAIL ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`);
  if (!cond) fails++;
};
// WA_FWD_SCRIPT permette di puntare a una copia MUTATA: è così che si
// verifica che il difetto vecchio verrebbe ripreso al volo.
const SCRIPT = process.env.WA_FWD_SCRIPT
  || new URL('../../homie-bridge/agent-os/bin/wa-forwarder.sh', import.meta.url).pathname;
const CURSOR0 = '2026-09-07T10:00:00Z';

// Un server che registra ogni POST e risponde col codice che gli diciamo.
function server(status = 200) {
  const seen = [];
  const srv = createServer((req, res) => {
    let b = '';
    req.on('data', c => (b += c));
    req.on('end', () => {
      try { seen.push(JSON.parse(b)); } catch { seen.push({ bad: b }); }
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    });
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ srv, seen, port: srv.address().port })));
}

// Una sandbox: HOME finto, wacli finto, cursore noto.
function sandbox(wacliBody) {
  const home = mkdtempSync(join(tmpdir(), 'wafwd-'));
  mkdirSync(join(home, '.boom'), { recursive: true });
  writeFileSync(join(home, '.boom', 'wa-forwarder-cursor'), CURSOR0);
  const wacli = join(home, 'wacli');
  writeFileSync(wacli, wacliBody);
  chmodSync(wacli, 0o755);
  return { home, wacli, cursor: () => readFileSync(join(home, '.boom', 'wa-forwarder-cursor'), 'utf8'),
           log: () => (existsSync(join(home, '.boom', 'wa-forwarder.log')) ? readFileSync(join(home, '.boom', 'wa-forwarder.log'), 'utf8') : '') };
}

function run(sb, api, ms = 2500) {
  return new Promise(resolve => {
    const p = spawn('bash', [SCRIPT], {
      env: { ...process.env, HOME: sb.home, AOS_HOME: join(sb.home, 'aos'), WACLI: sb.wacli,
             HOMIE_SECRET: 'test-secret', WA_FORWARD_API: api, POLL_SECS: '1', PATH: process.env.PATH },
      stdio: 'ignore',
    });
    setTimeout(() => { p.kill('SIGTERM'); setTimeout(() => { p.kill('SIGKILL'); resolve(); }, 400); }, ms);
  });
}

const MSGS = JSON.stringify({ messages: [
  { ChatJID: '393331234567@s.whatsapp.net', MsgID: 'm1', Text: 'ciao, cercavo un bilocale a Prati', Timestamp: '2026-09-07T10:01:00Z', ChatName: 'Sophie', FromMe: false },
  { ChatJID: '393331234567@s.whatsapp.net', MsgID: 'm2', Text: '', MediaType: 'ptt', Timestamp: '2026-09-07T10:02:00Z', ChatName: 'Sophie', FromMe: false },
  { ChatJID: '120363999@g.us', MsgID: 'm3', Text: 'messaggio di gruppo', Timestamp: '2026-09-07T10:03:00Z', ChatName: 'Famiglia', FromMe: false },
  { ChatJID: '393339999999@s.whatsapp.net', MsgID: 'm4', Text: 'ti richiamo domani', Timestamp: '2026-09-07T10:04:00Z', ChatName: 'Marco', FromMe: true },
  { ChatJID: '393338888888@s.whatsapp.net', MsgID: 'm5', Text: '', Timestamp: '2026-09-07T10:05:00Z', ChatName: 'X', FromMe: false },
]});

// ── 1. giro sano: inoltra, salta i gruppi, tiene le note vocali ───────────
{
  const { srv, seen, port } = await server(200);
  const sb = sandbox(`#!/bin/sh\ncat <<'J'\n${MSGS}\nJ\n`);
  await run(sb, `http://127.0.0.1:${port}/`);
  srv.close();
  const ids = seen.map(m => m.messageId);
  ok('sano: il messaggio di testo arriva', ids.includes('m1'));
  ok('sano: la NOTA VOCALE arriva come [nota vocale] (prima si buttava)',
     seen.some(m => m.messageId === 'm2' && m.body === '[nota vocale]'), seen.find(m => m.messageId === 'm2'));
  ok('sano: il messaggio in USCITA arriva (marca il lead contacted)',
     seen.some(m => m.messageId === 'm4' && m.direction === 'out'));
  ok('sano: il GRUPPO non diventa un lead', !ids.includes('m3'));
  ok('sano: nessun numero inventato tipo group:', !seen.some(m => String(m.phone).startsWith('group')));
  ok('sano: il muto sconosciuto viene scartato MA loggato',
     !ids.includes('m5') && /SKIP groups=1/.test(sb.log()), sb.log().slice(-200));
  ok('sano: il cursore avanza', sb.cursor() !== CURSOR0, sb.cursor());
}

// ── 2. wacli giù: NIENTE si perde ────────────────────────────────────────
{
  const { srv, seen, port } = await server(200);
  const sb = sandbox('#!/bin/sh\nexit 1\n');
  await run(sb, `http://127.0.0.1:${port}/`);
  srv.close();
  ok('wacli giù: il cursore NON avanza (il difetto che perdeva i messaggi)',
     sb.cursor() === CURSOR0, sb.cursor());
  ok('wacli giù: lo dice nel log invece di tacere', /wacli EXIT 1/.test(sb.log()));
  ok('wacli giù: non inventa invii', seen.length === 0);
}

// ── 3. server irraggiungibile: il cursore resta indietro, si riprova ──────
{
  const sb = sandbox(`#!/bin/sh\ncat <<'J'\n${MSGS}\nJ\n`);
  await run(sb, 'http://127.0.0.1:1/');   // porta chiusa → curl code 000
  ok('server giù: il cursore NON avanza', sb.cursor() === CURSOR0, sb.cursor());
  ok('server giù: dichiara che riproverà', /riprovo|cursore fermo/.test(sb.log()), sb.log().slice(-300));
}

// ── 4. il 4xx non blocca la coda per sempre ──────────────────────────────
{
  const { srv, port } = await server(400);
  const sb = sandbox(`#!/bin/sh\ncat <<'J'\n${MSGS}\nJ\n`);
  await run(sb, `http://127.0.0.1:${port}/`);
  srv.close();
  ok('4xx: messaggio scartato come definitivo, il cursore avanza',
     sb.cursor() !== CURSOR0 && /SCARTATO 400/.test(sb.log()), sb.log().slice(-300));
}

console.log(fails ? `\n${fails} FAIL` : '\nALL PASS');
process.exit(fails ? 1 : 0);
