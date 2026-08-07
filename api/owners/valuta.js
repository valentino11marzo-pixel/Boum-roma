// api/owners/valuta.js — "QUANTO RENDE IL TUO IMMOBILE?", il magnete mandati.
//
// La pagina pubblica /valuta chiede zona + mq + camere e risponde con i DUE
// numeri che BOOM ha già in casa e nessun portale regala insieme:
//   1. la fascia del CANONE CONCORDATO (js/canone-engine.js — accordo Roma
//      25/07/2023, lo stesso motore del Fascicolo Fiscale: la console e la
//      pagina pubblica non possono dare verdetti diversi);
//   2. il MERCATO OSSERVATO dal Perito (marketStats/<zona>, scritto ogni
//      mattina da api/market/pulse.js): €/mq richiesti e giorni di
//      assorbimento — con l'onestà del campione: sotto minSample non esce
//      un numero, esce "campione in costruzione". Una mediana su 3 annunci
//      spacciata per solida farebbe più danno di nessun numero.
//
// Due operazioni sullo stesso POST:
//   { op:'estimate', zona|zonaCod, mq, camere?, bagni?, arredato?, attico?,
//     classeEnergetica?, features[]?, canoneAtteso? }      → { ok, estimate }
//     (nessuna scrittura: si può provare quanto si vuole)
//   { op:'lead', ...gli stessi campi + name, email|phone, address?, message?,
//     company(honeypot) }                                  → { ok, id }
//     Scrive un lead `leadType:'landlord'` nello schema che leggono già
//     portale, Brain e Telegram — e la macchina esistente fa il resto. Il
//     Commerciale su questi lead SI ASTIENE (isOwnerLead in api/_market.js):
//     una trattativa di mandato non parte da un template per inquilini.
//
// Stesso irrigidimento delle altre porte pubbliche (reunion-lead): honeypot
// che risponde 200 senza scrivere, rate limit per IP, campi clippati, un
// rifiuto non scrive mai niente. Il report completo parte via email
// (best-effort: un'email fallita non annulla mai il lead).

import CANONE from '../../js/canone-engine.js';
import ME from '../../js/market-engine.js';
import { fsCreate, fsGet, logActivity } from '../homie/_lib.js';
import { sendEmail } from '../agent/_lib.js';
import { shell, para, fine, btn, rule } from '../preagreement/_notify.js';

// ── Rate limit best-effort per istanza calda (come reunion-lead) ──
const HITS = new Map(); // ip -> [timestamps]
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = { estimate: 30, lead: 6 };
function rateLimited(ip, op) {
  const now = Date.now();
  const key = op + ':' + ip;
  const arr = (HITS.get(key) || []).filter(t => now - t < WINDOW_MS);
  arr.push(now);
  HITS.set(key, arr);
  if (HITS.size > 5000) HITS.clear();
  return arr.length > (MAX_PER_WINDOW[op] || 6);
}

const clip = (v, n = 200) => (v == null ? null : String(v).trim().slice(0, n) || null);
const num = v => {
  const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(',', '.').replace(/[^\d.]/g, ''));
  return isFinite(n) && n > 0 ? n : null;
};
const r10 = v => Math.round(v / 10) * 10;   // arrotondo a €10: è una stima, non un preventivo
const eur = v => '€' + Math.round(v).toLocaleString('it-IT');

/**
 * Gli slug con cui cercare la zona nel libro del Perito. Il vocabolario del
 * radar viene dagli annunci ("Pigneto"), quello dell'accordo dalle schede
 * ("SALARIO TRIESTE (Via dei Laghi/Corsica)"): si prova la forma piena,
 * quella senza parentesi e le parole singole. Se nessun doc esiste, il
 * mercato tace — MAI si allarga la zona di nascosto (la regola di compsFor).
 */
export function zoneSlugCandidates(userText, zonaNome) {
  const out = [];
  const push = s => { const z = ME.normalizeZone(s); if (z && !out.includes(z)) out.push(z); };
  push(userText);
  if (zonaNome) {
    push(zonaNome);
    push(String(zonaNome).replace(/\(.*?\)/g, ' '));
    for (const w of String(zonaNome).replace(/\(.*?\)/g, ' ').split(/\s+/)) if (w.length >= 4) push(w);
  }
  return out;
}

