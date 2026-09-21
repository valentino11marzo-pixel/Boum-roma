// api/scrivano/_core.js — LO SCRIVANO, passo 4: la lettura dal telefono.
//
// Il tap 🌱 su un documento archiviato NON legge dentro il webhook Telegram:
// una lettura con Opus 5 dura fino a 100 s, Telegram ritenta l'update se il
// webhook non risponde in fretta (= due letture) e su Vercel il lavoro dopo
// la risposta si perde (la lezione del 13/09). Quindi: il tap mette IN CODA
// (scrivanoProposals/<docId>, id = il documento → un secondo tap non legge
// due volte), il worker al minuto prende UNA lettura, legge col CUORE
// dell'Innesto (api/portal/ingest.js: stesso prompt, stesso schema, stesse
// citazioni) e manda la card con il link al portal, dove si conferma.
// Qui non nasce mai un contratto, una persona o un immobile: solo la
// PROPOSTA. Le scritture vere restano nel portal, dietro la conferma.
import { fsGet, fsPatch, fsList } from '../homie/_lib.js';
import { readFiles, ingestRead, knownFromStore } from '../portal/ingest.js';
import { tgSend } from '../telegram/_lib.js';
import { runBudget } from '../_budget.js';

export const QUEUE = 'scrivanoProposals';
export const PORTAL_BASE = 'https://www.boomrome.com';   // sempre www: la lezione «Redirecting...»
export const LEASE_MS = 4 * 60 * 1000;    // una lettura ferma oltre 4' è un worker morto a metà: si riprende
export const MAX_ATTEMPTS = 2;             // un guasto momentaneo si riprova UNA volta, poi si dice
export const READ_COST_MS = 110 * 1000;    // AI_MS (100 s) + preparazione: quanto deve restare nel budget per iniziarne una
// Errori che non cambiano riprovando: si chiudono subito, col rimedio.
export const DETERMINISTIC = new Set([
  'too_many_pages', 'ai_too_long', 'unsupported_media_type', 'file_too_large', 'files_too_large',
  'ai_refused', 'ai_truncated', 'server_missing_anthropic_key', 'bad_file_url', 'text_or_file_required',
  'ai_bad_request', 'ai_bad_document',   // un 400 del modello che non è «troppo materiale»: schema/richiesta o documento illeggibile — riprovare non cambia nulla
]);

const iso = (t = Date.now()) => new Date(t).toISOString();
const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const eur = (n) => '€' + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export function proposalUrl(docId) {
  return `${PORTAL_BASE}/portal#innesto=${encodeURIComponent(String(docId))}`;
}

export function openKeyboard(docId) {
  return { inline_keyboard: [[{ text: '🖥 Apri nel portal e conferma', url: proposalUrl(docId) }]] };
}

// Ciò che del documento archiviato serve alla lettura e alla card: mai il
// contenuto, solo dove sta e come si chiama.
export function docSnapshot(doc, docId) {
  const d = doc || {};
  return {
    id: docId, name: d.name || null, fileName: d.fileName || null, fileUrl: d.fileUrl || null,
    mimeType: d.mimeType || null, category: d.category || null, type: d.type || null,
    propertyId: d.propertyId || null, contractId: d.contractId || null, tenantName: d.tenantName || null,
    fiscalYear: d.fiscalYear || null, needsFiling: !!d.needsFiling, source: d.source || null,
  };
}

// Il tap: mette in coda. Idempotente sul docId — «già letto» rimanda la
// card, «in lettura» o «in coda» non raddoppiano niente.
export async function enqueueRead({ docId, chatId = null, messageId = null, origin = 'telegram', now = Date.now() }) {
  const id = String(docId || '').trim();
  if (!id) return { ok: false, error: 'doc_id_required' };
  const doc = await fsGet('documents/' + id).catch(() => null);
  if (!doc) return { ok: false, error: 'doc_not_found' };
  if (!doc.fileUrl) return { ok: false, error: 'doc_without_file' };
  const prev = await fsGet(QUEUE + '/' + id).catch(() => null);
  if (prev && prev.status === 'done') return { ok: true, state: 'done', record: prev };
  if (prev && prev.status === 'reading' && !isStale(prev, now)) return { ok: true, state: 'reading' };
  if (prev && prev.status === 'queued') return { ok: true, state: 'queued', already: true };
  await fsPatch(QUEUE + '/' + id, {
    docId: id, status: 'queued', queuedAt: iso(now), chatId: chatId != null ? String(chatId) : null,
    messageId: messageId != null ? Number(messageId) : null, origin, attempts: 0, leaseAt: null,
    error: null, detail: null, document: docSnapshot(doc, id),
  });
  return { ok: true, state: 'queued' };
}

