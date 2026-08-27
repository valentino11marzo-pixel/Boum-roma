#!/usr/bin/env node
/**
 * Regenerate sitemap.xml from scripts/seo-config.js — la sitemap è una
 * PROIEZIONE del registro, mai un file da editare a mano (la copia a mano
 * era ferma a maggio e non conosceva welcome-to-rome né ponte-milvio).
 *
 *   node scripts/seo-sitemap.js
 *
 * Regole:
 *  - entra ogni pagina del registro non `skipSitemap` e non `noindex`;
 *  - lastmod = data dell'ULTIMO COMMIT che ha toccato il file (git),
 *    non "oggi": un lastmod finto insegna ai crawler a ignorarlo;
 *  - hreflang: `alternates` esplicite (reunion fr/en, executive en/it),
 *    oppure il legacy `lang:'it'` → it + x-default;
 *  - gli annunci /listing/:id NON stanno qui: li serve la sitemap dinamica
 *    /listings-sitemap.xml (api/sitemap-listings), sempre fresca.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { SITE, PAGES } = require('./seo-config');

const ROOT = path.resolve(__dirname, '..');
const today = new Date().toISOString().slice(0, 10);

function gitLastmod(file) {
  try {
    // Modifiche non ancora committate: il file cambia OGGI, qualunque cosa
    // dica l'ultimo commit.
    const dirty = execSync(`git status --porcelain -- "${file}"`, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (dirty) return today;
    const out = execSync(`git log -1 --format=%cs -- "${file}"`, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : null;
  } catch {
    return null;
  }
}

const entries = Object.entries(PAGES)
  .filter(([file, cfg]) => {
    if (cfg.skipSitemap) return false;
    if (/noindex/i.test(cfg.robots || '')) return false;
    return true;
  })
  .map(([file, cfg]) => {
    const loc = SITE.ORIGIN + (cfg.path === '/' ? '/' : cfg.path);
    const priority = cfg.priority != null ? cfg.priority : 0.5;
    const changefreq = cfg.changefreq || 'monthly';
    const lastmod = gitLastmod(file) || (cfg.article && cfg.article.dateModified) || today;
    return { loc, priority, changefreq, lastmod, cfg, file };
  })
  // Sort by priority desc so highest-value URLs appear first.
  .sort((a, b) => b.priority - a.priority || a.loc.localeCompare(b.loc));

function absolute(href) {
  if (/^https?:/.test(href)) return href;
  return SITE.ORIGIN + (href.startsWith('/') ? href : '/' + href);
}

function esc(u) {
  return u.replace(/&/g, '&amp;');
}

function urlNode({ loc, priority, changefreq, lastmod, cfg }) {
  const altLinks = [];
  if (Array.isArray(cfg.alternates)) {
    for (const a of cfg.alternates) {
      altLinks.push(`    <xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${esc(absolute(a.href))}"/>`);
    }
  } else if (cfg.lang === 'it') {
    altLinks.push(`    <xhtml:link rel="alternate" hreflang="it" href="${esc(loc)}"/>`);
    altLinks.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${esc(loc)}"/>`);
  }
  return [
    '  <url>',
    `    <loc>${esc(loc)}</loc>`,
    `    <lastmod>${lastmod}</lastmod>`,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority.toFixed(2)}</priority>`,
    ...altLinks,
    '  </url>',
  ].join('\n');
}

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
  ...entries.map(urlNode),
  '</urlset>',
  '',
].join('\n');

if (require.main === module) {
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml, 'utf8');
  console.log(`Wrote sitemap.xml — ${entries.length} URLs (highest priority: ${entries[0]?.loc})`);
}

module.exports = { entries, xml };
