// api/reminder-cron.js
// Vercel Cron Job — runs every 15 minutes
// Uses Firebase REST API (no service account key needed)
// Env vars required:
//   FIREBASE_API_KEY        → Web API key from Firebase console
//   FIREBASE_ADMIN_EMAIL    → valentino@boomrome.com
//   FIREBASE_ADMIN_PASS     → your portal password
//   FIREBASE_PROJECT_ID     → boom-property-dashboards
//   GMAIL_USER              → valentino@boomrome.com
//   GMAIL_APP_PASS          → 16-char app password
//   CRON_SECRET             → boom-cron-2026

import nodemailer from 'nodemailer';

// Wallet push is OPTIONAL — it must never take down the reminder cron.
// A static `import … from './_passkit.js'` crashed the whole function at load
// (ERR_MODULE_NOT_FOUND somewhere in the passkit chain → 500 every 15 min, no
// reminders sent). Load it lazily and tolerate failure: log the exact reason
// (so the underlying module issue can be fixed) and no-op the push.
let _pushPass;
async function pushPass(serial) {
  if (_pushPass === undefined) {
    try { _pushPass = (await import('./_passkit.js')).pushPass; }
    catch (e) { console.error('pushPass module unavailable:', (e && e.message) || e); _pushPass = null; }
  }
  if (_pushPass) return _pushPass(serial);
}

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const API_KEY    = process.env.FIREBASE_API_KEY;

async function getFirebaseToken() {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: process.env.FIREBASE_ADMIN_EMAIL,
        password: process.env.FIREBASE_ADMIN_PASS,
        returnSecureToken: true,
      }),
    }
  );
  const data = await res.json();
  if (!data.idToken) throw new Error('Firebase auth failed: ' + JSON.stringify(data));
  return data.idToken;
}

const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

async function fsQuery(collection, token, filter) {
  const body = { structuredQuery: { from: [{ collectionId: collection }], where: { fieldFilter: filter } } };
  const res = await fetch(`${FS_BASE}:runQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function fsPatch(docPath, fields, token) {
  const updateMask = Object.keys(fields).map(f => `updateMask.fieldPaths=${f}`).join('&');
  await fetch(`${FS_BASE}/${docPath}?${updateMask}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
}

function fsVal(v) {
  if (!v) return null;
  if (v.stringValue  !== undefined) return v.stringValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.integerValue !== undefined) return parseInt(v.integerValue);
  if (v.timestampValue !== undefined) return v.timestampValue;
  return null;
}

function parseDoc(doc) {
  if (!doc?.fields) return null;
  const obj = { id: doc.name?.split('/').pop() };
  for (const [k, v] of Object.entries(doc.fields)) obj[k] = fsVal(v);
  return obj;
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASS },
});

// ── Watchdog inviti freddi (puro, testato in tests/notify) ──────────────
// Invito a firmare inviato, NESSUNA firma dopo 72h → re-invito automatico
// al conduttore (max 2, distanza 24h dal reminder manuale). Un contratto
// mai invitato resta una decisione umana: qui non si inventa nulla.
export function shouldReinvite(c, nowMs) {
  const H72 = 72 * 3600 * 1000, H24 = 24 * 3600 * 1000;
  if (!c) return false;
  if (c.status && c.status !== 'active') return false;
  if (c.tenantSignature || c.landlordSignature) return false;   // partial → ci pensa l'altro nudge
  if (!c.tenantSignToken || !c.signInviteTenantAt) return false;
  if (nowMs - new Date(c.signInviteTenantAt).getTime() < H72) return false;
  const last = c.lastReminderAt ? new Date(c.lastReminderAt).getTime() : 0;
  if (last && nowMs - last < H24) return false;
  if ((c.inviteNudgeCount || 0) >= 2) return false;
  return true;
}

