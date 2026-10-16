export default { createTransport: () => ({ sendMail: async mail => {
  globalThis.deliveryMailAttempts.push(mail);
  await globalThis.deliverySmtp?.(mail);
  globalThis.deliveryMails.push(mail);
  return { messageId: 'synthetic-' + globalThis.deliveryMails.length };
} }) };
