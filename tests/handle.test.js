import { describe, expect, it, vi } from 'vitest';
import { handleMessage } from '../src/handle.js';

const msg = { channel: 'whatsapp', userId: '50255551234', messageId: 'w1', text: 'hola' };
const deps = (conv, over = {}) => ({
  save: vi.fn().mockResolvedValue(conv),
  out: vi.fn(), state: vi.fn(), send: vi.fn(),
  agent: vi.fn().mockResolvedValue('¡Hola!'),
  erpClient: { buscarClientePorTelefono: vi.fn().mockResolvedValue({ cliente_id: 7, nombre: 'La Ceiba', vendedor_id: 2 }) },
  ...over
});

describe('handleMessage', () => {
  it('ignora reintentos de Meta', async () => {
    const d = deps(null);
    await handleMessage(msg, d);
    expect(d.send).not.toHaveBeenCalled();
  });

  it('identifica al cliente por su número de WhatsApp y responde', async () => {
    const d = deps({ id: 1, estado: {} });
    await handleMessage(msg, d);
    expect(d.agent.mock.calls[0][0].estado.cliente).toMatchObject({ cliente_id: 7 });
    expect(d.send).toHaveBeenCalledWith('whatsapp', '50255551234', '¡Hola!');
    expect(d.state).toHaveBeenCalled();
  });

  it('no responde cuando un vendedor tomó la conversación', async () => {
    const d = deps({ id: 1, estado: { humano: { motivo: 'reclamo' } } });
    await handleMessage(msg, d);
    expect(d.agent).not.toHaveBeenCalled();
    expect(d.send).not.toHaveBeenCalled();
  });

  it('empieza una conversación nueva después de un pedido confirmado', async () => {
    const d = deps({ id: 1, estado: { ultimo: Date.now(), pedido_confirmado: 'PED1', historial: [{ role: 'user', content: 'x' }], cliente: { cliente_id: 7 } } });
    await handleMessage(msg, d);
    const estado = d.agent.mock.calls[0][0].estado;
    expect(estado.historial).toEqual([]);
    expect(estado.cliente.cliente_id).toBe(7);
  });

  it('pide texto cuando llega un audio', async () => {
    const d = deps({ id: 1, estado: {} });
    await handleMessage({ ...msg, text: null, unsupported: 'audio' }, d);
    expect(d.agent).not.toHaveBeenCalled();
    expect(d.send.mock.calls[0][2]).toMatch(/solo puedo leer/);
  });
});
