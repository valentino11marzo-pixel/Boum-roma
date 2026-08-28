// api/segretaria/_core.js — LA SEGRETARIA, il braccio operativo.
//
// Il disegno: STUDIO_SEGRETARIA_2026-08.md. I binari duri (chi, quando,
// quanto, l'eco, la sanificazione dell'uscita) vivono nel motore puro
// js/segretaria-engine.js; qui vive l'I/O: i fatti VERI nel prompt
// (catalogo con lo stato, alternative, slot dalla griglia di _avail,
// servizi da _catalog — mai un prezzo a memoria), la chiamata al modello,
// l'invio dalla STESSA rotaia del tap manuale (action_queue → executor →
// outbox WhatsApp), l'escalation con la card 🖐 e il quadro /segretaria.
//
// Contenimento: segretariaTurn è chiamata best-effort da homie/message —
// un suo errore non deve MAI far perdere il messaggio (che è già scritto).

import SEG from '../../js/segretaria-engine.js';
import { fsGet, fsPatch, fsCreate, fsList, logActivity } from '../homie/_lib.js';
import { tgSend } from '../telegram/_lib.js';
import { runExecutor, romeDay } from '../employees/_fiducia.js';
import { callClaude, extractJson } from '../agent/_claude.js';
import { replyLang } from '../_lang.js';
import { loadConfig, busyBlocks, buildSlots, listingCtx } from '../viewings/_avail.js';
import { CATALOG } from '../_catalog.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const ts = v => v && v.toMillis ? v.toMillis() : (v && v._seconds ? v._seconds * 1000 : (v ? new Date(v).getTime() || 0 : 0));

const SYSTEM = `Sei la segretaria di BOOM Roma, agenzia premium di affitti a Roma (boomrome.com). Rispondi su WhatsApp ai potenziali clienti mentre l'operatore non può. Il pubblico è internazionale: expat, professionisti, studenti stranieri.

LINGUA: quella indicata in "Lingua risposta". È già decisa: rispettala.

STILE (misurato sui messaggi veri dell'operatore): CORTO — 1-3 frasi, mai oltre ~400 caratteri. Una sola domanda per messaggio. Niente markdown, massimo 1 emoji. Prima persona plurale ("noi di BOOM"), MAI firmarti con un nome di persona. Caldo, diretto, professionale.

LA REGOLA D'ORO: NON INVENTARE MAI. Sai SOLO ciò che c'è nei fatti qui sotto. Un dato che non hai → dillo e prometti di verificarlo ("te lo confermo a breve").

DISPONIBILITÀ: se l'immobile è DISPONIBILE, conferma e porta verso la visita (di persona o in video — la video è gratuita per le nostre case, i clienti sono spesso all'estero). Se è AFFITTATO/NON DISPONIBILE, dillo subito con onestà, poi rilancia: chiedi zona/budget/data di ingresso e proponi le ALTERNATIVE REALI se le hai, o la ricerca su misura.

VISITE: proponi gli slot REALI elencati nei fatti (2-3 al massimo) e manda il link di prenotazione. Mai promettere un orario che non è nei fatti.

SERVIZI: al massimo UNO per conversazione, solo se risolve un problema che emerge, come possibilità e mai come vendita. I prezzi sono nei fatti: non citarne altri.

QUANDO PASSARE ALL'OPERATORE (escalate): trattativa sul prezzo o richieste di sconto, questioni legali o contrattuali, lamentele serie, richieste che i fatti non coprono e che contano. In quel caso di' che metti la persona in contatto con Valentino.

Rispondi SOLO con un oggetto JSON valido, senza testo attorno:
{"reply": "<messaggio WhatsApp>", "escalate": false}
oppure {"reply": "<eventuale messaggio ponte, o vuoto>", "escalate": true, "reason": "<perché serve l'operatore>"}`;

// ─── I fatti: solo fonti vere ────────────────────────────────────────────

