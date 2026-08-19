// api/radar/digest.js — LE VEDETTE, il postino (cron 3×/giorno).
//
// Le vedette (radarWatchers) hanno due canali: Telegram parte ISTANTANEO
// dall'ingestione (api/radar/_tap.js — l'operatore vuole saperlo subito);
// l'email invece esce di qui come DIGEST, perché un destinatario esterno
// non va mitragliato annuncio per annuncio durante una scansione (la
// lezione del Segugio: massimo 6 case per email, mai due volte la stessa).
//
// Il tap accoda (watcher.queue, cap 30); questo cron sceglie dalla coda ciò
// che non è mai stato notificato (digestPick nel motore), spedisce, e segna
// notifiedIds. Un rerun non rispedisce mai: l'idempotenza sta nei dati.
//
// Auth come i cron PFS; ?dry=1 conta senza spedire. Heartbeat
// teamHealth/vedetta (allerta Telegram esistente dopo 3 run falliti).

import RADAR from '../../js/radar-engine.js';
import { fsList, fsPatch } from '../homie/_lib.js';
import { requireCronOrAdmin } from '../pfs/_guard.js';
import { reportEmployeeHealth, tgNotify } from '../employees/_lib.js';
import { sendEmail } from '../agent/_lib.js';

const EMPLOYEE = 'vedetta';
const MAX_EMAILS_PER_RUN = 20;
const NOTIFIED_CAP = 300;

const escH = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const eur = n => '€' + Math.round(Number(n) || 0).toLocaleString('it-IT');

function digestHtml(watcher, hits) {
  const rows = hits.map(h => `
    <tr><td style="padding:12px 0;border-bottom:1px solid #eee">
      <a href="${escH(h.url)}" style="color:#111;text-decoration:none">
        <strong style="font-size:15px">${escH(h.title || 'Annuncio')}</strong>
        ${h.verdict === 'occasione' ? ' <span style="color:#B8960C;font-weight:600">💎 occasione</span>' : ''}<br>
        <span style="color:#666;font-size:13px">${escH(h.zone || 'Roma')}
        ${h.rooms != null ? ' · ' + h.rooms + ' camere' : ''}${h.sqm ? ' · ' + h.sqm + ' m²' : ''}
        · <strong style="color:#111">${eur(h.price)}/mese</strong> · ${escH(h.source || '')}</span><br>
        <span style="color:#B8960C;font-size:13px">Apri l'annuncio →</span>
      </a>
    </td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"></head>
  <body style="margin:0;background:#f6f6f6;font-family:Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:28px 18px">
    <div style="background:#fff;border-radius:14px;padding:26px 24px;border:1px solid #e8e8e8">
      <div style="letter-spacing:4px;font-size:12px;color:#B8960C">B O O M &nbsp;R O M A</div>
      <h2 style="font-weight:400;margin:14px 0 4px">${hits.length === 1 ? 'Nuovo annuncio' : hits.length + ' nuovi annunci'} per «${escH(watcher.name || 'la tua ricerca')}»</h2>
      <p style="color:#666;font-size:13.5px;margin:0 0 6px">Il radar BOOM tiene d'occhio il mercato per questa ricerca: ecco cosa è uscito.</p>
      <table style="width:100%;border-collapse:collapse">${rows}</table>
      <p style="color:#999;font-size:11.5px;margin:18px 0 0">A Roma le case buone vanno via in giorni: se una ti interessa, rispondi a questa email e ci muoviamo subito.</p>
    </div>
    <p style="color:#aaa;font-size:11px;text-align:center;margin:14px 0 0">
      Avviso impostato da BOOM Roma · per non riceverne più, rispondi con "stop"
    </p>
  </div></body></html>`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;
  const dry = String(req.query?.dry || '') === '1';

  const report = { watchers: 0, withQueue: 0, emailed: 0, listings: 0, skipped: [], errors: [] };
  try {
    const all = await fsList('radarWatchers', { limit: 100 });
    let sent = 0;

    for (const w of all) {
      if (!w || w.enabled === false) continue;
      report.watchers++;
      const to = w.channel && typeof w.channel.email === 'string' ? w.channel.email.trim() : '';
      if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) continue;
      const pick = RADAR.digestPick(w);
      if (!pick.send.length) continue;
      report.withQueue++;

      if (sent >= MAX_EMAILS_PER_RUN) { report.skipped.push(w.id); continue; }

      if (!dry) {
        try {
          await sendEmail({
            to,
            subject: pick.send.length === 1
              ? `Nuovo a ${pick.send[0].zone || 'Roma'}: ${eur(pick.send[0].price)}/mese — ${String(pick.send[0].title || '').slice(0, 60)}`
              : `${pick.send.length} nuovi annunci per «${w.name || 'la tua ricerca'}»`,
            html: digestHtml(w, pick.send),
          });
          sent++;
          report.emailed++;
          report.listings += pick.send.length;
          const sentIds = new Set(pick.send.map(h => h.id));
          const notified = (Array.isArray(w.notifiedIds) ? w.notifiedIds : [])
            .concat([...sentIds]).slice(-NOTIFIED_CAP);
          await fsPatch('radarWatchers/' + w.id, {
            notifiedIds: notified,
            queue: (Array.isArray(w.queue) ? w.queue : []).filter(e => e && !sentIds.has(e.id)),
            lastNotified: new Date(),
            notifyCount: (Number(w.notifyCount) || 0) + 1,
          });
        } catch (e) {
          report.errors.push((w.id + ': ' + e.message).slice(0, 140));
        }
      } else {
        report.emailed++;
        report.listings += pick.send.length;
      }
    }

    if (!dry) {
      await reportEmployeeHealth(EMPLOYEE, {
        ok: report.errors.length === 0,
        error: report.errors.length ? report.errors.join(' · ').slice(0, 400) : null,
        stats: { watchers: report.watchers, emailed: report.emailed, listings: report.listings },
      });
      if (report.emailed > 0) {
        await tgNotify(
          `📡 <b>Vedette</b> — digest partiti: ${report.emailed} email, ${report.listings} annunci.` +
          (report.errors.length ? `\n⚠️ ${report.errors.length} errori` : '')
        ).catch(() => {});
      }
    }
    return res.status(200).json({ ok: true, actor, dry, ...report });
  } catch (e) {
    console.error('[radar/digest]', e);
    if (!dry) await reportEmployeeHealth(EMPLOYEE, { ok: false, error: e.message }).catch(() => {});
    return res.status(500).json({ ok: false, error: e.message, ...report });
  }
}
