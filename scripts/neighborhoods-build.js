#!/usr/bin/env node
/**
 * BOOM Rome — Neighborhood landing page generator.
 *
 * Reads scripts/neighborhoods-data.js and writes one HTML file per
 * neighborhood into /apartments-in/. Vercel cleanUrls serves them
 * at /apartments-in/{slug}.
 *
 * Pages match BOOM's identity: dark #08080A, gold #D4AF37, Helvetica
 * Neue 300, wide letter-spacing, same nav + footer as other public
 * pages. They consume the SEO system (sentinels are placed so
 * scripts/seo-update.js can manage their head metadata).
 *
 * Run:
 *   node scripts/neighborhoods-build.js
 */

const fs = require('fs');
const path = require('path');
const { NEIGHBORHOODS } = require('./neighborhoods-data');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'apartments-in');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const ESC = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/* ────────────────────────────────────────────────────────────────────
 *  Shared CSS — matches the dark + gold BOOM identity used across
 *  apartments.html, about.html, blog.html.
 * ──────────────────────────────────────────────────────────────────── */
const SHARED_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --gold:#D4AF37;--gold-b:#E8C547;--gold-d:#B8960C;--gold-dim:rgba(212,175,55,0.10);--gold-line:rgba(212,175,55,0.22);
  --pure-black:#08080A;--bg:#000;--bg1:#0A0A0A;--bg2:#0E0E10;--bg3:#141416;
  --border:rgba(255,255,255,0.06);--border-h:rgba(255,255,255,0.12);--border-g:rgba(212,175,55,0.18);
  --text:#FAFAFA;--text2:rgba(250,250,250,0.65);--text3:rgba(250,250,250,0.35);--text4:rgba(250,250,250,0.18);
}
html{scroll-behavior:smooth;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
body{font-family:'Helvetica Neue',Helvetica,'Inter',-apple-system,sans-serif;font-weight:300;background:var(--pure-black);color:var(--text);line-height:1.7;overflow-x:hidden}
a{color:inherit;text-decoration:none;transition:color .25s}
strong{font-weight:500}
::selection{background:var(--gold);color:#000}

/* NAV (matches apartments.html / about.html exactly) */
nav{position:fixed;width:100%;top:0;z-index:100;padding:20px 50px;background:rgba(8,8,10,0.92);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-bottom:1px solid rgba(212,175,55,0.08)}
.nav-container{max-width:1400px;margin:0 auto;display:flex;justify-content:space-between;align-items:center}
.logo{display:flex;align-items:center;gap:15px}
.logo-svg{width:50px;height:50px;filter:drop-shadow(0 0 15px rgba(212,175,55,0.35));transition:filter .3s}
.logo:hover .logo-svg{filter:drop-shadow(0 0 25px rgba(212,175,55,0.6))}
.logo-text{font-size:22px;font-weight:300;letter-spacing:4px;text-transform:uppercase}
.nav-links{display:flex;gap:30px;align-items:center}
.nav-links a{color:rgba(255,255,255,0.62);font-size:12px;font-weight:400;text-transform:uppercase;letter-spacing:1.5px}
.nav-links a:hover,.nav-links a.active{color:var(--gold)}
.wa-link{color:#25D366!important}
.hamburger{display:none;flex-direction:column;gap:5px;cursor:pointer;padding:10px;z-index:200}
.hamburger span{width:22px;height:2px;background:var(--gold);transition:.3s}
.hamburger.active span:nth-child(1){transform:rotate(45deg) translate(5px,5px)}
.hamburger.active span:nth-child(2){opacity:0}
.hamburger.active span:nth-child(3){transform:rotate(-45deg) translate(6px,-6px)}
.mobile-menu{display:none;position:fixed;inset:0;background:rgba(8,8,10,0.98);backdrop-filter:blur(30px);z-index:150;flex-direction:column;align-items:center;justify-content:center;gap:28px}
.mobile-menu.active{display:flex}
.mobile-menu a{color:rgba(255,255,255,0.7);font-size:17px;letter-spacing:2px;text-transform:uppercase}
.mobile-menu a:hover{color:var(--gold)}
.mobile-menu .wa-mob{margin-top:20px;padding:12px 40px;background:#25D366;color:#fff;border-radius:100px;font-weight:600}
@media(max-width:880px){
  nav{padding:16px 20px}
  .nav-links{display:none}
  .hamburger{display:flex}
  .logo-svg{width:38px;height:38px}
  .logo-text{font-size:18px;letter-spacing:2px}
}

/* BREADCRUMB */
.breadcrumb{max-width:1400px;margin:0 auto;padding:110px 50px 0;font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.5px}
.breadcrumb a{color:var(--text3);transition:color .3s}
.breadcrumb a:hover{color:var(--gold)}
.breadcrumb .sep{margin:0 10px;opacity:.5}
@media(max-width:880px){.breadcrumb{padding:96px 20px 0;font-size:10px}}

/* HERO */
.hero{max-width:1400px;margin:0 auto;padding:32px 50px 64px;position:relative}
.hero-eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:var(--gold);margin-bottom:14px;padding:6px 14px;border:1px solid var(--border-g);border-radius:100px;background:var(--gold-dim)}
.hero-eyebrow::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--gold);box-shadow:0 0 8px var(--gold)}
.hero-title{font-size:clamp(46px,8vw,96px);font-weight:200;line-height:1;letter-spacing:-.02em;margin-bottom:18px}
.hero-vibe{font-size:clamp(18px,2.2vw,24px);color:var(--text2);max-width:760px;font-weight:300;line-height:1.45}
.hero-actions{margin-top:34px;display:flex;gap:14px;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;gap:8px;padding:14px 28px;border-radius:100px;font-size:12px;font-weight:500;letter-spacing:1.5px;text-transform:uppercase;transition:all .3s;border:1px solid transparent;cursor:pointer}
.btn-primary{background:var(--gold);color:#000}
.btn-primary:hover{background:var(--gold-b);transform:translateY(-2px);box-shadow:0 12px 32px rgba(212,175,55,0.25)}
.btn-ghost{background:transparent;color:var(--text);border-color:var(--border-h)}
.btn-ghost:hover{border-color:var(--gold);color:var(--gold)}
@media(max-width:880px){.hero{padding:24px 20px 44px}}

/* STATS STRIP */
.stats{max-width:1400px;margin:0 auto;padding:24px 50px;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;border-top:1px solid var(--border);border-bottom:1px solid var(--border)}
.stat{padding:18px;text-align:center}
.stat-value{font-size:clamp(20px,3vw,28px);font-weight:300;color:var(--gold);letter-spacing:-.01em;margin-bottom:4px}
.stat-label{font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:2px}
@media(max-width:880px){.stats{padding:18px 20px;grid-template-columns:repeat(2,1fr);gap:0}.stat{padding:14px;border-bottom:1px solid var(--border)}.stat:nth-child(odd){border-right:1px solid var(--border)}.stat:nth-child(n+3){border-bottom:none}}

/* AUDIENCE CHIPS */
.audience{max-width:1400px;margin:0 auto;padding:28px 50px;display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.audience-label{font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:2px;margin-right:8px}
.chip{display:inline-flex;padding:6px 14px;border:1px solid var(--border-h);border-radius:100px;font-size:12px;font-weight:300;color:var(--text2);background:rgba(255,255,255,0.02)}
@media(max-width:880px){.audience{padding:18px 20px}}

/* SECTION shared */
.section{max-width:1400px;margin:0 auto;padding:60px 50px}
.section-title{font-size:clamp(28px,4vw,42px);font-weight:200;letter-spacing:-.01em;margin-bottom:8px}
.section-eyebrow{display:inline-block;font-size:11px;color:var(--gold);text-transform:uppercase;letter-spacing:3px;margin-bottom:14px}
.section-subtitle{font-size:16px;color:var(--text2);max-width:720px;margin-bottom:36px}
@media(max-width:880px){.section{padding:42px 20px}}

/* WHY LIVE HERE — prose, tuned for long-form reading */
.prose{max-width:720px;font-size:18px;color:var(--text2);line-height:1.85;font-weight:300}
.prose p{margin-bottom:22px}
.prose p:last-child{margin-bottom:0}
.prose p strong{color:var(--text);font-weight:500}
.prose .lead{font-size:21px;color:var(--text);line-height:1.65;letter-spacing:-.005em}
/* Drop cap on the lead paragraph */
.prose .lead::first-letter{
  float:left;font-size:64px;line-height:.85;color:var(--gold);font-weight:300;
  padding:6px 14px 0 0;margin-top:2px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
}

/* PULL QUOTE — between long sections */
.pull-quote{max-width:780px;margin:42px 0;padding:18px 0 18px 26px;border-left:2px solid var(--gold);font-size:22px;line-height:1.45;font-weight:300;color:var(--text);letter-spacing:-.01em;font-style:italic}
.pull-quote::before{content:'\\201C';color:var(--gold);font-size:42px;line-height:0;position:relative;top:18px;margin-right:6px;font-style:normal}

/* BOOM VERDICT — opinionated callout */
.verdict{max-width:780px;margin:36px 0;padding:24px 28px;background:linear-gradient(135deg,rgba(212,175,55,0.06),rgba(212,175,55,0.01));border:1px solid var(--border-g);border-left:3px solid var(--gold);border-radius:0 14px 14px 0}
.verdict-label{display:inline-block;font-size:10px;color:var(--gold);text-transform:uppercase;letter-spacing:3px;font-weight:500;margin-bottom:10px}
.verdict-text{font-size:17px;color:var(--text);line-height:1.6;font-weight:300;letter-spacing:-.005em}

/* COMMUTE MATRIX */
.commute{max-width:1400px;margin:0 auto;padding:50px;border-top:1px solid var(--border)}
.commute-title{font-size:11px;color:var(--gold);text-transform:uppercase;letter-spacing:3px;margin-bottom:22px;font-weight:500}
.commute-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:14px}
.commute-row{padding:18px;background:var(--bg2);border:1px solid var(--border);border-radius:14px;text-align:center;transition:border-color .3s}
.commute-row:hover{border-color:var(--border-g)}
.commute-where{font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px}
.commute-time{font-size:22px;font-weight:300;color:var(--text);letter-spacing:-.01em}
.commute-time small{font-size:11px;color:var(--text3);letter-spacing:0;text-transform:none;font-weight:400;margin-left:3px}
@media(max-width:880px){.commute{padding:36px 20px}.commute-grid{grid-template-columns:repeat(2,1fr)}}

/* READING TIME */
.reading-time{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--text3);letter-spacing:1.5px;text-transform:uppercase;margin-top:18px}
.reading-time::before{content:'';width:5px;height:5px;border-radius:50%;background:var(--gold);box-shadow:0 0 6px var(--gold)}

/* RELATED NEIGHBORHOODS */
.related-section{background:var(--bg1)}
.related-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}
.related-card{padding:24px;background:var(--bg2);border:1px solid var(--border);border-radius:14px;transition:all .3s;display:block;color:var(--text)}
.related-card:hover{border-color:var(--border-g);transform:translateY(-2px)}
.related-card-name{font-size:18px;font-weight:400;letter-spacing:-.005em;margin-bottom:8px;color:var(--gold)}
.related-card-why{font-size:14px;color:var(--text2);line-height:1.6}
.related-card-cta{display:inline-block;margin-top:14px;font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:2px}

