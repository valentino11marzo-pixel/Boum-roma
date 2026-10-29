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
// Method: POST · body { form, name, email, phone?, message?, requestId?,
//                       …extra, company(honeypot) }
// → 200 { ok, id }  (the same requestId again → { ok, id, duplicate:true })
//
// IL MODULO CHE SA DA DOVE VIENE LA PERSONA (25/10/2026, /istanbul). Una
// porta generica resta generica, ma un modulo può dichiarare nel suo FORMS
// ciò che sa del visitatore, e solo allora vale:
//   · phoneCountry — il numero si salva E.164 letto col paese del modulo
//     (api/_market.js phoneE164): «0532 123 45 67» scritto su /istanbul è
//     +905321234567, non il +39532… che la card Telegram indovinava, e la
//     risposta WhatsApp del cliente ritrova il suo lead. Il digitato resta
//     in raw.phone; un numero che non ha la forma di quel paese resta com'è.
//   · closed — liste CHIUSE: un valore fuori lista si scarta, mai testo
//     libero nel lead (nel riassunto va l'etichetta per l'operatore);
//   · language — la lingua della PAGINA che la persona ha letto, da un campo
//     chiuso; replyLang decide comunque dalle sue parole, e nessun ramo della
//     macchina scrive in una lingua che non è inglese o italiano;
//   · market, origin, leadType, head — il lead resta un inquilino di Roma
//     (market 'roma'); origin nomina solo la porta (api/_market.js originOf).
// Per tutti i moduli: `requestId` (uno per caricamento di pagina) fa del
// documento web_<form>_<id>, così un invio ritentato dopo un timeout non fa
// un secondo lead; e l'attività si scrive PRIMA della risposta, sotto un
// tetto (la lezione del 13/09: su Vercel ciò che parte dopo res.json muore).

import { fsCreate, logActivity } from '../homie/_lib.js';
import { attributionFromReq } from '../_attribution.js';
import { phoneE164 } from '../_market.js';

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
  // /istanbul — chi si trasferisce a Roma da İstanbul (pagina in turco, EN a
  // scelta). Un inquilino di Roma come gli altri: la macchina intera lo
  // lavora, e la testa del riassunto dice da dove arriva.
  'istanbul': {
    intent: 'relocation', label: 'İSTANBUL → ROMA', head: true,
    market: 'roma', origin: 'istanbul', leadType: 'tenant', phoneCountry: 'tr',
    closed: { page_lang: { tr: 'turca', en: 'inglese' } },
    language: { field: 'page_lang', fallback: 'tr' },
  },
};

/** I campi che NON sono anagrafica: vanno riassunti nel messaggio, così
 *  l'operatore legge il contesto senza aprire il documento. */
const EXTRA_LABELS = {
  zone: 'zona', budget: 'budget', listing_url: 'annuncio', contract: 'contratto',
  arrival_date: 'arrivo', nationality: 'nazionalità', package: 'pacchetto',
  move_in_date: 'move-in', bedrooms: 'camere', preferred_areas: 'zone preferite',
  must_haves: 'requisiti', additional_info: 'note', service: 'servizio',
  form_type: 'tipo', source: 'origine', page_lang: 'pagina',
};

// Il mese della <select> arriva «2027-09»; l'operatore legge «settembre
// 2027». Tabella fissa, mai Intl (con small-ICU stamperebbe «M09»: la
// lezione di itNum). «unsure» è la voce «non ancora deciso»; qualunque altro
// testo resta com'è — l'etichetta è una cortesia, mai una riscrittura.
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio',
  'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
export function monthLabel(v) {
  const t = clip(v, 200);
  if (t === 'unsure') return 'da decidere';
  const m = /^(\d{4})-(\d{2})$/.exec(t);
  if (!m) return t;
  const i = parseInt(m[2], 10);
  return i >= 1 && i <= 12 ? `${MESI[i - 1]} ${m[1]}` : t;
}

/** Un campo di lista chiusa: la chiave se è nella lista, altrimenti null. */
function closedKey(f, k, v) {
  const list = f.closed && f.closed[k];
  if (!list) return undefined;          // il campo non è chiuso per questo modulo
  const key = clip(v, 40).toLowerCase();
  return Object.prototype.hasOwnProperty.call(list, key) ? key : null;
}

const formOf = (formKey) => FORMS[formKey] || FORMS[String(formKey || '').startsWith('blog') ? 'blog' : 'contact'];

