// api/leads/brain.js — IL LEAD BRAIN (cron */10 min)
//
// Server-side replacement for the Mac-side Homie lead grading, engineered for
// token frugality (Homie's own audit: ~2k Sonnet tokens PER LEAD, plus ~10k/day
// burnt AI-blocking injections a regex kills for free). Three stages:
//
//   STAGE 0 — rules, zero AI (Homie's 4 suggestions + heuristic scoring):
//     · newsletter/portal-noise artifacts and injection payloads → dead,
//       archived, never pinged, never touched by AI
//     · property already rented → grade C + note (still a human, may want
//       something else)
//     · deterministic score from real signals (phone, email, message depth,
//       expat/EN markers, budget, move-in, employment). Confidently high or
//       low → graded without AI. Only the ambiguous middle band moves on.
//   STAGE 1 — ONE batched haiku call per run (up to 20 leads in a single
//     request, strict JSON out) with a hard daily cap. 20 leads = 1 call.
//   STAGE 2 — the expensive personalized reply drafting stays where it is
//     (employees/commerciale, grade-gated, human-approved).
//
// Unlike Homie we NEVER auto-archive a reachable human on a low score:
// spam/injection/noise dies, a thin-but-real lead stays grade C. Quality
// first, tokens second.
//
// Writes on the lead: grade, gradeReason, intent, gradeConfidence, gradedBy,
// gradedAt (+ status 'archived' for dead). notify-pending shows the grade
// and skips dead leads. Heartbeat: teamHealth/lead-brain (visible in /team).
//
// Auth: cron secret / X-Homie-Secret / admin ID token. `?dry=1` read-only.

import { knobs, rejectedLine } from '../_squadra.js';
import {
  requireCronOrAdmin, fsGet, fsPatch, fsList, reportEmployeeHealth, saveReport,
} from '../employees/_lib.js';

const EMPLOYEE = 'lead-brain';
const MODEL = 'claude-haiku-4-5-20251001';
// Dimensione del lotto e freno di spesa non sono piu costanti qui: vivono su
// `settings/squadra` e si cambiano dalla scrivania (portale -> La Squadra),
// con default e intervalli in js/squadra-registry.js. Con dailyAiCallCap a 0
// il voto resta quello delle regole gratuite: nessuna chiamata a pagamento.

const NOISE_RE = /newsletter|unsubscribe|nuovi annunci|ricerca salvata|price drop|annunci per te|conferma la tua email|verifica il tuo account/i;
const INJECTION_RE = /ignore (all|previous|the) instructions|system prompt|\*{3,}\s*INSTRUCTIONS|<\s*(script|iframe)|BEGIN PROMPT|jailbreak/i;
const EXPAT_RE = /relocat|expat|erasmus|exchange|visiting|researcher|nurse|moving to rome|new job in|trasferisco|trasferimento per lavoro|english/i;
const EMPLOY_RE = /contratto|indeterminato|determinato|dipendente|impiegat|salary|income|employed|stipendio|partita iva|freelance|smart working/i;
const BUDGET_RE = /(€|euro|eur)\s?\d{3,4}|\d{3,4}\s?(€|euro|eur)|budget/i;
const MOVEIN_RE = /gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre|january|february|march|april|may|june|july|august|september|october|november|december|subito|asap|il prima possibile/i;