/* APARTMENTS GRID */
.listings-section{background:var(--bg1)}
.listings-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:22px;margin-top:8px}
.listing-card{background:var(--bg2);border:1px solid var(--border);border-radius:18px;overflow:hidden;transition:all .35s;cursor:pointer;display:flex;flex-direction:column}
.listing-card:hover{transform:translateY(-4px);border-color:var(--border-g);box-shadow:0 18px 50px rgba(0,0,0,0.4)}
.listing-img{height:200px;background:linear-gradient(135deg,#0E0E10,#1A1A1D);background-size:cover;background-position:center;position:relative}
.listing-img::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,transparent,rgba(0,0,0,0.4))}
.listing-body{padding:20px}
.listing-name{font-size:17px;font-weight:400;margin-bottom:6px;letter-spacing:-.01em}
.listing-zone{font-size:11px;color:var(--gold);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:10px}
.listing-meta{display:flex;gap:14px;color:var(--text3);font-size:12px;margin-bottom:14px}
.listing-price{font-size:18px;font-weight:400;color:var(--text)}
.listing-price small{color:var(--text3);font-size:11px;font-weight:300;margin-left:4px}
.listings-loading,.listings-empty{padding:60px 20px;text-align:center;color:var(--text3);font-size:14px}
.listings-empty a{color:var(--gold);border-bottom:1px solid var(--border-g)}

