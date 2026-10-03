// api/sign/_cosign.js — i co-conduttori ricevono il LORO link, da ogni strada.
//
// LA LEZIONE DEL 3 OTTOBRE 2026 («quando inserisco un co-conduttore non
// riceve mai il link, quindi non firma mai, e blocca tutta la journey: il
// link del proprietario dice "not your turn yet"»). La co-firma (agosto
// 2026) ha reso i co-conduttori firmatari VERI: `tenantSideComplete` esige
// la firma di ciascuno prima che il locatore possa controfirmare. Ma
// l'invito ai co-conduttori esisteva SOLO in `sign/send-link.js` (il
// portal). Il rail che si usa davvero — 🖊 Magic Sign della console
// (`preagreement/send-sign.js`) — mandava il link al solo titolare; il
// promemoria del cron sulle firme parziali, a titolare firmato, cercava
// il locatore (lato conduttori incompleto → nessun destinatario) e non
// mandava niente; ✍️ Firmo io si fermava su «mancano i co-conduttori»
// senza dare i loro link. Il contratto restava fermo per sempre, e il
// proprietario leggeva «tocca prima all'inquilino» senza sapere a chi.
//
// Qui UNA copia: chi manca, il suo link (derivato, `cosignRef` — niente da
// coniare né migrare), e l'invito per email a chi ce l'ha. Le strade la
// chiamano tutte: send-sign, send-link, la firma del titolare
// (notifyPartialSignature), il promemoria del cron, sign-for. Chi non ha
// un'email non sparisce: torna nella lista coi link, e la console li
// offre su WhatsApp (o da copiare) — un co-conduttore senza canale è un
// avviso visibile, mai un silenzio.

import { cosignRef } from '../magic-sign/_shared.js';
import { fsPatch } from '../homie/_lib.js';
import { sendSignInvite } from './_notify.js';

const BASE = 'https://www.boomrome.com';

// I co-conduttori VERI (con un nome — l'indice resta quello dell'array:
// è l'indice dentro il token derivato).
export function coSigners(contractId, contract) {
  const list = Array.isArray(contract && contract.coTenants) ? contract.coTenants : [];
  const out = [];
  list.forEach((cv, idx) => {
    if (!cv || !String(cv.name || '').trim()) return;
    out.push({
      idx,
      name: String(cv.name).trim(),
      email: String(cv.email || '').trim(),
      phone: String(cv.phone || '').trim(),
      signed: !!cv.signature,
      signedAt: cv.signedAt || null,
      url: contractId ? `${BASE}/sign?sign=${encodeURIComponent(cosignRef(contractId, idx))}` : '',
    });
  });
  return out;
}

export const pendingCoSigners = (contractId, contract) => coSigners(contractId, contract).filter(x => !x.signed);

// Manda l'invito a ogni co-conduttore NON firmato che ha un'email.
// - resend: «Reminder —» (anche quando un invito risulta già stampato);
// - updated: la versione corretta del contratto sostituisce la precedente;
// - only: gli indici da invitare (default: tutti quelli che mancano);
// - stamp: scrive `coSignInviteAt.<idx>` sul contratto (atteso — una
//   scrittura dopo la risposta su Vercel si perde, la lezione del 13/09).
// Ritorna { pending, emailed:[nomi], noEmail:[nomi], failed:[nomi] } —
// `pending` porta i link, così chi chiama può offrirli su WhatsApp.
export async function inviteCoTenants({ contractId, contract, property = null, resend = false, updated = false, stamp = true, only = null } = {}) {
  const pick = Array.isArray(only) ? new Set(only.map(Number)) : null;
  const pending = pendingCoSigners(contractId, contract).filter(x => !pick || pick.has(x.idx));
  const res = { pending, emailed: [], noEmail: [], failed: [] };
  if (!contractId || !pending.length) return res;
  const prev = (contract && contract.coSignInviteAt && typeof contract.coSignInviteAt === 'object') ? contract.coSignInviteAt : {};
  const primary = String((contract && contract.tenantName) || '').trim();
  const stamps = {};
  for (const p of pending) {
    if (!p.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email)) { res.noEmail.push(p.name); continue; }
    try {
      const r = await sendSignInvite({
        contract, property, role: 'tenant', to: p.email, name: p.name, url: p.url,
        resend: resend || !!prev[String(p.idx)], updated, coOf: primary,
      });
      if (r && r.ok) { res.emailed.push(p.name); stamps[String(p.idx)] = new Date().toISOString(); }
      else res.failed.push(p.name);
    } catch (e) {
      console.warn('[cosign] invite', p.idx, e.message);
      res.failed.push(p.name);
    }
  }
  if (stamp && Object.keys(stamps).length) {
    try { await fsPatch('contracts/' + contractId, { coSignInviteAt: { ...prev, ...stamps } }); }
    catch (e) { console.warn('[cosign] stamp:', e.message); }
  }
  return res;
}

// I link per la console / la proposta: nome, telefono, link, firmato —
// mai l'email (la proposta è letta anche dal console client-side).
export const coSignUrlsForPa = (contractId, contract) =>
  coSigners(contractId, contract).map(x => ({ name: x.name, phone: x.phone, url: x.url, signed: x.signed, hasEmail: !!x.email }));
