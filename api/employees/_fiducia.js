// api/employees/_fiducia.js — LA SCALA DELLA FIDUCIA, il braccio operativo.
//
// Il giudizio sta tutto in js/fiducia-engine.js (puro, testato); qui vive
// l'I/O: dentro il giro di notify-pending (ogni minuto) le bozze pending di
// una categoria PROMOSSA e PROVATA si armano con un ritardo di grazia, la
// card Telegram porta il tasto ✋ Ferma, e allo scadere l'invio passa dallo
// STESSO executor del tap manuale (api/agent/execute.js) — stessa strada,
// stesso outbox WhatsApp, stessa idempotenza. Alle 19 di Roma un digest
// elenca cosa è partito da solo.
//
// Regola di contenimento (la stessa del tap radar in _ingest): la scala è
// best-effort DENTRO notify-pending — un suo errore non deve mai fermare le
// card, i lead e le visite. Il chiamante la avvolge in try/catch.

import FID from '../../js/fiducia-engine.js';
import { fsGet, fsPatch, fsList, fsCreate } from '../homie/_lib.js';
import { tgSend, tgEdit, fmtAction, actionKeyboard } from '../telegram/_lib.js';
import executeHandler from '../agent/execute.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const ts = v => v && v.toMillis ? v.toMillis() : (v && v._seconds ? v._seconds * 1000 : (v ? new Date(v).getTime() || 0 : 0));

function romePart(ms, opts) {
  try { return new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', ...opts }).format(new Date(ms)); }
  catch { return new Intl.DateTimeFormat('it-IT', opts).format(new Date(ms)); }
}
const romeTime = ms => romePart(ms, { hour: '2-digit', minute: '2-digit', hour12: false });
const romeHour = ms => Number(romePart(ms, { hour: '2-digit', hour12: false }));
function romeDay(ms) {
  // YYYY-MM-DD nel calendario di Roma (en-CA stampa già ISO)
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date(ms)); }
  catch { return new Date(ms).toISOString().slice(0, 10); }
}

// ─── L'executor, in-process ──────────────────────────────────────────────
// Stesso trucco di callTool in agent/execute.js: si finge (req, res) così
// l'handler resta una funzione Vercel E una libreria. L'auth è la stessa
// del tap Telegram (X-Homie-Secret).
async function runExecutor(actionId) {
  let captured = { status: 0, body: null };
  const fakeReq = {
    method: 'POST',
    body: { id: actionId },
    headers: { 'x-homie-secret': process.env.HOMIE_SECRET || '' },
    on: () => {},
  };
  const fakeRes = {
    status(c) { captured.status = c; return this; },
    json(b) { captured.body = b; return this; },
    setHeader() {},
    end() { return this; },
  };
  await executeHandler(fakeReq, fakeRes);
  return captured;
}

