// Envía texto de vuelta por el mismo canal por el que escribió la persona.

const graph = path =>
  `https://graph.facebook.com/${process.env.GRAPH_API_VERSION || 'v23.0'}/${path}`;

export function buildSendRequest(channel, userId, text, env = process.env) {
  if (channel === 'whatsapp') {
    return {
      url: graph(`${env.WHATSAPP_PHONE_NUMBER_ID}/messages`),
      token: env.WHATSAPP_TOKEN,
      body: {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: userId,
        type: 'text',
        text: { body: text }
      }
    };
  }
  if (channel === 'messenger' || channel === 'instagram') {
    // Instagram se responde a través de la página de Facebook vinculada.
    return {
      url: graph(`${env.FB_PAGE_ID}/messages`),
      token: env.FB_PAGE_TOKEN,
      body: {
        recipient: { id: userId },
        messaging_type: 'RESPONSE',
        message: { text }
      }
    };
  }
  throw new Error(`Canal desconocido: ${channel}`);
}

export async function sendText(channel, userId, text) {
  const { url, token, body } = buildSendRequest(channel, userId, text);
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    throw new Error(`Meta ${channel} ${res.status}: ${await res.text()}`);
  }
  return res.json();
}
