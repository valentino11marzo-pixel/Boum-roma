// api/homie/miniera.js — la porta della MINIERA: lo storico wacli entra,
// il verdetto esce.
//
// Il Mac ha i mesi di conversazioni (wacli); il server ha gli esiti (leads,
// viewings, contracts) e il giudizio. Questo endpoint è il contratto fra i
// due, nello stesso spirito di homie/market.js — il Mac riporta FATTI, la
// decisione vive nel motore (js/miniera-engine.js), dove è testata.
//
//   GET  → stato sync + mappa { id: hash } per il sync incrementale: il Mac
//          salta i thread invariati senza chiedere niente a nessuno.
//   POST { op:'threads', rows:[...] }
//        → upsert idempotente in minieraThreads (id = sha1(chatId)):
//          ri-mandare tutto lo storico è un no-op (decisione D7).
//   POST { op:'study' }
//        → legge gli esiti reali da Firestore, esegue il motore, scrive il
//          rapporto in teamReports/miniera-<data>, recap Telegram col podio
//          del verdetto. Rigenerabile a piacere.
//
// Nel magazzino entrano FEATURE e campioni corti, mai l'archivio integrale
// (decisione D2 dello studio) — il clip sta nel motore, alla porta.
//
// Auth: X-Homie-Secret (come ogni porta di Homie). Heartbeat
// `pfsRadarHealth/miniera` → l'allerta Telegram esistente (3 run falliti)
// copre anche la Miniera senza codice nuovo.
//
// PREREQUISITO: la riga `minieraThreads` in firestore.rules deployata —
// senza, default-deny e il magazzino non esiste (lezione propertyLocks).

import crypto from 'node:crypto';
import MINIERA from '../../js/miniera-engine.js';
import { fsList, fsPatch, fsGet, requireSecret, readJson } from './_lib.js';
import { replyLang } from '../_lang.js';
import { tgNotify } from '../pfs/_health.js';

const HEARTBEAT = 'pfsRadarHealth/miniera';
const STATE = 'heartbeat/miniera-state';
const MAX_ROWS_PER_CALL = 100; // 2 round-trip Firestore a riga: 100 sta nei 60s

const docId = chatId =>
  crypto.createHash('sha1').update(String(chatId)).digest('hex').slice(0, 40);

export default async function handler(req, res) {
  if (!requireSecret(req, res)) return;

  try {
    if (req.method === 'GET') return await handleGet(req, res);
    if (req.method === 'POST') return await handlePost(req, res);
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (e) {
    console.error('[homie/miniera]', e);
    try {
      const prev = (await fsGet(HEARTBEAT)) || {};
      await fsPatch(HEARTBEAT, {
        ok: false, lastError: e.message, lastRunAt: new Date(),
        consecutiveErrors: (prev.consecutiveErrors || 0) + 1,
      });
    } catch { /* il battito non deve uccidere la risposta */ }
    return res.status(500).json({ ok: false, error: e.message });
  }
}

async function handleGet(req, res) {
  const state = (await fsGet(STATE)) || {};
  // Tetto largo, niente orderBy (doc senza campo sparirebbero — regola di casa).
  const rows = await fsList('minieraThreads', { limit: 5000 });
  const known = {};
  for (const r of rows) if (r.id && r.contentHash) known[r.id] = r.contentHash;
  return res.status(200).json({
    ok: true,
    state: {
      threads: rows.length,
      lastSyncAt: state.lastSyncAt || null,
      lastStudyAt: state.lastStudyAt || null,
    },
    known,
  });
}

async function handlePost(req, res) {
  const body = await readJson(req);
  const op = body?.op;
  if (op === 'threads') return await opThreads(body, res);
  if (op === 'study') return await opStudy(res);
  return res.status(400).json({ ok: false, error: 'unknown_op' });
}

// ── op: threads — le righe del Mac entrano nel magazzino ─────────────────
async function opThreads(body, res) {
  const rows = Array.isArray(body.rows) ? body.rows.slice(0, MAX_ROWS_PER_CALL) : [];
  let saved = 0, invalid = 0;
  for (const raw of rows) {
    const row = MINIERA.threadRow(raw);   // clip + veti (gruppi mai) alla porta
    if (!row) { invalid++; continue; }
    await fsPatch('minieraThreads/' + docId(row.chatId), {
      ...row,
      contentHash: MINIERA.rowHash(row),
      syncedAt: new Date(),
    });
    saved++;
  }
  await fsPatch(STATE, { lastSyncAt: new Date() }).catch(() => {});
  await fsPatch(HEARTBEAT, {
    ok: true, lastRunAt: new Date(), consecutiveErrors: 0,
    stats: { op: 'threads', saved, invalid },
  }).catch(() => {});
  return res.status(200).json({ ok: true, saved, invalid });
}

// ── op: study — il magazzino incontra gli esiti, esce il verdetto ────────
async function opStudy(res) {
  const [rows, leads, contracts, viewings, users, landlords, pfsClients, actions] =
    await Promise.all([
      fsList('minieraThreads', { limit: 5000 }),
      fsList('leads', { limit: 4000 }),
      fsList('contracts', { limit: 1000 }),
      fsList('viewings', { limit: 2000 }),
      fsList('users', { limit: 2000 }),
      fsList('landlords', { limit: 1000 }),
      fsList('pfsClients', { limit: 500 }),
      fsList('action_queue', { limit: 2000 }),
    ]);

  const index = MINIERA.buildOutcomeIndex({
    leads,
    contracts,
    // le visite portano il numero in due campi a seconda della porta d'origine
    viewings: viewings.map(v => ({ ...v, phone: v.phone || v.clientPhone })),
    users,
    landlords,
    pfsClients: pfsClients.map(c => ({ ...c, phone: c.phone || c.contactPhone || c.whatsapp })),
  });

  const st = MINIERA.study(rows, index, {
    // replyLang legge le parole VERE (api/_lang.js); campioni corti → 'na'
    langOf: sample => replyLang({ message: sample }),
  });
  const approvals = MINIERA.approvalStats(actions);
  const vd = MINIERA.verdict(st, approvals);

  // Il rapporto persistito: liste cappate così il doc resta piccolo — il
  // dettaglio oltre il cap si rigenera quando serve (lo studio è idempotente).
  const day = new Date().toISOString().slice(0, 10);
  const stored = {
    employee: 'miniera',
    at: new Date(),
    study: {
      ...st,
      silence: {
        unanswered: st.silence.unanswered.slice(0, 40),
        coldOpen: st.silence.coldOpen.slice(0, 40),
        unansweredTotal: st.silence.unanswered.length,
        coldOpenTotal: st.silence.coldOpen.length,
      },
    },
    verdict: vd,
  };
  await fsPatch('teamReports/miniera-' + day, stored);
  await fsPatch(STATE, { lastStudyAt: new Date(), lastReportId: 'miniera-' + day }).catch(() => {});
  await fsPatch(HEARTBEAT, {
    ok: true, lastRunAt: new Date(), consecutiveErrors: 0,
    stats: {
      op: 'study', threads: st.funnel.threads, joinedLeads: st.funnel.joinedLeads,
      unanswered: st.silence.unanswered.length, coldOpen: st.silence.coldOpen.length,
    },
  }).catch(() => {});

  // Best-effort: un Telegram fallito non è uno studio fallito.
  try { await tgNotify(MINIERA.tgSummary(st, vd)); } catch { /* niente */ }

  return res.status(200).json({ ok: true, report: 'teamReports/miniera-' + day, study: stored.study, verdict: vd });
}
