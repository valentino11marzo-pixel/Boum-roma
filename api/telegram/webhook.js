// api/telegram/webhook.js
// Receives Telegram updates and acts on the action_queue:
//   - inline button "approve:<id>" → set status=approved + call executor
//   - inline button "reject:<id>"  → set status=rejected
//   - inline button "edit:<id>"    → prompt the user to reply with /edit
//   - text "/start"                → welcome + show current pending
//   - text "/queue"                → list pending
//   - text "/edit <id> <new draft>"→ update payload.draft and re-stamp the queue
//   - text "/snapshot"             → portal state summary
//
// Auth: Telegram passes the optional secret via X-Telegram-Bot-Api-Secret-Token
// (set when we call setWebhook with secret_token). Plus we check chat_id
// against TELEGRAM_CHAT_ID so only the registered admin can do anything.
//
// Env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_WEBHOOK_SECRET (optional),
//      CRON_SECRET (used for the internal exec hop), HOMIE_SECRET (executor auth)

import { fsGet, fsPatch, fsList, readJson } from '../homie/_lib.js';
import { tgSend, tgEdit, tgAckCallback, requireWebhookSecret, isAuthorizedChat, fmtAction } from './_lib.js';
import { handleViewingCallback, sendAgenda } from './_viewings.js';
import { handleTaskCallback, handleTaskText, sendBrief } from '../regista/_telegram.js';
import { handleRichiamoCallback, handleRichiamaCommand } from './_richiamo.js';
import { fiduciaStatusMessage, toggleFiducia } from '../employees/_fiducia.js';
import { handoverSegretaria, segretariaOffConv, segretariaStatusMessage, toggleSegretariaKill } from '../segretaria/_core.js';

// Canonical public host for self-calls (the executor). VERCEL_URL deployment
// URLs can be auth-gated / unreliable for server-to-server self-fetches, which
// made the approve button's executor silently fail; www is the stable alias.
const BASE = process.env.PUBLIC_BASE_URL || 'https://www.boomrome.com';

// HTML escape for the Telegram messages built here (same helper as _viewings /
// notify-pending — one unescaped '<' silently kills the whole message).
const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// Persistent per-chat state (so /edit can prompt → wait for next message).
// Stored in a tiny Firestore doc so it survives serverless cold starts.
async function getState(chatId) {
  return (await fsGet(`telegramState/${chatId}`)) || {};
}
async function setState(chatId, patch) {
  await fsPatch(`telegramState/${chatId}`, { ...patch, updatedAt: new Date() });
}
async function clearState(chatId) {
  await fsPatch(`telegramState/${chatId}`, { mode: null, actionId: null, updatedAt: new Date() });
}