async function propertyFacts(lead) {
  const pid = lead && (lead.propertyId || lead.listingId);
  if (!pid) return { pid: null, available: null, lines: [] };
  let l = null;
  try { l = await fsGet(`listings/${pid}`); } catch { /* ignore */ }
  if (!l) { try { l = await fsGet(`properties/${pid}`); } catch { /* ignore */ } }
  if (!l) return { pid, available: null, lines: [] };
  const st = String(l.status || 'available').toLowerCase();
  const gone = /rented|affittat|off_market|reserved|unavailable/.test(st);
  const facts = [
    l.name || null,
    l.price ? `€${l.price}/mese` : null,
    l.sqm ? `${l.sqm}mq` : null,
    l.bedrooms || l.beds ? `${l.bedrooms || l.beds} camere` : null,
    l.zone ? `zona ${l.zone}` : null,
    (l.availableFrom || l.availableDate) ? `libero da ${l.availableFrom || l.availableDate}` : null,
    `link: https://www.boomrome.com/listing/${pid}`,
  ].filter(Boolean).join(' · ');
  return {
    pid, available: !gone,
    lines: [`IMMOBILE D'INTERESSE — STATO: ${gone ? 'NON PIÙ DISPONIBILE (dillo con onestà, proponi alternative)' : 'DISPONIBILE'}\n${facts}`],
  };
}

async function alternativeFacts(lead) {
  try {
    const all = await fsList('listings', { filter: { field: 'status', op: 'EQUAL', value: 'available' }, limit: 60 });
    const zone = String(lead.zone || lead.propertyZone || '').toLowerCase();
    const price = Number(lead.budget || lead.propertyPrice || lead.listingPrice || 0);
    const scored = all.map(l => {
      let s = 0;
      if (zone && String(l.zone || '').toLowerCase().includes(zone)) s += 2;
      if (price && l.price && Math.abs(Number(l.price) - price) <= price * 0.2) s += 1;
      return { l, s };
    }).sort((a, b) => b.s - a.s).slice(0, 2).filter(x => x.s > 0 || !zone);
    if (!scored.length) return [];
    return ['ALTERNATIVE REALI disponibili ora (citane al massimo 2, con link):\n' + scored.map(({ l }) =>
      `- ${l.name || l.id}${l.zone ? ', ' + l.zone : ''}${l.price ? ' — €' + l.price + '/mese' : ''} → https://www.boomrome.com/listing/${l.id}`
    ).join('\n')];
  } catch { return []; }
}

async function slotFacts(pid) {
  try {
    const cfg = await loadConfig();
    const busy = await busyBlocks(cfg);
    const ctx = await listingCtx(pid || '');
    const lines = [];
    for (const mode of ['video', 'person']) {
      const days = buildSlots(cfg, busy, mode, new Date(), ctx) || [];
      const flat = [];
      for (const d of days) {
        for (const t of d.times || []) { flat.push(`${d.label} ${t.label}`); if (flat.length >= 3) break; }
        if (flat.length >= 3) break;
      }
      if (flat.length) lines.push(`${mode === 'video' ? 'VIDEO-VISITA' : 'VISITA DI PERSONA'} — prossimi slot veri: ${flat.join(' · ')}`);
    }
    lines.push(`Link prenotazione (il cliente sceglie da solo): https://www.boomrome.com/book${pid ? '?listing=' + encodeURIComponent(pid) : ''}`);
    return lines;
  } catch { return []; }
}

function serviceFacts() {
  const pick = ['virtual-viewing', 'deal-assistance', 'contract-check-express', 'remote-move-pack'];
  const rows = pick.filter(k => CATALOG[k]).map(k => `- ${CATALOG[k].label}: €${CATALOG[k].eur} → https://www.boomrome.com${CATALOG[k].cancel}`);
  rows.push('- Property Finding (ricerca su misura sul mercato): €350 → https://www.boomrome.com/property-finding');
  return ['SERVIZI (massimo UNO, solo se risolve un problema emerso; la video-visita delle case BOOM è GRATIS, il Virtual Viewing €89 è per case NON nostre):\n' + rows.join('\n')];
}

