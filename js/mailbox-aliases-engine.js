/* Owned mailbox addresses, not sender authentication or permission to send.
 * These six aliases were saved and reread in BOOM Google Admin on 2026-11-04.
 * A different configured account keeps its own address only. No domain wildcard.
 */
(function (root, factory) {
  var API = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_MAILBOX_ALIASES = API;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var PRIMARY = 'valentino@boom-rome.com';
  var ALIASES = ['hello', 'affitti', 'proprietari', 'documenti', 'amministrazione', 'assistenza'];
  function ownedAddresses(account) {
    var own = typeof account === 'string' ? account.trim().toLowerCase() : '';
    if (!own) return [];
    if (own === PRIMARY) return [own].concat(ALIASES.map(function (name) { return name + '@boom-rome.com'; }));
    return [own];
  }
  return Object.freeze({ ownedAddresses: ownedAddresses });
});
