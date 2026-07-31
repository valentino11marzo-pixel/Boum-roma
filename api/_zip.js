// api/_zip.js — ZIP writer minimale, SENZA dipendenze npm (metodo STORE).
// Un pack di PDF/JPEG non guadagna nulla dalla compressione (sono formati
// già compressi), e una dipendenza nuova in api/ è un rischio di deploy
// concreto (l'ERR_MODULE_NOT_FOUND che il 2026-07-22 spense l'intera API):
// ~80 righe di formato ZIP classico coprono tutto il necessario.
// Nomi file UTF-8 (flag 0x0800), date DOS, CRC-32 standard.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function dosDateTime(d) {
  const dt = d instanceof Date ? d : new Date();
  const time = ((dt.getHours() & 31) << 11) | ((dt.getMinutes() & 63) << 5) | ((dt.getSeconds() >> 1) & 31);
  const date = (((dt.getFullYear() - 1980) & 127) << 9) | (((dt.getMonth() + 1) & 15) << 5) | (dt.getDate() & 31);
  return { time, date };
}

// files: [{ name, data (Buffer|string), date? }] → Buffer (.zip)
export function buildZip(files) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(String(f.name), 'utf8');
    const data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(String(f.data), 'utf8');
    const crc = crc32(data);
    const { time, date } = dosDateTime(f.date);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);   // local file header
    local.writeUInt16LE(20, 4);           // version needed
    local.writeUInt16LE(0x0800, 6);       // flags: nomi UTF-8
    local.writeUInt16LE(0, 8);            // method 0 = STORE
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); // compressed = uncompressed (STORE)
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);           // extra len
    locals.push(local, name, data);

    const central = Buffer.alloc(46);     // campi non scritti restano 0
    central.writeUInt32LE(0x02014b50, 0); // central dir header
    central.writeUInt16LE(20, 4);         // version made by
    central.writeUInt16LE(20, 6);         // version needed
    central.writeUInt16LE(0x0800, 8);     // flags: nomi UTF-8
    central.writeUInt16LE(0, 10);         // method STORE
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);    // offset del local header
    centrals.push(central, name);

    offset += 30 + name.length + data.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);      // end of central directory
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);         // inizio central dir
  return Buffer.concat([...locals, centralBuf, eocd]);
}
