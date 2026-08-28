// api/marketing/_higgsfield.js — il client Higgsfield, TUTTO in un file.
//
// La documentazione ufficiale (docs.higgsfield.ai) non è raggiungibile dal
// sandbox di build — stessa storia del feed Immobiliare — quindi i fatti
// raccolti e i punti da confermare stanno in docs/higgsfield-api.md. Questo
// file isola ogni assunzione sull'API: base URL, auth, forma del body,
// lettura del job set. Se un nome di campo differisce dai docs, si corregge
// QUI e da nessun'altra parte (submitBody e jobSetStatus sono esportate e
// testate proprio per questo).
//
// Regole:
//  · auth `Authorization: Key <KEY_ID>:<KEY_SECRET>` — server-side SOLO
//  · REST nuda, zero dipendenze npm (la lezione del bundler Vercel)
//  · ogni chiamata è time-boxed: un'API lenta non deve mai mangiarsi il
//    budget della funzione (la lezione ImapFlow)
//  · senza chiavi il client lo DICE (configured() === false), mai un throw
//    a caso a metà run

const BASE = () => process.env.HIGGSFIELD_API_BASE || 'https://api.higgsfield.ai';
const MODEL = () => process.env.HIGGSFIELD_VIDEO_MODEL || 'dop-lite';
const TIMEOUT_MS = 15000;

export function configured() {
  return !!(process.env.HIGGSFIELD_API_KEY && process.env.HIGGSFIELD_API_SECRET);
}

export function authHeader() {
  return 'Key ' + process.env.HIGGSFIELD_API_KEY + ':' + process.env.HIGGSFIELD_API_SECRET;
}

async function hfFetch(path, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(BASE() + path, {
      ...opts,
      signal: ctrl.signal,
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/json',
        ...(opts.headers || {}),
      },
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON error body */ }
    if (!res.ok) {
      throw new Error(`higgsfield ${res.status}: ${(text || '').slice(0, 200)}`);
    }
    return json;
  } finally {
    clearTimeout(t);
  }
}

// Il body del submit — la forma assunta (docs/higgsfield-api.md, sezione
// "da confermare"). Pura ed esportata: i test la pinnano, e una correzione
// post-verifica è un edit in un punto solo.
export function submitBody({ imageUrl, prompt, model, seed }) {
  return {
    params: {
      model: model || MODEL(),
      prompt: String(prompt || ''),
      input_images: [{ type: 'image_url', image_url: imageUrl }],
      enhance_prompt: true,
      ...(Number.isFinite(seed) ? { seed } : {}),
    },
  };
}

// Sottomette un image-to-video. Ritorna { jobSetId } o lancia.
export async function submitImage2Video(args) {
  if (!configured()) throw new Error('higgsfield_unconfigured');
  const out = await hfFetch('/v1/image2video', {
    method: 'POST',
    body: JSON.stringify(submitBody(args)),
  });
  const id = out && (out.id || out.job_set_id || out.jobSetId);
  if (!id) throw new Error('higgsfield: submit senza id nel payload di risposta');
  return { jobSetId: String(id) };
}

// Legge un job set. Ritorna il payload grezzo (jobSetStatus lo normalizza).
export async function getJobSet(jobSetId) {
  if (!configured()) throw new Error('higgsfield_unconfigured');
  return hfFetch('/v1/job-sets/' + encodeURIComponent(jobSetId), { method: 'GET' });
}

// Normalizza QUALSIASI job set in un verdetto a tre stati:
//   { status: 'pending' | 'completed' | 'failed', videoUrl, reason }
// Regole (pinnate nei test):
//  · un job 'failed' o 'nsfw' rende TUTTO il set failed, col motivo detto
//  · completed richiede l'URL del risultato: "completed senza file" è un
//    guasto, non un successo
//  · tutto il resto (queued / in_progress / forme ignote) è pending — mai
//    dichiarare finito ciò che non lo è
export function jobSetStatus(jobSet) {
  const jobs = (jobSet && Array.isArray(jobSet.jobs)) ? jobSet.jobs : [];
  if (!jobs.length) return { status: 'pending', videoUrl: null, reason: null };

  const bad = jobs.find(j => j && (j.status === 'failed' || j.status === 'nsfw'));
  if (bad) {
    return {
      status: 'failed', videoUrl: null,
      reason: bad.status === 'nsfw' ? 'filtro contenuti (nsfw)' : (bad.error || bad.reason || 'generazione fallita'),
    };
  }

  const allDone = jobs.every(j => j && j.status === 'completed');
  if (allDone) {
    const r = jobs[0] && jobs[0].results;
    const url = r && ((r.raw && r.raw.url) || (r.min && r.min.url) || r.url) || null;
    if (!url) return { status: 'failed', videoUrl: null, reason: 'completato ma senza URL del video' };
    return { status: 'completed', videoUrl: url, reason: null };
  }

  return { status: 'pending', videoUrl: null, reason: null };
}