// La storia può vivere su DUE doc conversazione: i primi messaggi di uno
// sconosciuto stanno su conv_whatsapp_<numero>, ma appena il lead esiste la
// risoluzione per telefono instrada tutto su conv_lead_<id>. Si leggono
// entrambe, si ordina per tempo, si tengono le ultime battute.
async function historyFacts(cids) {
  try {
    let rows = [];
    for (const cid of [...new Set(cids.filter(Boolean))]) {
      rows = rows.concat(await fsList('messages', { filter: { field: 'conversationId', op: 'EQUAL', value: cid }, limit: 80 }).catch(() => []));
    }
    const last = rows.sort((a, b) => ts(a.at) - ts(b.at)).slice(-12);
    if (!last.length) return [];
    return ['CONVERSAZIONE FINORA (dal più vecchio):\n' + last.map(m =>
      `${m.direction === 'in' ? 'CLIENTE' : 'BOOM'}: ${String(m.body || '').replace(/\s+/g, ' ').slice(0, 220)}`
    ).join('\n')];
  } catch { return []; }
}

// ─── L'escalation: un passaggio di testimone, mai un errore ──────────────
export async function escalateSegretaria({ cid, conv, lead, why, text }) {
  await fsPatch('conversations/' + cid, {
    segretaria: false,
    segretariaEscalatedAt: new Date(),
    segretariaEscalateWhy: String(why || '').slice(0, 300),
    needsReply: true,
  }).catch(() => {});
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) return;
  const name = (conv && conv.contactName) || (lead && lead.name) || 'cliente';
  const phone = (conv && conv.contactPhone) || (lead && lead.phone) || '';
  const digits = String(phone).replace(/\D/g, '');
  const kb = digits ? { reply_markup: { inline_keyboard: [[{ text: '💬 Riprendi tu su WhatsApp', url: `https://wa.me/${digits}` }]] } } : {};
  await tgSend(chatId,
    `🖐 <b>La Segretaria ti passa ${esc(name)}</b>\n${esc(why || '')}` +
    (text ? `\n\n💬 <i>${esc(String(text).slice(0, 240))}</i>` : '') +
    (lead && lead.propertyTitle ? `\n🏠 ${esc(lead.propertyTitle)}` : ''),
    kb).catch(() => {});
}

