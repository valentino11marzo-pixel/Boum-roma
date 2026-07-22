// api/wizard/interpret.js
// Natural-language listing edits for the Telegram wizard bot.
//
// The operator types plain Italian — "metti il deposito a due mesi per
// Pigneto", "aumenta il prezzo di Levico di 100€" — and this endpoint turns
// it into a validated update plan against the REAL catalog. It never writes:
// the bot shows the plan with a ✅ Conferma button and applies it only after
// the human tap. Fuzzy names (typos like "Levigo") are the model's job; the
// whitelist + sanitizer here make sure a hallucination can never invent a
// field or an id.
//
// Method: POST  ·  Headers: X-Wizard-Secret (or X-Homie-Secret)
// Body:   { text: "<operator message>" }
// 200:    { ok:true, action:'update', id, name, updates:{...}, summary:[...] }
//         { ok:true, action:'none', note:"<Italian explanation/question>" }
//
// updates already include derived fields (deposit € from depositMonths,
// twin fields size/bedrooms) so the bot writes them verbatim.

import { secretEqual, readJson, fsList } from '../homie/_lib.js';

const MODEL = 'claude-haiku-4-5-20251001';

const ALLOWED = {
  price: 'num', depositMonths: 'num', videoUrl: 'str', name: 'str',
  address: 'str', zone: 'str', sqm: 'num', floor: 'str', beds: 'num',
  bathrooms: 'num', furnished: 'furn', availableDate: 'str',
  description: 'str', agencyFee: 'num', status: 'status',
};
const FURN = new Set(['yes', 'partial', 'no']);
const STATUS = new Set(['available', 'rented', 'waitlist']);

function checkSecret(req, res) {
  const supplied = req.headers['x-wizard-secret'] || req.headers['x-homie-secret'];
  const expected = process.env.WIZARD_SECRET || process.env.HOMIE_SECRET;
  if (!expected) { res.status(500).json({ ok: false, error: 'server_misconfigured: WIZARD_SECRET unset' }); return false; }
  if (!secretEqual(String(supplied || ''), expected)) { res.status(401).json({ ok: false, error: 'invalid_secret' }); return false; }
  return true;
}

