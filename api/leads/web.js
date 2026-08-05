// api/leads/web.js
// L'ULTIMO PEZZO DI SITO CHE NON PARLAVA CON LA MACCHINA.
//
// Dodici moduli pubblici — contatti, contract check gratuito, pre-arrivo,
// precheck, i sette articoli del blog — spedivano ancora a Web3Forms. Ogni
// persona che li compilava diventava una email in una casella: nessun lead,
// quindi niente Lead Brain, niente ping su Telegram, nessun Commerciale.
// Il contract check gratuito è il nostro lead magnet: chi lo chiedeva
// spariva.
//
// Un endpoint solo per tutti, perché i campi cambiano da modulo a modulo ma
// la destinazione no: `form` dice da dove arriva, i campi noti si mappano,
// tutto il resto finisce in `raw` e riassunto in `message` — così un modulo
// nuovo domani non richiede codice nuovo qui.
//
// Method: POST · body { form, name, email, phone?, message?, …extra,
//                       company(honeypot) }
// → 200 { ok, id }

import { fsCreate, logActivity } from '../homie/_lib.js';

const HITS = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 8;
function rateLimited(ip) {
  const now = Date.now();
  const arr = (HITS.get(ip) || []).filter(t => now - t < WINDOW_MS);
  arr.push(now);
  HITS.set(ip, arr);
  if (HITS.size > 5000) for (const k of [...HITS.keys()].slice(0, 1000)) HITS.delete(k);
  return arr.length > MAX_PER_WINDOW;
}

const clip = (v, n = 300) => (v == null ? '' : String(v).trim().slice(0, n));
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Da quale modulo arriva → con che intento, e come chiamarlo nel portale.
// Un `form` sconosciuto non viene rifiutato (un modulo nuovo non deve
// rompersi il giorno del deploy): diventa un contatto generico.
export const FORMS = {
  'contact':         { intent: 'contact',        label: 'Contatto' },
  'contract-check':  { intent: 'contract-check', label: 'Contract check gratuito' },
  'pre-arrival':     { intent: 'concierge',      label: 'Pre-arrivo / concierge' },
  'precheck':        { intent: 'apply',          label: 'Pre-check idoneità' },
  'property-finding':{ intent: 'pfs',            label: 'Property Finding (form)' },
  'blog':            { intent: 'contact',        label: 'Articolo del blog' },
};

/** I campi che NON sono anagrafica: vanno riassunti nel messaggio, così
 *  l'operatore legge il contesto senza aprire il documento. */
const EXTRA_LABELS = {
  zone: 'zona', budget: 'budget', listing_url: 'annuncio', contract: 'contratto',
  arrival_date: 'arrivo', nationality: 'nazionalità', package: 'pacchetto',
  move_in_date: 'move-in', bedrooms: 'camere', preferred_areas: 'zone preferite',
  must_haves: 'requisiti', additional_info: 'note', service: 'servizio',
  form_type: 'tipo', source: 'origine',
};

export function buildMessage(formKey, body) {
  const f = FORMS[formKey] || FORMS[String(formKey || '').startsWith('blog') ? 'blog' : 'contact'];
  const bits = [f.label];
  for (const [k, lab] of Object.entries(EXTRA_LABELS)) {
    const v = clip(body[k], 200);
    if (v) bits.push(`${lab}: ${v}`);
  }
  const msg = clip(body.message, 800);
  if (msg) bits.push(msg);
  return bits.join(' · ');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'no_body' });
  if (body.company) return res.status(200).json({ ok: true, id: null }); // honeypot

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) return res.status(429).json({ ok: false, error: 'rate_limited' });

  const formKey = clip(body.form, 40).toLowerCase() || 'contact';
  const f = FORMS[formKey] || (formKey.startsWith('blog') ? FORMS.blog : FORMS.contact);

  const name = clip(body.name, 120);
  const email = clip(body.email, 160);
  const phone = clip(body.phone, 40);
  // Serve un nome e ALMENO un modo per rispondere: un lead irraggiungibile
  // occuperebbe la coda del Commerciale senza poter diventare nulla.
  const reachable = EMAIL_RE.test(email) || phone.replace(/\D/g, '').length >= 6;
  if (!name || !reachable) return res.status(400).json({ ok: false, error: 'contact_required' });

  const message = buildMessage(formKey, body);
  const now = new Date();
  const lead = {
    source: 'web',
    service: null,
    name,
    email: EMAIL_RE.test(email) ? email : null,
    phone: phone || null,
    message,
    notes: message,
    language: null,          // la decide replyLang dalle parole della persona
    budget: null,
    zone: clip(body.zone || body.preferred_areas, 80) || null,
    situation: null,
    propertyId: null,
    propertyTitle: clip(body.listing_url, 200) || null,
    propertyPrice: null,
    propertyAddress: null,
    intakeForm: false,
    status: 'new',
    grade: null,
    intent: f.intent,
    confidence: null,
    tier: null,
    ingestedBy: 'web-form',
    sourceRef: formKey,
    raw: {
      form: formKey,
      ip,
      ua: clip(req.headers['user-agent'], 300),
      // tutto ciò che il modulo ha mandato e qui non ha un campo dedicato
      extra: Object.fromEntries(Object.entries(body)
        .filter(([k]) => !['form', 'name', 'email', 'phone', 'message', 'company'].includes(k))
        .slice(0, 25)
        .map(([k, v]) => [k, clip(v, 200)])),
    },
    createdAt: now,
    ingestedAt: now,
  };

  try {
    const { id } = await fsCreate('leads', lead);
    logActivity(`Form ${formKey}: ${name}`, 'lead', { leadId: id, form: formKey }, 'web').catch(() => {});
    return res.status(200).json({ ok: true, id });
  } catch (err) {
    console.error('[leads/web] write failed:', err.message);
    return res.status(500).json({ ok: false, error: 'write_failed' });
  }
}
