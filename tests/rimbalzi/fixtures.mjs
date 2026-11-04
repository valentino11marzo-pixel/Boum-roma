// tests/rimbalzi/fixtures.mjs — i rimbalzi, scritti a mano ma COPIATI da un
// caso vero.
//
// IL CASO VERO (REAL): il testo umano e la parte macchina sono quelli del
// rimbalzo Gmail ricevuto dall'operatore («** Indirizzo non trovato **»,
// Final-Recipient / Action: failed / Status: 5.1.1, il 550-5.1.1 ripiegato su
// più righe). Gli indirizzi sono FINTI: operator@example.invalid (la casella
// che spedisce = GMAIL_USER nei test) e client.typo@example-mail.test.
//
// IPOTESI SINTETICHE, da sostituire con il rimbalzo vero quando l'operatore
// lo esporta (Gmail → ⋮ → «Mostra originale», indirizzo anonimizzato):
//   · In-Reply-To / References verso l'originale;
//   · X-Failed-Recipients nell'intestazione;
//   · l'originale allegato come message/rfc822 (Gmail potrebbe usare
//     text/rfc822-headers, o niente) — il parser li tratta tutti come
//     facoltativi, e le varianti qui sotto coprono le tre forme.

export const OPERATOR = 'operator@example.invalid';
export const CLIENT = 'client.typo@example-mail.test';

const CRLF = '\r\n';
const join = (lines) => lines.join(CRLF);

// quoted-printable minimo per il testo umano (UTF-8)
function qp(text) {
  const bytes = Buffer.from(text, 'utf8');
  let out = '', line = '';
  for (const b of bytes) {
    let piece;
    if (b === 0x0a) { out += line + CRLF; line = ''; continue; }
    if (b === 0x0d) continue;
    if ((b >= 33 && b <= 126 && b !== 61) || b === 32) piece = String.fromCharCode(b);
    else piece = '=' + b.toString(16).toUpperCase().padStart(2, '0');
    if (line.length + piece.length > 72) { out += line + '=' + CRLF; line = ''; }
    line += piece;
  }
  return out + line;
}

export const REAL_HUMAN = `** Indirizzo non trovato **\n\nIl tuo messaggio non è stato recapitato a ${CLIENT} perché l'indirizzo risulta inesistente o non può ricevere email.`;

export const REAL_MACHINE = join([
  'Reporting-MTA: dns; googlemail.com',
  `Received-From-MTA: dns; ${OPERATOR}`,
  'Arrival-Date: Sat, 25 Oct 2026 03:00:00 -0700 (PDT)',
  '',
  `Final-Recipient: rfc822; ${CLIENT}`,
  'Action: failed',
  'Status: 5.1.1',
  'Remote-MTA: dns; mx.example-mail.test. (192.0.2.4, the server for the domain example-mail.test.)',
  'Diagnostic-Code: smtp; 550-5.1.1 The email account that you tried to reach does not exist. Please try',
  " 550-5.1.1 double-checking the recipient's email address for typos or",
  ' 550 5.1.1 unnecessary spaces.',
  'Last-Attempt-Date: Sat, 25 Oct 2026 03:00:03 -0700 (PDT)',
  '',
]);

const originalRfc822 = (subject = 'Your Full Search is booked', to = CLIENT, body = 'Payment received.') => join([
  `From: ${OPERATOR}`,
  `To: ${to}`,
  `Subject: ${subject}`,
  'Message-ID: <orig-123@example.invalid>',
  'Date: Sat, 25 Oct 2026 10:00:00 +0000',
  'Content-Type: text/plain',
  '',
  body,
]);

/**
 * Un multipart/report delivery-status come lo costruisce Gmail.
 * @param {object} o
 */
