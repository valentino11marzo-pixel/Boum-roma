// api/search/matcher.js
// The saved-search alert engine. Cron (3×/day) — every active doc in
// `savedSearches` is matched against the live `listings` catalog; NEW
// matches (never notified before) are emailed as a short digest with
// direct /listing/:id links.
//
// Anti-spam by design:
//   - First run per search SEEDS silently: everything that already matches
//     is recorded in notifiedIds without an email, so subscribers are only
//     ever told about listings that appeared AFTER they saved the search.
//   - notifiedIds caps at 400 ids (oldest dropped) — a listing is never
//     emailed twice to the same subscriber.
//   - Max 6 listings per email; max 40 emails per run (safety valve).
//
// Auth: Vercel cron (`Authorization: Bearer CRON_SECRET`).
// GET /api/search/matcher?dry=1 → report only, no emails, no writes.

import { fsList, fsPatch } from '../homie/_lib.js';
import { sendEmail } from '../agent/_lib.js';
import { shell, para, btn, fine } from '../preagreement/_notify.js';
import DISPO from '../../js/dispo-engine.js';
import SCALO from '../../js/scalo-codes.js';

const SITE = 'https://www.boomrome.com';

const norm = s => String(s || '').toLowerCase().trim();

// Rentable = la corsia commerciale, non l'etichetta. Così entra anche la
// casa AFFITTATA di cui il contratto dichiara la fine (availableFrom): è
// esattamente l'annuncio che serve a chi cerca con mesi di anticipo, e fino
// a oggi era l'unica categoria che il Segugio non poteva vedere.
function isRentable(l) {
  return DISPO.marketLane(l).lane !== 'closed';
}

// Mirrors the discovery page's pass() closely enough to keep promises honest.
export function matches(criteria, l) {
  const c = criteria || {};
  if (c.budgetMax && Number(l.price) > Number(c.budgetMax)) return false;
  if (c.beds  && Number(l.beds  || 0) < Number(c.beds))  return false;
  if (c.baths && Number(l.bathrooms || l.baths || 0) < Number(c.baths)) return false;
  if (c.furnished && !(l.furnished === true || norm(l.furnished) === 'yes' || norm(l.furnished) === 'furnished')) return false;
  if (c.video && !l.videoUrl) return false;
  if (Array.isArray(c.zones) && c.zones.length) {
    const z = norm(l.zone);
    if (!c.zones.some(x => z === norm(x) || z.includes(norm(x)))) return false;
  }
  if (Array.isArray(c.feats) && c.feats.length) {
    const feats = (Array.isArray(l.features) ? l.features : []).map(norm);
    if (!c.feats.every(f => feats.some(x => x.includes(norm(f))))) return false;
  }
  if (c.q) {
    const hay = norm((l.name || '') + ' ' + (l.zone || '') + ' ' + (l.description || ''));
    if (!hay.includes(norm(c.q))) return false;
  }
  // LA DATA DI INGRESSO, che questo filtro non guardava affatto: chi salva
  // «mi serve da settembre» riceveva le case libere adesso e NON quelle che
  // si liberano a settembre — cioè il contrario di ciò che aveva chiesto.
  // Stessa regola della discovery: passa ciò che è libero ENTRO il tuo
  // atterraggio; una casa senza data non viene esclusa (non sappiamo, e
  // tacere è peggio che proporre).
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(c.moveIn || ''))) {
    const iso = DISPO.marketLane(l).iso;
    if (iso && iso > c.moveIn) return false;
  }
  return true;
}

const eur = n => '€' + Number(n || 0).toLocaleString('en-US');
const escH = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

// IL NOTAM DEL SEGUGIO (STUDIO_AVIATION, W5): il digest parla la lingua del
// board — righe da tabellone, codici di rotta dal lessico condiviso, corsie
// da marketLane — dentro il design system email condiviso (shell), così chi
// ha già ricevuto una email BOOM riconosce anche questa.
//
// La corsia esce SOLO da marketLane (la disciplina del board): now → FREE,
// ahead con data → FREE FROM <giorno mese>, ahead senza data → RESERVE
// AHEAD. `closed` non arriva mai qui: isRentable lo esclude alla porta.
const MESI_EN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
export function laneWord(l, today = new Date()) {
  const m = DISPO.marketLane(l);
  if (m.lane === 'now') return { word: 'FREE', color: '#1E7A45' };
  if (m.lane === 'ahead') {
    if (!m.iso) return { word: 'RESERVE AHEAD', color: '#8A6D1D' };
    const yr = m.iso.slice(0, 4) === String(today.getFullYear()) ? '' : ' ' + m.iso.slice(0, 4);
    return { word: `FREE FROM ${+m.iso.slice(8, 10)} ${MESI_EN[+m.iso.slice(5, 7) - 1]}${yr}`, color: '#8A6D1D' };
  }
  return null;
}

