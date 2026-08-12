// api/employees/commerciale.js — IL COMMERCIALE (cron ogni 2 ore, 8-20 Roma)
//
// The sales employee. In the Rome rental market response speed ≈ conversion,
// so this one makes sure NO lead sits unanswered:
//
//   • Prima risposta — every lead still `new` after a 20-minute human window
//     gets a personalized Claude-drafted reply (same persona as agent/ai.reply)
//     proposed in action_queue (Tier 2). Telegram pings the operator within a
//     minute (notify-pending); one tap approves and messages.send delivers.
//     Never auto-sends: outbound stays human-approved.
//   • Follow-up — leads still `new` after 48h (grade A/B or apply/reserve
//     intent) get ONE templated gentle nudge proposal.
//
// Idempotent by contextHash: a lead is never proposed twice for the same
// step, no matter how often the cron fires. Cap per run keeps the approval
// queue humane. Heartbeat + report like every employee; no digest message —
// the proposal cards ARE the notification.
//
// Auth: cron secret / X-Homie-Secret / admin ID token. `?dry=1` = read-only.

import { knobs, rejectedLine } from '../_squadra.js';
import { callClaude, extractJson } from '../agent/_claude.js';
import { replyLang } from '../_lang.js';
import { isReunion, isB2B } from '../_market.js';
import { fsGet, fsList as fsListRaw } from '../homie/_lib.js';
import {
  requireCronOrAdmin, fsList, logActivity, proposeAction,
  reportEmployeeHealth, saveReport,
} from './_lib.js';

const EMPLOYEE = 'commerciale';
// Finestra umana, cadenza dei follow-up e tetti per giro non sono più
// costanti qui: vivono su `settings/squadra` e si cambiano dalla scrivania
// (portale → La Squadra). Default e intervalli ammessi sono dichiarati in
// js/squadra-registry.js, lo stesso file che legge la console.
// Con maxFirstPerRun a 0 il Commerciale smette di preparare prime risposte
// senza che nessuno debba spegnere il cron.

const SYSTEM = `Sei l'assistente commerciale di BOOM Roma, agenzia premium di affitti a Roma (boomrome.com). Il pubblico è internazionale: expat, professionisti in trasferimento, studenti stranieri. Scrivi la PRIMA risposta a un lead.

LINGUA: scrivi nella lingua indicata da "Lingua risposta" nei fatti. È già stata decisa: rispettala sempre.

TONO: caldo, umano, competente. Mai robotico, mai markdown, massimo 1 emoji. 5-7 frasi. Firma "Il team BOOM" (o "The BOOM team" in inglese).

LA REGOLA PIÙ IMPORTANTE — lo stato dell'immobile:
- Se lo stato è DISPONIBILE: conferma con naturalezza, rispondi a ciò che ha chiesto, e proponi il passo successivo (visita di persona o in video).
- Se è AFFITTATO / NON PIÙ DISPONIBILE: dillo SUBITO, con onestà e senza giri di parole ("quella casa è appena stata assegnata"). Poi rilancia: chiedi i criteri (zona, budget, data) e proponi alternative. Mai far credere che sia libera, mai ignorare la domanda.
- Se non sai quale immobile: chiedi con garbo a cosa si riferisce.

RISPONDI A CIÒ CHE HANNO CHIESTO: se chiedono spese incluse, arredamento, durata, animali, disponibilità da una data — affronta quel punto per primo. Non usare un testo generico. Se un'informazione non ce l'hai, dillo e prometti di verificarla.

QUALIFICA CON UNA SOLA DOMANDA: la più utile che manca (data di ingresso, budget, quante persone). Mai un interrogatorio.

I NOSTRI SERVIZI (menzionane AL MASSIMO UNO, solo se risolve un problema reale che emerge dal messaggio, e come possibilità, mai come vendita):
- Virtual Viewing (€89): per chi è all'estero e vuole vedere case NON nostre. Le case BOOM si visitano in video gratis — non venderlo mai per i nostri immobili.
- Property Finding (€350): per chi cerca qualcosa di specifico che non abbiamo, o ha poco tempo. Cerchiamo noi sul mercato.
- Deal Assistance (€249): per chi ha già trovato casa altrove e vuole essere protetto nella trattativa e nel contratto.
- Contract Check (€49): per chi ha un contratto in mano e teme clausole scorrette.
- Concierge: per chi arriva a Roma e deve sistemare codice fiscale, utenze, residenza.
Regole d'oro dell'upsell: MAI più di un servizio, MAI nella stessa frase della risposta principale, MAI se il lead è già interessato a una nostra casa disponibile (in quel caso l'unico obiettivo è la visita). Una riga discreta in chiusura, tono "se ti serve, ci siamo", nessuna pressione, nessun prezzo martellato. Se nulla calza: NON menzionare servizi.

Rispondi SOLO con un oggetto JSON valido, senza testo attorno:
{"subject": "<oggetto email breve>", "body": "<corpo del messaggio>"}`;

