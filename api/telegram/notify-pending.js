// api/telegram/notify-pending.js
// Cron-triggered scanner. Every minute (per vercel.json) it queries
// `action_queue` for newly-pending actions Homie proposed and that the user
// hasn't been pinged about yet, then ships them to Telegram with inline
// Approva/Rifiuta/Modifica buttons. Idempotent: marks `telegramNotifiedAt`
// + `telegramMessageId` so the next run skips them.
//
// Auth: Vercel cron sets `Authorization: Bearer ${CRON_SECRET}` automatically.
//
// Env:
//   CRON_SECRET, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

import { fsList, fsPatch } from '../homie/_lib.js';
import { tgSend, fmtAction, actionKeyboard } from './_lib.js';
import { fiduciaTick } from '../employees/_fiducia.js';
import { fmtViewingCard, viewingKeyboard } from './_viewings.js';
import { loadViewing } from '../viewings/_apply.js';
import { replyLang } from '../_lang.js';
import { isReunion, reunionReplyText, isB2B, b2bReplyText } from '../_market.js';

const MAX_PER_RUN = 10; // cap so a backlog doesn't spam Telegram
const esc = s => String(s || '').replace(/[&<>]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c]));

export default async function handler(req, res) {
  // Vercel cron auth
  if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) return res.status(200).json({ ok: true, skipped: 'TELEGRAM_CHAT_ID not set' });
  if (!process.env.TELEGRAM_BOT_TOKEN) return res.status(200).json({ ok: true, skipped: 'TELEGRAM_BOT_TOKEN not set' });

  // Fetch pending actions. Use a single-field equality filter only — adding an
  // orderBy on a DIFFERENT field (createdAt) needs a Firestore composite index
  // that isn't provisioned, which made this 500 once Telegram env was set. We
  // order in code instead.
  let pending;
  try {
    pending = await fsList('action_queue', {
      filter: { field: 'status', op: 'EQUAL', value: 'pending' },
      limit: 50,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'list_failed', details: e.message });
  }
  const ts = v => v && v.toMillis ? v.toMillis() : (v && v._seconds ? v._seconds * 1000 : (v ? new Date(v).getTime() || 0 : 0));
  pending = (pending || []).sort((a, b) => ts(b.createdAt) - ts(a.createdAt));

  // ── La scala della fiducia — PRIMA delle card normali. ─────────────────
  // Le categorie promosse dall'operatore (/fiducia) si armano qui con il
  // ritardo di grazia e la loro card (col tasto ✋ Ferma) sostituisce quella
  // normale: il tick marca telegramNotifiedAt anche sulla copia in memoria,
  // così il giro sotto non manda la stessa azione due volte. Best-effort:
  // un errore della scala non ferma mai card, lead e visite.
  let fiducia = null;
  try { fiducia = await fiduciaTick({ pending, chatId }); }
  catch (e) { console.warn('[notify-pending] fiducia tick failed:', e.message); }

  const toNotify = (pending || [])
    .filter(a => !a.telegramNotifiedAt && !a.telegramMessageId)
    .slice(0, MAX_PER_RUN);

  const results = [];
  for (const a of toNotify) {
    try {
      const messageId = await tgSend(
        chatId,
        fmtAction(a) + `\n\n<i>id:</i> <code>${a.id}</code>`,
        { reply_markup: actionKeyboard(a.id) }
      );
      // Mark as notified so we don't double-send.
      await fsPatch(`action_queue/${a.id}`, {
        telegramNotifiedAt: new Date(),
        telegramMessageId: messageId || null,
        telegramChatId: chatId,
      });
      results.push({ id: a.id, messageId, ok: true });
    } catch (e) {
      results.push({ id: a.id, ok: false, error: e.message });
    }
  }

  // ── Also push high-priority business EVENTS, not just proposed actions. ──
  // agentNotifications (contract.signed, maintenance.opened, lead.new, concierge
  // emergencies) used to reach Telegram only via the Mac daemon. Push urgent/high
  // ones server-side so the operator's phone pings even with the Mac off. No
  // buttons — these are informational; the action loop above carries the buttons.
  const HOT = new Set(['urgent', 'high']);
  let events = [];
  try {
    events = await fsList('agentNotifications', {
      filter: { field: 'status', op: 'EQUAL', value: 'pending' },
      limit: 50,
    });
  } catch (_) { /* collection/rules absent → non-fatal */ }
  const evToNotify = (events || [])
    .filter(e => HOT.has(e.priority) && !e.telegramNotifiedAt)
    .slice(0, MAX_PER_RUN);
  const evResults = [];
  for (const e of evToNotify) {
    try {
      const icon = e.priority === 'urgent' ? '🚨' : '🔔';
      const mid = await tgSend(
        chatId,
        `${icon} <b>${esc(e.type || 'evento')}</b>\n${esc(e.summary || '')}\n\n<a href="https://www.boomrome.com/portal.html">Apri portale</a>`
      );
      await fsPatch(`agentNotifications/${e.id}`, {
        telegramNotifiedAt: new Date(),
        telegramMessageId: mid || null,
        telegramChatId: chatId,
      });
      evResults.push({ id: e.id, ok: true });
    } catch (err) {
      evResults.push({ id: e.id, ok: false, error: err.message });
    }
  }

  // ── 🐞 Bug reports: la segnalazione dell'operatore suona sul telefono ───
  // entro un minuto (sa che è presa in carico); il contesto completo —
  // errori client allegati da boom-err — resta sul doc per chi la lavora.
  let bugs = [];
  try {
    bugs = await fsList('bugReports', {
      filter: { field: 'status', op: 'EQUAL', value: 'open' },
      limit: 20,
    });
  } catch (_) { /* collection/rules assenti → non-fatale */ }
  const bugToNotify = (bugs || []).filter(b => !b.telegramNotifiedAt).slice(0, 5);
  const bugResults = [];
  for (const b of bugToNotify) {
    try {
      const nErr = Array.isArray(b.errs) ? b.errs.length : 0;
      const mid = await tgSend(
        chatId,
        `🐞 <b>Segnalazione bug</b> — ${esc(b.page || '?')}\n${esc(String(b.message || '').slice(0, 400))}${nErr ? `\n\n⚙ ${nErr} error${nErr === 1 ? 'e' : 'i'} client allegat${nErr === 1 ? 'o' : 'i'} sul doc` : ''}`
      );
      await fsPatch(`bugReports/${b.id}`, {
        telegramNotifiedAt: new Date(),
        telegramMessageId: mid || null,
      });
      bugResults.push({ id: b.id, ok: true });
    } catch (err) {
      bugResults.push({ id: b.id, ok: false, error: err.message });
    }
  }

  // ── Instant NEW-LEAD ping: the lead circle starts within a minute. ──────
  // Whatever caught the lead (portal-email scanner, Homie/WhatsApp, apply
  // form), the operator's phone shows WHO, WHAT and — when there's a phone —
  // a one-tap "open WhatsApp" button. The AI reply draft still follows via
  // the Commerciale's proposal card; this is the speed layer.
  let leads = [];
  try {
    leads = await fsList('leads', {
      filter: { field: 'status', op: 'EQUAL', value: 'new' },
      limit: 50,
    });
  } catch (_) { /* non-fatal */ }
  const GRADE_ICON = { A: '🔥', B: '🟢', C: '🟡' };
  const gradeRank = l => ({ A: 0, B: 1 }[l.grade] ?? 2);
  // Wait up to ~4 min for the Lead Brain grade+brief before pinging, so the
  // card usually arrives already analyzed; older ungraded leads ping anyway.
  // EXCEPT WhatsApp: that person is typing RIGHT NOW, on the channel where a
  // reply within a minute is normal and one within an hour is an insult. A
  // portal email can wait for its grade; a live chat cannot.
  const GRACE_MS = 4 * 60 * 1000;
  const isLive = l => String(l.source || '') === 'whatsapp';
  const ldToNotify = (leads || [])
    .filter(l => !l.telegramNotifiedAt && l.grade !== 'dead')
    .filter(l => l.grade || isLive(l) || (Date.now() - ts(l.createdAt)) >= GRACE_MS)
    .sort((a, b) => gradeRank(a) - gradeRank(b) || ts(b.createdAt) - ts(a.createdAt))
    .slice(0, 5);
  // Anti-chaos at volume: A/B (and not-yet-graded) leads get a full compact
  // card each; C leads are BATCHED into one digest message per run. Dead
  // never ping. Cards keep a fixed visual grammar — grade first, then home,
  // then contact, then quote — so ten in a row still scan in seconds.
  const ldFull = ldToNotify.filter(l => l.grade !== 'C');
  const ldLight = ldToNotify.filter(l => l.grade === 'C');
  const ldResults = [];
  for (const l of ldFull) {
    try {
      // WhatsApp reads as a live thread, not as a source label — the operator
      // must see at a glance that someone is waiting on the other side.
      const src = isReunion(l) ? '🇷🇪 La Réunion'
        : isB2B(l) ? '🏢 ente / azienda'
        : String(l.source || '') === 'whatsapp' ? '💬 ti ha scritto su WhatsApp'
        : esc(l.source || '?');
      const head = l.grade
        ? `${GRADE_ICON[l.grade] || '🟢'} <b>${esc(l.name || 'Lead')}</b> · ${src} · ${esc(l.grade)}`
        : `🟢 <b>${esc(l.name || 'Lead')}</b> · ${src}`;
      const bits = [
        head,
        l.propertyTitle ? `🏠 ${esc(l.propertyTitle)}${l.propertyPrice ? ' · €' + Number(l.propertyPrice).toLocaleString('it-IT', { useGrouping: true, maximumFractionDigits: 0 }) + '/mese' : ''}` : null,
        (l.phone || l.email) ? [l.phone && `📞 ${esc(l.phone)}`, l.email && `✉️ ${esc(l.email)}`].filter(Boolean).join(' · ') : null,
        // AI brief when the Brain produced one (synthetic but detail-complete);
        // raw quote as fallback so nothing is ever hidden
        l.brief ? `🧠 ${esc(l.brief)}` : (l.message ? `💬 <i>${esc(String(l.message).slice(0, 240))}</i>` : null),
      ].filter(Boolean);
      const digits = String(l.phone || '').replace(/\D/g, '');
      const waNum = digits ? (digits.length === 10 && digits.startsWith('3') ? '39' + digits : digits) : null;
      // Pre-filled first message: greeting by first name, THEIR apartment
      // with its public link, and the right question — the operator lands
      // in WhatsApp with the reply ready to send (editable before sending).
      let wa = null;
      if (waNum) {
        const first = String(l.name || '').trim().split(/\s+/)[0] || '';
        const link = l.propertyId ? `https://www.boomrome.com/listing/${encodeURIComponent(l.propertyId)}` : 'https://www.boomrome.com/apartments';
        const title = l.propertyTitle || null;
        // Language is decided by what they ACTUALLY wrote, not by a stored
        // flag: the portal-email extractor used to default everyone to 'it'.
        const en = replyLang(l) !== 'it';
        // A lead who wrote to us ON WhatsApp is already mid-conversation:
        // opening with "Hi, thanks for your interest" reads like a cold
        // outreach to someone who is looking at their own message above it.
        // Same channel, different move: answer, don't introduce yourself.
        const inThread = String(l.source || '') === 'whatsapp';
        // La Réunion parla francese e non ha nulla a che vedere col catalogo
        // romano: il messaggio pronto qui sotto manderebbe a un proprietario
        // di Saint-Pierre il link agli appartamenti di Roma, in inglese.
        // Un ente/azienda (B2B) invece parla di PERSONE DA SISTEMARE, non di
        // una casa per sé: la voce inquilino ("ti andrebbe una visita?") a un
        // HR è la stessa figuraccia in un altro vestito.
        const msgTxt = isReunion(l) ? reunionReplyText(l) : isB2B(l) ? b2bReplyText(l) : inThread
          ? (en
            ? (`Hi${first ? ' ' + first : ''}, Valentino here 👋` +
               (title ? ` Here's everything on "${title}" — photos, video and details: ${link}` : ` ${link}`) +
               `\nWant to see it? I can do in person or a live video call — tell me what suits you.`)
            : (`Ciao${first ? ' ' + first : ''}, sono Valentino 👋` +
               (title ? ` Qui trovi tutto su "${title}" — foto, video e dettagli: ${link}` : ` ${link}`) +
               `\nLa vuoi vedere? Posso dal vivo o in videochiamata — dimmi tu.`))
          : (en
            ? (`Hi${first ? ' ' + first : ''}! This is Valentino from BOOM Roma 👋 Thanks for your interest` +
               (title ? ` in "${title}"` : '') + `. Here you'll find all the details, photos and video: ${link}\n` +
               `Would you like to book a viewing (in person or live video)? Or just ask me anything you'd like to know!`)
            : (`Ciao${first ? ' ' + first : ''}! Sono Valentino di BOOM Roma 👋 Grazie per il tuo interesse` +
               (title ? ` per "${title}"` : '') + `. Qui trovi tutti i dettagli, le foto e il video: ${link}\n` +
               `Ti andrebbe di fissare una visita (dal vivo o in video)? Oppure chiedimi pure qualsiasi informazione!`));
        wa = `https://wa.me/${waNum}?text=${encodeURIComponent(msgTxt)}`;
      }
      const buttons = [[]];
      if (wa) buttons[0].push({
        text: String(l.source || '') === 'whatsapp' ? '💬 Rispondi (già scritto)' : '💬 WhatsApp (msg pronto)',
        url: wa,
      });
      buttons[0].push({ text: '📇 Portale', url: 'https://www.boomrome.com/portal' });
      // La consegna alla Segretaria (STUDIO_SEGRETARIA): solo dove esiste già
      // una conversazione WhatsApp — il click è la firma per QUELLA chat.
      if (l.conversationId && l.phone) buttons.push([{ text: '🤖 Passa alla Segretaria', callback_data: `sg:${l.id}` }]);
      const mid = await tgSend(chatId, bits.join('\n'), { reply_markup: { inline_keyboard: buttons } });
      await fsPatch(`leads/${l.id}`, { telegramNotifiedAt: new Date(), telegramMessageId: mid || null });
      ldResults.push({ id: l.id, ok: true });
    } catch (err) {
      ldResults.push({ id: l.id, ok: false, error: err.message });
    }
  }
  // C-grade digest: one line each, one message, one Portale button
  if (ldLight.length) {
    try {
      const rows = ldLight.map(l =>
        `• ${esc(l.name || '?')} — ${esc(l.source || '?')}${l.propertyTitle ? ' · ' + esc(String(l.propertyTitle).slice(0, 40)) : ''}${l.phone ? ' · 📞' : ''}`
      ).join('\n');
      const mid = await tgSend(chatId,
        `🟡 <b>${ldLight.length} lead C</b> (deboli ma reali) — il Commerciale li copre coi template:\n${rows}`,
        { reply_markup: { inline_keyboard: [[{ text: '📇 Vedili sul portale', url: 'https://www.boomrome.com/portal' }]] } });
      for (const l of ldLight) {
        await fsPatch(`leads/${l.id}`, { telegramNotifiedAt: new Date(), telegramMessageId: mid || null });
        ldResults.push({ id: l.id, ok: true });
      }
    } catch (err) {
      ldResults.push({ digest: true, ok: false, error: err.message });
    }
  }

  // ── Il ciclo visita: ogni richiesta arriva col tasto per chiuderla. ─────
  // Una visita che aspetta è un cliente che aspetta. La card porta i tre
  // gesti (conferma all'orario proposto, sposta, annulla) così il giro si
  // chiude dal telefono, in piedi, in dieci secondi. Le visite che il
  // cliente ha già prenotato da solo negli slot pubblici arrivano come
  // notifica — non c'è niente da approvare, gli slot ERANO la disponibilità
  // dichiarata — ma con Sposta/Annulla a portata di pollice.
  let viewings = [];
  try {
    for (const status of ['pending', 'confirmed']) {
      viewings = viewings.concat(await fsList('viewingRequests', {
        filter: { field: 'status', op: 'EQUAL', value: status },
        limit: 50,
      }));
    }
  } catch (_) { /* non-fatal */ }
  const vwToNotify = (viewings || [])
    .filter(v => !v.voided && !v.telegramNotifiedAt)
    // una visita già confermata si annuncia solo se l'ha presa il cliente:
    // quelle confermate dall'operatore le ha appena toccate lui
    .filter(v => String(v.status).toLowerCase() === 'pending' || v.selfBooked)
    .sort((a, b) => ts(b.createdAt) - ts(a.createdAt))
    .slice(0, 5);
  const vwResults = [];
  for (const v of vwToNotify) {
    try {
      const full = (await loadViewing(v.id).catch(() => null)) || v;
      const mid = await tgSend(chatId, fmtViewingCard(full), { reply_markup: viewingKeyboard(full) });
      await fsPatch(`viewingRequests/${v.id}`, { telegramNotifiedAt: new Date(), telegramMessageId: mid || null });
      vwResults.push({ id: v.id, ok: true });
    } catch (err) {
      vwResults.push({ id: v.id, ok: false, error: err.message });
    }
  }

  // Heartbeat (audit P1.2): notify-pending gira ogni minuto ed è il canale con
  // cui l'operatore riceve TUTTO (azioni, lead, visite) sul telefono — era
  // cieco. Best-effort, mai fatale.
  try {
    const { reportEmployeeHealth } = await import('../employees/_lib.js');
    await reportEmployeeHealth('notify-pending', { ok: true, stats: { pending: pending.length, leads: leads.length, viewings: viewings.length } });
  } catch { /* non-fatal */ }

  return res.status(200).json({
    ok: true,
    fiducia,
    scanned: pending.length,
    notified: results.filter(r => r.ok).length,
    failed:   results.filter(r => !r.ok).length,
    events: { scanned: events.length, notified: evResults.filter(r => r.ok).length, failed: evResults.filter(r => !r.ok).length },
    bugs: { scanned: bugs.length, notified: bugResults.filter(r => r.ok).length, failed: bugResults.filter(r => !r.ok).length },
    leads: { scanned: leads.length, notified: ldResults.filter(r => r.ok).length, failed: ldResults.filter(r => !r.ok).length },
    viewings: { scanned: viewings.length, notified: vwResults.filter(r => r.ok).length, failed: vwResults.filter(r => !r.ok).length },
    results,
  });
}
