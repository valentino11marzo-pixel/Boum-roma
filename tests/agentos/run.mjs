// tests/agentos/run.mjs — agent-os (il runtime di Homie sul Mac mini) non può
// tornare a essere il cliente che paga due volte.
//
// IL CASO REALE, 5-7 settembre 2026. realtime.sh svegliava Homie (Sonnet,
// 21k caratteri di bootstrap, corsia occupata fino a 240s) per OGNI
// notifica del server — un lead.new ogni 10' dallo scan-inbox, giorno e
// notte — con l'istruzione "dedup, qualifica, scrivi la risposta": il lavoro
// che bot/HOMIE.md vieta e che il server fa già gratis. Esito misurato:
// "No reply from agent" alle :01/:11/:21 tutta la notte, le "troppe
// transazioni" Anthropic, e l'operatore che scrive su Telegram senza vedere
// nemmeno "sta scrivendo". E health.sh, il dead-man switch, ha dichiarato
// SANO per 18 ore un gateway scaricato da launchd, perché controllava solo
// che il CLI fosse in PATH.
//
// Le regole si asseriscono sulla SORGENTE (sono script bash: girano solo su
// macOS con launchd; qui si verifica che dicano quello che devono dire) più
// `bash -n` su tutti gli eseguibili.
//
// Esegui: node tests/agentos/run.mjs

import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

let fails = 0;
const ok = (name, cond, detail) => {
  console.log(cond ? `PASS ${name}` : `FAIL ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`);
  if (!cond) fails++;
};
const src = f => readFileSync(new URL(`../../homie-bridge/agent-os/${f}`, import.meta.url), 'utf8');

// ── 0. tutti gli script sono bash valido ─────────────────────────────────
for (const dir of ['bin', 'lib']) {
  for (const f of readdirSync(new URL(`../../homie-bridge/agent-os/${dir}`, import.meta.url))) {
    if (!f.endsWith('.sh')) continue;
    let good = true;
    try { execFileSync('bash', ['-n', new URL(`../../homie-bridge/agent-os/${dir}/${f}`, import.meta.url).pathname]); }
    catch (e) { good = false; }
    ok(`bash -n ${dir}/${f}`, good);
  }
}

// ── 1. realtime.sh: per default NON sveglia e NON consuma la coda ─────────
const rt = src('bin/realtime.sh');
ok('realtime: allow-list vuota per default', /REALTIME_WAKE_TYPES="\$\{REALTIME_WAKE_TYPES:-\}"/.test(rt));
ok('realtime: con allow-list vuota non entra nel loop di polling', /if \[ -z "\$REALTIME_WAKE_TYPES" \]; then[\s\S]*?MANDATE mode[\s\S]*?while :; do/.test(rt));
ok('realtime: la modalità mandato precede la partenza del daemon (ordine)',
   rt.indexOf('MANDATE mode') < rt.indexOf('realtime daemon starting'));
ok('realtime: un tipo fuori allow-list viene rilasciato SENZA aos_wake_homie',
   /if ! type_allowed "\$type"; then[\s\S]*?"status":"done"[\s\S]*?return 0[\s\S]*?fi/.test(rt)
   && rt.indexOf('if ! type_allowed') < rt.indexOf('aos_wake_homie "$context"'));
ok('realtime: il vecchio prompt "scrivi risposta di benvenuto" resta SOLO dietro l\'allow-list',
   rt.includes('scrivi risposta di benvenuto') && rt.includes('type_allowed'));

// ── 2. pulse.sh: sensore gratuito, sveglia opt-in ─────────────────────────
const pl = src('bin/pulse.sh');
ok('pulse: PULSE_WAKE_LLM default 0', /PULSE_WAKE_LLM="\$\{PULSE_WAKE_LLM:-0\}"/.test(pl));
ok('pulse: con la sveglia spenta esce PRIMA di aos_wake_homie (ordine)',
   pl.indexOf('if [ "$PULSE_WAKE_LLM" != "1" ]') < pl.indexOf('aos_wake_homie "$context" minimal') &&
   /if \[ "\$PULSE_WAKE_LLM" != "1" \]; then[\s\S]*?last_pulse_ts[\s\S]*?exit 0/.test(pl));
// I commenti che raccontano il difetto restano (sono la memoria che lo tiene
// lontano): si guarda solo il CODICE, cioè le righe non commentate.
const plCode = pl.split('\n').filter(l => !/^\s*#/.test(l)).join('\n');
ok('pulse: il vecchio mandato ("boom lead-create", "boom action") è sparito dal prompt',
   !plCode.includes('boom lead-create') && !plCode.includes('boom action (Tier-2'));
ok('pulse: il prompt residuo dice al modello di NON analizzare e NON creare lead',
   /NON analizzare, NON creare lead, NON scrivere risposte/.test(pl));

// ── 3. health.sh: il sintomo, non l'indizio ───────────────────────────────
const hs = src('bin/health.sh');
ok('health: controlla che il LaunchAgent sia CARICATO (launchctl print)', /launchctl print "gui\/\$UID_NUM\/\$GW_LABEL"/.test(hs));
ok('health: controlla che la PORTA risponda (nc -z)', /nc -z 127\.0\.0\.1 "\$GW_PORT"/.test(hs));
ok('health: ricarica il gateway da solo (bootstrap + kickstart)',
   /launchctl bootstrap "gui\/\$UID_NUM" "\$GW_PLIST"/.test(hs) && /launchctl kickstart -k "gui\/\$UID_NUM\/\$GW_LABEL"/.test(hs));
ok('health: gateway_hold ferma il revive (lo stop voluto resta possibile)', /gateway_hold/.test(hs));
ok('health: "CLI in PATH" non è più l\'unico controllo',
   (hs.match(/command -v openclaw/g) || []).length >= 1 && hs.includes('gw_loaded'));

// ── 4. common.sh: l'allarme non passa dal gateway morto ───────────────────
const cm = src('lib/common.sh');
ok('alert: via gateway SOLO se la porta risponde', /command -v openclaw >\/dev\/null 2>&1 && aos_gateway_up; then/.test(cm));
ok('alert: fallback Bot API Telegram con TG_BOT_TOKEN', /api\.telegram\.org\/bot\$\{TG_BOT_TOKEN\}\/sendMessage/.test(cm));
ok('alert: senza token lo dice nel log invece di tacere', /alert NOT delivered/.test(cm));

console.log(fails ? `\n${fails} FAIL` : '\nALL PASS');
process.exit(fails ? 1 : 0);