export function dsnMessage(o = {}) {
  const id = o.messageId || '<dsn-abc@mx.google.com>';
  const from = o.from || 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>';
  const subject = o.subject || 'Delivery Status Notification (Failure)';
  const human = o.human != null ? o.human : REAL_HUMAN;
  const machine = o.machine != null ? o.machine : REAL_MACHINE;
  const machineType = o.machineType || 'message/delivery-status';
  const reportType = o.reportType || 'delivery-status';
  const headers = [
    `Delivered-To: ${OPERATOR}`,
    `From: ${from}`,
    `To: ${OPERATOR}`,
    'Auto-Submitted: auto-replied',
    `Subject: ${subject}`,
    ...(o.inReplyTo === false ? [] : ['References: <orig-123@example.invalid>', 'In-Reply-To: <orig-123@example.invalid>']),
    ...(o.xFailed ? [`X-Failed-Recipients: ${o.xFailed}`] : []),
    `Message-ID: ${id}`,
    `Date: ${o.date || 'Sat, 25 Oct 2026 10:00:03 +0000'}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/report; boundary="b1"; report-type=${reportType}`,
    '',
  ];
  const parts = [
    '--b1',
    'Content-Type: multipart/alternative; boundary="b3"',
    '',
    '--b3',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    qp(human),
    '',
    '--b3',
    'Content-Type: text/html; charset="UTF-8"',
    '',
    '<html><body><p>Delivery report</p></body></html>',
    '--b3--',
  ];
  if (o.noMachine !== true) {
    parts.push('--b1', `Content-Type: ${machineType}`, ...(o.machineDisposition ? ['Content-Disposition: attachment; filename="details.txt"'] : []), '', machine);
  }
  if (o.original !== false) {
    const type = o.originalType || 'message/rfc822';
    const orig = o.originalRaw || (type === 'text/rfc822-headers'
      ? join([`From: ${OPERATOR}`, `To: ${o.originalTo || CLIENT}`, `Subject: ${o.originalSubject || 'Your Full Search is booked'}`, 'Message-ID: <orig-123@example.invalid>', 'Date: Sat, 25 Oct 2026 10:00:00 +0000', ''])
      : originalRfc822(o.originalSubject, o.originalTo, o.originalBody));
    parts.push('--b1', `Content-Type: ${type}`, '', orig);
  }
  parts.push('--b1--', '');
  return Buffer.from(join([...headers, ...parts]), 'utf8');
}

/** Un'email semplice (testo), per i casi che NON sono un rimbalzo. */
export function plainMessage({ from, subject, text, headers = [], messageId = '<plain@example.invalid>', contentType = 'text/plain; charset="UTF-8"' }) {
  return Buffer.from(join([
    `From: ${from}`, `To: ${OPERATOR}`, `Subject: ${subject}`, `Message-ID: ${messageId}`,
    'Date: Sat, 25 Oct 2026 11:00:00 +0000', 'MIME-Version: 1.0', `Content-Type: ${contentType}`, ...headers, '',
    text, '',
  ]), 'utf8');
}

const machineFor = (recipients, mta = 'dns; googlemail.com') => join([
  `Reporting-MTA: ${mta}`, 'Arrival-Date: Sat, 25 Oct 2026 03:00:00 -0700 (PDT)', '',
  ...recipients.flatMap((r) => [
    ...(r.original ? [`Original-Recipient: ${r.original}`] : []),
    ...(r.final ? [`Final-Recipient: ${r.final}`] : []),
    ...(r.action ? [`Action: ${r.action}`] : []),
    ...(r.status ? [`Status: ${r.status}`] : []),
    ...(r.diag ? [`Diagnostic-Code: ${r.diag}`] : []),
    ...(r.retry ? [`Will-Retry-Until: ${r.retry}`] : []),
    '',
  ]),
]);

