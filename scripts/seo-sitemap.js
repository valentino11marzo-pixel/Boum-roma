#!/usr/bin/env node
/**
 * Regenerate sitemap.xml from scripts/seo-config.js.
 *
 *   node scripts/seo-sitemap.js
 */
const fs = require('fs');
const path = require('path');
const { SITE, PAGES } = require('./seo-config');

const ROOT = path.resolve(__dirname, '..');
const today = new Date().toISOString().slice(0, 10);

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

fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml, 'utf8');
console.log(`Wrote sitemap.xml — ${entries.length} URLs (highest priority: ${entries[0]?.loc})`);