// ─── IL TURNO ────────────────────────────────────────────────────────────
// Chiamata da homie/message su OGNI inbound di una conversazione consegnata.
// Ritorna { acted, sent?, escalated?, why? } — mai lancia verso l'alto.
export async function segretariaTurn({ cid, conv, lead, text, messageId, now = Date.now() }) {
  const raw = await fsGet('settings/segretaria').catch(() => null);
  const { cfg } = SEG.mergeConfig(raw);
  const day = romeDay(now);
  const budgetPath = `heartbeat/segretaria-${day}`;
  const budget = (await fsGet(budgetPath).catch(() => null)) || {};
  const turnsToday = Number(budget.turns || 0);

  const v = SEG.turnVerdict({ conv, text, cfg, turnsToday });
  if (v.act === 'skip') return { acted: false, why: v.why };
  if (v.act === 'escalate') {
    await escalateSegretaria({ cid, conv, lead, why: v.why, text });
    return { acted: true, escalated: true, why: v.why };
  }

  // Idempotenza per messaggio: un retry di Homie non risponde due volte.
  const contextHash = `segretaria:turn:${cid}:${messageId || SEG.textHash(text) + ':' + Math.floor(now / 60000)}`;
  try {
    const dup = await fsList('action_queue', { filter: { field: 'contextHash', op: 'EQUAL', value: contextHash }, limit: 1 });
    if (dup && dup.length) return { acted: false, why: 'già risposto a questo messaggio' };
  } catch { /* non-fatal */ }

  // I fatti, solo da fonti vere.
  const prop = await propertyFacts(lead);
  const facts = [
    lead && lead.name ? `Nome cliente: ${lead.name}` : null,
    lead && lead.budget ? `Budget dichiarato: €${lead.budget}/mese` : null,
    lead && lead.zone ? `Zona cercata: ${lead.zone}` : null,
    `Lingua risposta: ${replyLang(lead || { message: text }) === 'it' ? 'ITALIANO' : 'INGLESE'}`,
    ...prop.lines,
    ...(prop.available === false ? await alternativeFacts(lead || {}) : []),
    ...await slotFacts(prop.pid),
    ...serviceFacts(),
    ...await historyFacts([cid, lead && lead.conversationId]),
    `ULTIMO MESSAGGIO DEL CLIENTE (rispondi a QUESTO): "${String(text).slice(0, 500)}"`,
  ].filter(Boolean).join('\n\n');

  let parsed = null;
  try {
    const { text: out } = await callClaude({ system: SYSTEM, user: facts, maxTokens: 500 });
    parsed = extractJson(out);
  } catch (e) {
    await escalateSegretaria({ cid, conv, lead, why: 'la Segretaria non riesce a scrivere (' + e.message.slice(0, 120) + ')', text });
    return { acted: true, escalated: true, why: 'ai_error' };
  }
  if (!parsed || parsed.escalate) {
    await escalateSegretaria({ cid, conv, lead, why: (parsed && parsed.reason) || 'il modello chiede una persona', text });
    return { acted: true, escalated: true, why: (parsed && parsed.reason) || 'model_escalate' };
  }

  const clean = SEG.sanitizeReply(parsed.reply, cfg);
  if (!clean.ok) {
    await escalateSegretaria({ cid, conv, lead, why: 'risposta rifiutata dai binari: ' + clean.why, text });
    return { acted: true, escalated: true, why: clean.why };
  }

  // La rotaia del tap manuale: action_queue → executor → outbox WhatsApp.
  const phone = (conv && conv.contactPhone) || (lead && lead.phone);
  if (!phone) {
    await escalateSegretaria({ cid, conv, lead, why: 'nessun numero su cui rispondere', text });
    return { acted: true, escalated: true, why: 'no_phone' };
  }
  const { id: actionId } = await fsCreate('action_queue', {
    leadId: (lead && lead.id) || (conv && conv.leadId) || 'none',
    kind: 'reply',
    summary: `Segretaria → ${(conv && conv.contactName) || 'cliente'}`.slice(0, 240),
    tier: 1,
    confidence: 0.9,
    proposedBy: 'segretaria',
    payload: { channel: 'whatsapp', phone, recipient: phone, draft: clean.text },
    contextHash,
    status: 'approved',
    approvedAt: new Date(now),
    approvedBy: 'segretaria',
    autoApplied: true,
    createdAt: new Date(now),
  });
  const r = await runExecutor(actionId);
  const ok = r.status === 200 && r.body && r.body.ok !== false;
  if (!ok) {
    await escalateSegretaria({ cid, conv, lead, why: 'invio fallito: ' + String((r.body && r.body.error) || r.status).slice(0, 120), text });
    return { acted: true, escalated: true, why: 'send_failed' };
  }

  await fsPatch('conversations/' + cid, {
    segretariaTurns: Number(conv.segretariaTurns || 0) + 1,
    segretariaSent: SEG.noteSent(conv, clean.text, now),
    segretariaLastAt: new Date(now),
    needsReply: false,
    unread: 0,
  }).catch(() => {});
  await fsPatch(budgetPath, { turns: turnsToday + 1, day }).catch(() => {});
  await logActivity('Segretaria: risposta inviata', 'segretaria', { conversationId: cid, actionId }, 'segretaria').catch(() => {});
  return { acted: true, sent: true, actionId };
}