/**
 * La stima, pura: (input, cfg accordo, doc marketStats|null) → estimate.
 * Esportata così i test la guidano senza rete, e l'endpoint resta un guscio.
 */
export function buildEstimate(input, cfg, statsDoc) {
  const mq = num(input.mq);
  if (!mq || mq < 15 || mq > 600) return { ok: false, error: 'mq_non_validi' };

  const zonaText = clip(input.zonaCod, 20) || clip(input.zona, 80);
  const zona = CANONE.matchZone(zonaText || '');

  // ── Concordato: parametri SOLO da feature dichiarate, mai inventati ──
  let concordato = null;
  if (zona) {
    const der = CANONE.deriveParametri(Array.isArray(input.features) ? input.features : []);
    const derM = CANONE.deriveMaggiorazioni({
      furnished: !!input.arredato,
      floorText: input.attico ? 'attico' : '',
      energyClass: clip(input.classeEnergetica, 4) || '',
    }, cfg);
    const calc = CANONE.computeCanone({ zona, mq, parIdx: der.parIdx, mag: derM.mag, cfg });
    if (calc.ok) {
      concordato = {
        zonaCod: zona.cod, zonaNome: zona.nome,
        fascia: calc.fascia, nP: calc.nP, sc: Math.round(calc.sc * 10) / 10,
        eurMqMin: calc.fMin, eurMqMax: calc.fMax,
        monthlyMin: r10(calc.cMin), monthlyMax: r10(calc.cMax),
        note: calc.note,
      };
    }
  }

  // ── Mercato: solo ciò che il campione sostiene ──
  let market = { ok: false, reason: statsDoc ? 'small_sample' : 'no_zone_data', sample: 0 };
  if (statsDoc && statsDoc.asked && statsDoc.asked.ok) {
    const a = statsDoc.asked;
    market = {
      ok: true, sample: a.sample, activeCount: statsDoc.activeCount || 0,
      eurMqMedian: a.medianEurSqm, eurMqP25: a.p25, eurMqP75: a.p75,
      monthlyMedian: r10(a.medianEurSqm * mq),
      monthlyP25: r10(a.p25 * mq), monthlyP75: r10(a.p75 * mq),
      absorptionDays: statsDoc.absorption && statsDoc.absorption.ok ? statsDoc.absorption.medianDays : null,
      absorptionSample: statsDoc.absorption ? statsDoc.absorption.sample : 0,
      priceDrops30d: statsDoc.priceDrops30d || 0,
    };
  } else if (statsDoc && statsDoc.asked) {
    market.sample = statsDoc.asked.sample || 0;
  }

  // ── Dove sta il canone ATTESO dal proprietario, se ce l'ha detto ──
  const atteso = num(input.canoneAtteso);
  let position = null;
  if (atteso) {
    position = { atteso: Math.round(atteso) };
    if (market.ok) {
      const pp = ME.pricePositionFromStats({ price: atteso, sqm: mq, zone: zonaText }, statsDoc);
      if (pp.ok) position.market = { band: pp.band, label: pp.label, vsMedianPct: pp.vsMedianPct };
    }
    if (concordato) {
      position.concordato = atteso <= concordato.monthlyMax + 5
        ? { fits: true }
        : { fits: false, excess: Math.round(atteso - concordato.monthlyMax) };
    }
  }

  return {
    ok: true,
    zona: zona ? { cod: zona.cod, nome: zona.nome } : null,
    zonaText: zonaText || null,
    mq: Math.round(mq),
    camere: num(input.camere) || null,
    concordato, market, position,
    disclaimer: 'Stima organizzativa su dati dichiarati e mercato osservato: non sostituisce '
      + 'l\'attestazione di rispondenza ARPE né una valutazione in loco.',
  };
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

  // Honeypot: un umano non lo compila. 200 così il bot non impara niente.
  if (body.company) return res.status(200).json({ ok: true, id: 'skip' });

  const op = body.op === 'lead' ? 'lead' : 'estimate';
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip, op)) return res.status(429).json({ ok: false, error: 'rate_limited' });

  // Config accordo (pArr/pDur calibrate dalla console) — fail-open sui default.
  let cfg = null;
  try { cfg = await fsGet('settings/canoneAccordo'); } catch { cfg = null; }

  // Il doc di zona del Perito (admin-only nelle rules: lo legge il server).
  const zonaText = clip(body.zonaCod, 20) || clip(body.zona, 80);
  const zonaMatch = CANONE.matchZone(zonaText || '');
  let statsDoc = null;
  for (const slug of zoneSlugCandidates(clip(body.zona, 80), zonaMatch && zonaMatch.nome)) {
    try { statsDoc = await fsGet('marketStats/' + slug); } catch { statsDoc = null; }
    if (statsDoc) break;
  }

  const estimate = buildEstimate(body, cfg, statsDoc);
  if (!estimate.ok) return res.status(400).json({ ok: false, error: estimate.error });

  if (op === 'estimate') return res.status(200).json({ ok: true, estimate });

  // ── op:'lead' — la stima diventa una persona da richiamare ──
  const name = clip(body.name, 120);
  const email = clip(body.email, 160);
  const phone = clip(body.phone, 40);
  const hasEmail = email && email.includes('@') && email.includes('.');
  const hasPhone = phone && /\d{6,}/.test(phone.replace(/\D/g, ''));
  if (!name) return res.status(400).json({ ok: false, error: 'name_required' });
  if (!hasEmail && !hasPhone) return res.status(400).json({ ok: false, error: 'contact_required' });

  const address = clip(body.address, 160);
  const note = clip(body.message, 600);
  const zoneLabel = (estimate.zona && estimate.zona.nome) || estimate.zonaText || null;

  // Il riassunto che l'operatore legge PRIMA di rispondere: il lato in testa
  // (la lezione reunion-lead: leadType lo scrivono in tanti, lo legge nessuno).
  const bits = [];
  if (zoneLabel) bits.push(zoneLabel);
  bits.push(`${estimate.mq} mq`);
  if (estimate.camere) bits.push(`${estimate.camere} camere`);
  if (estimate.concordato) bits.push(`concordato ${eur(estimate.concordato.monthlyMin)}–${eur(estimate.concordato.monthlyMax)}/mese (fascia ${estimate.concordato.fascia})`);
  if (estimate.market.ok) {
    bits.push(`mercato mediana ${eur(estimate.market.monthlyMedian)}/mese`);
    if (estimate.market.absorptionDays) bits.push(`assorbimento ~${estimate.market.absorptionDays}gg`);
  }
  if (estimate.position) bits.push(`atteso ${eur(estimate.position.atteso)}`);
  const summary = [`PROPRIETARIO — Valutazione · ${bits.join(' · ')}.`, address ? `Indirizzo: ${address}.` : null, note]
    .filter(Boolean).join(' ');

  const now = new Date();
  const lead = {
    source: 'web',
    service: 'Valutazione immobile',
    leadType: 'landlord',
    intent: 'valuta_owner',
    name, email: hasEmail ? email : null, phone: phone || null,
    message: summary,
    notes: summary,
    // La pagina è in italiano: 'it' è il default onesto qui (la stessa scelta
    // di reunion-lead col francese). Se le SUE parole sono inglesi, replyLang
    // le vede nel message e vince comunque.
    language: 'it',
    zone: zoneLabel,
    budget: null,
    propertyAddress: address || null,
    status: 'new',
    grade: null,
    ingestedBy: 'owners-valuta',
    sourceRef: 'valuta',
    raw: {
      zona: estimate.zonaText, zonaCod: estimate.zona ? estimate.zona.cod : null,
      mq: estimate.mq, camere: estimate.camere,
      arredato: !!body.arredato, attico: !!body.attico,
      classeEnergetica: clip(body.classeEnergetica, 4),
      features: (Array.isArray(body.features) ? body.features : []).slice(0, 25).map(f => clip(f, 60)),
      canoneAtteso: num(body.canoneAtteso),
      estimate: {
        concordato: estimate.concordato ? { fascia: estimate.concordato.fascia, min: estimate.concordato.monthlyMin, max: estimate.concordato.monthlyMax } : null,
        market: estimate.market.ok ? { median: estimate.market.monthlyMedian, absorptionDays: estimate.market.absorptionDays, sample: estimate.market.sample } : null,
      },
      note, ip,
    },
    createdAt: now,
    ingestedAt: now,
  };

  try {
    // Il lead PRIMA di tutto: una notifica o un'email fallite non possono
    // annullare la persona (stesso ordine testato su reunion-lead).
    const { id } = await fsCreate('leads', lead);
    logActivity('Lead valutazione proprietario', 'lead', { leadId: id, zone: zoneLabel, mq: estimate.mq }, 'owners-valuta');

    fsCreate('agentNotifications', {
      type: 'lead.new',
      summary: `🔑 PROPRIETARIO — Valutazione · ${name}${zoneLabel ? ' · ' + zoneLabel : ''} · ${estimate.mq} mq`
        + (estimate.concordato ? ` · fino a ${eur(estimate.concordato.monthlyMax)}/mese` : ''),
      priority: 'high',
      ref: { collection: 'leads', id },
      payload: { name, email, phone, zone: zoneLabel, mq: estimate.mq, leadType: 'landlord', source: 'owners-valuta' },
      dedupKey: `lead-${id}`,
      status: 'pending',
      actor: 'owners-valuta',
      createdAt: new Date().toISOString(),
      attempts: 0,
    }).catch(e => console.warn('[owners/valuta] notify failed:', e.message));

    if (hasEmail) {
      sendReportEmail({ name, email, estimate, zoneLabel }).catch(e =>
        console.warn('[owners/valuta] report email failed:', e.message));
    }

    return res.status(200).json({ ok: true, id, estimate });
  } catch (err) {
    console.error('[owners/valuta]', err);
    return res.status(500).json({ ok: false, error: 'internal' });
  }
}

