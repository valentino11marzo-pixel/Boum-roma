// api/_emailjs.js
// Shared EmailJS transport (the boom_notification template). This is the
// delivery path that demonstrably works for every Stripe-webhook branch
// (PFS, deposit, reserve, services) — kept as ONE implementation so the
// pre-agreement suite can use it as a fallback when Nodemailer/Gmail fails.
//
// Template params: to_email, heading, subheading, name, intro, card_color,
// card_title, r1..r4 {icon,label,value}, closing, cta_text, portal_link.

export async function sendEmailJS(templateParams) {
  const body = {
    service_id: 'service_74n80th',
    template_id: 'boom_notification',
    user_id: 'dnMxbtS2qDm_o7SHE',
    accessToken: process.env.EMAILJS_PRIVATE_KEY,
    template_params: templateParams,
  };

  const r = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`EmailJS ${r.status}: ${txt}`);
  }
  return r.text();
}