export default async function handler(req, res) {
  if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const now = new Date();
  const results = { checked: 0, errors: [] };
  try {
    const token = await getFirebaseToken();
    const queryResult = await fsQuery('viewingRequests', token, {
      field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'confirmed' },
    });
    const docs = (queryResult || []).filter(r => r.document).map(r => parseDoc(r.document)).filter(Boolean);
    results.checked = docs.length;

    // ── Reminder visite: UNA sola voce, quella del countdown ──
    // Questo blocco spediva T-3h e T-30m con finestre proprie (165-195 /
    // 15-45 min) mentre api/viewings/_moments.js — richiamato più sotto —
    // manda T-24h, T-3h, T-30m e il "com'è andata" usando GLI STESSI flag
    // (reminder3hSent/reminder30mSent) su finestre più larghe. Con finestre
    // sovrapposte e un fsPatch che non controlla la risposta, lo stesso
    // cliente poteva ricevere il promemoria due volte. _moments.js è più
    // completo (Wallet, lingua, video/persona) ed è l'unico a parlare.
    // Il push del pass resta suo.

    // ── Rent reminders → live-update the tenant Wallet pass (Prossima rata) ──
    // Pushes once per payment when it enters the 3-day window, and once when it
    // goes overdue (dedup flags on the payment doc). No-op if the tenant hasn't
    // installed the pass.
    try {
      const payQ = await fsQuery('payments', token, {
        field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'pending' },
      });
      const pays = (payQ || []).filter(r => r.document).map(r => parseDoc(r.document)).filter(Boolean);
      let rentPush = 0;
      for (const p of pays) {
        const cid = p.contractId;
        if (!cid || !p.dueDate) continue;
        const days = (new Date(p.dueDate).getTime() - now.getTime()) / 86400000;
        const serials = [`tenant-${cid}`, `silver-${cid}`];
        if (days >= 0 && days <= 3 && !p.passDueSoonPushed) {
          for (const s of serials) { try { await pushPass(s); } catch (e) {} }
          await fsPatch(`payments/${p.id}`, { passDueSoonPushed: { booleanValue: true } }, token);
          rentPush++;
        } else if (days < 0 && !p.passOverduePushed) {
          for (const s of serials) { try { await pushPass(s); } catch (e) {} }
          await fsPatch(`payments/${p.id}`, { passOverduePushed: { booleanValue: true } }, token);
          rentPush++;
        }
      }
      results.rentPush = rentPush;
    } catch (e) { results.errors.push(`rent-push: ${e.message}`); }

    // ── Payment confirmed → "Pagato ✓" live update on the tenant pass ──
    // Only recently-paid (≤3 days) and not yet pushed → no spam, no backfill.
    try {
      const paidQ = await fsQuery('payments', token, {
        field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'paid' },
      });
      const paid = (paidQ || []).filter(r => r.document).map(r => parseDoc(r.document)).filter(Boolean);
      let paidPush = 0;
      for (const p of paid) {
        const cid = p.contractId;
        const when = p.paidDate || p.paidAt;
        if (!cid || !when || p.passPaidPushed) continue;
        const daysSince = (now.getTime() - new Date(when).getTime()) / 86400000;
        if (daysSince < 0 || daysSince > 3) continue;
        for (const s of [`tenant-${cid}`, `silver-${cid}`]) { try { await pushPass(s); } catch (e) {} }
        await fsPatch(`payments/${p.id}`, { passPaidPushed: { booleanValue: true } }, token);
        paidPush++;
      }
      results.paidPush = paidPush;
    } catch (e) { results.errors.push(`paid-push: ${e.message}`); }

    // ── Stale partial signatures → auto re-nudge the missing party ──
    // Contracts stuck at 'partial' for >48h get the counterparty their /sign
    // link again (respecting the manual reminder's 24h cooldown, max 3 auto
    // nudges). Closes the biggest signing-funnel leak with zero admin effort.
    try {
      const partQ = await fsQuery('contracts', token, {
        field: { fieldPath: 'signatureStatus' }, op: 'EQUAL', value: { stringValue: 'partial' },
      });
      const parts = (partQ || []).filter(r => r.document).map(r => parseDoc(r.document)).filter(Boolean);
      let nudged = 0;
      const H48 = 48 * 3600 * 1000, H24 = 24 * 3600 * 1000;
      for (const c of parts) {
        const signedRole = c.tenantSignature ? 'tenant' : (c.landlordSignature ? 'landlord' : null);
        if (!signedRole) continue;
        const pendingToken = signedRole === 'tenant' ? c.landlordSignToken : c.tenantSignToken;
        if (!pendingToken) continue;
        const signedAt = signedRole === 'tenant' ? c.tenantSignedAt : c.landlordSignedAt;
        if (!signedAt || (now.getTime() - new Date(signedAt).getTime()) < H48) continue;
        const last = c.lastReminderAt ? new Date(c.lastReminderAt).getTime() : 0;
        if (last && now.getTime() - last < H24) continue;
        if ((c.autoNudgeCount || 0) >= 3) continue;
        try {
          const { notifyPartialSignature } = await import('./sign/_notify.js');
          await notifyPartialSignature(c, signedRole, null, { nudgeOnly: true });
          await fsPatch(`contracts/${c.id}`, {
            lastReminderAt: { timestampValue: now.toISOString() },
            autoNudgeCount: { integerValue: String((c.autoNudgeCount || 0) + 1) },
          }, token);
          nudged++;
        } catch (e) { results.errors.push(`nudge ${c.id}: ${e.message}`); }
      }
      results.signNudged = nudged;
    } catch (e) { results.errors.push(`sign-nudge: ${e.message}`); }

    // ── Invito a firmare mai aperto → re-invito dopo 72h (max 2) ──
    // Chiude l'altro buco del funnel firme: il contratto INVIATO su cui
    // nessuno ha ancora firmato. Il re-invito parte come "Reminder —" nello
    // stesso design system, e ogni invio resta tracciato sul contratto.
    try {
      const noneQ = await fsQuery('contracts', token, {
        field: { fieldPath: 'signatureStatus' }, op: 'EQUAL', value: { stringValue: 'none' },
      });
      const cold = (noneQ || []).filter(r => r.document).map(r => parseDoc(r.document)).filter(Boolean);
      let reinvited = 0;
      for (const c of cold) {
        if (!shouldReinvite(c, now.getTime())) continue;
        try {
          const { fsGet } = await import('./homie/_lib.js');
          const { sendSignInvite } = await import('./sign/_notify.js');
          const tenant = c.tenantId ? await fsGet('users/' + c.tenantId).catch(() => null) : null;
          const to = (tenant && tenant.email) || c.tenantEmail || '';
          if (!to) continue;
          const sent = await sendSignInvite({
            contract: c, property: null, role: 'tenant', to,
            name: c.tenantName || (tenant && tenant.name) || '',
            url: `https://www.boomrome.com/sign?sign=${encodeURIComponent(c.tenantSignToken)}`,
            resend: true,
          });
          if (sent && sent.ok) {
            await fsPatch(`contracts/${c.id}`, {
              lastReminderAt: { timestampValue: now.toISOString() },
              inviteNudgeCount: { integerValue: String((c.inviteNudgeCount || 0) + 1) },
            }, token);
            reinvited++;
          }
        } catch (e) { results.errors.push(`reinvite ${c.id}: ${e.message}`); }
      }
      results.inviteNudged = reinvited;
    } catch (e) { results.errors.push(`invite-nudge: ${e.message}`); }

    // ── Aperto ma NON firmato → nudge gentile dopo 24h (una volta) ──
    // Il caso visto in produzione: 👀 link aperto, nessuna firma, nessuna
    // domanda. Diverso dal re-invito 72h (che copre chi non ha mai aperto):
    // qui la persona ha VISTO il contratto e si è fermata — un promemoria
    // morbido col suo stesso link, anche per i CO-FIRMATARI (link derivato).
    try {
      const DAY = 24 * 3600 * 1000;
      const seen = [];
      for (const st of ['none', 'partial']) {
        const q = await fsQuery('contracts', token, {
          field: { fieldPath: 'signatureStatus' }, op: 'EQUAL', value: { stringValue: st },
        });
        (q || []).filter(r => r.document).map(r => parseDoc(r.document)).filter(Boolean).forEach(c => seen.push(c));
      }
      let viewNudged = 0;
      for (const c of seen) {
        if (c.status && c.status !== 'active') continue;
        // UN SOLO sollecito al giorno per contratto, qualunque sia la
        // sorgente: senza questa guardia il re-invito 72h, il nudge della
        // firma parziale e questo "ha aperto e non ha firmato" potevano
        // partire nello STESSO run, con lo stesso link, alla stessa persona.
        if (c.lastReminderAt && (now.getTime() - new Date(c.lastReminderAt).getTime()) < DAY) continue;
        const targets = [];
        if (!c.tenantSignature && c.tenantSignToken && c.signViewedTenantAt && !c.viewNudgedTenantAt
            && (now.getTime() - new Date(c.signViewedTenantAt).getTime()) > DAY) {
          const { fsGet } = await import('./homie/_lib.js');
          const tenant = c.tenantId ? await fsGet('users/' + c.tenantId).catch(() => null) : null;
          targets.push({
            to: (tenant && tenant.email) || c.tenantEmail || '',
            name: c.tenantName || (tenant && tenant.name) || '',
            url: `https://www.boomrome.com/sign?sign=${encodeURIComponent(c.tenantSignToken)}`,
            stamp: 'viewNudgedTenantAt',
          });
        }
        const coList = Array.isArray(c.coTenants) ? c.coTenants : [];
        for (let i = 0; i < coList.length; i++) {
          const cv = coList[i];
          if (!cv || !cv.name || cv.signature || !cv.email) continue;
          const viewed = c['signViewedCo' + i + 'At'];
          if (!viewed || c['viewNudgedCo' + i + 'At']) continue;
          if ((now.getTime() - new Date(viewed).getTime()) <= DAY) continue;
          const { cosignRef } = await import('./magic-sign/_shared.js');
          targets.push({
            to: cv.email, name: cv.name,
            url: `https://www.boomrome.com/sign?sign=${encodeURIComponent(cosignRef(c.id, i))}`,
            stamp: 'viewNudgedCo' + i + 'At',
          });
        }
        for (const tg of targets.slice(0, 2)) {
          if (!tg.to) continue;
          try {
            const { sendSignInvite } = await import('./sign/_notify.js');
            const sent = await sendSignInvite({ contract: c, property: null, role: 'tenant', to: tg.to, name: tg.name, url: tg.url, resend: true });
            if (sent && sent.ok) {
              // lastReminderAt è il semaforo condiviso con gli altri nudge
              await fsPatch(`contracts/${c.id}`, {
                [tg.stamp]: { timestampValue: now.toISOString() },
                lastReminderAt: { timestampValue: now.toISOString() },
              }, token);
              viewNudged++;
            }
          } catch (e) { results.errors.push(`view-nudge ${c.id}: ${e.message}`); }
        }
      }
      if (viewNudged) results.viewNudged = viewNudged;
    } catch (e) { results.errors.push(`view-nudge: ${e.message}`); }