export function buildMessage(formKey, body) {
  const f = formOf(formKey);
  const bits = [];
  for (const [k, lab] of Object.entries(EXTRA_LABELS)) {
    const ck = closedKey(f, k, body[k]);
    if (ck === null) continue;                              // fuori lista: scartato
    const v = ck !== undefined ? f.closed[k][ck]
      : (k === 'move_in_date' || k === 'arrival_date') ? monthLabel(body[k]) : clip(body[k], 200);
    if (v) bits.push(`${lab}: ${v}`);
  }
  const msg = clip(body.message, 800);
  if (msg) bits.push(msg);
  // Un modulo con `head` apre il riassunto col suo nome («İSTANBUL → ROMA —
  // …»): è la prima cosa che l'operatore legge, anche quando il brief del
  // Lead Brain prende il posto del messaggio sulla card.
  if (f.head) return bits.length ? `${f.label} — ${bits.join(' · ')}` : f.label;
  return [f.label, ...bits].join(' · ');
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
  const phoneTyped = clip(body.phone, 40);
  const phone = (f.phoneCountry && phoneE164(phoneTyped, f.phoneCountry)) || phoneTyped;
  // Uno per caricamento di pagina: un invio ritentato ritrova lo stesso doc.
  const requestId = /^[a-z0-9]{8,40}$/i.test(String(body.requestId || '')) ? String(body.requestId) : null;
  // Serve un nome e ALMENO un modo per rispondere: un lead irraggiungibile
  // occuperebbe la coda del Commerciale senza poter diventare nulla.
  const reachable = EMAIL_RE.test(email) || phone.replace(/\D/g, '').length >= 6;
  if (!name || !reachable) return res.status(400).json({ ok: false, error: 'contact_required' });

  const message = buildMessage(formKey, body);
  // La lingua: null di regola (la decide replyLang dalle parole della
  // persona); il modulo che la conosce la legge da un campo CHIUSO.
  let language = null;
  if (f.language) {
    const k = closedKey(f, f.language.field, body[f.language.field]);
    language = k || f.language.fallback || null;
  }
  const now = new Date();
  const lead = {
    source: 'web',
    service: null,
    name,
    email: EMAIL_RE.test(email) ? email : null,
    phone: phone || null,
    message,
    notes: message,
    language,
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
    attribution: attributionFromReq(req, body),   // primo contatto consentito, mai bloccante
    raw: {
      form: formKey,
      ip,
      ua: clip(req.headers['user-agent'], 300),
      phone: phoneTyped || null,      // com'era scritto (phone è E.164 dove si sa leggere)
      requestId,
      // tutto ciò che il modulo ha mandato e qui non ha un campo dedicato;
      // un campo chiuso entra SOLO se è nella sua lista
      extra: Object.fromEntries(Object.entries(body)
        .filter(([k]) => !['form', 'name', 'email', 'phone', 'message', 'company', 'requestId'].includes(k))
        .filter(([k, v]) => closedKey(f, k, v) !== null)
        .slice(0, 25)
        .map(([k, v]) => [k, closedKey(f, k, v) || clip(v, 200)])),
    },
    createdAt: now,
    ingestedAt: now,
  };
  // Il modulo che sa chi è la persona lo dichiara; gli altri non toccano lo
  // schema di sempre (nessun campo nuovo sui loro lead).
  if (f.market) lead.market = f.market;
  if (f.origin) lead.origin = f.origin;
  if (f.leadType) lead.leadType = f.leadType;

  try {
    let id;
    try {
      ({ id } = await fsCreate('leads', lead, requestId ? `web_${formKey}_${requestId}` : undefined));
    } catch (e) {
      // lo stesso caricamento di pagina ha già scritto questo lead: successo,
      // nessuna seconda attività, nessun secondo lead
      if (e && e.exists && requestId) return res.status(200).json({ ok: true, id: `web_${formKey}_${requestId}`, duplicate: true });
      throw e;
    }
    // ATTESA, sotto un tetto: un'attività lasciata in volo quando parte la
    // risposta può morire con la funzione. Un tetto superato è solo una riga
    // di registro in meno, mai un lead perso (il lead è già scritto).
    await Promise.race([
      Promise.resolve(logActivity(`Form ${formKey}: ${name}`, 'lead', { leadId: id, form: formKey }, 'web')).catch(() => {}),
      new Promise((r) => setTimeout(r, 4000)),
    ]);
    return res.status(200).json({ ok: true, id });
  } catch (err) {
    console.error('[leads/web] write failed:', err.message);
    return res.status(500).json({ ok: false, error: 'write_failed' });
  }
}
