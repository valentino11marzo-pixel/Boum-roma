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
import { ingestProperty, listActiveClients } from './_ingest.js';
import RM from '../../js/radar-markets.js';
import { fsGet, fsPatch } from '../homie/_lib.js';
import { classifyAlertEmail, extractListings } from './_alertparse.js';
import { fetchHtml, parseListing, detectAdvertiser } from './_fetch.js';
import { reportHealth, reportNeedsAttention } from './_health.js';
import { runBudget } from '../_budget.js';

const LOOKBACK_DAYS = 3;
const MAX_MESSAGES = 40;
const MAX_DETAIL_FETCHES = 20;
// IMAP `from` substrings to fetch. 'casafari' is left TLD/subdomain-agnostic
// (alerts may arrive from casafari.com / .it / a notifications subdomain).
const SENDERS = ['idealista.it', 'immobiliare.it', 'casafari'];
// LE CITTÀ FUORI ROMA (radar per mercato, 25/10/2026): un gruppo a parte,
// col suo tetto e SEMPRE dopo Roma — ricerca IMAP compresa: la search delle
// città parte solo DOPO che le email romane sono state lette, col tempo che
// resta. Il volume (e la lentezza) di Madrid non può affamare né il tetto né
// il tempo dei clienti romani. Il mittente idealista.com è
// un'IPOTESI fino alla prima email vera (vedi CLAUDE.md, «Il radar per
// mercato»).
const CITY_SENDERS = ['idealista.com'];
const MAX_CITY_MESSAGES = 25;
// Senza un alert per 48h con clienti attivi in quella città, il flusso è
// spento (ricerca salvata disattivata, alias che non consegna): va detto.
const CITY_STREAM_GRACE_HOURS = 48;

// Gli indirizzi a cui l'email è arrivata: dove sta l'alias +radar-<città>.
// Mai nei log — servono solo a decidere la città.
export function recipientsOf(parsed) {
  const out = [];
  const take = (v) => {
    if (!v) return;
    if (Array.isArray(v)) { v.forEach(take); return; }
    if (typeof v === 'string') { out.push(v); return; }
    if (Array.isArray(v.value)) v.value.forEach(a => a && a.address && out.push(a.address));
    if (typeof v.text === 'string') out.push(v.text);
  };
  take(parsed && parsed.to);
  take(parsed && parsed.cc);
  const h = parsed && parsed.headers;
  if (h && typeof h.get === 'function') {
    take(h.get('delivered-to'));
    take(h.get('x-original-to'));
  }
  return out;
}

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
  // Deadline morbida: la piattaforma uccide la funzione a 60s A METÀ LAVORO
  // (58 timeout in 7gg tra i cron IMAP) — meglio fermarsi puliti con margine:
  // il re-scan è stateless e il dedupe rende gratis riprendere al giro dopo.
  // Vedi api/_budget.js: si parte solo se il residuo copre il costo massimo
  // del passo — una search o un fetch possono costare 25s (socketTimeout), e
  // controllare «sono in ritardo?» lasciava sforare la funzione a metà giro.
  const B = runBudget(60_000, 7_000);
  const COST_SEARCH = 25_000, COST_ITER = 25_000;
  const stats = { emailsSeen: 0, alerts: 0, listingsFound: 0, ingested: 0, pushedTotal: 0, droppedAgency: 0, skippedFresh: 0, timeBoxed: 0,
    byMarket: {}, marketUnknown: 0, citySearchSkipped: false };
  const mk = (m) => (stats.byMarket[m] = stats.byMarket[m] || { alerts: 0, listings: 0, ingested: 0, pushed: 0, lastAlertAt: null });
  const needsAttention = [];
  const results = [];
  let detailBudget = MAX_DETAIL_FETCHES;

  const client = new ImapFlow({
    host: process.env.PFS_IMAP_HOST || 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
    // connect 90s e socket idle 5min di default superano il limite
    // piattaforma (60s): lo stallo diventava un kill senza battito
    connectionTimeout: 15000, greetingTimeout: 10000,
    socketTimeout: 25000,
  });

  // Un'email letta → i suoi annunci nel mazzo giusto. Uguale per le due fasi.
  async function processUid(uid) {
    let parsed;
    try {
      const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!msg || !msg.source) return;
      parsed = await simpleParser(msg.source);
    } catch (e) {
      console.warn('[pfs/scan-inbox] fetch/parse failed uid', uid, e.message);
      return;
    }
    stats.emailsSeen++;

    const fromText = (parsed.from && parsed.from.text) || '';
    const subject = parsed.subject || '';
    const aliasMarket = RM.marketOfRecipients(recipientsOf(parsed));
    const cls = classifyAlertEmail({ from: fromText, subject, aliasMarket });
    if (!cls.isSearchAlert) return;
    stats.alerts++;

    const listings = extractListings(parsed.html || parsed.textAsHtml || parsed.text || '');
    stats.listingsFound += listings.length;
    // Le città che QUESTA email dimostra viva: solo quelle di un annuncio che
    // si è risolto lì. L'alias da solo non basta — all'alias arriva tutta la
    // posta dell'account idealista (avviso «ricerca disattivata», newsletter),
    // e un'email senza annunci terrebbe verde un flusso spento.
    const emailMarkets = new Set();

    for (const l of listings) {
      // La città di QUESTO annuncio: dominio → alias → testo. Senza una
      // città certa non si ingerisce: va fra i "da verificare". Il testo è
      // il titolo dell'annuncio; il pezzo di email intorno vale solo in un
      // riepilogo (è la scheda), mai in un'email da un annuncio solo, dove
      // sarebbe tutta l'email — piè di pagina col recapito del portale
      // compreso (la sede di idealista è a Madrid: un annuncio di
      // Barcellona diventerebbe "di Madrid").
      const mres = RM.resolveListingMarket({
        sourceUrl: l.sourceUrl, source: l.source, aliasMarket,
        text: l.title || (listings.length > 1 ? l.windowText : null),
      });
      if (!mres.market) {
        stats.marketUnknown++;
        needsAttention.push({ sourceUrl: l.sourceUrl, source: l.source, reason: mres.reason || 'market_unknown', subject: subject.slice(0, 120) });
        continue;
      }
      emailMarkets.add(mres.market);
      mk(mres.market).listings++;
      const city = mres.market !== 'roma';

      let { price, bedrooms, sqm } = l;
      let title = null, images = [], description = null;
      // Fuori Roma il suggerimento dell'oggetto vale solo per un'email da
      // UN annuncio: in un riepilogo l'oggetto non dice di quale.
      let advertiser = city
        ? ((listings.length === 1 && cls.advertiserHint) || 'unknown')
        : (cls.advertiserHint || 'unknown');

      // Enrich from the detail page when the email lacked the price
      // (or whenever we still have fetch budget and no advertiser info).
      // MAI per idealista.com: blocca gli IP dei datacenter come il .it
      // (ipotesi dichiarata), e un fetch sicuramente fallito è tempo perso.
      if (!city && (!price || advertiser === 'unknown') && detailBudget > 0) {
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
        needsAttention.push({ sourceUrl: l.sourceUrl, source: l.source, reason: 'no_price', subject: subject.slice(0, 120),
          ...(city ? { market: mres.market } : {}) });
        continue;
      }

      const r = await ingestProperty({
        sourceUrl: l.sourceUrl,
        source: l.source,
        price,
        // Fuori Roma MAI l'oggetto come titolo: può portare il nome della
        // ricerca salvata ("BM1234 Chamberí") e fingere una zona.
        title: city ? (l.title || null) : (title || subject.slice(0, 120)),
        bedrooms,
        sqm,
        images,
        description,
        advertiser,
        market: mres.market,
        marketVia: mres.via,
      }, { ingestedBy: 'pfs-scan-inbox', skipFreshHours: 12 });

      if (r.ok) {
        stats.ingested++;
        mk(mres.market).ingested++;
        mk(mres.market).pushed += (r.pushedTo || []).length;
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
    // L'ora dell'alert è la data DELL'EMAIL, non quella del giro: la
    // casella si rilegge per 3 giorni, e un alert vecchio riletto non
    // dimostra che la ricerca salvata sia ancora viva. Un'email senza
    // data leggibile conta come alert ma non rinfresca l'ora.
    const sent = parsed.date instanceof Date && !isNaN(parsed.date) ? Math.min(parsed.date.getTime(), Date.now()) : null;
    for (const m of emailMarkets) {
      const b = mk(m);
      b.alerts++;
      if (sent != null && (!b.lastAlertAt || sent > +new Date(b.lastAlertAt))) b.lastAlertAt = new Date(sent).toISOString();
    }
  }

  // Le email di una fase, una alla volta, finché il tempo le paga.
  async function processAll(uids) {
    for (let i = 0; i < uids.length; i++) {
      if (!B.afford(COST_ITER)) {
        stats.timeBoxed += uids.length - i;
        console.warn('[pfs/scan-inbox] soft deadline: restano', uids.length - i, 'email al prossimo giro');
        return false;
      }
      await processUid(uids[i]);
    }
    return true;
  }

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      // ── FASE A: Roma. Le ricerche IMAP e la lettura dei clienti romani
      // vengono PRIMA di tutto: una search lenta (socket malato, fino a 25s)
      // delle città non può più mangiare il tempo delle email di Roma.
      const uidSet = new Set();
      for (const from of SENDERS) {
        if (!B.afford(COST_SEARCH)) break; // socket malato: ogni search può costare 25s
        try {
          const uids = await client.search({ since, from }, { uid: true });
          for (const u of uids || []) uidSet.add(u);
        } catch (e) {
          console.warn('[pfs/scan-inbox] search failed for', from, e.message);
        }
      }
      const romeUids = [...uidSet].sort((a, b) => a - b).slice(-MAX_MESSAGES);
      const romeDone = await processAll(romeUids);

      // ── FASE B: le città, solo col tempo che Roma ha lasciato. Saltata
      // per tempo è detta (citySearchSkipped): il battito della città
      // diventa rosso da solo dopo 48h senza alert, se non passa mai.
      const cityUidSet = new Set();
      if (romeDone) {
        for (const from of CITY_SENDERS) {
          if (!B.afford(COST_SEARCH)) { stats.citySearchSkipped = true; break; }
          try {
            const uids = await client.search({ since, from }, { uid: true });
            for (const u of uids || []) cityUidSet.add(u);
          } catch (e) {
            console.warn('[pfs/scan-inbox] search failed for', from, e.message);
          }
        }
      } else stats.citySearchSkipped = true;
      const cityUids = [...cityUidSet].filter(u => !uidSet.has(u)).sort((a, b) => a - b).slice(-MAX_CITY_MESSAGES);
      await processAll(cityUids);
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
  await reportHealth('inbox', { ok: true, stats });
  const cityHealth = await reportCityStreams(stats);

  return res.status(200).json({ ok: true, actor, stats, pushed: results, needsAttention, cityHealth });
}

// Un battito per città (pfsRadarHealth/inbox-<città>): solo per le città che
// hanno clienti attivi o che hanno visto un alert in questo giro. Il campo
// dell'ultimo alert email si chiama lastAlertEmailAt — `lastAlertAt` è già
// l'ora dell'ultimo avviso Telegram di reportHealth, e confonderli
// spegnerebbe il diradamento dei promemoria.
async function reportCityStreams(stats) {
  const out = {};
  let clients = [];
  try { clients = await listActiveClients(); } catch { return out; }
  const now = new Date();
  for (const m of RM.enabledIds().filter(k => k !== 'roma')) {
    const activeClients = clients.filter(c => RM.clientMarket(c) === m).length;
    const seen = stats.byMarket[m] || { alerts: 0, listings: 0, ingested: 0, pushed: 0, lastAlertAt: null };
    if (!activeClients && !seen.alerts) continue;
    let prev = null;
    try { prev = await fsGet('pfsRadarHealth/inbox-' + m); } catch { /* primo giro */ }
    const prevAt = (prev && prev.lastAlertEmailAt) || null;
    const lastAlertEmailAt = [prevAt, seen.lastAlertAt].filter(Boolean)
      .sort((a, b) => +new Date(a) - +new Date(b)).pop() || null;
    const activeSince = activeClients > 0 ? ((prev && prev.activeSince) || now.toISOString()) : null;
    const v = RM.marketStreamVerdict({
      market: m, activeClients, lastAlertAt: lastAlertEmailAt, activeSince,
      nowMs: now.getTime(), graceHours: CITY_STREAM_GRACE_HOURS,
    });
    await reportHealth('inbox-' + m, {
      ok: v.ok, error: v.error,
      stats: { activeClients, ...seen },
    });
    try { await fsPatch('pfsRadarHealth/inbox-' + m, { market: m, lastAlertEmailAt, activeSince }); }
    catch (e) { console.warn('[pfs/scan-inbox] city stream write failed', m, e.message); }
    out[m] = { ok: v.ok, activeClients, alerts: seen.alerts };
  }
  return out;
}
