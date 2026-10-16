import { describe, expect, it, vi } from 'vitest';
import { ejecutarHerramienta, responder, TOOLS } from '../src/agent.js';

const catalogo = [
  { clave: 'p10', tipo: 'pieza_carne', id: 10, nombre: 'Lomo de res', codigo: 'RF-LOM', precio: 45.5 },
  { clave: 's3', tipo: 'subproducto', id: 3, nombre: 'Carne molida', codigo: 'SB-MOL', precio: 30 }
];
const fakeErp = (over = {}) => ({
  catalogoCliente: vi.fn().mockResolvedValue(catalogo),
  buscarClientePorNit: vi.fn(),
  buscarClientePorTelefono: vi.fn(),
  registrarPedido: vi.fn().mockResolvedValue({ numero_pedido: 'PED000123', total: 136.5 }),
  ...over
});
const cliente = { cliente_id: 7, nombre: 'Carnicería La Ceiba', vendedor_id: 2 };
const run = (nombre, input, estado, erp = fakeErp()) => ejecutarHerramienta(nombre, input, { estado, erp, canal: 'whatsapp' });

describe('herramientas del bot', () => {
  it('no deja ver catálogo ni pedir sin cliente identificado', async () => {
    expect((await run('ver_catalogo', {}, {})).error).toMatch(/no identificado/);
  });

  it('identifica solo si NIT y teléfono son del mismo cliente', async () => {
    const otro = { cliente_id: 8, nombre: 'Otro' };
    const estado = {};
    expect((await run('identificar_cliente', { nit: '1', telefono: '2' }, estado,
      fakeErp({ buscarClientePorNit: vi.fn().mockResolvedValue(cliente), buscarClientePorTelefono: vi.fn().mockResolvedValue(otro) }))).error).toBeTruthy();
    expect(estado.cliente).toBeUndefined();

    await run('identificar_cliente', { nit: '1', telefono: '2' }, estado,
      fakeErp({ buscarClientePorNit: vi.fn().mockResolvedValue(cliente), buscarClientePorTelefono: vi.fn().mockResolvedValue(cliente) }));
    expect(estado.cliente).toMatchObject({ cliente_id: 7, vendedor_id: 2 });
  });

  it('filtra el catálogo por nombre', async () => {
    const r = await run('ver_catalogo', { buscar: 'lomo' }, { cliente });
    expect(r.productos).toEqual([{ clave: 'p10', nombre: 'Lomo de res', precio_por_libra: 45.5 }]);
  });

  it('rechaza productos fuera del catálogo y cantidades inválidas', async () => {
    expect((await run('agregar_al_pedido', { clave: 'p99', libras: 1 }, { cliente })).error).toBeTruthy();
    expect((await run('agregar_al_pedido', { clave: 'p10', libras: 0 }, { cliente })).error).toBeTruthy();
  });

  it('exige mostrar el resumen antes de confirmar y no confirma cambios posteriores', async () => {
    const erp = fakeErp();
    const estado = { cliente };
    await run('agregar_al_pedido', { clave: 'p10', libras: 3 }, estado, erp);
    expect((await run('confirmar_pedido', { fecha_entrega: '2026-10-17' }, estado, erp)).error).toMatch(/resumen/);

    const resumen = await run('ver_pedido', {}, estado, erp);
    expect(resumen.total_estimado).toBe('Q136.50');

    await run('agregar_al_pedido', { clave: 's3', libras: 2 }, estado, erp);
    expect((await run('confirmar_pedido', { fecha_entrega: '2026-10-17' }, estado, erp)).error).toMatch(/cambió/);
    expect(erp.registrarPedido).not.toHaveBeenCalled();
  });

  it('registra el pedido en el ERP y vacía el carrito', async () => {
    const erp = fakeErp();
    const estado = { cliente };
    await run('agregar_al_pedido', { clave: 'p10', libras: 3, magra: true }, estado, erp);
    await run('ver_pedido', {}, estado, erp);
    const r = await run('confirmar_pedido', { fecha_entrega: '2026-10-17', observaciones: 'Entregar por la tarde' }, estado, erp);
    expect(r).toMatchObject({ ok: true, numero_pedido: 'PED000123' });
    expect(erp.registrarPedido).toHaveBeenCalledWith(expect.objectContaining({
      cliente,
      fecha_entrega_programada: '2026-10-17',
      lineas: [expect.objectContaining({ tipo: 'pieza_carne', id: 10, cantidad: 3, es_magra: true })]
    }));
    expect(estado.carrito).toEqual([]);
    expect(estado.pedido_confirmado).toBe('PED000123');
  });

  it('devuelve el rechazo del ERP como error para el asistente', async () => {
    const erp = fakeErp({ registrarPedido: vi.fn().mockRejectedValue(new Error('El pedido excede el límite de crédito')) });
    const estado = { cliente };
    await run('agregar_al_pedido', { clave: 'p10', libras: 3 }, estado, erp);
    await run('ver_pedido', {}, estado, erp);
    expect((await run('confirmar_pedido', { fecha_entrega: '2026-10-17' }, estado, erp)).error).toMatch(/límite de crédito/);
    expect(estado.carrito).toHaveLength(1);
  });

  it('todas las herramientas son estrictas', () => {
    for (const t of TOOLS) {
      expect(t.strict).toBe(true);
      expect(t.input_schema.additionalProperties).toBe(false);
    }
  });
});

describe('responder', () => {
  it('ejecuta herramientas y devuelve el texto final, agregando la historia sin editarla', async () => {
    const create = vi.fn()
      .mockResolvedValueOnce({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'ver_catalogo', input: { buscar: 'lomo' } }] })
      .mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'El lomo está a Q45.50 la libra.' }] });
    const estado = { cliente };
    const texto = await responder({ texto: '¿precio del lomo?', canal: 'whatsapp', estado, erp: fakeErp(), client: { beta: { messages: { create } } } });

    expect(texto).toBe('El lomo está a Q45.50 la libra.');
    expect(estado.historial.map(m => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(estado.historial[0].content).toMatch(/^\[contexto\].*Carnicería La Ceiba[\s\S]*¿precio del lomo\?$/);
    const req = create.mock.calls[0][0];
    expect(req).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default', betas: ['server-side-fallback-2026-07-01'] });
  });

  it('pasa a un vendedor si Claude rechaza el mensaje', async () => {
    const create = vi.fn().mockResolvedValue({ stop_reason: 'refusal', content: [] });
    const estado = {};
    const texto = await responder({ texto: 'x', canal: 'messenger', estado, erp: fakeErp(), client: { beta: { messages: { create } } } });
    expect(texto).toMatch(/vendedores/);
    expect(estado.humano).toBeTruthy();
  });
});
