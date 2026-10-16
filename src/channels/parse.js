// Convierte el webhook de Meta (WhatsApp, Messenger o Instagram) en una lista
// de mensajes con la misma forma, para que el bot no dependa del canal.
//
// { channel, userId, messageId, text, payload, name, timestamp }
//   - text:    lo que escribió la persona (o el título del botón que tocó)
//   - payload: id del botón o de la opción de lista, si tocó uno

export function parseWebhook(body) {
  if (!body || typeof body !== 'object') return [];
  switch (body.object) {
    case 'whatsapp_business_account':
      return parseWhatsApp(body);
    case 'page':
      return parseMessaging(body, 'messenger');
    case 'instagram':
      return parseMessaging(body, 'instagram');
    default:
      return [];
  }
}

function parseWhatsApp(body) {
  const out = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue;
      const value = change.value ?? {};
      const names = new Map((value.contacts ?? []).map(c => [c.wa_id, c.profile?.name]));
      // `statuses` (entregado, leído) llegan sin `messages` y se ignoran.
      for (const m of value.messages ?? []) {
        const base = {
          channel: 'whatsapp',
          userId: m.from,
          messageId: m.id,
          name: names.get(m.from) ?? null,
          timestamp: Number(m.timestamp) * 1000 || Date.now(),
          text: null,
          payload: null
        };
        if (m.type === 'text') {
          out.push({ ...base, text: m.text?.body ?? '' });
        } else if (m.type === 'interactive') {
          const reply = m.interactive?.button_reply ?? m.interactive?.list_reply;
          if (reply) out.push({ ...base, text: reply.title, payload: reply.id });
        } else if (m.type === 'button') {
          out.push({ ...base, text: m.button?.text ?? '', payload: m.button?.payload ?? null });
        } else {
          // Audio, imagen, ubicación, etc.: el bot responde que solo entiende texto.
          out.push({ ...base, text: null, unsupported: m.type });
        }
      }
    }
  }
  return out;
}

function parseMessaging(body, channel) {
  const out = [];
  for (const entry of body.entry ?? []) {
    for (const ev of entry.messaging ?? []) {
      const base = {
        channel,
        userId: ev.sender?.id,
        name: null,
        timestamp: ev.timestamp ?? Date.now(),
        text: null,
        payload: null
      };
      if (ev.message) {
        // Los mensajes que envía la propia página regresan como "echo".
        if (ev.message.is_echo) continue;
        const m = ev.message;
        if (m.quick_reply) {
          out.push({ ...base, messageId: m.mid, text: m.text ?? '', payload: m.quick_reply.payload });
        } else if (typeof m.text === 'string') {
          out.push({ ...base, messageId: m.mid, text: m.text });
        } else {
          out.push({ ...base, messageId: m.mid, unsupported: m.attachments?.[0]?.type ?? 'unknown' });
        }
      } else if (ev.postback) {
        out.push({
          ...base,
          messageId: ev.postback.mid ?? `postback-${ev.sender?.id}-${ev.timestamp}`,
          text: ev.postback.title ?? '',
          payload: ev.postback.payload ?? null
        });
      }
    }
  }
  return out.filter(m => m.userId && m.messageId);
}