// Call the existing /api/agent/execute endpoint server-side (no public hop).
// Uses HOMIE_SECRET because the executor accepts the same admin signal Homie
// itself uses — same trust level.
async function callExecutor(actionId, override) {
  const res = await fetch(`${BASE}/api/agent/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Homie-Secret': process.env.HOMIE_SECRET || '',
    },
    body: JSON.stringify({ id: actionId, ...(override ? { override } : {}) }),
  });
  let data;
  try { data = await res.json(); } catch { data = { ok: false, error: `http_${res.status}` }; }
  return { ok: res.ok && data.ok !== false, status: data.status, error: data.error, data };
}

async function listPending(limit = 10) {
  try {
    return await fsList('action_queue', {
      filter: { field: 'status', op: 'EQUAL', value: 'pending' },
      orderBy: { field: 'createdAt', direction: 'DESCENDING' },
      limit,
    });
  } catch { return []; }
}

async function fmtSnapshot() {
  const pending = await listPending(5);
  if (!pending.length) return '<b>📭 Coda vuota</b>\nNessuna azione in attesa.';
  const lines = pending.map((a, i) =>
    `${i + 1}. <b>${(a.kind || 'azione')}</b> · ${(a.summary || '').slice(0, 80)} <i>(${a.id.slice(0, 8)})</i>`
  );
  return `<b>📋 ${pending.length} in attesa</b>\n` + lines.join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (!requireWebhookSecret(req, res)) return;

  let update;
  try { update = await readJson(req); }
  catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  if (!update) return res.status(200).json({ ok: true, ignored: 'no_body' });

  try {
    // ── Inline button taps ───────────────────────────────────────────────
    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq.message?.chat?.id;
      const messageId = cq.message?.message_id;
      const data = String(cq.data || '');
      const [verb, actionId] = data.split(':');

      if (!isAuthorizedChat(chatId)) {
        await tgAckCallback(cq.id, '⛔ Non autorizzato');
        return res.status(200).json({ ok: true });
      }
      if (!verb || !actionId) {
        await tgAckCallback(cq.id, 'Dati non validi');
        return res.status(200).json({ ok: true });
      }

      // ── Il ciclo visita (v*) — confirm / move / cancel, dal telefono ────
      // Deve venire PRIMA della lettura di action_queue: una visita non vive
      // in quella collezione e il lookup risponderebbe "Non trovata".
      if (verb[0] === 'v') {
        const handled = await handleViewingCallback(verb, data.slice(verb.length + 1), {
          chatId, messageId, callbackId: cq.id,
        });
        if (handled) return res.status(200).json({ ok: true });
      }

      // ── Recensione chiesta (rvw) — così non si chiede due volte ────────
      // Deve stare PRIMA della lettura di action_queue: un contratto non vive
      // lì e il lookup risponderebbe "Non trovata".
      if (verb === 'rvw') {
        try {
          await fsPatch('contracts/' + actionId, { reviewAskedAt: new Date().toISOString() });
          await tgAckCallback(cq.id, '✓ Segnato come chiesto');
          if (messageId) await tgEdit(chatId, messageId,
            (cq.message.text || '') + '\n\n✓ Richiesta segnata — non ricomparirà.');
        } catch (e) {
          console.error('[telegram] rvw:', e.message);
          await tgAckCallback(cq.id, 'Non sono riuscito a segnarlo');
        }
        return res.status(200).json({ ok: true });
      }

      // ── Il Regista (tk*) — task fatta / rimandata, dal telefono ─────────
      if (verb === 'tkd' || verb === 'tks') {
        const handled = await handleTaskCallback(verb, data.slice(verb.length + 1), {
          chatId, messageId, callbackId: cq.id,
        });
        if (handled) return res.status(200).json({ ok: true });
      }

      // ── Il Richiamo (rk/rx) — la firma a un tap su una campagna ─────────
      // Prima della lettura di action_queue: una campagna non vive lì.
      if (verb === 'rk' || verb === 'rx') {
        const handled = await handleRichiamoCallback(verb, actionId, {
          chatId, messageId, callbackId: cq.id,
        });
        if (handled) return res.status(200).json({ ok: true });
      }

      // ── La Segretaria (sg/sgx/sgk) — consegna, ripresa, kill switch ─────
      // Prima della lettura di action_queue: una conversazione non vive lì.
      if (verb === 'sg') {
        const r = await handoverSegretaria(actionId).catch(e => ({ ok: false, why: e.message }));
        await tgAckCallback(cq.id, r.ok ? '🤖 Consegnata' : (r.why || 'Non riesco').slice(0, 190));
        if (r.ok && messageId) {
          await tgEdit(chatId, messageId,
            (cq.message.text || '') + `\n\n🤖 <b>CONSEGNATA ALLA SEGRETARIA</b> — risponde lei su questa chat. Un tuo messaggio manuale la spegne; /segretaria per il quadro.`).catch(() => {});
        }
        return res.status(200).json({ ok: true });
      }
      if (verb === 'sgx') {
        await segretariaOffConv(actionId, 'ripresa dall\'operatore da /segretaria').catch(() => {});
        await tgAckCallback(cq.id, '🖐 Ripresa: ora rispondi tu');
        try {
          const { msg, keyboard } = await segretariaStatusMessage();
          if (messageId) await tgEdit(chatId, messageId, msg, { reply_markup: keyboard });
        } catch { /* non-fatal */ }
        return res.status(200).json({ ok: true });
      }
      if (verb === 'sgk') {
        await toggleSegretariaKill().catch(() => {});
        await tgAckCallback(cq.id, '✓ Fatto');
        try {
          const { msg, keyboard } = await segretariaStatusMessage();
          if (messageId) await tgEdit(chatId, messageId, msg, { reply_markup: keyboard });
        } catch { /* non-fatal */ }
        return res.status(200).json({ ok: true });
      }

      // ── La scala della fiducia (ftg) — gli interruttori di /fiducia ─────
      // Prima della lettura di action_queue: un toggle non è un'azione.
      if (verb === 'ftg') {
        const done = await toggleFiducia(actionId).catch(() => false);
        await tgAckCallback(cq.id, done ? '✓ Fatto' : 'Interruttore sconosciuto');
        if (done && messageId) {
          try {
            const { msg, keyboard } = await fiduciaStatusMessage();
            await tgEdit(chatId, messageId, msg, { reply_markup: keyboard });
          } catch (e) { console.warn('[telegram] ftg refresh:', e.message); }
        }
        return res.status(200).json({ ok: true });
      }

      const action = await fsGet(`action_queue/${actionId}`);
      if (!action) {
        await tgAckCallback(cq.id, 'Non trovata');
        return res.status(200).json({ ok: true });
      }
      if (action.status !== 'pending') {
        await tgAckCallback(cq.id, `Già ${action.status}`);
        return res.status(200).json({ ok: true });
      }

      // ── ✋ Ferma (fstop): l'auto-invio armato torna una decisione umana ──
      // Il doc resta pending con la tastiera normale: fermarla non è
      // rifiutarla — è riprendersi il tap.
      if (verb === 'fstop') {
        await fsPatch(`action_queue/${actionId}`, {
          autoSendAt: null,
          fiduciaStopped: true,
          fiduciaStoppedAt: new Date(),
        });
        await tgAckCallback(cq.id, '✋ Fermata — decidi tu');
        await tgEdit(chatId, messageId,
          fmtAction(action) + `\n\n✋ <b>FERMATA</b> — l'invio automatico è annullato, resta in approvazione manuale.\n<i>id:</i> <code>${actionId}</code>`,
          { reply_markup: { inline_keyboard: [[
            { text: '✅ Approva', callback_data: `approve:${actionId}` },
            { text: '❌ Rifiuta', callback_data: `reject:${actionId}` },
          ]] } });
        return res.status(200).json({ ok: true });
      }

      if (verb === 'approve') {
        // 1) Optimistic mark approved
        await fsPatch(`action_queue/${actionId}`, {
          status: 'approved',
          approvedAt: new Date(),
          approvedBy: 'telegram:' + chatId,
        });
        await tgAckCallback(cq.id, 'Approvata, eseguo…');
        // 2) Fire executor
        const exec = await callExecutor(actionId);
        const execDetail = exec.data && (exec.data.details || (exec.data.result && exec.data.result.error));
        const tag = exec.ok && exec.status === 'executed' ? '✅ <b>ESEGUITA</b>'
                 : exec.ok                                ? `✅ <b>APPROVATA</b> (${exec.status || 'in coda'})`
                 :                                          `⚠️ <b>APPROVATA</b> ma executor: ${exec.error || 'errore'}${execDetail ? `\n<i>${String(execDetail).slice(0, 180)}</i>` : ''}\n↻ Ripremi Approva per ritentare`;
        await tgEdit(chatId, messageId, fmtAction(action) + `\n\n${tag}\n<i>id:</i> <code>${actionId}</code>`);
        return res.status(200).json({ ok: true });
      }

      if (verb === 'reject') {
        await fsPatch(`action_queue/${actionId}`, {
          status: 'rejected',
          rejectedAt: new Date(),
          rejectedBy: 'telegram:' + chatId,
        });
        await tgAckCallback(cq.id, 'Rifiutata');
        await tgEdit(chatId, messageId, fmtAction(action) + `\n\n❌ <b>RIFIUTATA</b>\n<i>id:</i> <code>${actionId}</code>`);
        return res.status(200).json({ ok: true });
      }

      if (verb === 'edit') {
        await setState(chatId, { mode: 'awaiting_edit', actionId });
        await tgAckCallback(cq.id, 'Mandami il nuovo testo');
        await tgSend(chatId, `✏️ Mandami il nuovo testo della bozza per <code>${actionId.slice(0, 8)}…</code> in un messaggio.\nOppure /cancel per annullare.`);
        return res.status(200).json({ ok: true });
      }

      await tgAckCallback(cq.id, '?');
      return res.status(200).json({ ok: true });
    }

    // ── Text messages ────────────────────────────────────────────────────
    if (update.message) {
      const msg = update.message;
      const chatId = msg.chat?.id;
      const text = String(msg.text || '').trim();

      if (!isAuthorizedChat(chatId)) {
        await tgSend(chatId, '⛔ Non autorizzato. Per autorizzarti, imposta TELEGRAM_CHAT_ID in Vercel a <code>' + chatId + '</code>.');
        return res.status(200).json({ ok: true });
      }

      // ── Documenti in ingresso (foto o file) → Lo Smistatore ────────────
      // Manda al bot QUALSIASI documento per il commercialista (foto di un
      // F24, PDF di una fattura, ricevuta…): viene classificato dall'AI,
      // agganciato all'immobile giusto e archiviato nella cartella del
      // pacchetto — la checklist del Contabile si aggiorna da sola.
      if (msg.document || (msg.photo && msg.photo.length)) {
        return await handleIncomingDoc(chatId, msg, res);
      }

      // /start, /help, /queue, /snapshot, /cancel, /edit <id> <text>
      if (text === '/start' || text === '/help') {
        const help = [
          '<b>BOOM Roma · Cockpit Telegram</b>',
          '',
          'Ricevi notifiche quando Homie propone un\'azione (Tier 2).',
          'Tap sui bottoni per approvare/rifiutare, o:',
          '',
          '• /queue — vedi le pending',
          '• /fiducia — quali bozze possono partire da sole (coi numeri e gli interruttori)',
          '• /segretaria — le chat in mano alla Segretaria (🤖 sulla card del lead per consegnargliene una)',
          '• /vendi — manda a un cliente il link di pagamento di un servizio',
          '• /recensione — chi ringraziare oggi, con il messaggio già pronto',
          '• /visite — agenda dei prossimi 7 giorni + richieste da confermare',
          '• /giornata — il Foglio di Chiamata di oggi (visite, viaggi, task)',
          '• /calendario — il tuo Google Calendar è collegato alla griglia? Cosa blocca?',
          '• /task — i tuoi task aperti · /task <code>&lt;testo&gt;</code> per crearne uno',
          '• Oppure scrivimi "ricordami di … domani alle 15": task salvato e messo in calendario',
          '• /snapshot — stato portal',
          '• /edit <code>&lt;id&gt; &lt;testo&gt;</code> — modifica la bozza',
          '• /cancel — annulla un edit in corso',
          '',
          '📁 <b>Archivio</b>: mandami QUALSIASI documento (foto o PDF — F24,',
          'fatture, ricevute, contratti…): lo classifico, lo aggancio',
          'all\'immobile e lo archivio per il commercialista. Scrivi una',
          'didascalia se vuoi darmi un indizio (es. "F24 IMU via Cavour").',
        ].join('\n');
        await tgSend(chatId, help);
        return res.status(200).json({ ok: true });
      }

      if (text === '/cancel') {
        await clearState(chatId);
        await tgSend(chatId, '✓ Annullato.');
        return res.status(200).json({ ok: true });
      }

      if (text === '/queue') {
        await tgSend(chatId, await fmtSnapshot());
        return res.status(200).json({ ok: true });
      }

      // /segretaria — il quadro vivo: quali chat sono in mano a lei, con i
      // tasti 🖐 Riprendi e il kill switch. La consegna si fa dalla card del
      // lead (🤖); qui si controlla e si riprende.
      if (text === '/segretaria') {
        try {
          const { msg, keyboard } = await segretariaStatusMessage();
          await tgSend(chatId, msg, { reply_markup: keyboard });
        } catch (e) {
          await tgSend(chatId, '⚠️ Non riesco a leggere lo stato della Segretaria: ' + esc(e.message));
        }
        return res.status(200).json({ ok: true });
      }

      // /fiducia — LA SCALA DELLA FIDUCIA: quali categorie di bozze possono
      // partire da sole, coi numeri storici davanti e gli interruttori
      // sotto il pollice. La promozione la decide sempre l'operatore qui;
      // i numeri (campione + tasso) decidono se è anche in vigore.
      if (text === '/fiducia') {
        try {
          const { msg, keyboard } = await fiduciaStatusMessage();
          await tgSend(chatId, msg, { reply_markup: keyboard });
        } catch (e) {
          await tgSend(chatId, '⚠️ Non riesco a leggere lo stato della scala: ' + esc(e.message));
        }
        return res.status(200).json({ ok: true });
      }

      // /recensione — LE RECENSIONI, CHIESTE A CHI HA APPENA AVUTO LE CHIAVI.
      // Il journey chiede già via email a T+3; questo copre WhatsApp, che
      // converte molto di più. Non manda niente da solo: prepara il messaggio
      // e l'operatore tocca, perché la regola è chiedere SOLO a chi è
      // contento — una richiesta di massa brucia il profilo.
      // /recensione link <url> — il collaudo del link, prima di metterlo su
      // Vercel. Il link giusto apre la SCATOLA DELLE STELLE; quello che Google
      // offre col bottone "Condividi" apre il profilo, e da lì metà delle
      // persone non trova dove scrivere. Incollarlo qui dice subito quale dei
      // due hai in mano — senza scoprirlo dal calo di recensioni fra un mese.
      if (text.startsWith('/recensione link') || text.startsWith('/recensioni link')) {
        const { reviewUrl } = await import('../reviews/_lib.js');
        const cand = text.replace(/^\/recensioni?\s+link\s*/i, '').trim();
        if (!cand) {
          await tgSend(chatId, [
            '<b>Collaudo del link recensione</b>', '',
            'Uso: <code>/recensione link &lt;url&gt;</code>', '',
            'Dove prenderlo: profilo Google Business → <b>Chiedi recensioni</b>.',
            'Il link giusto ha una di queste due forme:',
            '• <code>https://g.page/r/&lt;id&gt;/review</code>',
            '• <code>https://search.google.com/local/writereview?placeid=&lt;id&gt;</code>',
            '', '<i>Quello che esce dal bottone "Condividi" (share.google / maps.app.goo.gl) NON va bene: apre il profilo, non le stelle.</i>',
          ].join('\n'));
          return res.status(200).json({ ok: true });
        }
        const good = reviewUrl(cand);
        await tgSend(chatId, good
          ? ['✅ <b>Link valido</b> — apre direttamente le stelle.', '',
             'Mettilo su Vercel come variabile <code>REVIEW_URL</code>:',
             `<code>${esc(good)}</code>`, '',
             '<i>Da quel momento lo usano sia le email del journey sia i messaggi di /recensione.</i>'].join('\n')
          : ['❌ <b>Questo non è il link giusto.</b>', '',
             `Ricevuto: <code>${esc(cand.slice(0, 120))}</code>`, '',
             'Serve una di queste due forme:',
             '• <code>https://g.page/r/&lt;id&gt;/review</code>',
             '• <code>https://search.google.com/local/writereview?placeid=&lt;id&gt;</code>', '',
             '<i>Sul profilo Google Business cerca il bottone "Chiedi recensioni": quello dà il link corto giusto. Il bottone "Condividi" dà l\'altro, che porta al profilo.</i>'].join('\n'));
        return res.status(200).json({ ok: true });
      }

      if (text === '/recensione' || text === '/recensioni') {
        const { reviewCandidates, reviewWaUrl, activeReviewUrl, hasRealReviewLink } =
          await import('../reviews/_lib.js');
        const url = activeReviewUrl();
        let rows = [];
        try {
          const contracts = await fsList('contracts', { limit: 200 });
          const enriched = [];
          for (const row of contracts || []) {
            const { id, ...c } = row;
            let u = null;
            try { if (c.tenantId) u = await fsGet('users/' + c.tenantId); } catch (_) {}
            enriched.push({
              id, ...c,
              tenantName: (u && u.name) || c.tenantName || '',
              tenantPhone: (u && (u.phone || u.tenantPhone)) || c.tenantPhone || '',
              tenantEmail: (u && u.email) || '',
              tenantLanguage: (u && u.language) || c.tenantLanguage || 'en',
              propertyAddress: c.propertyAddress || '',
            });
          }
          rows = reviewCandidates(enriched, new Date().toISOString().slice(0, 10));
        } catch (e) {
          console.error('[telegram] /recensione:', e.message);
        }
        if (!rows.length) {
          await tgSend(chatId, '⭐️ Nessuno da ringraziare oggi.\n\n<i>Compaiono qui gli inquilini entrati da 2 a 45 giorni a cui non è ancora stata chiesta la recensione.</i>');
          return res.status(200).json({ ok: true });
        }
        const head = hasRealReviewLink()
          ? '⭐️ <b>Chiedi la recensione</b>'
          : '⭐️ <b>Chiedi la recensione</b>\n<i>⚠️ REVIEW_URL non è configurato: il link apre la ricerca Google, non la scatola delle stelle. Prendi il link g.page/r/…/review dal profilo e mettilo su Vercel.</i>';
        const lines = [head, ''];
        const keyboard = [];
        for (const r of rows.slice(0, 8)) {
          lines.push(`• <b>${esc(r.name || 'inquilino')}</b>${r.property ? ' — ' + esc(r.property) : ''} · da ${r.days}gg`);
          keyboard.push([
            { text: `💬 ${(r.name || 'inquilino').split(' ')[0]}`, url: reviewWaUrl(r.phone, r.name, r.lang, url) },
            { text: '✓ Chiesto', callback_data: 'rvw:' + String(r.id).slice(0, 50) },
          ]);
        }
        lines.push('', '<i>Prima chiedi come va: la recensione si chiede a chi è contento.</i>');
        await tgSend(chatId, lines.join('\n'), { reply_markup: { inline_keyboard: keyboard } });
        return res.status(200).json({ ok: true });
      }

      // /vendi — IL LINK CHE VENDE. Ogni euro incassato da BOOM è nato in una
      // conversazione con una persona dentro; quella conversazione non aveva
      // un bottone per incassare. Ora sì: `/vendi` elenca il catalogo,
      // `/vendi <servizio> [email] [nome]` restituisce il link da inoltrare al
      // cliente su WhatsApp — prezzo dal catalogo server-side, mai digitato a
      // mano, quindi mai sbagliato.
      if (text === '/vendi' || text.startsWith('/vendi ')) {
        const { sellUrl, sellables, matchKind } = await import('../services/_sell.js');
        const arg = text.slice(6).trim();
        if (!arg) {
          const list = sellables()
            .map(s => `• <code>${s.kind}</code> — €${s.eur} · ${esc(s.label.split('—')[0].trim())}`)
            .join('\n');
          await tgSend(chatId, [
            '<b>💶 Manda un link di pagamento</b>', '',
            list, '',
            'Uso: <code>/vendi &lt;servizio&gt; [email] [nome]</code>',
            'Es: <code>/vendi virtual-viewing anna@mail.com Anna</code>',
            '', '<i>Il link apre Stripe sul servizio giusto, al prezzo di listino. Inoltralo e basta.</i>',
          ].join('\n'));
          return res.status(200).json({ ok: true });
        }
        const parts = arg.split(/\s+/);
        const kind = matchKind(parts[0]);
        if (kind === 'AMBIGUOUS') {
          await tgSend(chatId, `Quale? "${esc(parts[0])}" combacia con più servizi — scrivi l'id esatto (<code>/vendi</code> per la lista).`);
          return res.status(200).json({ ok: true });
        }
        if (!kind) {
          await tgSend(chatId, `Non conosco "${esc(parts[0])}". <code>/vendi</code> per il catalogo.`);
          return res.status(200).json({ ok: true });
        }
        const email = parts.find(p => p.includes('@')) || '';
        const name = parts.slice(1).filter(p => !p.includes('@')).join(' ');
        const url = sellUrl(kind, { email, name, ref: 'telegram' });
        const svc = sellables().find(s => s.kind === kind);
        await tgSend(chatId, [
          `<b>${esc(svc.label)}</b> — €${svc.eur}`,
          email ? `Per: ${esc(email)}${name ? ' · ' + esc(name) : ''}` : (name ? `Per: ${esc(name)}` : ''),
          '', url, '',
          '<i>Copia e incolla al cliente. Paga da telefono in un minuto; quando paga arriva il lead e partono le email.</i>',
        ].filter(Boolean).join('\n'));
        return res.status(200).json({ ok: true });
      }

      // /richiama — la campagna che ricontatta i lead senza perderne uno:
      // anteprima con esclusi e motivo, poi UN tap (✅) e parte tutto.
      if (text === '/richiama' || text.startsWith('/richiama ')) {
        await handleRichiamaCommand(chatId, text.slice(9).trim());
        return res.status(200).json({ ok: true });
      }

      // /visite — l'agenda della settimana, con le richieste ancora aperte
      // già pronte da confermare con un tap. `/visite 14` allarga l'orizzonte.
      if (text === '/visite' || text.startsWith('/visite ')) {
        const n = parseInt(text.slice(8).trim(), 10);
        await sendAgenda(chatId, Number.isFinite(n) && n > 0 && n <= 30 ? n : 7);
        return res.status(200).json({ ok: true });
      }

      // /giornata — il Foglio di Chiamata on demand (chiederlo è consenso:
      // parte anche a giornata vuota)
      if (text === '/giornata') {
        await sendBrief(chatId);
        return res.status(200).json({ ok: true });
      }

      // /calendario — il calendario esterno fallisce in silenzio per progetto
      // (fail-open). Questa è l'unica risposta esplicita: collegato o no,
      // raggiungibile o no, quali impegni tolgono slot davvero.
      if (text === '/calendario') {
        try {
          const { calendarDiagnosis, formatDiagnosis } = await import('../viewings/calendar-check.js');
          await tgSend(chatId, formatDiagnosis(await calendarDiagnosis()));
        } catch (e) {
          await tgSend(chatId, '🗓 Diagnosi non riuscita: ' + String(e.message || e).slice(0, 200));
        }
        return res.status(200).json({ ok: true });
      }

      if (text === '/snapshot') {
        // Compute the snapshot directly from Firestore (admin token) instead of
        // self-fetching our own HTTP endpoint over VERCEL_URL, which could come
        // back empty and render as a bare "{}".
        try {
          const [leads, contracts, payments, pendingActions] = await Promise.all([
            fsList('leads', { limit: 100 }),
            fsList('contracts', { limit: 100 }),
            fsList('payments', { limit: 100 }),
            fsList('action_queue', { filter: { field: 'status', op: 'EQUAL', value: 'pending' }, limit: 50 }),
          ]);
          const newLeads = leads.filter(l => l.status === 'new' || !l.status).length;
          const activeC = contracts.filter(c => c.status === 'active').length;
          const unsigned = contracts.filter(c => c.status !== 'draft' && (!c.landlordSignature || !c.tenantSignature)).length;
          const now = new Date();
          const overdue = payments.filter(p => p.status === 'pending' && p.dueDate && new Date(p.dueDate) < now).length;
          await tgSend(chatId, [
            '<b>📊 Snapshot BOOM</b>',
            `👥 Lead: ${leads.length} (${newLeads} nuovi)`,
            `📄 Contratti attivi: ${activeC} · da firmare: ${unsigned}`,
            `💶 Pagamenti scaduti: ${overdue}`,
            `⚡ Azioni in attesa: ${pendingActions.length}`,
          ].join('\n'));
        } catch (e) {
          await tgSend(chatId, '⚠️ Snapshot non disponibile al momento.');
        }
        return res.status(200).json({ ok: true });
      }

      // /edit <id> <new draft>
      if (text.startsWith('/edit ')) {
        const body = text.slice(6).trim();
        const sp = body.indexOf(' ');
        if (sp < 0) {
          await tgSend(chatId, 'Formato: <code>/edit &lt;actionId&gt; &lt;nuovo testo&gt;</code>');
          return res.status(200).json({ ok: true });
        }
        const actionId = body.slice(0, sp);
        const newDraft = body.slice(sp + 1).trim();
        return await applyEdit(chatId, actionId, newDraft, res);
      }

      // Awaiting-edit continuation (user just pressed ✏️)
      const state = await getState(chatId);
      if (state.mode === 'awaiting_edit' && state.actionId) {
        await clearState(chatId);
        return await applyEdit(chatId, state.actionId, text, res);
      }

      // Il Regista: /task, /task <testo>, o linguaggio naturale
      // ("ricordami di … domani alle 15") → promemoria + evento in calendario
      if (await handleTaskText(chatId, text)) {
        return res.status(200).json({ ok: true });
      }

      // Fallback: tip
      await tgSend(chatId, 'Comando non riconosciuto. /help per le opzioni — o scrivimi "ricordami di …" per un promemoria.');
      return res.status(200).json({ ok: true });
    }

    return res.status(200).json({ ok: true, ignored: 'unhandled_update' });
  } catch (e) {
    console.error('[telegram/webhook]', e);
    return res.status(200).json({ ok: false, error: e.message });
  }
}