// pure + exported for tests
export function stage0(lead, listingById) {
  const msg = String(lead.message || '').trim();
  if (INJECTION_RE.test(msg)) return { grade: 'dead', reason: 'injection payload', final: true };
  if (NOISE_RE.test(msg) || NOISE_RE.test(String(lead.raw && lead.raw.subject || ''))) {
    return { grade: 'dead', reason: 'portal noise/newsletter', final: true };
  }
  if (!msg && !lead.phone && !lead.email) return { grade: 'dead', reason: 'no content, no contact', final: true };

  let score = 0;
  const why = [];
  if (lead.phone) { score += 25; why.push('phone'); }
  if (lead.email) { score += 15; why.push('email'); }
  if (msg.length >= 80) { score += 20; why.push('rich message'); }
  else if (msg.length > 0 && msg.length < 20) { score -= 15; why.push('generic'); }
  if (lead.language === 'en' || EXPAT_RE.test(msg)) { score += 15; why.push('expat/EN'); }
  if (EMPLOY_RE.test(msg)) { score += 10; why.push('employment'); }
  if (BUDGET_RE.test(msg)) { score += 10; why.push('budget'); }
  if (MOVEIN_RE.test(msg)) { score += 10; why.push('move-in'); }

  const prop = lead.propertyId ? listingById.get(lead.propertyId) : null;
  let rented = false;
  if (prop && /rented|affittato/.test(String(prop.status || ''))) { rented = true; why.push('property rented'); }

  if (rented) return { grade: 'C', reason: 'property already rented — ' + why.join(', '), final: true, score };
  if (score >= 85) return { grade: 'A', reason: why.join(', '), final: true, score };
  if (score >= 70) return { grade: 'B', reason: why.join(', '), final: true, score };
  if (score <= 15 && !lead.phone) return { grade: 'C', reason: 'thin signal — ' + (why.join(', ') || 'no signals'), final: true, score };
  return { score, reason: why.join(', '), final: false };  // ambiguous → AI batch
}

async function gradeBatch(key, items) {
  const SYSTEM = `Sei il valutatore lead di BOOM Roma, agenzia affitti premium orientata a inquilini internazionali/expat e professionisti. Per OGNI lead assegna:
grade: "A" (qualificato e pronto: reddito/lavoro solido o expat in arrivo, richiesta specifica, budget compatibile) | "B" (promettente ma incompleto) | "C" (generico/debole ma persona reale) | "dead" (spam, agenzia, bot, non è una persona interessata)
intent: "visita" | "info" | "apply" | "other"
brief: sintesi operativa in italiano (max 30 parole) che CONSERVA ogni dettaglio utile alla trattativa: chi è (lavoro/studio/coppia), budget, data ingresso, durata, richieste specifiche, urgenza. Niente riempitivi.
Rispondi SOLO array JSON, stesso ordine: [{"i":<n>,"grade":"...","intent":"...","confidence":0-1,"reason":"<max 8 parole>","brief":"<sintesi>"}]`;
  const lines = items.map((x, n) =>
    `LEAD ${n}: fonte=${x.source || '?'} | nome=${x.name || '?'} | tel=${x.phone ? 'sì' : 'no'} | email=${x.email ? 'sì' : 'no'} | lingua=${x.language || '?'}` +
    ` | annuncio=${x.propertyTitle || '?'}${x.propertyPrice ? ' €' + x.propertyPrice : ''}` +
    `\nmessaggio: ${String(x.message || '(vuoto)').slice(0, 400)}`
  ).join('\n---\n');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 1200, system: SYSTEM, messages: [{ role: 'user', content: lines }] }),
  });
  if (!r.ok) throw new Error('anthropic_' + r.status);
  const j = await r.json();
  const out = (j.content || []).map(b => b.text || '').join('');
  const a = out.indexOf('['), b = out.lastIndexOf(']') + 1;
  return JSON.parse(out.slice(a, b));
}