// ── Il report al proprietario: gli stessi numeri della pagina, per iscritto,
// nel design system condiviso. Best-effort e time-boxed: mai sul percorso
// del lead. ──────────────────────────────────────────────────────────────
async function sendReportEmail({ name, email, estimate, zoneLabel }) {
  const first = String(name || '').split(' ')[0] || 'Gentile proprietario';
  const c = estimate.concordato, m = estimate.market;
  const rows = [];
  if (c) {
    rows.push(fine(`📐 <strong>Canone concordato (accordo Roma 2023)</strong> — fascia ${c.fascia}: `
      + `<strong>${eur(c.monthlyMin)}–${eur(c.monthlyMax)}/mese</strong> (${c.nP} parametri su 20, sup. convenzionale ${c.sc} mq)`));
    rows.push(fine('Con il concordato: cedolare secca al 10% e la nostra attestazione ARPE inclusa nella gestione.'));
  }
  if (m && m.ok) {
    rows.push(fine(`📊 <strong>Mercato osservato in zona</strong> — mediana ${eur(m.monthlyMedian)}/mese per ${estimate.mq} mq `
      + `(${m.eurMqMedian} €/mq · campione ${m.sample} annunci)`));
    if (m.absorptionDays) rows.push(fine(`⏱ <strong>Tempi di affitto in zona</strong> — mediana ~${m.absorptionDays} giorni (su ${m.absorptionSample} chiusure osservate)`));
  } else {
    rows.push(fine('📊 Il campione di zona del nostro radar è in costruzione: il numero di mercato te lo diamo a voce, su comparabili veri.'));
  }
  await Promise.race([
    sendEmail({
      to: email,
      subject: `La valutazione del tuo immobile${zoneLabel ? ' — ' + zoneLabel : ''} · BOOM`,
      html: shell(
        para(`Ciao ${first},`)
        + para(`ecco la stima per il tuo immobile${zoneLabel ? ` a <strong>${zoneLabel}</strong>` : ''} (${estimate.mq} mq):`)
        + rule()
        + rows.join('')
        + rule()
        + para('Il numero VERO — quello a cui lo metteremmo a reddito — te lo diciamo dopo due domande al telefono. Gestione completa: pubblicazione sui portali, selezione inquilini, contratto concordato registrato, incassi automatici e rendiconto mensile.')
        + btn('https://wa.me/393313251961?text=' + encodeURIComponent(`Ciao, ho fatto la valutazione su boomrome.com${zoneLabel ? ' per ' + zoneLabel : ''} — vorrei parlarne.`), 'Parliamone su WhatsApp')
        + fine('Oppure rispondi a questa email. Stima organizzativa: non sostituisce l\'attestazione ARPE né una valutazione in loco.'),
        `La valutazione del tuo immobile${zoneLabel ? ' a ' + zoneLabel : ''}`),
    }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('email_timeout')), 10000)),
  ]);
}
