// Real Centralino HTML + synthetic Firebase boundary shared by browser tests
// and the local Home preview. Never import this fixture into production code.
import { readFileSync } from 'node:fs';

export function installPhoneFixture({ rows = [], sources = {} } = {}) {
  window.__phoneRows = rows;
  window.__phoneSources = sources;
  window.__reads = [];
  window.__writes = [];
  window.__holdReviewWrites = false;
  window.__reviewResolvers = [];
  window.__releaseReviewWrite = () => { const resolve = window.__reviewResolvers.shift(); if (resolve) resolve(); };
  const query = {
    orderBy: () => query, limit: () => query,
    get: async () => {
      window.__reads.push({ kind: 'list' });
      return { docs: window.__phoneRows.map(row => ({ id: row.id, data: () => row })) };
    },
    doc: id => ({ get: async options => {
      window.__reads.push({ kind: 'doc', id, options });
      if (window.__holdSource) await new Promise(resolve => { window.__releaseSource = resolve; });
      if (window.__sourceError) throw Error('permission-denied');
      const row = window.__phoneSources[id];
      return { id, exists: !!row, data: () => row };
    }, update: async fields => {
      if (fields.reviewTags && window.__holdReviewWrites) await new Promise(resolve => window.__reviewResolvers.push(resolve));
      window.__writes.push({ id, fields });
      window.__phoneRows = window.__phoneRows.map(row => row.id === id ? { ...row, ...fields } : row);
      if (window.__phoneSources[id]) Object.assign(window.__phoneSources[id], fields);
      if (window.__emit) await window.__emit();
    } }),
  };
  const auth = { currentUser: { uid: 'synthetic-admin' } };
  window.firebase = { auth: () => auth, firestore: () => ({ collection: name => {
    if (name !== 'phoneCalls') throw Error('unexpected collection ' + name);
    return query;
  } }) };
  window.BoomPortal = {
    requireAuth: async roles => { if (roles.join(',') !== 'admin') throw Error('admin gate missing'); },
    listen: (q, receive) => { window.__emit = async () => receive(await q.get()); window.__emit(); },
    toast: () => {},
  };
}

export function phonePreviewHtml({ rows = [], sources = {} } = {}) {
  const html = readFileSync(new URL('../../chiamate.html', import.meta.url), 'utf8');
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  const script = scripts.map(match => match[1]).find(text => text.includes('contactPresentation'));
  if (!script) throw Error('Centralino script missing');
  const shell = html.replace(/<script(?:\s[^>]*)?>[\s\S]*?<\/script>/g, '')
    .replace(/<link\b[^>]*>/g, '');
  const data = JSON.stringify({ rows, sources }).replace(/</g, '\\u003c');
  return shell.replace('</body>', `<script>(${installPhoneFixture.toString()})(${data});
    window.fetch = async () => { throw Error('Anteprima sintetica: nessun servizio esterno'); };
    document.addEventListener('click', event => {
      const link = event.target.closest('a');
      if (link && /^(?:https?:|tel:)/.test(link.getAttribute('href') || '')) event.preventDefault();
    });
    ${script}</script></body>`);
}