// ── Pre-agreement 24h nudge: accepted + payment due + Stripe never
    // completed → one gentle email with a resume-payment link. Lazy import,
    // best-effort — must never take the cron down. ──
    try {
      const { runPaReminders } = await import('./preagreement/_remind.js');
      results.paReminders = await runPaReminders();
    } catch (e) { results.errors.push(`pa-remind: ${e.message}`); }

    // ── Lucchetti sull'immobile: libera quelli che non hanno più diritto di
    // tenerlo (proposta revocata dalla console con una scrittura client-side,
    // proposta cancellata, riserva non pagata oltre la finestra). Senza questa
    // passata un appartamento resterebbe congelato. Una volta l'ora. ──
    if (now.getUTCMinutes() < 15) {
      try {
        const { sweepLocks } = await import('./preagreement/_lock.js');
        results.propertyLocks = await sweepLocks();
      } catch (e) { results.errors.push(`pa-locks: ${e.message}`); }
    }

    // ── Hold €300: la riserva scaduta (48h) libera la casa e Telegram
    // ricorda all'operatore il rimborso. Nello stesso giro, il one-shot
    // Lotto 12 sana i dati del catalogo UNA volta (marker heartbeat —
    // i rerun sono no-op per costruzione). ──
    if (now.getUTCMinutes() < 15) {
      try {
        const { sweepHolds, runOnceLotto12 } = await import('./ops/_lotto12.js');
        results.holds = await sweepHolds();
        results.lotto12 = await runOnceLotto12();
      } catch (e) { results.errors.push(`holds: ${e.message}`); }
    }

    // ── Tenant journey: T-30/T-14/T-7/T-1 pre-move-in, T+3 review ask,
    // T-90 renewal confirmation (no upsell), exit thank-you + referral.
    // Once per step per contract (contracts.journey flags). Lazy import,
    // best-effort. Runs at most once an hour (minute 0-14 window). ──
    if (now.getUTCMinutes() < 15) {
      try {
        const { runJourney } = await import('./journey/_run.js');
        results.journey = await runJourney();
      } catch (e) { results.errors.push(`journey: ${e.message}`); }
    }

    // ── Canone automatico SEPA: avvia gli addebiti delle rate in finestra
    // (contratti col mandato attivo, SDD_LEAD_DAYS di anticipo — SEPA regola
    // in ~5 giorni). Idempotente per costruzione (chiave sdd_<paymentId> +
    // guardia sddPiId): la finestra oraria è risparmio, non protezione. ──
    if (now.getUTCMinutes() < 15) {
      try {
        const { collectSdd } = await import('./payments/_sdd.js');
        results.sdd = await collectSdd();
      } catch (e) { results.errors.push(`sdd: ${e.message}`); }
    }

    // ── Viewing countdown: T-24h / T-3h / T-30m before the appointment and
    // the "how did it go?" ask after it. EVERY run (not hourly): a 30-minute
    // warning is worthless if it can fire an hour late. ──
    try {
      const { runViewingMoments } = await import('./viewings/_moments.js');
      results.viewings = await runViewingMoments();
    } catch (e) { results.errors.push(`viewings: ${e.message}`); }

    // ── Watchdog refinalize: contratti COMPLETI senza finalizedAt ──
    // finalize è best-effort dentro la richiesta del firmatario: se cade
    // (timeout, pdf-lib, SMTP) il contratto resta firmato ma SENZA
    // certificato, contratto-firmato, pack ed email — e finora il recupero
    // era solo manuale. Qui si ritenta da solo (max 2/run: dentro c'è PDF
    // + email, pesa). finalizeContract è idempotente su finalizedAt.
    //
    // ULTIMO DELLA FILA, DI PROPOSITO (lezione 1/09/2026): questo blocco
    // stava PRIMA di journey, incasso SEPA e countdown visite — il giorno
    // in cui Storage rifiutava gli upload, ogni finalize bruciava il resto
    // dei 60s e il 504 di piattaforma spegneva TUTTO ciò che veniva dopo,
    // a ogni run. Un RECUPERO non deve mai affamare l'incasso o i
    // promemoria: ora sta in coda, e in più paga solo se il tempo c'è
    // (la regola di api/_budget.js — la sonda dentro finalizeContract
    // rende comunque il caso-guasto economico, ~1s).
    try {
      const elapsed = () => Date.now() - now.getTime();
      if (elapsed() > 35_000) {
        results.refinalizeSkipped = 'budget';
      } else {
        const compQ = await fsQuery('contracts', token, {
          field: { fieldPath: 'signatureStatus' }, op: 'EQUAL', value: { stringValue: 'complete' },
        });
        const unfinalized = (compQ || []).filter(r => r.document).map(r => parseDoc(r.document))
          .filter(c => c && !c.finalizedAt && c.tenantSignature && c.landlordSignature);
        let refinalized = 0;
        for (const c of unfinalized.slice(0, 2)) {
          if (elapsed() > 40_000) { results.refinalizeSkipped = 'budget'; break; }
          try {
            const { finalizeContract } = await import('./sign/_finalize.js');
            const fin = await finalizeContract(c);
            if (fin && fin.ok && !fin.skipped) refinalized++;
            if (fin && fin.error === 'storage_unavailable') results.errors.push(`refinalize ${c.id}: storage_unavailable`);
          } catch (e) { results.errors.push(`refinalize ${c.id}: ${e.message}`); }
        }
        if (refinalized) results.refinalized = refinalized;
      }
    } catch (e) { results.errors.push(`refinalize-watchdog: ${e.message}`); }

    // Heartbeat (audit P1.2): reminder-cron incassa gli affitti (collectSdd),
    // manda i promemoria e i moments — era il più critico dei cron ciechi. Se
    // muore, ora /team lo vede. Best-effort: mai far fallire il cron per il battito.
    try {
      const { reportEmployeeHealth } = await import('./employees/_lib.js');
      await reportEmployeeHealth('reminder-cron', { ok: !(results.errors && results.errors.length), stats: { errors: (results.errors || []).length } });
    } catch { /* non-fatal */ }

    return res.status(200).json({ ok: true, timestamp: now.toISOString(), ...results });
  } catch (e) {
    console.error('Cron error:', e);
    try {
      const { reportEmployeeHealth } = await import('./employees/_lib.js');
      await reportEmployeeHealth('reminder-cron', { ok: false, error: e.message });
    } catch { /* non-fatal */ }
    return res.status(500).json({ error: e.message });
  }
}
