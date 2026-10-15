#!/usr/bin/env node
/**
 * Regenerate sitemap.xml from scripts/seo-config.js.
 *
 *   node scripts/seo-sitemap.js          # refuses if it would drop a URL
 *   node scripts/seo-sitemap.js --force  # rewrite anyway
 *
 * sitemap.xml e' mantenuta A MANO: dichiara pagine (meteo, canone, executive,
 * reunion, moving-to-rome…) che il registro di seo-config.js non conosce.
 * Riscriverla dal solo registro le cancellerebbe in silenzio dalla sitemap,
 * cioe' dall'indice. Prima di scrivere si contano le <loc> esistenti contro
 * quelle derivate dalla configurazione: se ne sparirebbe anche una, si esce
 * con 1 e si dice quante.
 */
const fs = require('fs');
const path = require('path');
const { SITE, PAGES } = require('./seo-config');

const ROOT = path.resolve(__dirname, '..');
const SITEMAP = path.join(ROOT, 'sitemap.xml');
const FORCE = process.argv.includes('--force');
const today = new Date().toISOString().slice(0, 10);

function configLocs() {
  return new Set(
    Object.values(PAGES)
      .filter((cfg) => !cfg.skipSitemap && !/^noindex/i.test(cfg.robots || ''))
      .map((cfg) => SITE.ORIGIN + (cfg.path === '/' ? '/' : cfg.path))
  );
}

function existingLocs() {
  if (!fs.existsSync(SITEMAP)) return [];
  const xml = fs.readFileSync(SITEMAP, 'utf8');
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
}

{
  const keep = configLocs();
  const dropped = existingLocs().filter((loc) => !keep.has(loc));
  if (dropped.length && !FORCE) {
    console.error(
      `sitemap.xml is hand-maintained; this run would drop ${dropped.length} URLs — use --force to override.`
    );
    for (const loc of dropped) console.error('  - ' + loc);
    process.exit(1);
  }
}

const entries = Object.entries(PAGES)
  .filter(([file, cfg]) => {
    if (cfg.skipSitemap) return false;
    if (/^noindex/i.test(cfg.robots || '')) return false;
    return true;
  })
  .map(([file, cfg]) => {
    const loc = SITE.ORIGIN + (cfg.path === '/' ? '/' : cfg.path);
    const priority = cfg.priority != null ? cfg.priority : 0.5;
    const changefreq = cfg.changefreq || 'monthly';
    const lastmod = (cfg.article && cfg.article.dateModified) || today;
    return { loc, priority, changefreq, lastmod, cfg, file };
  })
  // Sort by priority desc so highest-value URLs appear first.
  .sort((a, b) => b.priority - a.priority);

function urlNode({ loc, priority, changefreq, lastmod, cfg }) {
  const altLinks = [];
  if (cfg.lang === 'it') {
    altLinks.push(`    <xhtml:link rel="alternate" hreflang="it" href="${loc}"/>`);
    altLinks.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${loc}"/>`);
  }
  return [
    '  <url>',
    `    <loc>${loc}</loc>`,
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

fs.writeFileSync(SITEMAP, xml, 'utf8');
console.log(`Wrote sitemap.xml — ${entries.length} URLs (highest priority: ${entries[0]?.loc})`);