export default async function handler(req, res) {
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;
  const dry = String((req.query && req.query.dry) || '') === '1';
  const { k, rejected } = await knobs(EMPLOYEE);

  const stats = { scanned: 0, ruled: 0, aiGraded: 0, aiCalls: 0, dead: 0, A: 0, B: 0, C: 0, capped: false };
  try {
    const pending = (await fsList('leads', {
      filter: { field: 'status', op: 'EQUAL', value: 'new' }, limit: 50,
    })).filter(l => !l.grade);
    stats.scanned = pending.length;
    if (!pending.length) {
      await reportEmployeeHealth(EMPLOYEE, { ok: true, stats });
      return res.status(200).json({ ok: true, dry, ...stats });
    }

    let listingById = new Map();
    try { listingById = new Map((await fsList('listings', { limit: 100 })).map(l => [l.id, l])); } catch { /* best-effort */ }

    const ambiguous = [];
    const grades = new Map(); // id -> {grade, reason, intent?, confidence?, by}
    for (const l of pending) {
      const r0 = stage0(l, listingById);
      if (r0.final) {
        grades.set(l.id, { grade: r0.grade, reason: r0.reason, confidence: 0.9, by: 'rules' });
        stats.ruled++;
      } else {
        ambiguous.push({ ...l, _score: r0.score, _why: r0.reason });
      }
    }

    // batched AI for the middle band, behind a daily cap
    if (ambiguous.length) {
      const key = process.env.ANTHROPIC_API_KEY;
      // daily AI budget in ONE doc under heartbeat/ (already admin-writable
      // per firestore.rules — no new rules deploy needed); resets on day change
      const BUDGET_DOC = 'heartbeat/lead-brain-budget';
      const day = new Date().toISOString().slice(0, 10);
      let used = 0;
      try {
        const b = (await fsGet(BUDGET_DOC)) || {};
        used = b.day === day ? Number(b.calls || 0) : 0;
      } catch { /* first */ }
      if (!key || used >= k.dailyAiCallCap) {
        stats.capped = true;
        for (const l of ambiguous) grades.set(l.id, { grade: 'B', reason: 'AI cap/off — banda media prudente (' + (l._why || 's0') + ')', confidence: 0.4, by: 'rules-fallback' });
      } else {
        const batch = ambiguous.slice(0, k.batchMax);
        try {
          const out = await gradeBatch(key, batch);
          stats.aiCalls = 1;
          if (!dry) {
            try { await fsPatch(BUDGET_DOC, { day, calls: used + 1, at: new Date() }); }
            catch (e) { console.warn('[leads/brain] budget save failed:', e.message); }
          }
          const byI = new Map((out || []).map(o => [o.i, o]));
          batch.forEach((l, n) => {
            const g = byI.get(n) || {};
            const grade = ['A', 'B', 'C', 'dead'].includes(g.grade) ? g.grade : 'C';
            grades.set(l.id, { grade, reason: String(g.reason || '').slice(0, 120), intent: g.intent, brief: g.brief ? String(g.brief).slice(0, 300) : null, confidence: Math.max(0, Math.min(1, +g.confidence || 0.6)), by: 'ai-batch' });
            stats.aiGraded++;
          });
        } catch (e) {
          console.error('[leads/brain] batch failed:', e.message);
          for (const l of batch) grades.set(l.id, { grade: 'B', reason: 'AI fallita — prudente', confidence: 0.3, by: 'rules-fallback' });
        }
      }
    }

    for (const [id, g] of grades) {
      stats[g.grade === 'dead' ? 'dead' : g.grade] = (stats[g.grade === 'dead' ? 'dead' : g.grade] || 0) + 1;
      if (dry) continue;
      const patch = {
        grade: g.grade, gradeReason: g.reason, gradeConfidence: g.confidence,
        gradedBy: g.by, gradedAt: new Date(),
      };
      if (g.intent) patch.intent = g.intent;
      if (g.brief) patch.brief = g.brief;
      if (g.grade === 'dead') { patch.status = 'archived'; patch.archivedReason = 'lead-brain: ' + g.reason; }
      await fsPatch(`leads/${id}`, patch);
    }

    await reportEmployeeHealth(EMPLOYEE, { ok: true, stats });
    await saveReport(EMPLOYEE, { stats, at: new Date().toISOString(), summary: rejectedLine(rejected) || undefined });
    return res.status(200).json({ ok: true, dry, ...stats });
  } catch (err) {
    console.error('[leads/brain]', err);
    await reportEmployeeHealth(EMPLOYEE, { ok: false, error: err.message });
    return res.status(500).json({ ok: false, error: err.message });
  }
}
