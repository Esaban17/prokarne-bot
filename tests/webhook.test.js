import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@vercel/functions', () => ({ waitUntil: p => p }));
const handleMessage = vi.fn().mockResolvedValue();
vi.mock('../src/handle.js', () => ({ handleMessage: (...a) => handleMessage(...a) }));

const { GET, POST } = await import('../api/webhook.js');
const { isValidSignature } = await import('../src/signature.js');
const { buildSendRequest } = await import('../src/channels/send.js');

const sign = body => 'sha256=' + createHmac('sha256', 'secreto').update(body).digest('hex');

beforeEach(() => {
  process.env.META_VERIFY_TOKEN = 'mi-token';
  process.env.META_APP_SECRET = 'secreto';
  handleMessage.mockClear();
});

describe('GET /api/webhook', () => {
  it('devuelve el challenge con el token correcto', async () => {
    const res = GET(new Request('https://x/api/webhook?hub.mode=subscribe&hub.verify_token=mi-token&hub.challenge=123'));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('123');
  });

  it('rechaza un token incorrecto', () => {
    expect(GET(new Request('https://x/api/webhook?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=1')).status).toBe(403);
  });
});

describe('POST /api/webhook', () => {
  const body = JSON.stringify({
    object: 'page',
    entry: [{ messaging: [{ sender: { id: 'u1' }, timestamp: 1, message: { mid: 'm1', text: 'hola' } }] }]
  });

  it('procesa un mensaje firmado por Meta', async () => {
    const res = await POST(new Request('https://x/api/webhook', { method: 'POST', body, headers: { 'x-hub-signature-256': sign(body) } }));
    expect(res.status).toBe(200);
    expect(handleMessage).toHaveBeenCalledWith(expect.objectContaining({ channel: 'messenger', text: 'hola' }));
  });

  it('rechaza un mensaje sin firma válida', async () => {
    const res = await POST(new Request('https://x/api/webhook', { method: 'POST', body, headers: { 'x-hub-signature-256': 'sha256=00' } }));
    expect(res.status).toBe(401);
    expect(handleMessage).not.toHaveBeenCalled();
  });
});

describe('isValidSignature', () => {
  it('falla sin app secret', () => {
    expect(isValidSignature('x', sign('x'), '')).toBe(false);
  });
});

describe('buildSendRequest', () => {
  const env = { WHATSAPP_PHONE_NUMBER_ID: 'PN', WHATSAPP_TOKEN: 'wt', FB_PAGE_ID: 'PG', FB_PAGE_TOKEN: 'pt' };

  it('arma el envío de WhatsApp', () => {
    const r = buildSendRequest('whatsapp', '502', 'hola', env);
    expect(r.url).toMatch(/\/PN\/messages$/);
    expect(r.body).toMatchObject({ messaging_product: 'whatsapp', to: '502', text: { body: 'hola' } });
  });

  it('usa la página de Facebook para Messenger e Instagram', () => {
    for (const ch of ['messenger', 'instagram']) {
      const r = buildSendRequest(ch, 'id1', 'hola', env);
      expect(r.url).toMatch(/\/PG\/messages$/);
      expect(r.token).toBe('pt');
      expect(r.body.recipient.id).toBe('id1');
    }
  });
});
