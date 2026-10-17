/* Preparazione immagini SmartLink nel browser: una copia per Portal e prova locale. */
(function (root) {
  'use strict';
  async function prepare(file) {
    if (!file?.type?.startsWith('image/') || file.size > 25_000_000) throw new Error('Usa foto fino a 25 MB; saranno ottimizzate prima del caricamento.');
    let bitmap;
    try { bitmap = await createImageBitmap(file); }
    catch { throw new Error('Una foto non è leggibile sul dispositivo. Esportala in JPG e riprova.'); }
    try {
      const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      let blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', .88));
      if (!blob || blob.type !== 'image/webp') blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .88));
      if (!blob || !['image/webp', 'image/jpeg'].includes(blob.type) || blob.size >= 8_000_000) throw new Error('Una foto resta troppo grande dopo l’ottimizzazione. Riducila e riprova.');
      return blob;
    } finally { bitmap.close?.(); }
  }
  const API = { prepare };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_SMARTLINK_PHOTO = API;
})(typeof window !== 'undefined' ? window : this);