// ─── La consegna (il click) e il rientro ─────────────────────────────────
// LA TRAPPOLA VERA (trovata dal test sul giro reale): i primi messaggi di
// uno sconosciuto vivono su conv_whatsapp_<numero>, ma appena il lead esiste
// homie/message risolve il numero → contactType 'lead' e ogni messaggio
// successivo atterra su conv_lead_<id>. Consegnare solo il doc registrato
// sul lead significava consegnare una conversazione che non avrebbe più
// ricevuto traffico. Si marca la PRIMARIA (conv_lead_<id>, creata se manca,
// coi dati di contatto copiati) E quella storica, se diversa.
function convIdLead(leadId) {
  return 'conv_lead_' + String(leadId).replace(/[^A-Za-z0-9_-]/g, '');
}
export async function handoverSegretaria(leadId) {
  const lead = await fsGet(`leads/${leadId}`).catch(() => null);
  if (!lead) return { ok: false, why: 'lead non trovato' };
  if (!lead.phone) return { ok: false, why: 'nessun numero WhatsApp (per ora la Segretaria parla solo su WhatsApp)' };
  const primary = convIdLead(leadId);
  const legacy = lead.conversationId && lead.conversationId !== primary ? lead.conversationId : null;
  const legacyConv = legacy ? await fsGet('conversations/' + legacy).catch(() => null) : null;
  const prev = await fsGet('conversations/' + primary).catch(() => null);
  const stamp = {
    segretaria: true,
    segretariaAt: new Date(),
    leadId,
  };
  await fsPatch('conversations/' + primary, {
    ...stamp,
    contactType: 'lead',
    contactId: leadId,
    contactName: (prev && prev.contactName) || (legacyConv && legacyConv.contactName) || lead.name || lead.phone,
    contactPhone: (prev && prev.contactPhone) || lead.phone,
    segretariaTurns: Number((prev && prev.segretariaTurns) || 0),
  });
  if (legacy && legacyConv) await fsPatch('conversations/' + legacy, stamp).catch(() => {});
  await logActivity('Segretaria: conversazione consegnata', 'segretaria', { conversationId: primary, leadId }, 'operator');
  return { ok: true, cid: primary, name: (legacyConv && legacyConv.contactName) || lead.name || 'cliente' };
}

export async function segretariaOffConv(cid, why = 'spenta dall\'operatore') {
  await fsPatch('conversations/' + cid, { segretaria: false, segretariaOffAt: new Date(), segretariaOffWhy: why });
  return true;
}

// ─── /segretaria — il quadro dal telefono ────────────────────────────────
export async function segretariaStatusMessage() {
  const raw = await fsGet('settings/segretaria').catch(() => null);
  const { cfg, rejected } = SEG.mergeConfig(raw);
  let active = [];
  try { active = await fsList('conversations', { filter: { field: 'segretaria', op: 'EQUAL', value: true }, limit: 20 }); } catch { /* ignore */ }
  const rows = (active || []).map(c =>
    `• <b>${esc(c.contactName || c.id)}</b> — ${Number(c.segretariaTurns || 0)} turni${c.lastMessagePreview ? ` · <i>${esc(String(c.lastMessagePreview).slice(0, 60))}</i>` : ''}`);
  const msg = [
    `<b>🤖 La Segretaria</b> — ${cfg.enabled ? '🟢 in servizio' : '🔴 SPENTA (kill switch)'}`,
    '',
    'Risponde SOLO sulle conversazioni che le consegni tu (🤖 sulla card del lead). Un tuo messaggio manuale nella chat la spegne su quella conversazione.',
    '',
    active.length ? `<b>Chat in mano a lei (${active.length}):</b>` : 'Nessuna chat consegnata al momento.',
    ...rows,
    '',
    `Tetti: ${cfg.maxTurns} turni/chat · ${cfg.dailyCap} turni/giorno.`,
    ...(rejected.length ? ['⚠️ Impostazioni ignorate: ' + rejected.map(r => r.key).join(', ')] : []),
  ].join('\n');
  const keyboard = { inline_keyboard: [
    [{ text: cfg.enabled ? '🔴 Spegni TUTTO (kill switch)' : '🟢 Rimetti in servizio', callback_data: 'sgk:all' }],
    ...(active || []).slice(0, 10).map(c => [{ text: `🖐 Riprendi tu · ${String(c.contactName || c.id).slice(0, 30)}`, callback_data: `sgx:${c.id}` }]),
  ] };
  return { msg, keyboard };
}

export async function toggleSegretariaKill() {
  const raw = (await fsGet('settings/segretaria').catch(() => null)) || {};
  await fsPatch('settings/segretaria', { enabled: raw.enabled === false ? true : false, updatedAt: new Date() });
  return true;
}
