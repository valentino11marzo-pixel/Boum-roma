// api/portal/_notify.js
// Best-effort operator alerts fired when a PFS client acts inside the client
// portal (requests a viewing / messages the concierge). Closes the reverse loop:
// before this, portal actions only wrote to pfsClients and nobody was pinged —
// the operator had to spot them by opening portal.html. Reuses the same EmailJS
// `boom_notification` template the rest of the app already uses. Never throws;
// failures are logged and swallowed so the client's action always succeeds.

const OWNER_EMAIL = process.env.NOTIFY_OWNER_EMAIL || 'valentino@boomrome.com';
const EMAILJS = { service: 'service_74n80th', template: 'boom_notification', user: 'dnMxbtS2qDm_o7SHE' };

export async function notifyOperator({ kind, client, property, preference, text }) {
  try {
    const name = (client && client.name) || 'Cliente PFS';
    const code = (client && client.portalAccessCode) || '';
    let heading, intro, r2icon, r2label, r2value, r3icon, r3label, r3value;

    if (kind === 'viewing') {
      heading = 'Richiesta visita · PFS';
      intro = `${name} ha richiesto una visita dal portale.`;
      r2icon = '🏠'; r2label = 'Immobile'; r2value = (property && property.address) || '—';
      r3icon = '🕐'; r3label = 'Preferenza'; r3value = preference || '—';
    } else if (kind === 'message') {
      heading = 'Nuovo messaggio · PFS';
      intro = `${name} ti ha scritto dal portale.`;
      r2icon = '✉️'; r2label = 'Messaggio'; r2value = (text || '—').slice(0, 300);
      r3icon = '🔑'; r3label = 'Codice'; r3value = code || '—';
    } else {
      return false;
    }

    const tp = {
      to_email: OWNER_EMAIL, from_name: 'BOOM Portal', reply_to: 'noreply@boomrome.com',
      name: 'Valentino', heading, subheading: name, intro,
      card_title: kind === 'viewing' ? 'VIEWING REQUEST' : 'MESSAGE', card_color: '#D4AF37',
      r1_icon: '👤', r1_label: 'Cliente', r1_value: name,
      r2_icon: r2icon, r2_label: r2label, r2_value: r2value,
      r3_icon: r3icon, r3_label: r3label, r3_value: r3value,
      r4_icon: '🔑', r4_label: 'Codice', r4_value: code || '—',
      closing: `Apri il portale per rispondere. Codice cliente: ${code || '—'}.`,
      cta_text: 'Apri portal →', portal_link: 'https://www.boomrome.com/portal.html',
    };

    const r = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: EMAILJS.service, template_id: EMAILJS.template, user_id: EMAILJS.user,
        accessToken: process.env.EMAILJS_PRIVATE_KEY || undefined,
        template_params: tp,
      }),
    });
    if (!r.ok) console.error('[portal/_notify]', kind, r.status, await r.text().catch(() => ''));
    return r.ok;
  } catch (e) {
    console.error('[portal/_notify]', e && e.message);
    return false;
  }
}
