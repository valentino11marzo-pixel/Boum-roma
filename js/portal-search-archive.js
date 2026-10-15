/* On-demand archive pages. Session memory only; no IO until load() is called. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BOOM_PORTAL_SEARCH_ARCHIVE = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SOURCES = Object.freeze({
    client: 'clients', property: 'properties', person: 'users',
    contract: 'contracts', document: 'documents', maintenance: 'maintenance',
    lead: 'leads', task: 'tasks', deadline: 'deadlines', payment: 'payments',
    listing: 'listings', pfsClient: 'pfsClients', pfsProperty: 'pfsProperties',
    landlord: 'landlords', proposal: 'preAgreements'
  });
  var owns = function (key) { return typeof key === 'string' && Object.prototype.hasOwnProperty.call(SOURCES, key); };

  function create(options) {
    options = options || {};
    if (typeof options.readPage !== 'function' || typeof options.getScope !== 'function') {
      throw new TypeError('readPage and getScope are required');
    }
    if (options.onChange != null && typeof options.onChange !== 'function') throw new TypeError('Invalid onChange');
    var pageSize = options.pageSize === undefined ? 200 : options.pageSize;
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200) throw new RangeError('pageSize must be 1–200');
    var readPage = options.readPage, getScope = options.getScope, onChange = options.onChange;
    var sources = new Map(), user = null, generation = 0;

    function scopeUser() {
      try {
        var scope = getScope();
        return scope && scope.admin === true && scope.user && typeof scope.user === 'object' ? scope.user : null;
      } catch (_) { return null; }
    }
    // Reading state can invalidate it, but never notifies/render-recurses.
    function syncScope() {
      var next = scopeUser();
      if (next !== user) { generation++; sources.clear(); user = next; }
      return user;
    }
    function empty(allowed) {
      return { rows: [], status: 'idle', complete: false, hasMore: !!allowed, error: false };
    }
    function snapshot(entry) {
      return entry ? { rows: Array.from(entry.rows.values(), function (row) { return Object.assign({}, row); }),
        status: entry.status, complete: entry.complete, hasMore: entry.hasMore, error: entry.error } : empty(!!user);
    }
    function notify() {
      // A presentation callback cannot turn a successful read into a data error.
      if (onChange) { try { onChange(); } catch (_) {} }
    }
    function state(kind) {
      if (!owns(kind)) throw new TypeError('Unknown archive kind');
      if (!syncScope()) return empty(false);
      return snapshot(sources.get(kind));
    }
    function reset() {
      generation++; sources.clear(); user = scopeUser(); notify();
    }
    function validate(page, afterId) {
      if (!page || !Array.isArray(page.rows) || page.rows.length > pageSize
          || typeof page.hasMore !== 'boolean' || typeof page.lastId !== 'string') throw new TypeError('Invalid archive page');
      if (page.rows.some(function (row) {
        return !row || typeof row !== 'object' || Array.isArray(row)
          || typeof row.id !== 'string' || !row.id || row.id.indexOf('/') !== -1;
      })) throw new TypeError('Invalid archive record');
      if ((page.rows.length && !page.lastId)
          || (page.hasMore && (!page.rows.length || !page.lastId || page.lastId === afterId))) throw new TypeError('Invalid archive cursor');
    }
    function load(kind, collection) {
      if (!owns(kind) || SOURCES[kind] !== collection) return Promise.reject(new TypeError('Unknown archive source'));
      if (!syncScope()) return Promise.resolve(empty(false));
      var entry = sources.get(kind);
      if (!entry) {
        entry = { rows: new Map(), status: 'idle', complete: false, hasMore: true, error: false, afterId: null, pending: null };
        sources.set(kind, entry);
      }
      if (entry.pending) return entry.pending;
      if (entry.complete) return Promise.resolve(snapshot(entry));
      var requestGeneration = generation, requestUser = user, afterId = entry.afterId;
      function current() {
        return !!syncScope() && generation === requestGeneration && user === requestUser && sources.get(kind) === entry;
      }
      entry.status = 'loading'; entry.error = false;
      entry.pending = Promise.resolve().then(function () {
        if (!current()) return null;
        return readPage(collection, { afterId: afterId, limit: pageSize });
      }).then(function (page) {
        if (!current()) return empty(false);
        validate(page, afterId);
        // Validate the entire page before changing rows or the retry cursor.
        page.rows.forEach(function (row) { entry.rows.set(row.id, Object.assign({}, row)); });
        entry.afterId = page.lastId || afterId;
        entry.hasMore = page.hasMore; entry.complete = !page.hasMore;
        entry.status = 'ready'; entry.error = false; entry.pending = null;
        notify();
        return current() ? snapshot(entry) : empty(false);
      }).catch(function () {
        if (!current()) return empty(false);
        entry.status = 'error'; entry.error = true; entry.pending = null;
        notify();
        return current() ? snapshot(entry) : empty(false);
      });
      var pending = entry.pending;
      notify();
      return pending;
    }
    return { load: load, state: state, reset: reset };
  }
  return { create: create, SOURCES: SOURCES };
});
