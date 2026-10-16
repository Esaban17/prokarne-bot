import { describe, expect, it } from 'vitest';
import { parseWebhook } from '../src/channels/parse.js';

describe('parseWebhook', () => {
  it('lee un texto de WhatsApp con el nombre del contacto', () => {
    const [m] = parseWebhook({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ field: 'messages', value: {
        contacts: [{ wa_id: '50255551234', profile: { name: 'Ana López' } }],
        messages: [{ from: '50255551234', id: 'wamid.1', timestamp: '1760000000', type: 'text', text: { body: 'quiero 3 libras de lomo' } }]
      } }] }]
    });
    expect(m).toMatchObject({ channel: 'whatsapp', userId: '50255551234', messageId: 'wamid.1', name: 'Ana López', text: 'quiero 3 libras de lomo' });
  });

  it('lee la respuesta de un botón de WhatsApp', () => {
    const [m] = parseWebhook({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ field: 'messages', value: {
        messages: [{ from: '502', id: 'wamid.2', timestamp: '1', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'confirmar', title: 'Confirmar' } } }]
      } }] }]
    });
    expect(m).toMatchObject({ text: 'Confirmar', payload: 'confirmar' });
  });

  it('ignora los avisos de entregado/leído de WhatsApp', () => {
    expect(parseWebhook({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ field: 'messages', value: { statuses: [{ id: 'wamid.1', status: 'read' }] } }] }]
    })).toEqual([]);
  });

  it('marca audios e imágenes como no soportados', () => {
    const [m] = parseWebhook({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ field: 'messages', value: { messages: [{ from: '502', id: 'wamid.3', timestamp: '1', type: 'audio' }] } }] }]
    });
    expect(m.unsupported).toBe('audio');
  });

  it('lee Messenger e ignora los echos de la página', () => {
    const msgs = parseWebhook({
      object: 'page',
      entry: [{ id: 'PAGE', messaging: [
        { sender: { id: 'PSID1' }, timestamp: 5, message: { mid: 'm1', text: 'hola' } },
        { sender: { id: 'PAGE' }, timestamp: 6, message: { mid: 'm2', text: 'eco', is_echo: true } },
        { sender: { id: 'PSID1' }, timestamp: 7, postback: { title: 'Ver catálogo', payload: 'CATALOGO', mid: 'm3' } }
      ] }]
    });
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toMatchObject({ channel: 'messenger', userId: 'PSID1', text: 'hola' });
    expect(msgs[1]).toMatchObject({ payload: 'CATALOGO', messageId: 'm3' });
  });

  it('lee Instagram', () => {
    const [m] = parseWebhook({
      object: 'instagram',
      entry: [{ id: 'IG', messaging: [{ sender: { id: 'IGSID' }, timestamp: 1, message: { mid: 'ig1', text: 'precio del lomo?' } }] }]
    });
    expect(m).toMatchObject({ channel: 'instagram', userId: 'IGSID', text: 'precio del lomo?' });
  });

  it('ignora objetos desconocidos', () => {
    expect(parseWebhook({ object: 'user' })).toEqual([]);
    expect(parseWebhook(null)).toEqual([]);
  });
});