export default async function handler(req, res) {
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;
  const dry = req.query?.dry === '1';

  try {
    const out = await run({ dry });
    if (!dry) await reportEmployeeHealth(EMPLOYEE, { ok: true, stats: out.counts });
    return res.status(200).json({ ok: true, actor, dry, ...out });
  } catch (e) {
    console.error('[commerciale]', e);
    if (!dry) await reportEmployeeHealth(EMPLOYEE, { ok: false, error: e.message });
    return res.status(500).json({ ok: false, error: e.message });
  }
}

async function run({ dry }) {
  // Le regole in vigore, non quelle di quando il file fu scritto.
  const { k, rejected } = await knobs(EMPLOYEE);
  const now = Date.now();
  const leads = await fsList('leads', { orderBy: { field: 'createdAt', direction: 'DESCENDING' }, limit: 120 });

  const isNew = l => !l.status || l.status === 'new';
  const ageOf = l => { const t = Date.parse(l.createdAt || 0); return t ? now - t : null; };
  const reachable = l => !!(l.email || l.phone);

// channel choice: honour the origin channel when we can actually reach them
function pickChannel(lead) {
  const src = String(lead.source || '').toLowerCase();
  if (src.includes('whatsapp') && lead.phone) return 'whatsapp';
  if (lead.email) return 'email';
  return lead.phone ? 'whatsapp' : 'email';
}

  const proposals = [];
  let firstCount = 0, followupCount = 0, aiErrors = 0, timeBoxed = false;
  // Deadline morbida sotto il maxDuration (60s): con molti lead nuovi le
  // chiamate Claude in serie sfondavano il limite e la piattaforma uccideva
  // il run a metà — i timeout visti nei log. contextHash rende idempotente
  // riprendere al giro dopo.
  const softDeadline = now + 48_000;

  for (const lead of leads) {
    if (Date.now() > softDeadline) { timeBoxed = true; break; }
    if (!isNew(lead) || !reachable(lead)) continue;
    // La Réunion: il Commerciale TACE. Tutto ciò che lo rende bravo — il
    // SYSTEM prompt che descrive il mercato romano, il catalogo `listings`
    // che consulta, il follow-up "stai ancora cercando casa a Roma?" — è
    // calibrato su Roma, e su un lead réunionnais produrrebbe una prima
    // risposta in inglese che parla di un'altra isola. Meglio nessuna bozza
    // che una bozza sbagliata: il lead esce comunque su Telegram entro un
    // minuto, con il messaggio francese già scritto (api/_market.js).
    if (isReunion(lead)) continue;
    // Enti e aziende: il Commerciale TACE anche qui. La sua persona è
    // l'assistente di chi cerca casa per sé — a un ufficio housing, a un HR
    // o a un proprietario che si propone scriverebbe "ti andrebbe di fissare
    // una visita?". I moduli partner pingano già Telegram alla porta
    // (partners/submit) e notify-pending porta il messaggio business già
    // scritto (b2bReplyText): la prima voce vera resta l'operatore.
    if (isB2B(lead)) continue;
    const age = ageOf(lead);
    if (age == null || age < k.humanWindowMin * 60000 || age > k.maxLeadAgeDays * 86400000) continue;

    // ── Prima risposta ────────────────────────────────────────────────
    if (firstCount < k.maxFirstPerRun) {
      const r = await proposeFirstReply(lead, dry).catch(e => {
        aiErrors++; console.warn('[commerciale] first reply failed:', lead.id, e.message);
        return null;
      });
      if (r) {
        proposals.push(r);
        if (!r.dedupHit) { firstCount++; continue; } // fresh first-reply → follow-up not yet due
      }
    }

    // ── Follow-up (una volta sola, dopo 48h ancora `new`) ─────────────
    if (followupCount < k.maxFollowupPerRun && age > k.followupAfterHours * 3600000) {
      const hot = lead.grade === 'A' || lead.grade === 'B' || ['apply', 'reserve'].includes(lead.intent);
      if (!hot) continue;
      const r = await proposeFollowup(lead, dry);
      proposals.push(r);
      if (!r.dedupHit) followupCount++;
    }
  }

  const counts = {
    leadsScanned: leads.length,
    firstReplies: firstCount,
    followups: followupCount,
    dedupSkipped: proposals.filter(p => p.dedupHit).length,
    aiErrors,
    ...(timeBoxed ? { timeBoxed: true } : {}),
  };
  const summary = `${firstCount} prime risposte + ${followupCount} follow-up in coda approvazione (${counts.dedupSkipped} già proposti)`
    + (timeBoxed ? ' — run interrotto al time-box, riprende al prossimo giro' : '') + (rejectedLine(rejected) ? ' — ' + rejectedLine(rejected) : '');

  const report = { summary, counts, proposals: proposals.filter(p => !p.dedupHit).slice(0, 15) };
  // Quiet runs keep the heartbeat (written by the handler) but skip the
  // empty report — teamReports stays a feed of things that happened.
  if (!dry && (firstCount || followupCount || aiErrors)) {
    await saveReport(EMPLOYEE, report);
    await logActivity('Commerciale: run completato', 'employee', counts, EMPLOYEE);
  }
  return { counts, summary, report };
}

