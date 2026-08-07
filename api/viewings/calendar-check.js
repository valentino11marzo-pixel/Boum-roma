// api/viewings/calendar-check.js — "il calendario è collegato?"
//
// Il calendario esterno è l'unico pezzo del ciclo visita che vive FUORI da
// BOOM, e per progetto fallisce in silenzio: se l'indirizzo ICS è sbagliato o
// irraggiungibile la griglia continua a funzionare come prima (fail-open, ed è
// giusto così — un calendario giù non deve spegnere le prenotazioni). Il
// prezzo di quella scelta è che il silenzio è ambiguo: "nessuno slot tolto"
// può voler dire "collegato e non ho impegni" oppure "non è collegato".
//
// Questa è la risposta esplicita. Legge il calendario ADESSO (bypassando la
// cache di 2 minuti) e dice: quante sorgenti, se rispondono, quanti impegni
// OCCUPATI ci sono nell'orizzonte e quali sono i prossimi. Non mostra MAI
// l'URL: quello è la credenziale.
//
// GET/POST — auth: Bearer CRON_SECRET, X-Homie-Secret o ID token admin.
// Il bot Telegram la espone come /calendario (nessuna UI da imparare).

import { requireCronOrAdmin } from '../pfs/_guard.js';
import { loadConfig, TZ } from './_avail.js';
import { busyIcsUrls, externalBusy, clearIcsCache } from './_busyics.js';

const fmt = ms => new Intl.DateTimeFormat('it-IT', {
  timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short',
  hour: '2-digit', minute: '2-digit',
}).format(new Date(ms));
const hhmm = ms => new Intl.DateTimeFormat('it-IT', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(ms));

/** @returns { configured, horizonDays, sources[], busy, next[] } */
export async function calendarDiagnosis(now = new Date()) {
  const cfg = await loadConfig();
  const urls = busyIcsUrls(cfg);
  const out = {
    configured: urls.length,
    horizonDays: Number(cfg.horizonDays) || 14,
    sources: [], busy: 0, next: [],
  };
  if (!urls.length) return out;

  // una diagnosi deve leggere il calendario ADESSO, non la copia in cache
  clearIcsCache();
  const report = [];
  let blocks = [];
  try { blocks = await externalBusy(cfg, now, globalThis.fetch, report); }
  catch (e) { report.push({ host: 'calendar', ok: false, error: String(e.message || 'failed').slice(0, 120) }); }

  out.sources = report;
  out.busy = blocks.length;
  out.next = blocks
    .filter(b => b[1] > now.getTime())
    .sort((a, b) => a[0] - b[0])
    .slice(0, 6)
    .map(b => ({ start: b[0], end: b[1], label: `${fmt(b[0])}–${hhmm(b[1])}` }));
  return out;
}

/** The same verdict, as a Telegram message. */
export function formatDiagnosis(d) {
  if (!d.configured) {
    return '🗓 <b>Calendario NON collegato</b>\n'
      + 'La variabile <code>BUSY_ICS_URLS</code> non è impostata (o non è un URL https).\n'
      + 'Le prenotazioni funzionano lo stesso: manca solo il blocco automatico dei tuoi impegni.';
  }
  const bad = d.sources.filter(s => !s.ok);
  const good = d.sources.filter(s => s.ok);
  const L = [];
  if (bad.length && !good.length) {
    L.push('🗓 <b>Calendario collegato ma IRRAGGIUNGIBILE</b>');
    L.push(bad.map(s => `· ${s.host}: ${s.error}`).join('\n'));
    L.push('');
    L.push('Controlla che l\'indirizzo sia quello <b>segreto in formato iCal</b> e che finisca con <code>.ics</code>.');
    L.push('Nessun rischio nel frattempo: la griglia resta quella di prima.');
    return L.join('\n');
  }
  L.push(`🗓 <b>Calendario collegato</b> — ${good.length} sorgent${good.length === 1 ? 'e' : 'i'} (${good.map(s => s.host).join(', ')})`);
  const events = good.reduce((a, s) => a + (s.events || 0), 0);
  L.push(`Letti adesso: <b>${events}</b> eventi · <b>${d.busy}</b> occupano tempo nei prossimi ${d.horizonDays} giorni.`);
  if (bad.length) L.push(`⚠️ ${bad.length} sorgente non risponde: ${bad.map(s => s.host).join(', ')}`);
  if (d.next.length) {
    L.push('');
    L.push('<b>Prossimi impegni che tolgono slot:</b>');
    L.push(d.next.map(n => `· ${n.label}`).join('\n'));
  } else if (events) {
    L.push('');
    L.push('Nessuno di questi eventi blocca slot: sono tutti segnati <b>“Libero”</b> (o annullati).');
    L.push('Per bloccare, l\'evento va segnato <b>“Impegnato”</b> in Google Calendar.');
  } else {
    L.push('');
    L.push('Agenda vuota nell\'orizzonte: nessuno slot da togliere.');
  }
  return L.join('\n');
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;
  try {
    const d = await calendarDiagnosis();
    return res.status(200).json({ ok: true, ...d, text: formatDiagnosis(d) });
  } catch (e) {
    console.error('[viewings/calendar-check]', e);
    return res.status(500).json({ ok: false, error: e.message || 'internal' });
  }
}
