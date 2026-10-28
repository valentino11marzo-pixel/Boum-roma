import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {scrollBlock} from '../../scripts/scroll-sync.mjs';
const require=createRequire(import.meta.url),M=require('../../js/mappa-engine.js');
const root=fileURLToPath(new URL('../../',import.meta.url)),html=readFileSync(root+'your-rome.html','utf8');
execFileSync(process.execPath,[root+'design/pages-deco/build-your-rome.mjs','--check']);
assert.match(html,/<!doctype html>/i);assert.match(html,/<html lang="en">/);assert.match(html,/<meta charset="utf-8">/);
assert.match(html,/<link rel="canonical" href="https:\/\/www.boomrome.com\/your-rome">/);
assert.ok(html.includes(scrollBlock(root)),'exact shared scroll block');
for(const d of M.DESTINATIONS.filter(d=>d.source)){
 assert.ok(html.includes(d.address),d.slug+' has a crawlable official address');assert.ok(html.includes(d.source),d.slug+' links its official source');
}
const blocks=[...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m=>JSON.parse(m[1]));
const graph=blocks.flatMap(x=>x['@graph']||[x]),faq=graph.find(x=>x['@type']==='FAQPage');
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
for(const question of faq.mainEntity){assert.ok(html.includes('<summary>'+esc(question.name)+'</summary>'));assert.ok(html.includes('<p>'+esc(question.acceptedAnswer.text)+'</p>'));}
assert.equal(graph.filter(x=>x['@type']==='RealEstateAgent').length,1);
assert.equal(graph.find(x=>x['@type']==='RealEstateAgent').legalName,'Egidi Immobiliare S.r.l.');
for(const match of html.matchAll(/(?:src|href)="(\/(?:assets|js|css)\/[^"?]+)(?:\?[^" ]*)?"/g))assert.ok(existsSync(root+match[1].slice(1)),match[1]+' exists');
assert.match(html,/<form[^>]+action="\/skyline"[^>]+method="get"/);
assert.match(html,/name="place"/);assert.match(html,/name="budget"/);assert.match(html,/name="priority"/);
assert.doesNotMatch(html,/<iframe|maplibre-gl\.js|name="email"/,'the guide is crawlable and does not load map WebGL or gate access');
console.log('  ✓ Your Rome page: generator parity, official campus text, visible FAQ/schema, identity, real assets and a functional no-JS planner');