/* LANDMARKS */
.landmark-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}
.landmark{padding:24px;background:var(--bg2);border:1px solid var(--border);border-radius:14px;transition:border-color .3s}
.landmark:hover{border-color:var(--border-g)}
.landmark-name{font-size:15px;color:var(--gold);font-weight:500;margin-bottom:8px;letter-spacing:.01em}
.landmark-blurb{font-size:13px;color:var(--text2);line-height:1.6}

/* TIPS */
.tips-section{background:var(--bg1)}
.tip-list{counter-reset:tip;display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}
.tip{counter-increment:tip;padding:24px 24px 24px 64px;background:var(--bg2);border:1px solid var(--border);border-radius:14px;position:relative;font-size:14px;color:var(--text2);line-height:1.65}
.tip::before{content:counter(tip,decimal-leading-zero);position:absolute;left:22px;top:22px;font-size:14px;color:var(--gold);font-weight:300;letter-spacing:1px}

/* FAQ */
.faq-list{max-width:840px}
.faq{border-bottom:1px solid var(--border);padding:22px 0}
.faq-q{font-size:17px;color:var(--text);font-weight:400;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:20px;letter-spacing:-.005em}
.faq-q::after{content:'+';color:var(--gold);font-size:22px;font-weight:300;transition:transform .25s}
.faq[open] .faq-q::after{transform:rotate(45deg)}
.faq-a{font-size:14px;color:var(--text2);line-height:1.75;padding-top:16px;max-width:760px}

/* CTA */
.cta{max-width:1400px;margin:60px auto 100px;padding:64px 50px;border-radius:24px;background:linear-gradient(135deg,rgba(212,175,55,0.05),rgba(212,175,55,0.01));border:1px solid var(--border-g);text-align:center}
.cta-title{font-size:clamp(28px,4vw,42px);font-weight:200;letter-spacing:-.01em;margin-bottom:14px}
.cta-sub{font-size:15px;color:var(--text2);margin-bottom:30px;max-width:560px;margin-left:auto;margin-right:auto}
.cta-actions{display:flex;gap:14px;justify-content:center;flex-wrap:wrap}
@media(max-width:880px){.cta{margin:42px 20px 60px;padding:42px 24px}}

/* LIVE DEMAND STRIP (data from /api/demand/zones — hidden until it loads) */
.demand-strip{display:none;max-width:1400px;margin:0 auto;padding:0 50px 10px}
.demand-inner{display:inline-flex;flex-wrap:wrap;align-items:baseline;gap:6px;padding:14px 22px;border:1px solid var(--border-g);border-radius:14px;background:linear-gradient(135deg,rgba(212,175,55,0.07),rgba(212,175,55,0.02));font-size:14px;color:var(--text2);line-height:1.6}
.demand-inner b{color:var(--gold);font-weight:500}
.demand-budget{color:var(--text3);font-size:13px}
@media(max-width:880px){.demand-strip{padding:0 20px 10px}}

/* LANDLORD CTA — "Hai un appartamento a …?" */
.landlord{max-width:1400px;margin:0 auto;padding:56px 50px}
.landlord-box{padding:44px 40px;border-radius:24px;background:linear-gradient(135deg,rgba(212,175,55,0.06),rgba(212,175,55,0.015));border:1px solid var(--border-g);display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:26px}
.landlord-copy{max-width:620px}
.landlord-title{font-size:clamp(24px,3.4vw,36px);font-weight:200;letter-spacing:-.01em;margin-bottom:10px}
.landlord-sub{font-size:14px;color:var(--text2);line-height:1.7}
.landlord-actions{display:flex;gap:14px;flex-wrap:wrap}
@media(max-width:880px){.landlord{padding:40px 20px}.landlord-box{padding:30px 24px}}

/* FOOTER */
footer{background:var(--bg1);border-top:1px solid var(--border);padding:60px 50px 40px}
.foot-grid{max-width:1400px;margin:0 auto;display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:50px}
.foot-brand .logo-text{font-size:18px;letter-spacing:3px;margin-bottom:14px;display:inline-block}
.foot-brand p{font-size:13px;color:var(--text3);max-width:280px;line-height:1.7}
.foot-col h4{font-size:11px;color:var(--gold);text-transform:uppercase;letter-spacing:2.5px;margin-bottom:18px;font-weight:500}
.foot-col a{display:block;color:var(--text3);font-size:13px;padding:5px 0;transition:color .25s}
.foot-col a:hover{color:var(--gold)}
.foot-bottom{max-width:1400px;margin:46px auto 0;padding-top:24px;border-top:1px solid var(--border);text-align:center;font-size:11px;color:var(--text4);letter-spacing:1px}
@media(max-width:880px){footer{padding:40px 20px 30px}.foot-grid{grid-template-columns:1fr 1fr;gap:30px}}
`;

/* ────────────────────────────────────────────────────────────────────
 *  Shared SVG logo
 * ──────────────────────────────────────────────────────────────────── */
const LOGO_SVG = `<svg class="logo-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" style="stop-color:#FFD700"/><stop offset="100%" style="stop-color:#B8960C"/>
  </linearGradient></defs>
  <circle cx="50" cy="50" r="44" fill="none" stroke="url(#g)" stroke-width="2" opacity=".5"/>
  <text x="50" y="62" font-family="Helvetica Neue, Arial" font-size="26" font-weight="300" fill="url(#g)" text-anchor="middle" letter-spacing="2">B</text>