async function proposeFirstReply(lead, dry) {
  const contextHash = `commerciale:first:${lead.id}`;
  if (dry) return { type: 'first', leadId: lead.id, dedupHit: false, dry: true };

  // Dedup BEFORE paying for the Claude call.
  const probe = await proposeProbe(contextHash);
  if (probe) return { type: 'first', leadId: lead.id, dedupHit: true };


// What the draft MUST know before writing a word: is that home still free?
// Answering "yes it's available" about a rented flat is the single worst
// thing an assistant can do — it burns the lead and the reputation at once.
async function propertyContext(lead) {
  const pid = lead.propertyId || lead.listingId;
  if (!pid) return { line: null, available: null };
  let l = null;
  try { l = await fsGet(`listings/${pid}`); } catch { /* ignore */ }
  if (!l) { try { l = await fsGet(`properties/${pid}`); } catch { /* ignore */ } }
  if (!l) return { line: null, available: null };
  const st = String(l.status || 'available').toLowerCase();
  const gone = /rented|affittat|off_market|reserved|unavailable/.test(st);
  const facts = [
    l.name || null,
    l.price ? `€${l.price}/mese` : null,
    l.sqm ? `${l.sqm}mq` : null,
    l.beds ? `${l.beds} camere` : null,
    l.furnished === 'yes' ? 'arredato' : l.furnished === 'no' ? 'non arredato' : null,
    l.availableDate ? `libero da ${l.availableDate}` : null,
  ].filter(Boolean).join(' · ');
  return {
    available: !gone,
    line: `STATO IMMOBILE: ${gone ? 'NON PIÙ DISPONIBILE (affittato/riservato) — dillo con onestà e proponi alternative' : 'DISPONIBILE'}${facts ? `\nDati veri dell'immobile: ${facts}` : ''}`,
  };
}

// When the home is gone, give the model REAL alternatives instead of vague
// promises: same zone first, then similar price.
async function alternatives(lead) {
  try {
    const all = await fsListRaw('listings', { filter: { field: 'status', op: 'EQUAL', value: 'available' }, limit: 60 });
    const zone = String(lead.zone || lead.propertyZone || '').toLowerCase();
    const price = Number(lead.budget || lead.propertyPrice || lead.listingPrice || 0);
    const scored = all.map(l => {
      let s = 0;
      if (zone && String(l.zone || '').toLowerCase().includes(zone)) s += 2;
      if (price && l.price && Math.abs(Number(l.price) - price) <= price * 0.2) s += 1;
      return { l, s };
    }).sort((a, b) => b.s - a.s).slice(0, 3).filter(x => x.s > 0 || !zone);
    if (!scored.length) return null;
    return 'ALTERNATIVE REALI disponibili ora (citane al massimo 2, con link):\n' + scored.map(({ l }) =>
      `- ${l.name || l.id}${l.zone ? ', ' + l.zone : ''}${l.price ? ' — €' + l.price + '/mese' : ''} → https://www.boomrome.com/listing/${l.id}`
    ).join('\n');
  } catch { return null; }
}

  const facts = [
    lead.name ? `Nome lead: ${lead.name}` : null,
    lead.budget ? `Budget: €${lead.budget}/mese` : null,
    lead.zone ? `Zona preferita: ${lead.zone}` : null,
    lead.propertyTitle || lead.listingName ? `Immobile d'interesse: ${lead.propertyTitle || lead.listingName}${lead.listingPrice ? ` (€${lead.listingPrice}/mese)` : ''}` : null,
    lead.intent ? `Intento: ${lead.intent}` : null,
    lead.source ? `Fonte: ${lead.source}` : null,
    lead.message ? `Messaggio originale del lead: "${String(lead.message).slice(0, 500)}"` : null,
    lead.brief ? `Sintesi: ${lead.brief}` : null,
    `Lingua risposta: ${replyLang(lead) === 'it' ? 'ITALIANO' : 'INGLESE'}`,
  ].filter(Boolean);

  const ctx = await propertyContext(lead);
  if (ctx.line) facts.push(ctx.line);
  if (ctx.available === false) {
    const alt = await alternatives(lead);
    if (alt) facts.push(alt);
  }
  const factsText = facts.filter(Boolean).join('\n');

  const { text } = await callClaude({ system: SYSTEM, user: `Scrivi la prima risposta a questo lead.\n\n${factsText}`, maxTokens: 700 });
  const parsed = extractJson(text) || { subject: 'La tua richiesta — BOOM Roma', body: text };

  // Reply on the channel they used: someone who wrote on WhatsApp expects
  // a WhatsApp answer (and Homie's outbox now delivers it after approval),
  // even if we happen to know their email. Email otherwise.
  const channel = pickChannel(lead);
  const r = await proposeAction({
    leadId: lead.id,
    kind: 'reply',
    summary: `Prima risposta a ${lead.name || 'lead'}${lead.propertyTitle || lead.listingName ? ` · ${lead.propertyTitle || lead.listingName}` : ''} (${channel})`,
    confidence: 0.8,
    proposedBy: 'commerciale',
    payload: {
      channel,
      recipient: lead.email || lead.phone,
      to: lead.email || undefined,
      phone: lead.phone || undefined,
      subject: parsed.subject || 'La tua richiesta — BOOM Roma',
      draft: parsed.body || text,
    },
    contextHash,
  });
  return { type: 'first', leadId: lead.id, name: lead.name || null, dedupHit: r.dedupHit };
}

