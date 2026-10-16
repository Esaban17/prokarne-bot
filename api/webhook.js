import { waitUntil } from '@vercel/functions';
import { parseWebhook } from '../src/channels/parse.js';
import { isValidSignature } from '../src/signature.js';
import { handleMessage } from '../src/handle.js';

// Meta llama a este GET una sola vez, al registrar la URL del webhook.
export function GET(request) {
  const params = new URL(request.url).searchParams;
  if (
    params.get('hub.mode') === 'subscribe' &&
    process.env.META_VERIFY_TOKEN &&
    params.get('hub.verify_token') === process.env.META_VERIFY_TOKEN
  ) {
    return new Response(params.get('hub.challenge'), { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

// Mensajes entrantes de WhatsApp, Messenger e Instagram.
export async function POST(request) {
  const raw = await request.text();
  if (!isValidSignature(raw, request.headers.get('x-hub-signature-256'), process.env.META_APP_SECRET)) {
    return new Response('Invalid signature', { status: 401 });
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  // Meta reintenta si no recibe 200 rápido, así que se responde de inmediato
  // y los mensajes se procesan después.
  const messages = parseWebhook(body);
  waitUntil(
    Promise.all(
      messages.map(m =>
        handleMessage(m).catch(err => console.error(`Error ${m.channel} ${m.messageId}:`, err))
      )
    )
  );
  return new Response('EVENT_RECEIVED', { status: 200 });
}