async function applyEdit(chatId, actionId, newDraft, res) {
  if (!newDraft) {
    await tgSend(chatId, 'Bozza vuota — niente da fare.');
    return res.status(200).json({ ok: true });
  }
  const action = await fsGet(`action_queue/${actionId}`);
  if (!action) {
    await tgSend(chatId, `Non trovata: <code>${actionId}</code>`);
    return res.status(200).json({ ok: true });
  }
  if (action.status !== 'pending') {
    await tgSend(chatId, `Azione già <b>${action.status}</b> — non posso modificarla.`);
    return res.status(200).json({ ok: true });
  }
  const newPayload = { ...(action.payload || {}), draft: newDraft };
  await fsPatch(`action_queue/${actionId}`, { payload: newPayload, editedAt: new Date(), editedBy: 'telegram:' + chatId });
  await tgSend(chatId, `✓ Bozza aggiornata.\n\n${fmtAction({ ...action, payload: newPayload })}`);
  return res.status(200).json({ ok: true });
}

// ── Lo Smistatore via Telegram ───────────────────────────────────────────
// Scarica il file dal bot (getFile → file download), lo passa alla pipeline
// condivisa (_smista.js) e risponde con cosa ha capito e dove l'ha messo.
async function handleIncomingDoc(chatId, msg, res) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  try {
    let fileId, fileName, mimeType, fileSize;
    if (msg.document) {
      fileId = msg.document.file_id;
      fileName = msg.document.file_name || 'documento';
      mimeType = msg.document.mime_type || 'application/octet-stream';
      fileSize = msg.document.file_size || 0;
    } else {
      const best = msg.photo[msg.photo.length - 1]; // largest rendition
      fileId = best.file_id;
      fileName = 'foto.jpg';
      mimeType = 'image/jpeg';
      fileSize = best.file_size || 0;
    }

    const ACCEPTED = /^(application\/pdf|image\/(jpeg|png|webp|gif))$/;
    if (!ACCEPTED.test(mimeType)) {
      await tgSend(chatId, `⚠️ Formato non supportato (<code>${mimeType}</code>) — mandami un PDF o una foto.`);
      return res.status(200).json({ ok: true });
    }
    if (fileSize > 8 * 1024 * 1024) {
      await tgSend(chatId, '⚠️ File oltre 8MB — caricalo dal portale (Archivio) oppure mandami una versione più leggera.');
      return res.status(200).json({ ok: true });
    }

    await tgSend(chatId, '📥 Ricevuto — lo smisto…');

    const info = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`).then(r => r.json());
    const filePath = info?.result?.file_path;
    if (!filePath) throw new Error('download non disponibile da Telegram');
    const bin = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
    if (!bin.ok) throw new Error('download fallito (' + bin.status + ')');
    const base64 = Buffer.from(await bin.arrayBuffer()).toString('base64');

    const { smistaDocument } = await import('../documents/_smista.js');
    const out = await smistaDocument({
      base64, mediaType: mimeType, fileName,
      hint: msg.caption || null,
      origin: 'telegram',
    });

    const lines = [
      `📁 <b>Archiviato: ${out.label}</b>`,
      out.propertyLabel ? `🏠 ${out.propertyLabel}` : '🤔 Immobile non riconosciuto — è in <b>99_DaSmistare</b> (assegnalo dal portale, o rimandamelo con una didascalia tipo "via Cavour")',
      `📅 Anno fiscale ${out.fiscalYear} · cartella <code>${out.folder}</code>`,
      out.summary ? `<i>${out.summary}</i>` : null,
      '',
      'La checklist del commercialista si è aggiornata da sola. Archivio: https://www.boomrome.com/portal',
    ].filter(Boolean);
    await tgSend(chatId, lines.join('\n'));
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[telegram/webhook] smistatore:', e);
    await tgSend(chatId, '⚠️ Non sono riuscito ad archiviarlo: ' + e.message + '\nRiprova, o caricalo dal portale.');
    return res.status(200).json({ ok: true });
  }
}
