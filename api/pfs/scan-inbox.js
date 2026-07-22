// api/pfs/scan-inbox.js
// THE load-bearing ingestion source: reads the portal alert emails
// (Idealista "della tua ricerca", Immobiliare saved-search alerts) from
// the Gmail mailbox over IMAP and feeds every listing through the shared
// pipeline (_ingest.js) → dedupe → scoring → client swipe decks.
//
// Why email and not scraping: the portals cannot block their own alert
// emails, and Idealista even labels private-owner listings in the subject
// ("di un privato") — exactly the filter BOOM's outreach needs.
//
// Stateless by design: every run re-reads the last LOOKBACK_DAYS of alert
// mail; pfsProperties dedupes by sourceUrl (skipFreshHours), so processing
// the same email twice is a no-op. No fragile "seen flags" that break when
// Valentino reads his own inbox.
//
// Env: PFS_IMAP_USER / PFS_IMAP_PASS override GMAIL_USER / GMAIL_APP_PASS
// when the alert mailbox differs from the sending account. The mailbox is
// the one receiving the alerts (valentino@boom-rome.com) with IMAP enabled
// and an app password.
//
// Auth: cron secret / Homie secret / admin token (see _guard.js).

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { requireCronOrAdmin } from './_guard.js';
import { ingestProperty } from './_ingest.js';
import { classifyAlertEmail, extractListings } from './_alertparse.js';
import { fetchHtml, parseListing, detectAdvertiser } from './_fetch.js';
import { reportHealth, reportNeedsAttention } from './_health.js';

const LOOKBACK_DAYS = 3;
const MAX_MESSAGES = 40;
const MAX_DETAIL_FETCHES = 20;
// IMAP `from` substrings to fetch. 'casafari' is left TLD/subdomain-agnostic
// (alerts may arrive from casafari.com / .it / a notifications subdomain).
const SENDERS = ['idealista.it', 'immobiliare.it', 'casafari'];

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;

  const user = process.env.PFS_IMAP_USER || process.env.GMAIL_USER;
  const pass = process.env.PFS_IMAP_PASS || process.env.GMAIL_APP_PASS;
  if (!user || !pass) {
    await reportHealth('inbox', { ok: false, error: 'IMAP credentials missing (PFS_IMAP_USER/PASS or GMAIL_USER/GMAIL_APP_PASS)' });
    return res.status(500).json({ ok: false, error: 'imap_credentials_missing' });
  }

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000);
  const stats = { emailsSeen: 0, alerts: 0, listingsFound: 0, ingested: 0, pushedTotal: 0, droppedAgency: 0, skippedFresh: 0 };
  const needsAttention = [];
  const results = [];
  let detailBudget = MAX_DETAIL_FETCHES;

  const client = new ImapFlow({
    host: process.env.PFS_IMAP_HOST || 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
    socketTimeout: 30000,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      // One IMAP search per sender domain, merged + deduped
      const uidSet = new Set();
      for (const from of SENDERS) {
        try {
          const uids = await client.search({ since, from }, { uid: true });
          for (const u of uids || []) uidSet.add(u);
        } catch (e) {
          console.warn('[pfs/scan-inbox] search failed for', from, e.message);
        }
      }
      const uids = [...uidSet].sort((a, b) => a - b).slice(-MAX_MESSAGES);

      for (const uid of uids) {
        let parsed;
        try {
          const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
          if (!msg || !msg.source) continue;
          parsed = await simpleParser(msg.source);
        } catch (e) {
          console.warn('[pfs/scan-inbox] fetch/parse failed uid', uid, e.message);
          continue;
        }
        stats.emailsSeen++;

        const fromText = (parsed.from && parsed.from.text) || '';
        const subject = parsed.subject || '';
        const cls = classifyAlertEmail({ from: fromText, subject });
        if (!cls.isSearchAlert) continue;
        stats.alerts++;

        const listings = extractListings(parsed.html || parsed.textAsHtml || parsed.text || '');
        stats.listingsFound += listings.length;

        for (const l of listings) {
          let { price, bedrooms, sqm } = l;
          let title = null, images = [], description = null;
          let advertiser = cls.advertiserHint || 'unknown';

          // Enrich from the detail page when the email lacked the price
          // (or whenever we still have fetch budget and no advertiser info)
          if ((!price || advertiser === 'unknown') && detailBudget > 0) {
            detailBudget--;
            const html = await fetchHtml(l.sourceUrl);
            if (html) {
              const det = parseListing(html, l.sourceUrl);
              price = price || det.price;
              bedrooms = bedrooms ?? det.bedrooms;
              sqm = sqm ?? det.sqm;
              title = det.title;
              images = det.images;
              description = det.description;
              const detected = detectAdvertiser(html, l.source);
              if (advertiser === 'unknown') advertiser = detected;
            }
          }

          if (!price) {
            needsAttention.push({ sourceUrl: l.sourceUrl, source: l.source, reason: 'no_price', subject: subject.slice(0, 120) });
            continue;
          }

          const r = await ingestProperty({
            sourceUrl: l.sourceUrl,
            source: l.source,
            price,
            title: title || subject.slice(0, 120),
            bedrooms,
            sqm,
            images,
            description,
            advertiser,
          }, { ingestedBy: 'pfs-scan-inbox', skipFreshHours: 12 });

          if (r.ok) {
            stats.ingested++;
            if (r.skippedFresh) stats.skippedFresh++;
            if (r.droppedAgency) stats.droppedAgency++;
            stats.pushedTotal += (r.pushedTo || []).length;
            if ((r.pushedTo || []).length) {
              results.push({ sourceUrl: l.sourceUrl, pushedTo: r.pushedTo.map(p => `${p.name}:${p.score}`) });
            }
          } else {
            needsAttention.push({ sourceUrl: l.sourceUrl, source: l.source, reason: r.error || 'ingest_failed' });
          }
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (e) {
    try { await client.logout(); } catch { /* already closed */ }
    await reportHealth('inbox', { ok: false, error: 'imap: ' + e.message, stats });
    return res.status(500).json({ ok: false, error: 'imap_failed', detail: e.message, stats });
  }

  await reportNeedsAttention('inbox', needsAttention);

  // "Green but dead" guard: alert emails ARRIVED yet not one listing URL
  // came out — the portals changed their email template and the parser is
  // silently blind. That is a failure, not a success: report it as one so
  // the 3-strike Telegram alarm fires (this is the load-bearing source).
  const parsedNothing = stats.alerts > 0 && stats.listingsFound === 0;
  await reportHealth('inbox', parsedNothing
    ? { ok: false, error: `${stats.alerts} alert email(s) parsed to ZERO listings — email template changed? (_alertparse.js)`, stats }
    : { ok: true, stats });

  return res.status(200).json({ ok: true, actor, stats, pushed: results, needsAttention, parsedNothing });
}
