// tests/viewings/telegram.mjs — the operator's buttons.
//
// Telegram caps callback_data at 64 BYTES and silently rejects the whole
// keyboard when one button exceeds it — the card would arrive with no buttons
// at all, and the only symptom is "il bot non risponde". So the encoding is
// asserted, not assumed. Same for the card markup: an unescaped `<` in a
// client's name would make Telegram refuse the message as bad HTML.
//
// Run: node tests/viewings/telegram.mjs

import { fmtViewingCard, viewingKeyboard } from '../../api/telegram/_viewings.js';

let fails = 0;
const ok = (name, cond, detail) => {
  console.log(cond ? `PASS ${name}` : `FAIL ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) fails++;
};

const buttons = kb => kb.inline_keyboard.flat();
const cbs = kb => buttons(kb).filter(b => b.callback_data);

// A realistic worst case: Firestore auto-ids are 20 chars, but a hand-made id
// can be longer — the encoding must survive it with room to spare.
const LONG_ID = 'a'.repeat(28);
const base = {
  id: LONG_ID,
  clientName: 'Sophie Kuhlwein',
  clientPhone: '+49 176 1234567',
  clientEmail: 'sophie@example.de',
  listingName: 'Trilocale Pigneto',
  listingPrice: 1400,
  listingAddress: 'Via del Pigneto 42',
  durationMinutes: 45,
  mode: 'person',
  confirmedDateTime: '2026-08-06T13:00:00.000Z',
};

// ── 1. every callback fits, whatever the state ────────────────────────────
{
  const states = [
    { ...base, status: 'pending' },
    { ...base, status: 'confirmed' },
    { ...base, status: 'confirmed', mode: 'video', videoUrl: 'https://meet.jit.si/boom-viewing-abc123def456' },
    { ...base, status: 'cancelled' },
    { ...base, status: 'pending', confirmedDateTime: null, proposedDateTime: null, scheduledAt: null },
  ];
  let worst = 0, worstData = '';
  for (const v of states) {
    for (const b of cbs(viewingKeyboard(v))) {
      const bytes = Buffer.byteLength(b.callback_data, 'utf8');
      if (bytes > worst) { worst = bytes; worstData = b.callback_data; }
      ok(`callback fits 64 bytes (${b.callback_data.slice(0, 12)}…)`, bytes <= 64, `${bytes} bytes: ${b.callback_data}`);
    }
  }
  console.log(`     ↳ worst case ${worst}/64 bytes (${worstData})`);
  // the day/time callbacks add at most 1 mode char + 8 date chars on top
  ok('headroom for the picker callbacks', worst + 9 <= 64, `${worst} + 9`);
}

// ── 2. the three moves are there, in the right shape ──────────────────────
{
  const pending = viewingKeyboard({ ...base, status: 'pending' });
  const data = cbs(pending).map(b => b.callback_data.split(':')[0]);
  ok('a pending viewing can be confirmed in one tap', data.includes('vok'));
  ok('…and moved', data.includes('vmv'));
  ok('…and cancelled', data.includes('vxq'));
  ok('confirm is the first button', cbs(pending)[0].callback_data.startsWith('vok:'));
  ok('confirm names the actual time', /Conferma \w/.test(buttons(pending)[0].text), buttons(pending)[0].text);

  const confirmed = viewingKeyboard({ ...base, status: 'confirmed' });
  const cdata = cbs(confirmed).map(b => b.callback_data.split(':')[0]);
  ok('a confirmed viewing is not re-confirmable', !cdata.includes('vok'));
  ok('…but is still movable', cdata.includes('vmv'));
  ok('…and carries the one-tap action as a link', buttons(confirmed).some(b => b.url && b.url.includes('google.com/maps')));

  const video = viewingKeyboard({ ...base, status: 'confirmed', mode: 'video' });
  ok('a video viewing links the room, not a map', buttons(video).some(b => b.url && b.url.includes('meet.jit.si')));

  const gone = viewingKeyboard({ ...base, status: 'cancelled' });
  ok('a cancelled viewing offers no destructive action', cbs(gone).length === 0);
}

// ── 3. a viewing with no proposed time cannot "confirm nothing" ───────────
{
  const noTime = { ...base, status: 'pending', confirmedDateTime: null, proposedDateTime: null, scheduledAt: null };
  const kb = viewingKeyboard(noTime);
  ok('no time → the confirm button opens the picker instead', cbs(kb)[0].callback_data.startsWith('vmv:'),
    cbs(kb)[0].callback_data);
}

// ── 4. the card is HTML-safe and complete ─────────────────────────────────
{
  const nasty = { ...base, status: 'pending', clientName: 'Anna <script>alert(1)</script> & Co', notes: 'a < b & c > d' };
  const card = fmtViewingCard(nasty);
  ok('client name is escaped', !card.includes('<script>'), card.slice(0, 200));
  ok('ampersands are escaped', card.includes('&amp;'));
  ok('only our own tags remain', (card.match(/<(?!\/?(b|i)>)/g) || []).length === 0,
    JSON.stringify((card.match(/<[^>]*>/g) || []).filter(t => !/^<\/?[bi]>$/.test(t))));

  const full = fmtViewingCard({ ...base, status: 'confirmed' });
  ok('the card names the client', full.includes('Sophie Kuhlwein'));
  ok('the card names the property', full.includes('Trilocale Pigneto'));
  ok('the card shows the price', full.includes('1.400'));
  ok('the card shows the address for an in-person visit', full.includes('Via del Pigneto 42'));
  ok('the card says how you meet', full.includes('di persona'));

  const vid = fmtViewingCard({ ...base, status: 'confirmed', mode: 'video' });
  ok('a video card says video', vid.includes('🎥 video'));
  ok('a video card does not print an address', !vid.includes('Via del Pigneto'));

  const tagged = fmtViewingCard({ ...base, status: 'confirmed' }, '✅ <b>CONFERMATA</b>');
  ok('the stamp is appended', tagged.includes('✅ <b>CONFERMATA</b>'));

  const bare = fmtViewingCard({ id: 'x', status: 'pending' });
  ok('a card with almost no data still renders', bare.includes('RICHIESTA VISITA') && bare.includes('nessun orario'), bare);
}

console.log(fails ? `\n${fails} FAILED` : '\nAll green.');
process.exit(fails ? 1 : 0);
