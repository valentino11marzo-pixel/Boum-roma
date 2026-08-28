// api/marketing/creativo.js — IL CREATIVO (cron ogni 30').
//
// Il primo membro del reparto Marketing: trasforma le foto già curate dal
// Fotografo in un reel via Higgsfield e lo PROPONE. La Pagella dà al video
// 3 punti su 10 e ogni lunedì elenca i buchi; questo li chiude senza che
// nessuno giri un clip. Studio: STUDIO_MARKETING_HIGGSFIELD.md.
//
// LA RIGA CHE NON SI ATTRAVERSA: genera da solo, PUBBLICA MAI da solo.
// Questo file non scrive MAI su `listings` (asserito nei test sulla
// sorgente): il reel finisce parcheggiato su Storage e arriva su Telegram
// con il comando di pubblicazione che l'operatore già usa
// (/video <id> <url> sul bot). Il tap è l'approvazione.
//
// Il giro:
//   A. completa i job in volo (poll job set → scarica MP4 → Storage
//      listings/enhanced/<id>/video/ — il path del Media Studio, rules già
//      deployate — → card Telegram). Un fallimento Higgsfield NON si
//      ritenta da solo (crediti — la lezione SDD).
//   B. sottomette i nuovi entro i tetti (manopole maxPerRun/weeklyCap in
//      Direzione, tetto settimanale contato su Firestore: le submission
//      contano anche se falliscono, la spesa c'è stata).
//
// Senza chiavi Higgsfield non è un guasto: lo dice UNA volta (pattern
// "blocked ≠ guasta") e la worklist resta visibile. Kill switch totale:
// settings/marketing { enabled: false }.
//
// Auth come i cron PFS (Bearer CRON_SECRET · X-Homie-Secret · admin);
// ?dry=1 calcola senza scrivere e senza chiamare Higgsfield.

import ME from '../../js/marketing-engine.js';
import * as HF from './_higgsfield.js';
import { fsGet, fsPatch, fsCreate, fsList, getAdminToken } from '../homie/_lib.js';
import { requireCronOrAdmin } from '../pfs/_guard.js';
import { tgNotify } from '../pfs/_health.js';
import { reportEmployeeHealth, saveReport } from '../employees/_lib.js';
import { knobs, rejectedLine } from '../_squadra.js';

const BUCKET = process.env.FIREBASE_BUCKET || 'boom-property-dashboards.firebasestorage.app';
const RUN_BUDGET_MS = 45000;        // dentro il maxDuration 60 di vercel.json
const MAX_FINALIZE_PER_RUN = 3;     // download+upload sono i passi pesanti
const MAX_POLLS = 48;               // ~24h a giri di 30': oltre è un timeout
const MAX_FINALIZE_ERRORS = 3;      // download/upload falliti prima di arrendersi
const MAX_VIDEO_BYTES = 90 * 1024 * 1024; // storage.rules ferma a 100MB
const ORPHAN_AFTER_MS = 20 * 60 * 1000;   // 'created' senza jobSetId da riparare

async function uploadVideo(path, buf) {
  const token = await getAdminToken();
  const up = await fetch(
    `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o?name=${encodeURIComponent(path)}`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'video/mp4' }, body: buf }
  );
  if (!up.ok) throw new Error(`storage ${up.status}: ${(await up.text()).slice(0, 200)}`);
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media`;
}

async function downloadVideo(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`download ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length) throw new Error('download vuoto');
    if (buf.length > MAX_VIDEO_BYTES) throw new Error(`video troppo grande (${buf.length} byte)`);
    return buf;
  } finally { clearTimeout(t); }
}

// Senza chiavi si parla UNA volta in assoluto: il doc heartbeat con id
// fisso è la memoria (fsCreate risponde 409 la seconda volta).
async function sayUnconfiguredOnce(eligible) {
  try {
    await fsCreate('heartbeat', {
      note: 'higgsfield keys missing', at: new Date(), eligible,
    }, 'marketing-unconfigured');
    await tgNotify(
      '🎥 <b>Il Creativo è assunto ma senza chiavi</b>\n' +
      'Mancano HIGGSFIELD_API_KEY / HIGGSFIELD_API_SECRET su Vercel ' +
      '(higgsfield.ai → API, vedi docs/higgsfield-api.md).\n' +
      `Worklist pronta: ${eligible} annunci senza video.\n` +
      'Lo dico una volta sola.'
    );
  } catch (e) {
    if (!e.exists) console.warn('[creativo] say-once failed:', e.message);
  }
}