</svg>`;

/* ────────────────────────────────────────────────────────────────────
 *  Page sections
 * ──────────────────────────────────────────────────────────────────── */

function navHtml(activeHref = '/apartments-in') {
  const link = (href, label, extraClass = '') => {
    const cls = href === activeHref ? `${extraClass} active`.trim() : extraClass;
    return `<a href="${href}"${cls ? ` class="${cls}"` : ''}>${label}</a>`;
  };
  return `<nav>
    <div class="nav-container">
      <a href="/" class="logo" aria-label="BOOM Rome — Home">
        ${LOGO_SVG}
        <span class="logo-text">BOOM</span>
      </a>
      <div class="nav-links">
        ${link('/apartments', 'Apartments')}
        ${link('/apartments-in', 'Neighborhoods')}
        ${link('/property-finding', 'Property Finding')}
        ${link('/concierge', 'Concierge')}
        ${link('/blog', 'Blog')}
        ${link('/about', 'About')}
        <a href="https://wa.me/393313251961" class="wa-link" rel="noopener">WhatsApp</a>
      </div>
      <div class="hamburger" id="hamburger" aria-label="Menu" role="button" tabindex="0">
        <span></span><span></span><span></span>
      </div>
    </div>
    <div class="mobile-menu" id="mobileMenu">
      <a href="/">Home</a>
      <a href="/apartments">Apartments</a>
      <a href="/apartments-in">Neighborhoods</a>
      <a href="/property-finding">Property Finding</a>
      <a href="/concierge">Concierge</a>
      <a href="/blog">Blog</a>
      <a href="/about">About</a>
      <a href="https://wa.me/393313251961" class="wa-mob" rel="noopener">WhatsApp Us</a>
    </div>
  </nav>`;
}

function footerHtml(currentSlug = null) {
  const y = new Date().getFullYear();
  const nbhdLinks = NEIGHBORHOODS.map((x) =>
    x.slug === currentSlug
      ? `<span aria-current="page" style="color:#D4AF37">${ESC(x.name)}</span>`
      : `<a href="/apartments-in/${x.slug}">${ESC(x.name)}</a>`
  ).join('');
  const nbhdNav = `<nav class="foot-nbhds" aria-label="Rome neighborhoods" style="border-top:1px solid rgba(255,255,255,0.08);margin-top:8px;padding:18px 0 4px;display:flex;flex-wrap:wrap;gap:10px 16px;align-items:baseline;font-size:13px;line-height:1.8"><span style="color:#999;letter-spacing:1px;text-transform:uppercase;font-size:11px">Rome neighborhoods</span>${nbhdLinks}</nav>`;
  return `<footer>
    <div class="foot-grid">
      <div class="foot-brand">
        <span class="logo-text">BOOM</span>
        <p>Premium mid-term apartment rentals in Rome. Video-verified listings, 48-hour move-in, full management. Built in Rome, for you.</p>
      </div>
      <div class="foot-col">
        <h4>Browse</h4>
        <a href="/apartments">All Apartments</a>
        <a href="/apartments-in">By Neighborhood</a>
        <a href="/deals">Current Deals</a>
        <a href="/blog">Blog</a>
      </div>
      <div class="foot-col">
        <h4>Services</h4>
        <a href="/property-finding">Property Finding</a>
        <a href="/virtual-viewing">Virtual Viewing</a>
        <a href="/deal-assistance">Deal Assistance</a>
        <a href="/concierge">Concierge</a>
        <a href="/affitta">Affitta con BOOM</a>
      </div>
      <div class="foot-col">
        <h4>Company</h4>
        <a href="/about">About</a>
        <a href="/contact">Contact</a>
        <a href="/owners">For Owners</a>
        <a href="/stima-canone${currentSlug ? `?zona=${currentSlug}` : ''}">Stima il Canone</a>
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
      </div>
    </div>
    ${nbhdNav}
    <div class="foot-bottom">© ${y} BOOM Rome — Premium rentals, built in Rome.</div>
  </footer>`;
}

/* ────────────────────────────────────────────────────────────────────
 *  Page composer
 * ──────────────────────────────────────────────────────────────────── */
function pageHtml(n, allNeighborhoods) {
  const canonical = `https://www.boomrome.com/apartments-in/${n.slug}`;
  const rentRange = `€${n.stats.rentMin.toLocaleString()}–€${n.stats.rentMax.toLocaleString()}`;
  const audienceChips = n.audience.map((a) => `<span class="chip">${ESC(a)}</span>`).join('');

  // Reading time — ~220 words per minute over body copy
  const wordCount = [n.summary, ...n.whyLiveHere, ...n.insiderTips, ...n.faqs.map((f) => f.q + ' ' + f.a)]
    .join(' ')
    .split(/\s+/).length;
  const readMin = Math.max(2, Math.round(wordCount / 220));

  // Why-live-here: first paragraph gets the lead/drop-cap treatment, pull-quote
  // is lifted from the second paragraph, the verdict callout closes the section.
  const whyParas = n.whyLiveHere.map((p, i) =>
    i === 0 ? `<p class="lead">${ESC(p)}</p>` : `<p>${ESC(p)}</p>`
  );
  // Insert a pull quote after the second paragraph if we have one
  const pullQuote = n.verdict
    ? null
    : (n.whyLiveHere[1] ? n.whyLiveHere[1].split('. ').slice(0, 1)[0] + '.' : null);
  if (n.whyLiveHere.length >= 3 && pullQuote) {
    whyParas.splice(2, 0, `<blockquote class="pull-quote">${ESC(pullQuote)}</blockquote>`);
  }
  const whyHtml = whyParas.join('\n');

  const verdictHtml = n.verdict
    ? `<aside class="verdict"><div class="verdict-label">BOOM Verdict</div><div class="verdict-text">${ESC(n.verdict)}</div></aside>`
    : '';

  const commute = n.commute || {};
  const commuteHtml = `<section class="commute" aria-label="Commute times from ${ESC(n.name)}">
    <div class="commute-title">Commute from ${ESC(n.name)}</div>
    <div class="commute-grid">
      <div class="commute-row"><div class="commute-where">Termini</div><div class="commute-time">${commute.termini ?? '—'}<small>min</small></div></div>
      <div class="commute-row"><div class="commute-where">Vatican</div><div class="commute-time">${commute.vatican ?? '—'}<small>min</small></div></div>
      <div class="commute-row"><div class="commute-where">Colosseum</div><div class="commute-time">${commute.colosseum ?? '—'}<small>min</small></div></div>
      <div class="commute-row"><div class="commute-where">Pantheon</div><div class="commute-time">${commute.pantheon ?? '—'}<small>min</small></div></div>
      <div class="commute-row"><div class="commute-where">Fiumicino ✈</div><div class="commute-time">${commute.fiumicino ?? '—'}<small>min</small></div></div>
    </div>
  </section>`;

  const landmarks = n.landmarks
    .map((l) => `<div class="landmark"><div class="landmark-name">${ESC(l.name)}</div><div class="landmark-blurb">${ESC(l.blurb)}</div></div>`)
    .join('\n');
  const tips = n.insiderTips.map((t) => `<div class="tip">${ESC(t)}</div>`).join('\n');
  const faqs = n.faqs
    .map(
      (f) =>
        `<details class="faq"><summary class="faq-q">${ESC(f.q)}</summary><div class="faq-a">${ESC(f.a)}</div></details>`
    )
    .join('\n');
  const matchTermsAttr = n.matchTerms.join('|');

  const byName = Object.fromEntries(allNeighborhoods.map((x) => [x.slug, x]));
  const relatedHtml = (n.related || [])
    .map((r) => {
      const o = byName[r.slug];
      if (!o) return '';
      return `<a class="related-card" href="/apartments-in/${o.slug}">
        <div class="related-card-name">${ESC(o.name)}</div>
        <div class="related-card-why">${ESC(r.why)}</div>
        <div class="related-card-cta">Explore ${ESC(o.name)} →</div>
      </a>`;
    })
    .join('\n');
  const relatedSection = relatedHtml
    ? `<section class="section related-section" id="related">
      <span class="section-eyebrow">If you like ${ESC(n.name)}</span>
      <h2 class="section-title">Also consider…</h2>
      <p class="section-subtitle">Three neighborhoods with overlapping DNA. Pick the trade-off that matches you.</p>
      <div class="related-grid">${relatedHtml}</div>
    </section>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="manifest" href="/site.webmanifest">
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${ESC(n.metaTitle)}</title>
  <!-- BOOM_SEO:placeholder — populated by scripts/seo-update.js -->
    <!-- Perf: early-connect to the hosts that gate the LCP photos (Firebase data + imgur images) -->
    <link rel="preconnect" href="https://i.imgur.com" crossorigin>
    <link rel="preconnect" href="https://www.gstatic.com" crossorigin>
    <link rel="preconnect" href="https://firestore.googleapis.com" crossorigin>

  <!-- Google tag -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-EYCD59RDVJ"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-EYCD59RDVJ')</script>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600&display=swap" rel="stylesheet">

  <style>${SHARED_CSS}</style>
    <link rel="stylesheet" href="/css/boom-cinema.css">
</head>
<body>

${navHtml('/apartments-in')}

<div class="breadcrumb" aria-label="Breadcrumb">
  <a href="/">Home</a>
  <span class="sep">/</span>
  <a href="/apartments-in">Neighborhoods</a>
  <span class="sep">/</span>
  <span>${ESC(n.name)}</span>
</div>

<header class="hero">
  <span class="hero-eyebrow">${ESC(n.eyebrow)}</span>
  <h1 class="hero-title">${ESC(n.name)}</h1>
  <p class="hero-vibe">${ESC(n.shortVibe)}</p>
  <div class="hero-actions">
    <a href="#listings" class="btn btn-primary">See Apartments in ${ESC(n.name)} →</a>
    <a href="/book" class="btn btn-ghost">Book a Viewing</a>
  </div>
  <div class="reading-time">${readMin} min read · honest take from BOOM</div>
</header>

<!-- Live tenant demand for this zone — populated from /api/demand/zones, stays hidden if unavailable -->
<section class="demand-strip" id="demandStrip" data-zone-slug="${n.slug}" data-zone-name="${ESC(n.name)}" aria-live="polite"></section>

<section class="stats" aria-label="${ESC(n.name)} at a glance">
  <div class="stat"><div class="stat-value">${rentRange}</div><div class="stat-label">1-Bed Rent · €/mo</div></div>
  <div class="stat"><div class="stat-value">${n.stats.walkScore}/10</div><div class="stat-label">Walkability</div></div>
  <div class="stat"><div class="stat-value">${n.stats.vibeScore}/10</div><div class="stat-label">Vibe Rating</div></div>
  <div class="stat"><div class="stat-value">${n.stats.transitScore}/10</div><div class="stat-label">Transit</div></div>
</section>

<div class="audience">
  <span class="audience-label">Best for:</span>
  ${audienceChips}
</div>

<section class="section" id="why">
  <span class="section-eyebrow">Why live here</span>
  <h2 class="section-title">${ESC(n.name)} in one glance</h2>
  <p class="section-subtitle">${ESC(n.summary)}</p>
  <div class="prose">
    ${whyHtml}
  </div>
  ${verdictHtml}
</section>

${commuteHtml}

<section class="section listings-section" id="listings">
  <span class="section-eyebrow">Available now</span>
  <h2 class="section-title">Apartments in ${ESC(n.name)}</h2>
  <p class="section-subtitle">Live from our Firestore — verified by BOOM, ready for viewing.</p>
  <div class="listings-grid" id="listingsGrid" data-zone-match="${ESC(matchTermsAttr)}">
    <div class="listings-loading">Loading apartments…</div>
  </div>
</section>

<!-- Landlord CTA — owners with property in this zone -->
<section class="landlord" id="proprietari" aria-label="Per i proprietari a ${ESC(n.name)}">
  <div class="landlord-box">
    <div class="landlord-copy">
      <span class="section-eyebrow">Per i proprietari</span>
      <h2 class="landlord-title">Hai un appartamento a ${ESC(n.name)}?</h2>
      <p class="landlord-sub">Scopri in 60 secondi quanto può rendere al mese — stima gratuita basata su annunci reali di mercato e sulla domanda di inquilini verificati BOOM in zona. Nessun impegno.</p>
    </div>
    <div class="landlord-actions">
      <a href="/stima-canone?zona=${n.slug}" class="btn btn-primary" data-track="stima_canone_click">Scopri quanto rende →</a>
      <a href="/affitta" class="btn btn-ghost" data-track="affitta_click">Affitta con BOOM</a>
    </div>
  </div>
</section>

<section class="section" id="landmarks">
  <span class="section-eyebrow">The basics</span>
  <h2 class="section-title">Landmarks &amp; daily geography</h2>
  <div class="landmark-grid">
    ${landmarks}
  </div>
</section>

<section class="section tips-section" id="tips">
  <span class="section-eyebrow">From the BOOM desk</span>
  <h2 class="section-title">Insider tips</h2>
  <p class="section-subtitle">Five things we tell every new BOOM tenant moving to ${ESC(n.name)}.</p>
  <div class="tip-list">
    ${tips}
  </div>
</section>

<section class="section" id="faq">
  <span class="section-eyebrow">FAQ</span>
  <h2 class="section-title">${ESC(n.name)} — questions we hear most</h2>
  <div class="faq-list">
    ${faqs}
  </div>
</section>

${relatedSection}

<section class="cta">
  <h2 class="cta-title">Ready to live in ${ESC(n.name)}?</h2>
  <p class="cta-sub">Book a free video viewing of any apartment, or have BOOM find you one that matches your brief.</p>
  <div class="cta-actions">
    <a href="/book" class="btn btn-primary">Book a Viewing</a>
    <a href="/property-finding" class="btn btn-ghost">Have BOOM Find Me One</a>
    <a href="https://wa.me/393313251961" class="btn btn-ghost" rel="noopener">💬 WhatsApp Us</a>
  </div>
</section>

${footerHtml(n.slug)}

<script>
// Mobile menu
(function(){
  const h=document.getElementById('hamburger'),m=document.getElementById('mobileMenu');
  if(!h)return;
  const t=()=>{h.classList.toggle('active');m.classList.toggle('active')};
  h.addEventListener('click',t);
  h.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();t()}});
  m.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{h.classList.remove('active');m.classList.remove('active')}));
})();

// GA4 helper — no-ops if gtag is unavailable
function boomTrack(name,params){try{if(typeof gtag==='function')gtag('event',name,params||{})}catch(e){}}

// Live tenant-demand widget — /api/demand/zones (aggregated + anonymized).
// The strip stays display:none unless the API answers AND this zone has seekers.
(function(){
  var el=document.getElementById('demandStrip');
  if(!el)return;
  var slug=el.getAttribute('data-zone-slug')||'';
  var esc=function(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')};
  fetch('/api/demand/zones').then(function(r){return r.ok?r.json():null}).then(function(d){
    if(!d||!d.ok||!Array.isArray(d.zones))return;
    var z=null;
    for(var i=0;i<d.zones.length;i++){if(d.zones[i]&&d.zones[i].key===slug){z=d.zones[i];break}}
    if(!z||!(Number(z.seekers)>=1))return;
    var n=Number(z.seekers);
    var label=z.label||el.getAttribute('data-zone-name')||'';
    var html='🔥 <b>'+n+(n===1?' inquilino verificato':' inquilini verificati')+'</b> '+(n===1?'cerca':'cercano')+' casa a '+esc(label)+' con BOOM adesso';
    if(z.budgetAvg&&Number(z.budgetAvg)>0){html+=' <span class="demand-budget">· budget medio €'+Math.round(Number(z.budgetAvg)).toLocaleString('it-IT')+'/mese</span>';}
    el.innerHTML='<div class="demand-inner">'+html+'</div>';
    el.style.display='block';
    boomTrack('demand_widget_view',{zone:slug,seekers:n});
  }).catch(function(){/* keep hidden */});
})();

// Landlord CTA click tracking
document.querySelectorAll('#proprietari [data-track]').forEach(function(a){
  a.addEventListener('click',function(){boomTrack(a.getAttribute('data-track'),{zone:'${n.slug}',page:'apartments-in'})});
});
</script>

<!-- Firebase + Firestore for live listings -->
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>
<script>
firebase.initializeApp({apiKey:"AIzaSyDDb8UeSc8RhO_VxQrhLrupu1aPD4rwRso",authDomain:"boom-property-dashboards.firebaseapp.com",projectId:"boom-property-dashboards",storageBucket:"boom-property-dashboards.firebasestorage.app",messagingSenderId:"937269017440",appId:"1:937269017440:web:41c1a0b1e1633c2f373c05"});
const db=firebase.firestore();

(async function loadZoneListings(){
  const grid=document.getElementById('listingsGrid');
  const matchAttr=grid.getAttribute('data-zone-match')||'';
  const terms=matchAttr.toLowerCase().split('|').filter(Boolean);
  try{
    let all;
    try{ const snap=await db.collection('listings').get(); all=snap.docs.map(d=>({id:d.id,...d.data()})); }
    catch(_){ const r=await fetch('/api/listings',{cache:'no-store'}); const j=await r.json(); all=(j&&j.listings)||[]; }
    const matched=all.filter(l=>{
      const s=(l.status||l.availabilityStatus||'').toLowerCase();
      if(s==='rented'||s==='affittato'||s==='off_market')return false;
      const blob=((l.zone||'')+' '+(l.neighborhood||'')+' '+(l.address||'')+' '+(l.name||'')).toLowerCase();
      return terms.some(t=>blob.includes(t));
    });
    if(!matched.length){
      grid.innerHTML='<div class="listings-empty">No live listings in this area right now. <a href="/property-finding">Have BOOM find one for you →</a></div>';
      injectItemListJsonLd([]);
      return;
    }
    grid.innerHTML=matched.map(l=>{
      const price=l.price?'€'+Number(l.price).toLocaleString():'—';
      const sqm=l.sqm||l.size;
      const beds=l.beds||l.bedrooms;
      const meta=[sqm&&sqm+'m²',beds&&(beds+' bed'+(beds>1?'s':''))].filter(Boolean).join(' · ');
      const img=l.image||(l.images&&l.images[0])||'';
      return '<a class="listing-card" href="/apartments/'+encodeURIComponent(l.id)+'">'
        +'<div class="listing-img"'+(img?' style="background-image:url(\\''+img+'\\')"':'')+'></div>'
        +'<div class="listing-body">'
        +'<div class="listing-zone">'+(l.zone||l.neighborhood||'Rome')+'</div>'
        +'<div class="listing-name">'+(l.name||'Apartment')+'</div>'
        +(meta?'<div class="listing-meta">'+meta+'</div>':'')
        +'<div class="listing-price">'+price+'<small>per month</small></div>'
        +'</div></a>';
    }).join('');
    injectItemListJsonLd(matched);
  }catch(e){
    console.error('Listings load failed:',e);
    grid.innerHTML='<div class="listings-empty">Could not load apartments. <a href="/apartments">Browse all listings →</a></div>';
  }
})();

function injectItemListJsonLd(items){
  const SENT='data-seo-neighborhood-itemlist';
  document.head.querySelectorAll('script['+SENT+']').forEach(s=>s.remove());
  if(!items.length)return;
  const data={
    "@context":"https://schema.org","@type":"ItemList",
    "numberOfItems":items.length,
    "itemListElement":items.slice(0,25).map((l,i)=>({
      "@type":"ListItem","position":i+1,
      "url":"https://www.boomrome.com/apartments/"+encodeURIComponent(l.id),
      "name":l.name||"Apartment",
      "item":{
        "@type":"Apartment","name":l.name||"Apartment",
        "url":"https://www.boomrome.com/apartments/"+encodeURIComponent(l.id),
        "address":{"@type":"PostalAddress","addressLocality":"Rome","addressRegion":"Lazio","addressCountry":"IT"},
        ...(l.price?{"offers":{"@type":"Offer","price":Number(l.price),"priceCurrency":"EUR","availability":"https://schema.org/InStock"}}:{})
      }
    }))
  };
  const s=document.createElement('script');s.type='application/ld+json';s.setAttribute(SENT,'');s.textContent=JSON.stringify(data);document.head.appendChild(s);
}
</script>

        <script defer src="/js/boom-cinema.js"></script>
    <script defer src="/js/boom-track.js"></script>
</body>
</html>`;
}

