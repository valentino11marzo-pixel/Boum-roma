// api/_cityorderpdf.js — THE ORDER DOCUMENT of a desk that charges at
// signing (Paris: the numbered, non-exclusive search mandate; Berlin: the
// search order), as a PDF built IN MEMORY (spec v1.8 D8 §5.2 step 6).
//
// What it is: the text of api/_cityterms.js renderOrderTerms — the ONE copy
// of the order terms — laid out on the BOOM document header of
// api/_pdfbrand.js (the real mark, the gold rule, the legal footer on every
// page). Nothing is invented here: every word on the page comes from the
// rendered terms, plus a heading line that names the desk, the fare and the
// number. Paris prints the French text first, then the English (the terms
// say which is which; which language prevails is not stated, O17); Berlin
// prints the English.
//
// Where it goes: attached to the client's order email and to the operator's
// copy (api/_cityorder.js). NO Storage prefix (D8): the lead keeps only the
// SHA-256 of the bytes that were emailed (orderPdf.sha256), so the document a
// client holds can always be checked against the record.
//
// Deterministic by construction: the creation and modification dates are
// the order's own instant (orderedAt), the producer and creator are fixed —
// the same order renders the same bytes (tests/cities/signing.mjs builds it
// twice and compares the hashes; spec §18 asked for the test).
//
// The client's name is printed AS TYPED (review finding F4): the body — the
// terms, whose party line carries the name and the email the client typed —
// is set in the document font of api/_pdffont.js (Latin with every
// extension, Greek, Cyrillic), never through api/_pdfbrand.js wa(), which
// deleted every letter outside WinAnsi without a word («Ayşe Yılmaz» → «Aye
// Ylmaz»). A character even that font cannot print (a Chinese name, an
// emoji) becomes «?» and is returned in `unprinted`: the order records it and
// tells the operator — a document never loses a letter in silence. The
// masthead, the title, the language labels and the legal footer carry fixed
// text and keep the Helvetica of _pdfbrand.js.
//
// pdf-lib is imported statically: a lazy `await import()` is not traced by
// the Vercel bundler and is missing at runtime (the lesson of 22 July 2026).

import crypto from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { brandAssets, masthead, stampFooters, wa, INK, GREY, GOLD } from './_pdfbrand.js';
import { DOC_FONTKIT, FONT_NAME, fontBytes, printable } from './_pdffont.js';
import { renderOrderTerms } from './_cityterms.js';

const W = 595.28, H = 841.89, M = 50;
const BOTTOM = 72;          // the legal footer sits at 34–44: never write below this
const SIZE = 9.2, LEAD = 12.6, GAP = 5.5;

// a paragraph broken into lines that fit `maxW`; a token wider than the line
// (a long URL, an e-mail) is cut by characters — it never runs off the page
function wrap(text, font, size, maxW) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  const fits = (s) => font.widthOfTextAtSize(s, size) <= maxW;
  for (let w of words) {
    const tryLine = line ? line + ' ' + w : w;
    if (fits(tryLine)) { line = tryLine; continue; }
    if (line) { lines.push(line); line = ''; }
    while (!fits(w)) {
      let i = w.length - 1;
      while (i > 1 && !fits(w.slice(0, i))) i--;
      lines.push(w.slice(0, i));
      w = w.slice(i);
    }
    line = w;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * The PDF of ONE order.
 * @param order the same object renderOrderTerms takes ({ city, plan, number,
 *   name, email, orderedAt, withdrawalEndsOn, workFrom, expiresOn, startNow })
 *   plus `deskLabel` ('Paris') and `planLabel` ('Full Search') for the heading.
 * @returns {Promise<{ bytes: Buffer, sha256: string, pages: number, filename: string, terms: object, unprinted: string[] }>}
 *   `unprinted`: the distinct characters of the body the document font could
 *   not print (each printed as «?»); empty when every letter is as typed.
 *   Throws (with `.code` from renderOrderTerms) on an order the terms cannot
 *   render truthfully — the caller records the failure, never a blank PDF.
 */
export async function buildOrderPdf(order = {}) {
  const terms = renderOrderTerms(order);
  const at = new Date(order.orderedAt instanceof Date ? order.orderedAt.getTime() : order.orderedAt);
  const number = String(order.number);
  const pdf = await PDFDocument.create();
  pdf.setTitle(wa(`${terms.title} — ${number}`));
  pdf.setAuthor('Egidi Immobiliare S.r.l.');
  pdf.setSubject(wa(`BOOM ${order.deskLabel || ''} — ${order.planLabel || order.plan} · ${number}`));
  pdf.setCreator('BOOM');
  pdf.setProducer('BOOM');
  pdf.setCreationDate(at);
  pdf.setModificationDate(at);
  const b = await brandAssets(pdf);
  // the body font, embedded whole (a pre-made subset, ~94 KB): every page
  // prints the same glyphs the same way, and the bytes stay deterministic
  pdf.registerFontkit(DOC_FONTKIT);
  const body = await pdf.embedFont(fontBytes(), { subset: false, customName: FONT_NAME });
  const unprinted = [];
  const asTyped = (t) => {
    const p = printable(t);
    for (const ch of p.lost) if (!unprinted.includes(ch)) unprinted.push(ch);
    return p.text;
  };

  const day = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric' }).format(at);
  let page = pdf.addPage([W, H]);
  let y = masthead(page, b, { W, H, M, title: number, date: day });
  const maxW = W - 2 * M;
  const newPage = () => { page = pdf.addPage([W, H]); y = H - 60; };
  const ensure = (h) => { if (y - h < BOTTOM) newPage(); };
  // `text` arrives ready for its font: wa() for the Helvetica of the
  // heading, asTyped() for the body font
  const lines = (text, font, size, lead, color) => {
    for (const ln of wrap(text, font, size, maxW)) {
      ensure(lead);
      page.drawText(ln, { x: M, y: y - size, size, font, color });
      y -= lead;
    }
  };

  // the heading: the document's own title, then the desk, the fare, the number
  lines(wa(terms.title), b.bold, 14, 18, INK);
  y -= 2;
  lines(wa(`BOOM ${order.deskLabel || ''} — ${order.planLabel || order.plan} · ${number}`), b.font, 9, 13, GREY);
  y -= 10;

  const LABEL = { fr: 'FRANÇAIS', en: 'ENGLISH' };
  const langs = ['fr', 'en'].filter((l) => Array.isArray(terms[l]));
  for (const lang of langs) {
    ensure(30);
    page.drawRectangle({ x: M, y: y - 1, width: maxW, height: 0.6, color: GOLD });
    y -= 14;
    page.drawText(wa(LABEL[lang]), { x: M, y: y - 8, size: 8, font: b.bold, color: GOLD, characterSpacing: 1.6 });
    y -= 18;
    for (const p of terms[lang]) {
      lines(asTyped(p), body, SIZE, LEAD, INK);
      y -= GAP;
    }
    y -= 8;
  }

  stampFooters(pdf, b, { W, M });
  const bytes = Buffer.from(await pdf.save());
  return {
    bytes,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    pages: pdf.getPageCount(),
    filename: `BOOM-${number}.pdf`,
    terms,
    unprinted,
  };
}