export default async function handler(req, res) {
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;

  const started = Date.now();
  const dry = req.query?.dry === '1' || String(req.url || '').includes('dry=1');
  const stats = { submitted: 0, ready: 0, failed: 0, polled: 0, errors: 0 };
  const out = { ok: true, dry, configured: HF.configured(), submitted: [], ready: [], failed: [] };

  try {
    // ── Kill switch: stop totale, ma il battito resta verde (è una scelta,
    // non un guasto) ─────────────────────────────────────────────────────
    let killed = false;
    try { const s = await fsGet('settings/marketing'); killed = !!(s && s.enabled === false); } catch { /* fail-open */ }
    if (killed) {
      if (!dry) await reportEmployeeHealth('creativo', { ok: true, stats: { killSwitch: true } });
      return res.status(200).json({ ok: true, killSwitch: true });
    }

    const { k, rejected } = await knobs('creativo');
    if (rejected.length) out.note = rejectedLine(rejected);

    const [listings, creatives] = await Promise.all([
      fsList('listings', { filter: { field: 'status', op: 'EQUAL', value: 'available' }, limit: 200 }),
      fsList('marketingCreatives', { limit: 300 }),
    ]);

    // ── A. i job in volo ─────────────────────────────────────────────────
    const listingById = {};
    listings.forEach(l => { listingById[l.id] = l; });
    const pending = creatives.filter(c => c.status === 'submitted' && c.jobSetId);
    out.pending = pending.length;

    if (!dry) {
      for (const c of pending.slice(0, MAX_FINALIZE_PER_RUN)) {
        if (Date.now() - started > RUN_BUDGET_MS) break;
        const l = listingById[c.listingId] || (await fsGet('listings/' + c.listingId).catch(() => null)) || { id: c.listingId, name: c.listingName };
        try {
          const verdict = HF.jobSetStatus(await HF.getJobSet(c.jobSetId));
          stats.polled++;

          if (verdict.status === 'failed') {
            await fsPatch('marketingCreatives/' + c.id, { status: 'failed', error: verdict.reason, failedAt: new Date() });
            await tgNotify(ME.failedMessage(l, verdict.reason));
            stats.failed++; out.failed.push({ id: c.id, reason: verdict.reason });
            continue;
          }

          if (verdict.status === 'pending') {
            const polls = (c.pollCount || 0) + 1;
            if (polls >= MAX_POLLS) {
              await fsPatch('marketingCreatives/' + c.id, { status: 'failed', error: 'timeout generazione', failedAt: new Date() });
              await tgNotify(ME.failedMessage(l, 'timeout generazione'));
              stats.failed++; out.failed.push({ id: c.id, reason: 'timeout' });
            } else {
              await fsPatch('marketingCreatives/' + c.id, { pollCount: polls, lastPolledAt: new Date() });
            }
            continue;
          }

          // completed → scarica e parcheggia su Storage NOSTRO (gli URL dei
          // risultati possono scadere: non si linka mai roba effimera)
          const buf = await downloadVideo(verdict.videoUrl);
          const path = `listings/enhanced/${c.listingId}/video/boom-reel-${c.id}.mp4`;
          const url = await uploadVideo(path, buf);
          await fsPatch('marketingCreatives/' + c.id, { status: 'ready', videoUrl: url, storagePath: path, readyAt: new Date() });
          await tgNotify(ME.readyMessage(l, url));
          stats.ready++; out.ready.push({ id: c.id, listingId: c.listingId, url });
        } catch (e) {
          // intoppo transitorio (poll/download/upload): si riprova al giro
          // dopo, ma con un contatore — non all'infinito
          const errs = (c.finalizeErrors || 0) + 1;
          stats.errors++;
          if (errs >= MAX_FINALIZE_ERRORS) {
            await fsPatch('marketingCreatives/' + c.id, { status: 'failed', error: 'consegna fallita: ' + String(e.message).slice(0, 200), failedAt: new Date() });
            await tgNotify(ME.failedMessage(l, 'consegna fallita (download/upload)'));
            stats.failed++; out.failed.push({ id: c.id, reason: 'consegna' });
          } else {
            await fsPatch('marketingCreatives/' + c.id, { finalizeErrors: errs, lastError: String(e.message).slice(0, 200) });
          }
        }
      }
    }

    // ── B. le sottomissioni nuove ────────────────────────────────────────
    // Le manopole in vigore (Direzione → settings/squadra.creativo):
    // k.maxPerRun reel per giro, k.weeklyCap tetto di spesa settimanale.
    const work = ME.pickWork(listings, creatives, { maxPerRun: k.maxPerRun, weeklyCap: k.weeklyCap }, new Date());
    out.eligible = work.eligible;
    out.weeklyCount = work.weeklyCount;
    out.budgetLeft = work.budgetLeft;
    out.skipped = work.skipped.slice(0, 20);
    out.todo = work.todo.map(l => ({ id: l.id, name: l.name || null }));

    if (!HF.configured()) {
      if (!dry && work.eligible > 0) await sayUnconfiguredOnce(work.eligible);
    } else if (!dry) {
      // riparazione orfani: 'created' senza jobSetId (run morto fra create e
      // submit) — nessuna spesa nuova, si completa l'intenzione
      const orphans = creatives.filter(c =>
        c.status === 'created' && !c.jobSetId && c.createdAt &&
        (Date.now() - new Date(c.createdAt).getTime()) > ORPHAN_AFTER_MS);

      const toSubmit = orphans
        .map(c => ({ creative: c, listing: listingById[c.listingId] }))
        .filter(x => x.listing)
        .concat(work.todo.map(l => ({ creative: null, listing: l })));

      for (const { creative, listing } of toSubmit) {
        if (Date.now() - started > RUN_BUDGET_MS) break;
        const id = creative ? creative.id : ME.creativeId(listing);
        const brief = ME.buildBrief(listing);
        if (!brief.imageUrl) continue;

        if (!creative) {
          try {
            await fsCreate('marketingCreatives', {
              listingId: listing.id, listingName: listing.name || null,
              status: 'created', prompt: brief.prompt, imageUrl: brief.imageUrl,
              photosHash: id, createdAt: new Date(), createdBy: 'creativo',
            }, id);
          } catch (e) {
            if (e.exists) continue; // un rerun non sottomette due volte — per costruzione
            throw e;
          }
        }

        try {
          const { jobSetId } = await HF.submitImage2Video({ imageUrl: brief.imageUrl, prompt: brief.prompt });
          await fsPatch('marketingCreatives/' + id, { status: 'submitted', jobSetId, submittedAt: new Date(), pollCount: 0 });
          stats.submitted++; out.submitted.push({ id, listingId: listing.id });
        } catch (e) {
          await fsPatch('marketingCreatives/' + id, { status: 'failed', error: 'submit: ' + String(e.message).slice(0, 200), failedAt: new Date() });
          stats.errors++; stats.failed++;
          out.failed.push({ id, reason: 'submit' });
        }
      }
    }

    // ── salute + report ──────────────────────────────────────────────────
    if (!dry) {
      const ok = stats.errors === 0;
      await reportEmployeeHealth('creativo', {
        ok,
        error: ok ? null : `${stats.errors} intoppi nel giro`,
        stats: { ...stats, eligible: work.eligible, weeklyCount: work.weeklyCount, configured: HF.configured() },
      });
      if (stats.submitted || stats.ready || stats.failed) {
        await saveReport('creativo', {
          summary: `reel: ${stats.submitted} sottomessi · ${stats.ready} pronti · ${stats.failed} falliti`,
          submitted: out.submitted, ready: out.ready, failed: out.failed,
        });
      }
      out.ok = ok;
    }

    return res.status(200).json(out);
  } catch (err) {
    console.error('[marketing/creativo]', err);
    if (!dry) {
      try { await reportEmployeeHealth('creativo', { ok: false, error: err.message }); } catch { /* già loggato */ }
    }
    return res.status(500).json({ ok: false, error: err.message || 'internal' });
  }
}
