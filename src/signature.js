import { createHmac, timingSafeEqual } from 'node:crypto';

// Meta firma cada POST del webhook con el App Secret (header X-Hub-Signature-256).
// Sin esta validación cualquiera podría mandar pedidos falsos al bot.
export function isValidSignature(rawBody, header, appSecret) {
  if (!appSecret || typeof header !== 'string' || !header.startsWith('sha256=')) return false;
  const expected = Buffer.from(
    'sha256=' + createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')
  );
  const received = Buffer.from(header);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
