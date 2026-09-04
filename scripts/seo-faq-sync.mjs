#!/usr/bin/env node
// scripts/seo-faq-sync.mjs — lo schema FAQ segue la PAGINA, mai il contrario.
//
// La dottrina è quella già pagata su /reunion e /executive: markup che
// afferma ciò che la pagina non mostra è contenuto nascosto — Google lo
// sanziona e un motore di risposta cita una frase introvabile. Qui la regola
// diventa meccanica: le domande VISIBILI sono la fonte, il blocco JSON-LD
// FAQPage viene riscritto per rispecchiarle parola per parola.
//
//   node scripts/seo-faq-sync.mjs <file.html> [...]   riscrive i blocchi
//   node scripts/seo-faq-sync.mjs --dry <file.html>   mostra senza scrivere
//
// Regole dure:
//  - una pagina SENZA FAQ visibili non riceve mai un blocco inventato:
//    lo strumento riferisce e non tocca nulla (si rimuove a mano, che è
//    una decisione, non una sincronizzazione);
//  - un solo blocco FAQPage per pagina (Google conta il primo; due blocchi
//    divergenti sono due verità) — i doppioni top-level vengono rimossi;
//  - i blocchi dentro @graph non si toccano (executive/reunion hanno grafi
//    curati a mano e già testati sulla visibilità).
//
// Esporta le funzioni pure: tests/seo/run.mjs usa la STESSA estrazione e la
// STESSA normalizzazione per asserire l'invariante — una copia sola.

import { readFileSync, writeFileSync } from 'node:fs';

/* ── testo: entità + tag → testo piano ─────────────────────────────── */
export function plainText(s) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&rsquo;/g, '’')
    .replace(/&lsquo;/g, '‘')
    .replace(/&quot;/g, '"')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…')
    .replace(/&egrave;/g, 'è').replace(/&Egrave;/g, 'È')
    .replace(/&eacute;/g, 'é').replace(/&agrave;/g, 'à')
    .replace(/&ograve;/g, 'ò').replace(/&ugrave;/g, 'ù')
    .replace(/&igrave;/g, 'ì').replace(/&euro;/g, '€')
    .replace(/&gt;/g, '>').replace(/&lt;/g, '<')
    .replace(/\s+/g, ' ')
    // un link inline chiuso prima della punteggiatura ("…a Roma</a>.") non
    // deve lasciare "Roma ." nello schema
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();
}

/* ── confronto tollerante: niente apostrofi/accenti/punteggiatura ──── */
export function normText(s) {
  return plainText(s)
    .replace(/[’‘'`´]/g, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ── estrazione delle FAQ visibili (i 3 pattern del sito) ──────────── */
export function extractVisibleFaq(html) {
  const pairs = [];
  let m;
  // 1) .faq-item con h3 + p (canone) — il pattern più specifico per primo:
  //    i <details> generici catturerebbero anche gli accordion di UI
  const fre = /class="[^"]*faq-item[^"]*"[^>]*>\s*<h3[^>]*>([\s\S]*?)<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/gi;
  while ((m = fre.exec(html))) {
    const q = plainText(m[1]);
    const a = plainText(m[2]);
    if (q && a) pairs.push({ q, a });
  }
  if (pairs.length) return pairs;
  // 2) .q-card di faq.html: h3 nella testa, risposta in .q-content
  //    (i link correlati dentro q-related NON sono risposta)
  const cards = html.split(/<div class="q-card[^"]*"/i).slice(1);
  for (const card of cards) {
    const qm = card.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const am = card.match(/<div class="q-content"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i);
    if (!qm || !am) continue;
    const q = plainText(qm[1]);
    const a = plainText(am[1].replace(/<div class="q-related"[\s\S]*$/i, ''));
    if (q && a) pairs.push({ q, a });
  }
  if (pairs.length) return pairs;
  // 3) <details><summary>Q</summary> ... </details> (moving-to-rome, zone)
  //    Solo domande vere: un <summary> senza punto interrogativo è quasi
  //    sempre un accordion di interfaccia, non una FAQ.
  const dre = /<details[^>]*>\s*<summary[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi;
  while ((m = dre.exec(html))) {
    const q = plainText(m[1]);
    const a = plainText(m[2]);
    if (q && a && q.includes('?')) pairs.push({ q, a });
  }
  return pairs;
}

/* ── i blocchi ld+json della pagina ────────────────────────────────── */
export function ldBlocks(html) {
  const out = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    let json = null;
    try { json = JSON.parse(m[1]); } catch { /* il test lo segnala */ }
    out.push({ raw: m[0], inner: m[1], json, index: m.index });
  }
  return out;
}

const isTopFaq = (b) => b.json && b.json['@type'] === 'FAQPage';

export function buildFaqLd(pairs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: pairs.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
}

/* ── sincronizzazione di una pagina ────────────────────────────────── */
export function syncFaqLd(html) {
  const pairs = extractVisibleFaq(html);
  const blocks = ldBlocks(html).filter(isTopFaq);
  if (!blocks.length) return { html, changed: false, reason: 'nessun blocco FAQPage' };
  if (!pairs.length) return { html, changed: false, reason: 'nessuna FAQ visibile — blocco da rimuovere a mano, non da inventare' };

  const fresh = `<script type="application/ld+json">\n${JSON.stringify(buildFaqLd(pairs), null, 2)}\n</script>`;
  let out = html;
  // sostituisce il PRIMO blocco, rimuove gli altri (dall'ultimo al primo,
  // così gli indici restano validi)
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    if (i === 0) {
      out = out.slice(0, b.index) + fresh + out.slice(b.index + b.raw.length);
    } else {
      // rimuove anche l'eventuale a-capo orfano
      out = out.slice(0, b.index) + out.slice(b.index + b.raw.length).replace(/^\n/, '');
    }
  }
  return { html: out, changed: out !== html, count: pairs.length, removed: blocks.length - 1 };
}

/* ── CLI ───────────────────────────────────────────────────────────── */
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const args = process.argv.slice(2);
  const DRY = args.includes('--dry');
  const files = args.filter((a) => !a.startsWith('--'));
  if (!files.length) {
    console.error('uso: node scripts/seo-faq-sync.mjs [--dry] <file.html> [...]');
    process.exit(1);
  }
  for (const f of files) {
    const html = readFileSync(f, 'utf8');
    const res = syncFaqLd(html);
    if (!res.changed) {
      console.log(`[=] ${f} — ${res.reason || 'già allineato'}`);
      continue;
    }
    if (!DRY) writeFileSync(f, res.html, 'utf8');
    console.log(`[✓] ${f} — ${res.count} domande dallo schermo allo schema${res.removed ? `, ${res.removed} blocco doppio rimosso` : ''}${DRY ? ' (dry)' : ''}`);
  }
}