async function proposeFollowup(lead, dry) {
  const contextHash = `commerciale:followup:${lead.id}`;
  if (dry) return { type: 'followup', leadId: lead.id, dedupHit: false, dry: true };

  const en = replyLang(lead) !== 'it';   // one detector for the whole system
  const name = lead.name ? ` ${lead.name.split(' ')[0]}` : '';
  const draft = en
    ? `Hi${name},\n\nJust checking in on your enquiry — we're still happy to help you find the right place in Rome. If you're still looking, reply with your ideal move-in date and we'll line up a couple of options (with video tours if you're abroad).\n\nBest,\nThe BOOM team`
    : `Ciao${name},\n\nTi scriviamo di nuovo per la tua richiesta: siamo ancora a disposizione per aiutarti a trovare la casa giusta a Roma. Se stai ancora cercando, rispondici con la tua data di ingresso ideale e ti proponiamo un paio di opzioni (anche con video-visita).\n\nA presto,\nIl team BOOM`;

  // Reply on the channel they used: someone who wrote on WhatsApp expects
  // a WhatsApp answer (and Homie's outbox now delivers it after approval),
  // even if we happen to know their email. Email otherwise.
  const channel = pickChannel(lead);
  const r = await proposeAction({
    leadId: lead.id,
    kind: 'reply',
    summary: `Follow-up a ${lead.name || 'lead'} — fermo da 48h+ (${channel})`,
    confidence: 0.8,
    proposedBy: 'commerciale',
    payload: {
      channel,
      recipient: lead.email || lead.phone,
      to: lead.email || undefined,
      phone: lead.phone || undefined,
      subject: en ? 'Still looking for a place in Rome?' : 'Stai ancora cercando casa a Roma?',
      draft,
    },
    contextHash,
  });
  return { type: 'followup', leadId: lead.id, name: lead.name || null, dedupHit: r.dedupHit };
}

// Cheap existence check on contextHash (proposeAction would also dedupe, but
// for first replies we check first to avoid a wasted Claude call).
async function proposeProbe(contextHash) {
  try {
    const hits = await fsList('action_queue', {
      filter: { field: 'contextHash', op: 'EQUAL', value: contextHash },
      limit: 1,
    });
    return hits.length > 0;
  } catch { return false; }
}