// ─── Il giro, chiamato da notify-pending PRIMA delle card normali ────────
// pending: la lista già letta dal chiamante (status 'pending'). Ordine dei
// mestieri: (1) disarmo se l'operatore ha spento, (2) invio delle armate a
// grazia scaduta, (3) armo le nuove candidate, (4) digest serale.
export async function fiduciaTick({ pending, chatId, now = Date.now() }) {
  const raw = await fsGet('settings/fiducia').catch(() => null);
  const { cfg } = FID.mergeConfig(raw);
  const out = { armed: 0, sent: 0, disarmed: 0, failed: 0 };
  const armedDocs = (pending || []).filter(a => a.autoSendAt && !a.fiduciaStopped);

  // (1) Il kill switch vince anche sulle bozze già armate: spegnere
  // l'interruttore (globale o di categoria) DISARMA, mai "finisce il giro".
  for (const a of armedDocs) {
    const key = FID.categoryOf(a);
    if (cfg.enabled && key && cfg.categories[key]) continue;
    await fsPatch(`action_queue/${a.id}`, { autoSendAt: null, fiduciaDisarmed: new Date() });
    a.autoSendAt = null;
    out.disarmed++;
    if (chatId && a.telegramMessageId) {
      await tgEdit(chatId, a.telegramMessageId,
        fmtAction(a) + `\n\n✋ <b>Auto-invio disattivato</b> — resta a te.\n<i>id:</i> <code>${a.id}</code>`,
        { reply_markup: actionKeyboard(a.id) }).catch(() => {});
    }
  }

  // (2) Le armate a grazia scaduta partono — dalla STESSA strada del tap.
  for (const a of armedDocs) {
    if (!a.autoSendAt || ts(a.autoSendAt) > now) continue;
    // Rilettura fresca: il tap manuale (Approva/Rifiuta/Ferma) può essere
    // arrivato dopo la lista del chiamante. Solo un doc ancora pending e
    // ancora armato parte.
    const fresh = await fsGet(`action_queue/${a.id}`).catch(() => null);
    if (!fresh || fresh.status !== 'pending' || !fresh.autoSendAt || fresh.fiduciaStopped) continue;
    await fsPatch(`action_queue/${a.id}`, {
      status: 'approved',
      approvedAt: new Date(),
      approvedBy: 'fiducia-auto',
      fiduciaAutoSent: true,
      fiduciaDay: romeDay(now),
    });
    let ok = false, why = '';
    try {
      const r = await runExecutor(a.id);
      ok = r.status === 200 && r.body && r.body.ok !== false;
      why = ok ? '' : String((r.body && (r.body.error || r.body.details)) || `http_${r.status}`);
    } catch (e) { why = e.message; }
    if (ok) out.sent++; else out.failed++;
    if (chatId) {
      const tag = ok
        ? `🤖 <b>INVIATA DA SOLA</b> alle ${romeTime(now)} — categoria promossa da te (/fiducia)`
        : `⚠️ <b>Invio automatico fallito</b> (${esc(why.slice(0, 160))}) — resta a te: Approva per ritentare`;
      const text = fmtAction(a) + `\n\n${tag}\n<i>id:</i> <code>${a.id}</code>`;
      const opts = ok ? {} : { reply_markup: actionKeyboard(a.id) };
      if (a.telegramMessageId) await tgEdit(chatId, a.telegramMessageId, text, opts).catch(() => {});
      else await tgSend(chatId, text, opts).catch(() => {});
    }
  }

  // (3) Le nuove candidate si armano — solo categorie promosse e provate.
  if (cfg.enabled && Object.keys(cfg.categories).length) {
    const candidates = (pending || []).filter(a =>
      !a.autoSendAt && !a.fiducia && !a.fiduciaStopped && FID.categoryOf(a) && cfg.categories[FID.categoryOf(a)]);
    if (candidates.length) {
      // Lo storico si paga una volta per giro, e solo quando serve.
      const history = await fsList('action_queue', { limit: 400 }).catch(() => []);
      const stats = FID.statsFor(history);
      for (const a of candidates) {
        let lead = null;
        if (a.leadId && a.leadId !== 'none') lead = await fsGet(`leads/${a.leadId}`).catch(() => null);
        const v = FID.autoVerdict({ action: a, lead, stats, cfg, now });
        if (!v.auto) {
          // Stampato una volta: il perché resta sul doc e il giro dopo non
          // rilegge il lead. La card normale la manda il chiamante.
          await fsPatch(`action_queue/${a.id}`, { fiducia: { auto: false, why: v.why } }).catch(() => {});
          continue;
        }
        await fsPatch(`action_queue/${a.id}`, {
          fiducia: { auto: true, key: v.key, rate: v.rate, decided: v.decided },
          autoSendAt: new Date(v.sendAt),
        });
        out.armed++;
        if (chatId) {
          try {
            const mid = await tgSend(chatId,
              fmtAction(a) +
              `\n\n🤖 <b>Parte da sola alle ${romeTime(v.sendAt)}</b> · ${esc(v.key)} — approvata da te ${v.rate}% su ${v.decided} decisioni` +
              `\n<i>id:</i> <code>${a.id}</code>`,
              { reply_markup: { inline_keyboard: [
                [{ text: '✋ Ferma — decido io', callback_data: `fstop:${a.id}` }],
                [{ text: '✅ Manda subito', callback_data: `approve:${a.id}` },
                 { text: '❌ Rifiuta', callback_data: `reject:${a.id}` }],
              ] } });
            await fsPatch(`action_queue/${a.id}`, {
              telegramNotifiedAt: new Date(), telegramMessageId: mid || null, telegramChatId: chatId,
            });
            // il chiamante ha la lista in mano: senza questo, la card normale
            // partirebbe una seconda volta nello stesso giro
            a.telegramNotifiedAt = new Date(); a.telegramMessageId = mid || null;
          } catch { /* la card normale farà da rete al giro dopo */ }
        }
      }
    }
  }

  // (4) Il digest delle 19: cosa è partito da solo oggi. Idempotente per
  // costruzione (fsCreate con id del giorno → 409 al secondo tentativo).
  if (romeHour(now) === 19 && chatId) {
    const day = romeDay(now);
    let first = false;
    try { await fsCreate('heartbeat', { kind: 'fiducia-digest', day, at: new Date() }, `fiducia-digest-${day}`); first = true; }
    catch (e) { if (!e.exists) console.warn('[fiducia] digest marker:', e.message); }
    if (first) {
      const sent = await fsList('action_queue', {
        filter: { field: 'fiduciaDay', op: 'EQUAL', value: day }, limit: 50,
      }).catch(() => []);
      if (sent.length) {
        const rows = sent.map(a => `• ${esc(String(a.summary || a.kind || a.id).slice(0, 90))}`).join('\n');
        await tgSend(chatId,
          `🤖 <b>Oggi la scala della fiducia ha inviato da sola ${sent.length} messaggi${sent.length === 1 ? 'o' : ''}:</b>\n${rows}\n\n<i>/fiducia per il quadro e gli interruttori.</i>`
        ).catch(() => {});
        out.digest = sent.length;
      }
    }
  }

  return out;
}