/** Le varianti (lettera = come nella specifica). */
export const VARIANTS = {
  real: () => dsnMessage(),
  // a. la parte macchina come allegato, con Content-Disposition
  a: () => dsnMessage({ machineDisposition: true, messageId: '<dsn-a@mx.google.com>' }),
  // b. niente parte macchina: solo X-Failed-Recipients
  b: () => Buffer.from(join([
    'From: Mail Delivery System <Mailer-Daemon@mx.example.test>', `To: ${OPERATOR}`,
    'Subject: Mail delivery failed: returning message to sender', `X-Failed-Recipients: ${CLIENT}`,
    'Message-ID: <dsn-b@mx.example.test>', 'Date: Sat, 25 Oct 2026 10:00:03 +0000', 'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"', '',
    'This message was created automatically by mail delivery software.', '',
    'A message that you sent could not be delivered to one or more of its recipients. This is a permanent error.', '',
    `  ${CLIENT}`, '    host mx.example-mail.test [192.0.2.4]', '    SMTP error from remote mail server after RCPT TO:<' + CLIENT + '>:', '    550 5.1.1 User unknown', '',
  ]), 'utf8'),
  // c. solo il testo umano, da un demone di posta
  c: () => Buffer.from(join([
    'From: Mail Delivery Subsystem <mailer-daemon@googlemail.com>', `To: ${OPERATOR}`,
    'Subject: Delivery Status Notification (Failure)', 'Message-ID: <dsn-c@mx.google.com>',
    'Date: Sat, 25 Oct 2026 10:00:03 +0000', 'MIME-Version: 1.0', 'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: quoted-printable', '', qp(REAL_HUMAN), '',
  ]), 'utf8'),
  // d. il RITARDO: Action delayed, 4.4.1, Will-Retry-Until, «(Delay)»
  d: () => dsnMessage({
    subject: 'Delivery Status Notification (Delay)', messageId: '<dsn-d@mx.google.com>',
    human: `** Consegna non completata **\n\nSi è verificato un problema temporaneo durante il recapito del tuo messaggio a ${CLIENT}. Gmail riproverà per altre 46 ore.`,
    machine: machineFor([{ final: `rfc822; ${CLIENT}`, action: 'delayed', status: '4.4.1', diag: 'smtp; 421 4.4.1 Connection timed out', retry: 'Mon, 27 Oct 2026 03:00:00 -0700 (PDT)' }]),
  }),
  // e. più destinatari: un definitivo, un ritardo, un consegnato
  e: () => dsnMessage({
    messageId: '<dsn-e@mx.google.com>',
    machine: machineFor([
      { final: 'rfc822; gone.user@example-mail.test', action: 'failed', status: '5.1.1', diag: 'smtp; 550 5.1.1 user unknown' },
      { final: 'rfc822; full.box@example-mail.test', action: 'delayed', status: '4.2.2', diag: 'smtp; 452 4.2.2 mailbox full' },
      { final: 'rfc822; fine.user@example-mail.test', action: 'delivered', status: '2.0.0' },
    ]),
  }),
  // f. inoltro (Original ≠ Final) + xtext su Original-Recipient
  f: () => dsnMessage({
    messageId: '<dsn-f@mx.google.com>',
    machine: machineFor([
      { original: 'rfc822;old.address@forward.test', final: 'rfc822; new.address@target.test', action: 'failed', status: '5.1.1' },
      { original: 'rfc822;a+2Bb@x.test', final: 'rfc822; a+b@x.test', action: 'failed', status: '5.1.1' },
    ]),
  }),
  // g. Postfix: Undelivered Mail Returned to Sender, intestazioni dell'originale
  g: () => dsnMessage({
    from: 'MAILER-DAEMON@mx.example.test (Mail Delivery System)', subject: 'Undelivered Mail Returned to Sender',
    messageId: '<dsn-g@mx.example.test>', human: `This is the mail system at host mx.example.test.\n\nI'm sorry to have to inform you that your message could not be delivered to one or more recipients.`,
    machine: machineFor([{ final: 'rfc822; postfix.user@example-mail.test', original: 'rfc822;postfix.user@example-mail.test', action: 'failed', status: '5.1.1', diag: 'smtp; 550 5.1.1 <postfix.user@example-mail.test>: Recipient address rejected: User unknown in virtual mailbox table' }], 'dns; mx.example.test'),
    originalType: 'text/rfc822-headers', originalSubject: 'La tua visita è confermata', originalTo: 'postfix.user@example-mail.test',
  }),
  // h. Exchange 5.4.1
  h: () => dsnMessage({
    from: 'Microsoft Outlook <postmaster@outlook.example.test>', subject: 'Undeliverable: Your Full Search is booked',
    messageId: '<dsn-h@outlook.example.test>', human: 'Your message to exch.user@corp.example.test couldn\'t be delivered.',
    machine: machineFor([{ final: 'rfc822;exch.user@corp.example.test', action: 'failed', status: '5.4.1', diag: 'smtp;550 5.4.1 Recipient address rejected: Access denied. AS(201806281) [EX.PROD.OUTLOOK.example]' }], 'dns;outlook.example.test'),
  }),
  // i. 5.7.1 politica
  i: () => dsnMessage({
    messageId: '<dsn-i@mx.google.com>', human: 'Message blocked',
    machine: machineFor([{ final: 'rfc822; policy.user@strict.example.test', action: 'failed', status: '5.7.1', diag: 'smtp; 550 5.7.1 Message rejected due to local policy (DMARC)' }]),
  }),
  // j. ricevuta di lettura
  j: () => dsnMessage({ reportType: 'disposition-notification', messageId: '<mdn-j@example.invalid>', from: `Cliente <${CLIENT}>`, subject: 'Read: Your Full Search is booked', machineType: 'message/disposition-notification', machine: join(['Reporting-UA: mail.example-mail.test', `Final-Recipient: rfc822; ${CLIENT}`, 'Original-Message-ID: <orig-123@example.invalid>', 'Disposition: manual-action/MDN-sent-manually; displayed', '']) }),
  // k. risposta automatica fuori sede
  k: () => plainMessage({ from: `Cliente <${CLIENT}>`, subject: 'Fuori sede: Your Full Search is booked', text: 'Sono fuori sede fino al 3 novembre, rispondo al rientro.', headers: ['Auto-Submitted: auto-replied'], messageId: '<ooo-k@example-mail.test>' }),
  // l. il solo destinatario è l'operatore
  l: () => dsnMessage({ messageId: '<dsn-l@mx.google.com>', machine: machineFor([{ final: `rfc822; ${OPERATOR}`, action: 'failed', status: '5.1.1' }]) }),
  // m. sorgente tagliata a 256KB dentro l'originale (un PDF grande rimandato)
  m: () => dsnMessage({ messageId: '<dsn-m@mx.google.com>', originalRaw: join([
    `From: ${OPERATOR}`, `To: ${CLIENT}`, 'Subject: Your Full Search is booked', 'Message-ID: <orig-123@example.invalid>',
    'Date: Sat, 25 Oct 2026 10:00:00 +0000', 'MIME-Version: 1.0', 'Content-Type: multipart/mixed; boundary="pdf"', '',
    '--pdf', 'Content-Type: text/plain', '', 'Payment received.', '--pdf',
    'Content-Type: application/pdf; name="conferma.pdf"', 'Content-Transfer-Encoding: base64', '',
    ...Array.from({ length: 6000 }, (_, i) => 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ejAxMjM0'.slice(0, 76)),
    '--pdf--', '',
  ]) }),
  // n. message/global-delivery-status con tipo utf-8;
  n: () => dsnMessage({ messageId: '<dsn-n@mx.google.com>', machineType: 'message/global-delivery-status', machine: machineFor([{ final: 'utf-8; globale.user@example-mail.test', action: 'failed', status: '5.1.1' }]) }),
  // o. oggetto originale con <script>
  o: () => dsnMessage({ messageId: '<dsn-o@mx.google.com>', originalSubject: 'Conferma <script>alert(1)</script> & co' }),
};