/* ────────────────────────────────────────────────────────────────────
 *  Hub page (index.html for the /apartments-in/ section)
 * ──────────────────────────────────────────────────────────────────── */
function hubHtml() {
  const cards = NEIGHBORHOODS.map((n) => {
    const rentRange = `€${n.stats.rentMin.toLocaleString()}–€${n.stats.rentMax.toLocaleString()}`;
    return `<a class="hub-card" href="/apartments-in/${n.slug}">
      <div class="hub-card-head">
        <span class="hub-card-name">${ESC(n.name)}</span>
        <span class="hub-card-rent">${rentRange}</span>
      </div>
      <div class="hub-card-vibe">${ESC(n.shortVibe)}</div>
      <div class="hub-card-stats">
        <span>Walk ${n.stats.walkScore}/10</span>
        <span>Vibe ${n.stats.vibeScore}/10</span>
        <span>Transit ${n.stats.transitScore}/10</span>
      </div>
      <div class="hub-card-cta">Explore ${ESC(n.name)} →</div>
    </a>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="manifest" href="/site.webmanifest">
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rome Neighborhoods — Where to Rent an Apartment | BOOM</title>
  <!-- BOOM_SEO:placeholder — populated by scripts/seo-update.js -->

  <script async src="https://www.googletagmanager.com/gtag/js?id=G-EYCD59RDVJ"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-EYCD59RDVJ')</script>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600&display=swap" rel="stylesheet">

  <style>${SHARED_CSS}
  .hub-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px;margin-top:8px}
  .hub-card{display:block;padding:28px;background:var(--bg2);border:1px solid var(--border);border-radius:18px;transition:all .35s;color:var(--text)}
  .hub-card:hover{transform:translateY(-3px);border-color:var(--border-g);box-shadow:0 18px 50px rgba(0,0,0,0.4)}
  .hub-card-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px}
  .hub-card-name{font-size:24px;font-weight:300;letter-spacing:-.01em}
  .hub-card-rent{font-size:12px;color:var(--gold);letter-spacing:1px;font-weight:400}
  .hub-card-vibe{font-size:14px;color:var(--text2);line-height:1.6;margin-bottom:18px;min-height:44px}
  .hub-card-stats{display:flex;gap:14px;font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.5px;padding-top:16px;border-top:1px solid var(--border);margin-bottom:18px}
  .hub-card-cta{font-size:12px;color:var(--gold);text-transform:uppercase;letter-spacing:2px;font-weight:500}
  </style>
    <link rel="stylesheet" href="/css/boom-cinema.css">
</head>
<body>

${navHtml('/apartments-in')}

<div class="breadcrumb" aria-label="Breadcrumb">
  <a href="/">Home</a>
  <span class="sep">/</span>
  <span>Neighborhoods</span>
</div>

<header class="hero">
  <span class="hero-eyebrow">Rome Neighborhood Guides</span>
  <h1 class="hero-title">Where to live in Rome</h1>
  <p class="hero-vibe">Ten neighborhoods, ten realities. Pick the vibe — we'll find you the apartment.</p>
  <div class="hero-actions">
    <a href="/apartments" class="btn btn-primary">Browse All Apartments →</a>
    <a href="/property-finding" class="btn btn-ghost">Find My Match</a>
  </div>
</header>

<section class="section">
  <div class="hub-grid">
    ${cards}
  </div>
</section>

<section class="section" id="hub-faq">
  <span class="section-eyebrow">FAQ</span>
  <h2 class="section-title">Choosing a Rome neighborhood — questions we hear most</h2>
  <div class="faq-list">
  <details class="faq"><summary class="faq-q">Which Rome neighborhood is best for students?</summary><div class="faq-a">San Lorenzo sits right next to Sapienza University and has the cheapest central rents and the liveliest student scene. <a href="/apartments-in/pigneto">Pigneto</a> and <a href="/apartments-in/ostiense">Ostiense</a> (next to Roma Tre) are the other student favourites — affordable, well-connected, and full of bars.</div></details>
<details class="faq"><summary class="faq-q">Which neighborhood is best for families in Rome?</summary><div class="faq-a"><a href="/apartments-in/prati">Prati</a> is the classic family choice: elegant, safe, residential, close to the Vatican and great schools. <a href="/apartments-in/trieste-coppede">Trieste &amp; Coppedè</a> is quieter and leafier with parks like Villa Ada and Villa Torlonia. Both trade nightlife for calm.</div></details>
<details class="faq"><summary class="faq-q">Where do most expats live in Rome?</summary><div class="faq-a">The most popular expat neighborhoods are <a href="/apartments-in/trastevere">Trastevere</a>, <a href="/apartments-in/monti">Monti</a> and <a href="/apartments-in/prati">Prati</a> — all central, walkable and international in feel. <a href="/apartments-in/centro-storico">Centro Storico</a> is the dream if your budget stretches; <a href="/apartments-in/testaccio">Testaccio</a> offers the same energy for less.</div></details>
<details class="faq"><summary class="faq-q">What is the cheapest central area to rent in Rome?</summary><div class="faq-a">For central living on a smaller budget, look east: <a href="/apartments-in/pigneto">Pigneto</a>, <a href="/apartments-in/san-lorenzo">San Lorenzo</a>, and parts of <a href="/apartments-in/esquilino">Esquilino</a> and <a href="/apartments-in/ostiense">Ostiense</a>. You get strong tram/metro links and far more space per euro than the historic core — at the cost of postcard looks.</div></details>
<details class="faq"><summary class="faq-q">Which areas have the best nightlife, and which are quietest?</summary><div class="faq-a">For nightlife: <a href="/apartments-in/trastevere">Trastevere</a>, <a href="/apartments-in/san-lorenzo">San Lorenzo</a>, <a href="/apartments-in/pigneto">Pigneto</a> and <a href="/apartments-in/testaccio">Testaccio</a> never sleep. For quiet: <a href="/apartments-in/prati">Prati</a> and <a href="/apartments-in/trieste-coppede">Trieste &amp; Coppedè</a>, or the residential edges of any central zone.</div></details>
<details class="faq"><summary class="faq-q">How should I choose, and how does BOOM help?</summary><div class="faq-a">Pick by lifestyle first, price second. Open any neighborhood above to see character, commute times and live verified listings. BOOM video-verifies every apartment, handles the legal contract, and can match you to a place if you tell us your brief. Start looking 4–6 weeks before your move for mid-term rentals.</div></details>
  </div>
</section>

<section class="cta">
  <h2 class="cta-title">Not sure which neighborhood?</h2>
  <p class="cta-sub">Tell us how you live — we'll match you to the right area and the right apartment.</p>
  <div class="cta-actions">
    <a href="/property-finding" class="btn btn-primary">Have BOOM Find Me One</a>
    <a href="https://wa.me/393313251961" class="btn btn-ghost" rel="noopener">WhatsApp Us</a>
  </div>
</section>

${footerHtml()}

<script>
(function(){
  const h=document.getElementById('hamburger'),m=document.getElementById('mobileMenu');
  if(!h)return;
  const t=()=>{h.classList.toggle('active');m.classList.toggle('active')};
  h.addEventListener('click',t);
  h.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();t()}});
  m.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{h.classList.remove('active');m.classList.remove('active')}));
})();
</script>

        <script defer src="/js/boom-cinema.js"></script>
    <script defer src="/js/boom-track.js"></script>
    <script type="application/ld+json">{"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": "Which Rome neighborhood is best for students?", "acceptedAnswer": {"@type": "Answer", "text": "San Lorenzo sits right next to Sapienza University and has the cheapest central rents and the liveliest student scene. Pigneto and Ostiense (next to Roma Tre) are the other student favourites — affordable, well-connected, and full of bars."}}, {"@type": "Question", "name": "Which neighborhood is best for families in Rome?", "acceptedAnswer": {"@type": "Answer", "text": "Prati is the classic family choice: elegant, safe, residential, close to the Vatican and great schools. Trieste & Coppedè is quieter and leafier with parks like Villa Ada and Villa Torlonia. Both trade nightlife for calm."}}, {"@type": "Question", "name": "Where do most expats live in Rome?", "acceptedAnswer": {"@type": "Answer", "text": "The most popular expat neighborhoods are Trastevere, Monti and Prati — all central, walkable and international in feel. Centro Storico is the dream if your budget stretches; Testaccio offers the same energy for less."}}, {"@type": "Question", "name": "What is the cheapest central area to rent in Rome?", "acceptedAnswer": {"@type": "Answer", "text": "For central living on a smaller budget, look east: Pigneto, San Lorenzo, and parts of Esquilino and Ostiense. You get strong tram/metro links and far more space per euro than the historic core — at the cost of postcard looks."}}, {"@type": "Question", "name": "Which areas have the best nightlife, and which are quietest?", "acceptedAnswer": {"@type": "Answer", "text": "For nightlife: Trastevere, San Lorenzo, Pigneto and Testaccio never sleep. For quiet: Prati and Trieste & Coppedè, or the residential edges of any central zone."}}, {"@type": "Question", "name": "How should I choose, and how does BOOM help?", "acceptedAnswer": {"@type": "Answer", "text": "Pick by lifestyle first, price second. Open any neighborhood page to see character, commute times and live verified listings. BOOM video-verifies every apartment, handles the legal contract, and can match you to a place if you tell us your brief. Start looking 4–6 weeks before your move for mid-term rentals."}}]}</script>
</body>
</html>`;
}

/* ────────────────────────────────────────────────────────────────────
 *  Browser-loadable zone → neighborhood-slug helper.
 *  One source of truth (neighborhoods-data.js) drives both server-side
 *  page generation and client-side card linking.
 * ──────────────────────────────────────────────────────────────────── */
function writeZoneSlugHelper() {
  const map = NEIGHBORHOODS.map((n) => ({
    slug: n.slug,
    name: n.name,
    terms: n.matchTerms,
  }));
  const body = `/* AUTO-GENERATED — do not edit. Source: scripts/neighborhoods-data.js
 * Run: node scripts/neighborhoods-build.js
 *
 * window.BOOM.zoneToSlug(zoneString)   -> "trastevere" | null
 * window.BOOM.zoneToName(zoneString)   -> "Trastevere" | null
 * window.BOOM.allNeighborhoods()       -> [{slug,name,terms}]
 */
(function () {
  var N = ${JSON.stringify(map)};
  function find(input) {
    if (!input) return null;
    var s = String(input).toLowerCase();
    for (var i = 0; i < N.length; i++) {
      var n = N[i];
      for (var j = 0; j < n.terms.length; j++) {
        if (s.indexOf(n.terms[j]) !== -1) return n;
      }
    }
    return null;
  }
  window.BOOM = window.BOOM || {};
  window.BOOM.zoneToSlug = function (z) { var h = find(z); return h ? h.slug : null; };
  window.BOOM.zoneToName = function (z) { var h = find(z); return h ? h.name : null; };
  window.BOOM.allNeighborhoods = function () { return N.slice(); };
})();
`;
  const jsDir = path.join(ROOT, 'js');
  if (!fs.existsSync(jsDir)) fs.mkdirSync(jsDir, { recursive: true });
  fs.writeFileSync(path.join(jsDir, 'neighborhoods.js'), body, 'utf8');
  console.log('[✓] /js/neighborhoods.js (zone→slug helper)');
}

/* ────────────────────────────────────────────────────────────────────
 *  Write everything
 * ──────────────────────────────────────────────────────────────────── */
let count = 0;
for (const n of NEIGHBORHOODS) {
  const fp = path.join(OUT_DIR, `${n.slug}.html`);
  fs.writeFileSync(fp, pageHtml(n, NEIGHBORHOODS), 'utf8');
  console.log(`[✓] /apartments-in/${n.slug}.html`);
  count++;
}
fs.writeFileSync(path.join(OUT_DIR, 'index.html'), hubHtml(), 'utf8');
console.log(`[✓] /apartments-in/index.html (hub)`);
writeZoneSlugHelper();
console.log(`\nWrote ${count} neighborhood pages + hub + zone-slug helper.`);
console.warn(
  '\n[!] Pages were written with EMPTY BOOM_SEO / BOOM_JSONLD sentinel blocks.' +
  '\n    Re-apply them before committing: node scripts/seo-update.js' +
  '\n    (NOTE: verify seo-update.js/seo-config.js are in sync with the committed' +
  '\n    pages first — they have drifted before, e.g. WhatsApp number and titles.)'
);