// ─── /fiducia — il quadro e gli interruttori, dal telefono ───────────────
export async function fiduciaStatusMessage() {
  const raw = await fsGet('settings/fiducia').catch(() => null);
  const { cfg, rejected } = FID.mergeConfig(raw);
  const history = await fsList('action_queue', { limit: 400 }).catch(() => []);
  const rows = FID.statusRows(FID.statsFor(history), cfg);
  const lines = rows.map(r => {
    const nums = r.decided ? `${r.rate == null ? 'n/d' : r.rate + '%'} su ${r.decided} decisioni` : 'nessuna decisione storica';
    const state = !r.on ? '⚪ spenta' : r.ready ? '🟢 attiva' : `🟡 accesa ma in attesa dei numeri (servono ≥${cfg.minSample} decisioni al ≥${cfg.minRate}%)`;
    return `${state} — <b>${esc(r.label)}</b>\n     ${nums}`;
  });
  const neverLines = Object.keys(FID.NEVER).map(k => `• <code>${esc(k)}</code>: ${esc(FID.NEVER[k])}`);
  const msg = [
    `<b>🤖 La scala della fiducia</b> — interruttore generale: ${cfg.enabled ? '🟢 ACCESO' : '🔴 SPENTO'}`,
    '',
    'Una categoria promossa parte DA SOLA dopo ' + cfg.graceMin + ' minuti di grazia (✋ Ferma sulla card). Digest ogni sera alle 19.',
    '',
    ...lines,
    '',
    '<b>Mai promuovibili</b> (per costruzione):',
    ...neverLines,
    ...(rejected.length ? ['', '⚠️ Impostazioni ignorate: ' + rejected.map(r => r.key).join(', ')] : []),
  ].join('\n');
  const keyboard = { inline_keyboard: [
    [{ text: cfg.enabled ? '🔴 Spegni tutto' : '🟢 Accendi l\'interruttore generale', callback_data: 'ftg:all' }],
    ...rows.map(r => [{ text: `${r.on ? '⏸ Spegni' : '▶️ Promuovi'} · ${r.label.slice(0, 44)}`, callback_data: `ftg:${r.code}` }]),
  ] };
  return { msg, keyboard };
}

// ─── Il toggle (callback ftg:<all|code>) ─────────────────────────────────
export async function toggleFiducia(arg) {
  const raw = (await fsGet('settings/fiducia').catch(() => null)) || {};
  if (arg === 'all') {
    await fsPatch('settings/fiducia', { enabled: raw.enabled !== true, updatedAt: new Date() });
    return true;
  }
  const cat = FID.byCode(arg);
  if (!cat) return false;
  const cats = { ...(raw.categories || {}) };
  cats[cat.key] = cats[cat.key] !== true;
  await fsPatch('settings/fiducia', { categories: cats, updatedAt: new Date() });
  return true;
}