export function isStale(rec, now = Date.now()) {
  const t = Date.parse(rec && rec.leaseAt || '');
  return !t || now - t > LEASE_MS;
}

// Pura: la prossima lettura da fare — in coda, la più vecchia prima; una
// «reading» col lease scaduto torna eleggibile (il worker che l'aveva presa
// è morto a metà).
export function pickNext(items, now = Date.now()) {
  const cand = (items || []).filter((r) => r && (r.status === 'queued' || (r.status === 'reading' && isStale(r, now))));
  cand.sort((a, b) => String(a.queuedAt || '').localeCompare(String(b.queuedAt || '')));
  return cand[0] || null;
}

async function readOne(item) {
  const d = item.document || {};
  let files;
  try {
    files = await readFiles({ files: [{ fileUrl: d.fileUrl, mediaType: d.mimeType || '', name: d.fileName || d.name || 'documento' }] });
  } catch (e) {
    return { ok: false, status: e.status || 400, error: e.message, detail: e.detail || null };
  }
  const known = await knownFromStore();
  // L'indicazione resta MORBIDA: l'immobile che lo Smistatore ha agganciato
  // aiuta l'aggancio, ma una classificazione sbagliata non deve deviare la
  // lettura (nel prompt l'indicazione «ha precedenza sulle deduzioni»).
  let hint = '';
  if (d.propertyId) {
    const prop = await fsGet('properties/' + d.propertyId).catch(() => null);
    const label = prop ? [prop.name || prop.title, prop.address].filter(Boolean).join(' — ') : '';
    if (label) hint = `In archivio il documento è agganciato all'immobile «${label}»: se il testo lo conferma, usa quella grafia.`;
  }
  return ingestRead({ files, text: '', hint, known, tag: 'scrivano/worker' });
}

// La card della proposta pronta: un riepilogo che si legge sul telefono,
// e il link. Pura: si testa senza rete.
export function proposalCard(rec) {
  const p = rec.proposal || {}, d = rec.document || {};
  const lines = [];
  lines.push(`🌱 <b>${rec.empty ? 'Nessun dato riconosciuto' : 'Proposta pronta'}</b> · «${esc(d.name || d.fileName || rec.docId)}»`);
  if (rec.summary) lines.push(`<i>${esc(rec.summary)}</i>`);
  for (const f of (rec.files || []).slice(0, 4)) {
    lines.push(`${f.legible ? '📄' : '⚠️'} ${esc(f.title || f.name || '')} — ${esc(f.label || '')}${f.pages ? ' · ' + f.pages + ' pag.' : ''}${!f.legible ? ' · illeggibile' + (f.summary ? ': ' + esc(f.summary) : '') : ''}`);
  }
  if (p.tenant && p.tenant.name) lines.push(`👤 Inquilino: <b>${esc(p.tenant.name)}</b>${p.tenant.codiceFiscale ? ' · ' + esc(p.tenant.codiceFiscale) : ''}`);
  (p.coTenants || []).slice(0, 3).forEach((c) => { if (c && c.name) lines.push(`👥 Co-conduttore: ${esc(c.name)}`); });
  if (p.landlord && (p.landlord.businessName || p.landlord.name)) lines.push(`🏢 Proprietario: <b>${esc(p.landlord.businessName || p.landlord.name)}</b>`);
  if (p.property && (p.property.address || p.property.name)) lines.push(`🏠 Immobile: <b>${esc(p.property.address || p.property.name)}</b>${p.property.city ? ', ' + esc(p.property.city) : ''}`);
  const c = p.contract;
  if (c && (c.rent || c.startDate)) {
    lines.push(`📜 Contratto: ${esc(c.type || '—')}${c.rent ? ' · ' + eur(c.rent) + '/mese' : ''}${c.startDate ? ' · ' + esc(c.startDate) + (c.endDate ? ' → ' + esc(c.endDate) : '') : ''}${c.deposit ? ' · deposito ' + eur(c.deposit) : ''}`);
  }
  const ch = rec.checks || {};
  const msg = (e) => esc(typeof e === 'string' ? e : (e && (e.msg || e.message || e.text)) || '');
  const errs = ch.errors || [], warns = ch.warnings || [];
  if (errs.length) lines.push(`❌ ${errs.length} ${errs.length === 1 ? 'errore da correggere' : 'errori da correggere'}: ${errs.slice(0, 2).map(msg).join(' · ')}`);
  else if (!rec.empty) lines.push(`✅ Nessun errore${warns.length ? ' · ' + warns.length + (warns.length === 1 ? ' avviso' : ' avvisi') : ''}`);
  const u = rec.usage || {};
  const meta = [
    rec.confidence != null ? 'sicurezza ' + rec.confidence + '%' : null,
    u.ms ? Math.round(u.ms / 1000) + ' s' : null,
    u.inputTokens ? ((u.inputTokens || 0) + (u.outputTokens || 0)) + ' token' : null,
  ].filter(Boolean).join(' · ');
  if (meta) lines.push(`🔎 ${esc(meta)}`);
  lines.push('');
  lines.push(rec.empty
    ? 'Nessuna proposta da questo documento. Dal portal puoi rileggerlo con un\'indicazione o con un file più nitido.'
    : 'Niente è stato scritto: apri il portal, controlla campi e citazioni, e conferma.');
  return lines.join('\n');
}