export function digestHtml(search, hits) {
  const rows = hits.map(l => {
    // il codice SOLO dal lessico curato — nessun match → niente sigla,
    // resta il nome della zona per esteso (mai una sigla inventata).
    const code = SCALO.zoneCode(String(l.zone || ''));
    const lane = laneWord(l);
    const meta = [escH(l.zone || 'Rome'), l.beds ? l.beds + ' bed' : 'Studio', l.sqm ? l.sqm + ' m²' : '']
      .filter(Boolean).join(' · ');
    return `
    <tr><td style="padding:13px 0;border-bottom:1px solid #E7E4DC">
      <a href="${SITE}/listing/${encodeURIComponent(l.id)}" style="text-decoration:none">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="font-family:Helvetica,Arial,sans-serif">
            ${code ? `<span style="display:inline-block;border:1px solid #8A6D1D;color:#8A6D1D;font-size:9.5px;letter-spacing:1.6px;padding:2px 7px;border-radius:4px;margin-right:8px;vertical-align:1px">${code}</span>` : ''}<strong style="font-size:15px;font-weight:500;color:#141414">${escH(l.name || 'Apartment')}</strong><br>
            <span style="color:#6E6A60;font-size:12.5px;line-height:1.9">${meta}</span>
          </td>
          <td align="right" style="font-family:Helvetica,Arial,sans-serif;white-space:nowrap;vertical-align:top">
            <strong style="font-size:15px;color:#8A6D1D">${eur(l.price)}/mo</strong><br>
            ${lane ? `<span style="font-size:10px;letter-spacing:1.6px;color:${lane.color}">${lane.word}</span>` : ''}
          </td>
        </tr></table>
      </a>
    </td></tr>`;
  }).join('');
  const unsub = `${SITE}/api/search/unsub?id=${encodeURIComponent(search.id)}&e=${encodeURIComponent(search.email)}`;
  const inner =
    para(`<span style="font-size:9.5px;letter-spacing:2.4px;color:#98948A">NOTAM &middot; NEW ON THE BOARD</span><br>` +
      `<b style="font-size:19px;font-weight:300">New home${hits.length > 1 ? 's' : ''} matching your search</b>`) +
    para(`${search.label ? 'Your search &ldquo;' + escH(search.label) + '&rdquo;' : 'Your saved search'} just matched ${hits.length} new listing${hits.length > 1 ? 's' : ''} — video-verified, transparent pricing.`) +
    `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 4px">${rows}</table>` +
    btn(`${SITE}/apartments`, 'See everything →') +
    para('Rome moves fast — the good ones go in days. Questions? Just reply, a human answers within 2 hours.') +
    fine(`You saved this search on boomrome.com · <a href="${unsub}" style="color:#98948A">stop these alerts</a>`);
  return shell(inner, `New on the board — your saved search just matched ${hits.length} home${hits.length > 1 ? 's' : ''}`);
}

export default async function handler(req, res) {
  const isVercelCron = req.headers['authorization'] === `Bearer ${process.env.CRON_SECRET}`;
  const dry = req.query?.dry === '1';
  if (!isVercelCron && !dry) return res.status(401).json({ ok: false, error: 'unauthorized' });

  const report = { searches: 0, seeded: 0, emailed: 0, matchesFound: 0, errors: [] };
  try {
    const [searches, listings] = await Promise.all([
      fsList('savedSearches', { limit: 300 }),
      fsList('listings', { limit: 300 }),
    ]);
    const catalog = listings.filter(isRentable);
    let emailsSent = 0;

    for (const s of searches) {
      if (norm(s.status) !== 'active' || !s.email) continue;
      report.searches++;
      const criteria = typeof s.criteria === 'string' ? safeJson(s.criteria) : (s.criteria || {});
      const known = new Set(Array.isArray(s.notifiedIds) ? s.notifiedIds : (typeof s.notifiedIds === 'string' ? safeJson(s.notifiedIds) || [] : []));
      const hit = catalog.filter(l => matches(criteria, l));
      const fresh = hit.filter(l => !known.has(l.id));
      if (!fresh.length) continue;

      const allIds = [...known, ...fresh.map(l => l.id)].slice(-400);

      if (!s.lastNotified && !known.size) {
        // First contact: seed silently so we only ever alert on the future.
        report.seeded++;
        if (!dry) await fsPatch(`savedSearches/${s.id}`, { notifiedIds: JSON.stringify(allIds), seededAt: new Date().toISOString() });
        continue;
      }

      report.matchesFound += fresh.length;
      if (emailsSent >= 40) continue; // safety valve
      if (!dry) {
        try {
          await sendEmail({
            to: s.email,
            subject: fresh.length === 1
              ? `New in ${fresh[0].zone || 'Rome'}: ${(fresh[0].name || 'a verified home')} — ${eur(fresh[0].price)}/mo`
              : `${fresh.length} new Rome homes match your search`,
            html: digestHtml(s, fresh.slice(0, 6)),
          });
          emailsSent++;
          report.emailed++;
          await fsPatch(`savedSearches/${s.id}`, {
            notifiedIds: JSON.stringify(allIds),
            lastNotified: new Date().toISOString(),
            notifyCount: Number(s.notifyCount || 0) + 1,
          });
        } catch (e) {
          report.errors.push(`${s.id}: ${e.message}`.slice(0, 120));
        }
      } else {
        report.emailed++; // would have
      }
    }
    return res.status(200).json({ ok: true, dry, ...report });
  } catch (e) {
    console.error('[matcher]', e);
    return res.status(500).json({ ok: false, error: e.message, ...report });
  }
}

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }
