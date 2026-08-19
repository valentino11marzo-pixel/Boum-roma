// api/outreach/queue.js — IL CONTATTO: la coda dei messaggi al proprietario.
//
// IL FLUSSO. L'operatore rivede l'annuncio in plancia, sceglie stile e voce,
// LEGGE il messaggio esatto e tocca Conferma: quel tap È l'approvazione
// (come il ✅ del Richiamo — la firma sull'azione, mai un invio autonomo).
// Il doc entra qui con status 'approved'; il Mac di Homie (boom_contatto.py,
// browser vero, profilo loggato sui portali) lo preleva, apre l'annuncio,
// scrive nella chat/form del portale ESATTAMENTE quel testo, e riporta.
//
// LE DISCIPLINE (le stesse del Pubblicista, che questo file ricalca):
//   - UN contatto per annuncio PER COSTRUZIONE: l'id del doc è
//     outreachKey(listingId) — un secondo cliente interessato alla stessa
//     casa non genera un secondo messaggio, mai;
//   - LEASE contro il doppio invio: il GET marca i job 'sending' con
//     leaseAt; un job che resta 'sending' oltre 45' (Mac morto a metà) torna
//     'approved' da solo — ma un doppio POST di esito non duplica nulla;
//   - 3 fallimenti → 'failed' (parcheggiato, visibile in plancia: si può
//     ri-approvare con un tap) — mai ritentare a vuoto per sempre;
//   - blocked (captcha/login sul portale) → i job leased tornano 'approved'
//     e il battito lo dice: un portale che ci ha visto non si martella;
//   - il rapporto È il battito (pfsRadarHealth/contatto): il Mac riporta a
//     OGNI giro, anche a coda vuota — un giro a vuoto è salute, il silenzio
//     è il guasto. Allerta Telegram esistente dopo 3 run falliti.
//   - a invio riuscito, l'outreach dell'annuncio in plancia passa da solo a
//     'contattato' (channel 'portal-chat'): la plancia dice la verità senza
//     che nessuno la aggiorni a mano.
//
// Kill switch: settings/outreach { enabled: false } — globale.
// Auth: X-Homie-Secret (il Mac). La CREAZIONE dei job non passa da qui:
// la plancia scrive outreachQueue direttamente (rules admin-only), con
// l'anteprima del motore condiviso js/outreach-engine.js.

import OUT from '../../js/outreach-engine.js';
import { fsGet, fsPatch, fsList, requireSecret, readJson, logActivity } from '../homie/_lib.js';
import { reportHealth, tgNotify } from '../pfs/_health.js';

const PULL_CAP = 6;               // messaggi per giro: ritmo umano, mai raffiche
const LEASE_MS = 45 * 60e3;       // oltre, un 'sending' orfano torna in coda
const MAX_ATTEMPTS = 3;
export const SUGGESTED_INTERVAL_MINUTES = 5;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Homie-Secret');
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!requireSecret(req, res)) return;

  try {
    if (req.method === 'GET') return await handleGet(req, res);
    if (req.method === 'POST') return await handlePost(req, res);
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (e) {
    console.error('[outreach/queue]', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}

async function killSwitchOff() {
  const s = await fsGet('settings/outreach').catch(() => null);
  return !!(s && s.enabled === false);
}

async function handleGet(req, res) {
  if (await killSwitchOff()) {
    return res.status(200).json({ ok: true, enabled: false, jobs: [], suggestedIntervalMinutes: SUGGESTED_INTERVAL_MINUTES });
  }

  // ?peek=1 — guardare senza prendere: niente lease, niente stati toccati.
  // È la via del --dry: un'occhiata non deve mai contare come un tentativo.
  if (String(req.query?.peek || '') === '1') {
    const rows = await fsList('outreachQueue', { filter: { field: 'status', op: 'EQUAL', value: 'approved' }, limit: 50 }).catch(() => []);
    rows.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
    return res.status(200).json({
      ok: true, enabled: true, peek: true,
      jobs: rows.map(j => ({
        id: j.id, listingId: j.listingId || null, sourceUrl: j.sourceUrl, portal: j.portal,
        message: j.message, style: j.style || null, voice: j.voice || null,
        clientName: j.clientName || null, attempts: Number(j.attempts) || 0,
      })),
      suggestedIntervalMinutes: SUGGESTED_INTERVAL_MINUTES,
    });
  }

  // I lease scaduti tornano in coda PRIMA di distribuire lavoro nuovo — e
  // il reclaim CONTA come tentativo: un lotto i cui rapporti si perdono
  // sempre (Mac che muore a metà, POST che non arriva) dopo MAX_ATTEMPTS
  // reclaim si PARCHEGGIA invece di essere reinviato alla cieca per sempre
  // (il doppio messaggio allo stesso proprietario è il danno da non fare).
  const now = Date.now();
  const sending = await fsList('outreachQueue', { filter: { field: 'status', op: 'EQUAL', value: 'sending' }, limit: 50 }).catch(() => []);
  for (const j of sending) {
    const leased = +new Date(j.leaseAt || 0);
    if (!leased || (now - leased) > LEASE_MS) {
      const attempts = (Number(j.attempts) || 0) + 1;
      const parked = attempts >= MAX_ATTEMPTS;
      await fsPatch('outreachQueue/' + j.id, {
        status: parked ? 'failed' : 'approved',
        attempts, leaseAt: null,
        ...(parked ? { lastError: 'lease scaduto ' + attempts + ' volte senza rapporto: possibile invio non confermato — verifica a mano' } : {}),
      }).catch(() => {});
    }
  }

  // ?assist=1 — la corsia dell'operatore al terminale: serve ANCHE i
  // parcheggiati ('failed'), che è esattamente ciò che --assist promette
  // di recuperare. Il giro automatico (--run) non li vede mai.
  const assist = String(req.query?.assist || '') === '1';
  const statuses = assist ? ['approved', 'failed'] : ['approved'];
  let pool = [];
  for (const st of statuses) {
    const rows = await fsList('outreachQueue', { filter: { field: 'status', op: 'EQUAL', value: st }, limit: 50 }).catch(() => []);
    pool = pool.concat(rows);
  }
  pool.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  const jobs = [];
  for (const j of pool.slice(0, PULL_CAP)) {
    // La validazione ANCHE in uscita: un job manomesso a mano non deve mai
    // arrivare al browser (il motore è la stessa copia della plancia).
    const v = OUT.validateJob(j);
    if (!v.ok) {
      await fsPatch('outreachQueue/' + j.id, { status: 'failed', lastError: 'validazione: ' + v.errors.join(' · ') }).catch(() => {});
      continue;
    }
    // IL LEASE È LA CONSEGNA: se il patch a 'sending' non atterra, il job
    // NON parte — un ciclo perso si recupera al giro dopo, un messaggio
    // doppio a un proprietario no. (Niente .catch che inghiotte: la regola
    // promessa in testa a questo file deve essere vera.)
    try {
      await fsPatch('outreachQueue/' + j.id, { status: 'sending', leaseAt: new Date() });
    } catch {
      continue;
    }
    jobs.push({
      id: j.id,
      listingId: j.listingId || null,
      sourceUrl: j.sourceUrl,
      portal: j.portal,
      message: j.message,
      style: j.style || null,
      voice: j.voice || null,
      clientName: j.clientName || null,
      attempts: Number(j.attempts) || 0,
    });
  }

  return res.status(200).json({
    ok: true, enabled: true, assist, jobs,
    suggestedIntervalMinutes: SUGGESTED_INTERVAL_MINUTES,
    reportTo: '/api/outreach/queue',
  });
}

async function handlePost(req, res) {
  const body = await readJson(req).catch(() => null) || {};
  const results = Array.isArray(body.results) ? body.results : [];
  const blocked = body.blocked === true;
  const writeFailures = [];
  let sent = 0, failed = 0, parked = 0;

  for (const r of results.slice(0, 50)) {
    if (!r || !r.id) continue;
    const job = await fsGet('outreachQueue/' + r.id).catch(() => null);
    if (!job) continue;
    if (job.status === 'sent') continue; // un doppio esito non riscrive la storia

    if (r.ok) {
      // L'esito 'sent' DEVE atterrare: se il patch fallisce il doc resta
      // 'sending' e il reclaim (che ora conta i tentativi) lo parcheggerà
      // invece di reinviarlo alla cieca — ma il guasto va DETTO, non
      // inghiottito: finisce nell'errore del battito qui sotto.
      let landed = true;
      try {
        await fsPatch('outreachQueue/' + r.id, {
          status: 'sent', sentAt: new Date(), leaseAt: null,
          sentVia: r.via || 'portal-chat',
        });
      } catch (e) {
        landed = false;
        writeFailures.push(r.id + ': ' + String(e.message).slice(0, 80));
      }
      if (!landed) continue;
      sent++;
      // La plancia dice la verità da sola: l'annuncio passa a 'contattato'.
      // MERGE, non sostituzione: fsPatch rimpiazza la mappa intera, e lì
      // dentro vivono la nota scritta dall'operatore e il suo contactedAt
      // (write-once) — e uno stato più avanti ('risposto', 'visita_fissata')
      // non deve MAI retrocedere a 'contattato' per colpa nostra.
      if (job.listingId) {
        const prop = await fsGet('pfsProperties/' + job.listingId).catch(() => null);
        const prev = (prop && prop.outreach) || {};
        const keepStatus = prev.status && ['da_contattare', 'contattato'].indexOf(prev.status) < 0;
        await fsPatch('pfsProperties/' + job.listingId, {
          outreach: {
            ...prev,
            status: keepStatus ? prev.status : 'contattato',
            note: prev.note || ('via chat del portale' + (job.clientName ? ' · per ' + job.clientName : '')),
            by: prev.by || 'contatto',
            channel: 'portal-chat',
            updatedAt: new Date().toISOString(),
            contactedAt: prev.contactedAt || new Date().toISOString(),
          },
        }).catch(() => {});
      }
      await logActivity('outreach_sent', 'pfs_radar', {
        listingId: job.listingId, sourceUrl: job.sourceUrl, portal: job.portal, style: job.style,
      }, 'contatto').catch(() => {});
    } else {
      const attempts = (Number(job.attempts) || 0) + 1;
      // "esito_incerto" = il Mac ha premuto invio ma non ha una PROVA della
      // consegna: ritentare in automatico rischia il DOPPIO messaggio allo
      // stesso proprietario, che è peggio di uno perso. Parcheggio subito:
      // lo verifica l'operatore (--assist o portale), non un retry cieco.
      const uncertain = /^esito_incerto/.test(String(r.error || ''));
      const isParked = uncertain || attempts >= MAX_ATTEMPTS;
      if (isParked) parked++; else failed++;
      await fsPatch('outreachQueue/' + r.id, {
        status: isParked ? 'failed' : 'approved',
        attempts, leaseAt: null,
        lastError: String(r.error || 'invio fallito').slice(0, 300),
      }).catch(() => {});
    }
  }

  // Portale bloccato: i job rimasti leased di questo giro tornano in coda
  // (il Mac li ha mollati apposta — mai martellare un portale che ci ha visto).
  if (blocked) {
    const sending = await fsList('outreachQueue', { filter: { field: 'status', op: 'EQUAL', value: 'sending' }, limit: 50 }).catch(() => []);
    for (const j of sending) {
      await fsPatch('outreachQueue/' + j.id, { status: 'approved', leaseAt: null }).catch(() => {});
    }
  }

  // Il battito, SEMPRE — anche a giro vuoto (idle è salute; il silenzio no).
  const runOk = !blocked && writeFailures.length === 0
    && !(results.length > 0 && sent === 0 && (failed + parked) > 0);
  await reportHealth('contatto', {
    ok: runOk,
    blocked,
    error: blocked ? String(body.error || 'portale bloccato (login/captcha)')
      : writeFailures.length ? ('esiti NON registrati (Firestore): ' + writeFailures.join(' · ')).slice(0, 400)
      : (runOk ? null : 'tutti gli invii del giro falliti'),
    stats: { pulled: results.length, sent, failed, parked, idle: body.idle === true },
  });

  if (sent > 0) {
    await tgNotify(
      `📨 <b>Contatto</b> — ${sent} messaggi${sent === 1 ? 'o' : ''} consegnat${sent === 1 ? 'o' : 'i'} nella chat del portale.` +
      (failed + parked ? `\n⚠️ ${failed + parked} falliti${parked ? ` (${parked} parcheggiati)` : ''}` : '') +
      `\n<a href="https://boomrome.com/pfs-command">Plancia</a>`
    ).catch(() => {});
  }

  return res.status(200).json({ ok: true, recorded: { sent, failed, parked, blocked } });
}