const eur = n => '€' + Number(n).toLocaleString('it-IT');

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (!checkSecret(req, res)) return;

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ ok: false, error: 'server_missing_anthropic_key' });

  let body;
  try { body = await readJson(req); } catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  const text = String((body && body.text) || '').trim().slice(0, 600);
  if (!text) return res.status(400).json({ ok: false, error: 'no_text' });

  let listings;
  try { listings = await fsList('listings', { limit: 100 }); }
  catch (e) { return res.status(500).json({ ok: false, error: 'catalog_read_failed' }); }
  const byId = new Map(listings.map(l => [l.id, l]));

  const catalog = listings.map(l =>
    `${l.id} | ${l.name || '?'} | ${l.zone || '?'} | ${eur(l.price || 0)}/mese | stato:${l.status || 'available'}` +
    ` | depositoMesi:${l.depositMonths || 1} | video:${(l.videoUrl || l.youtubeUrl) ? 'sì' : 'no'}`
  ).join('\n');

  const SYSTEM = `Sei l'interprete comandi del gestionale immobiliare BOOM Roma. L'operatore scrive in italiano colloquiale una modifica a un annuncio. Hai il catalogo reale (una riga per annuncio: id | nome | zona | prezzo | stato | depositoMesi | video).

Rispondi SOLO con JSON: {"action":"update","id":"<id dal catalogo>","updates":{...},"note":"<max 1 frase>"} oppure {"action":"none","note":"<domanda o spiegazione in italiano, max 2 frasi>"}.

Campi ammessi in updates: price, depositMonths, videoUrl, name, address, zone, sqm, floor, beds, bathrooms, furnished(yes|partial|no), availableDate, description, agencyFee, status(available|rented|waitlist).

Regole:
- Matcha l'annuncio in modo tollerante (refusi tipo "Levigo"→Levico, nome parziale, zona). L'id DEVE venire dal catalogo, mai inventato.
- Modifiche relative ("aumenta di 100", "sconta 50") → calcola il valore assoluto dal prezzo attuale.
- Deposito espresso in mesi → depositMonths (numero). "due mesi" = 2.
- "affittato/affittata" → status rented; "rimetti disponibile/riattiva" → status available.
- Più annunci plausibili o nessuno → action none con la domanda giusta.
- Richiesta fuori dai campi ammessi → action none spiegando cosa sai fare.`;

  let plan;
  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL, max_tokens: 400, system: SYSTEM,
        messages: [{ role: 'user', content: `CATALOGO:\n${catalog}\n\nMESSAGGIO OPERATORE:\n${text}` }],
      }),
    });
    if (!upstream.ok) {
      console.error('[wizard/interpret] anthropic', upstream.status, (await upstream.text()).slice(0, 200));
      return res.status(502).json({ ok: false, error: 'ai_failed' });
    }
    const data = await upstream.json();
    const out = (data.content || []).map(b => b.text || '').join('').trim();
    const a = out.indexOf('{'), b = out.lastIndexOf('}');
    plan = JSON.parse(a >= 0 && b > a ? out.slice(a, b + 1) : out);
  } catch (e) {
    console.error('[wizard/interpret]', e);
    return res.status(502).json({ ok: false, error: 'ai_failed' });
  }

  if (!plan || plan.action !== 'update' || !byId.has(plan.id)) {
    return res.status(200).json({ ok: true, action: 'none', note: String((plan && plan.note) || 'Non ho trovato l\'annuncio — dimmi il nome o l\'ID (/listings).').slice(0, 300) });
  }

  // Sanitize: whitelist + coercion. A hallucinated field dies here.
  const cur = byId.get(plan.id);
  const updates = {};
  for (const [k, v] of Object.entries(plan.updates || {})) {
    const kind = ALLOWED[k];
    if (!kind) continue;
    if (kind === 'num') { const n = Number(String(v).replace(',', '.')); if (Number.isFinite(n) && n >= 0) updates[k] = n; }
    else if (kind === 'furn') { if (FURN.has(v)) updates[k] = v; }
    else if (kind === 'status') { if (STATUS.has(v)) updates[k] = v; }
    else { const s = String(v).trim(); if (s) updates[k] = s.slice(0, 2000); }
  }
  if (!Object.keys(updates).length) {
    return res.status(200).json({ ok: true, action: 'none', note: 'Ho capito l\'annuncio ma non la modifica — riprova con più dettagli.' });
  }

  // Derived fields + human summary (old → new), so the bot just displays.
  const summary = [];
  const newPrice = updates.price != null ? updates.price : Number(cur.price || 0);
  if (updates.price != null) summary.push(`Prezzo: ${eur(cur.price || 0)} → ${eur(updates.price)}`);
  if (updates.depositMonths != null) {
    if (updates.depositMonths > 6) updates.depositMonths = 6;
    updates.deposit = Math.round(updates.depositMonths * newPrice);
    summary.push(`Deposito: ${updates.depositMonths} mes${updates.depositMonths === 1 ? 'e' : 'i'} = ${eur(updates.deposit)}`);
  } else if (updates.price != null && Number(cur.depositMonths) > 0) {
    updates.deposit = Math.round(Number(cur.depositMonths) * newPrice);
    summary.push(`Deposito ricalcolato: ${eur(updates.deposit)} (${cur.depositMonths} mesi)`);
  }
  if (updates.sqm != null) updates.size = updates.sqm;
  if (updates.beds != null) updates.bedrooms = updates.beds;
  if (updates.videoUrl) summary.push('Video tour aggiornato');
  if (updates.status) summary.push(`Stato: ${cur.status || 'available'} → ${updates.status}`);
  for (const k of ['name', 'address', 'zone', 'sqm', 'floor', 'beds', 'bathrooms', 'furnished', 'availableDate', 'agencyFee']) {
    if (updates[k] != null) summary.push(`${k}: ${cur[k] != null ? cur[k] : '—'} → ${updates[k]}`);
  }
  if (updates.description) summary.push('Descrizione aggiornata');

  return res.status(200).json({
    ok: true, action: 'update', id: plan.id,
    name: cur.name || plan.id, updates, summary,
    note: String(plan.note || '').slice(0, 200),
  });
}