export function failureCard(rec, res) {
  const d = rec.document || {};
  return [
    `⚠️ <b>Lettura non riuscita</b> · «${esc(d.name || d.fileName || rec.docId)}»`,
    esc(res.detail || 'Il servizio di lettura non ha risposto.'),
    res.error ? `<code>${esc(res.error)}</code>` : null,
    '',
    'Dal portal (🌱 Innesto) puoi rileggerlo quando vuoi, anche con meno pagine.',
  ].filter(Boolean).join('\n');
}

async function notify(rec, text, opts) {
  const chatId = rec.chatId || process.env.TELEGRAM_CHAT_ID;
  if (!chatId || !process.env.TELEGRAM_BOT_TOKEN) return false;
  try { await tgSend(chatId, text, opts || {}); return true; }
  catch (e) { console.error('[scrivano] notify', e && e.message); return false; }
}

// Il giro del worker: UNA lettura per run (una lettura vale fino a 100 s,
// il run ne ha 120). Torna sempre {ok:true} quando ha lavorato: un
// documento illeggibile è un guasto del documento, non del worker.
export async function processQueue({ dry = false, now = Date.now(), budget = null } = {}) {
  const b = budget || runBudget(120_000, 5_000);
  const items = await fsList(QUEUE, { limit: 200 }).catch(() => []);
  const stats = { queued: items.filter((r) => r.status === 'queued').length, read: 0, failed: 0, retried: 0, deferred: 0 };
  const next = pickNext(items, now);
  if (!next) return { ok: true, idle: true, stats };
  if (dry) return { ok: true, dry: true, next: next.docId, stats };
  if (!b.afford(READ_COST_MS)) { stats.deferred++; return { ok: true, deferred: next.docId, stats }; }

  const key = QUEUE + '/' + next.docId;
  const attempts = (next.attempts || 0) + 1;
  await fsPatch(key, { status: 'reading', leaseAt: iso(now), attempts });

  let res;
  try { res = await readOne(next); }
  catch (e) { res = { ok: false, status: 500, error: 'read_crashed', detail: String(e && e.message || e).slice(0, 200) }; }

  if (res.ok) {
    const record = {
      status: 'done', doneAt: iso(), error: null, detail: null, leaseAt: null,
      proposal: res.proposal || {}, derived: res.derived || {}, checks: res.checks || null,
      files: res.files || [], evidence: res.evidence || [], notes: res.notes || [],
      confidence: res.confidence != null ? res.confidence : null, summary: res.summary || '',
      usage: res.usage || null, empty: !!res.empty, message: res.message || null,
    };
    await fsPatch(key, record);
    stats.read++;
    const full = Object.assign({}, next, record);
    await notify(full, proposalCard(full), { reply_markup: openKeyboard(next.docId) });
    console.log(`[scrivano] done doc=${next.docId} attempts=${attempts} sections=${Object.keys(record.proposal).join(',') || '-'}`);
    return { ok: true, done: next.docId, stats };
  }

  const giveUp = DETERMINISTIC.has(res.error) || attempts >= MAX_ATTEMPTS;
  if (giveUp) {
    await fsPatch(key, { status: 'failed', failedAt: iso(), error: res.error || 'unknown', detail: res.detail || null, leaseAt: null });
    stats.failed++;
    await notify(next, failureCard(next, res));
    console.error(`[scrivano] failed doc=${next.docId} attempts=${attempts} error=${res.error}`);
    return { ok: true, failed: next.docId, stats };
  }
  await fsPatch(key, { status: 'queued', error: res.error || 'unknown', detail: res.detail || null, leaseAt: null });
  stats.retried++;
  console.error(`[scrivano] retry doc=${next.docId} attempts=${attempts} error=${res.error}`);
  return { ok: true, retried: next.docId, stats };
}
