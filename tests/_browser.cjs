// tests/_browser.cjs — il ponte CommonJS verso tests/_browser.mjs.
// Le suite scritte in .cjs non possono require() un modulo ESM: qui si
// riespone la stessa logica leggendo il .mjs con un import dinamico, cosi'
// le regole su come si apre un browser restano in UNA copia sola.
let cache = null;
async function mjs() {
  if (!cache) cache = await import('./_browser.mjs');
  return cache;
}
module.exports = {
  loadChromium: async () => (await mjs()).loadChromium(),
  launchOptions: async (extra) => (await mjs()).launchOptions(extra),
};
