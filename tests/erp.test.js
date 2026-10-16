import { describe, expect, it, vi } from 'vitest';
import { createErp } from '../src/erp.js';

const json = (status, body) => ({ ok: status < 400, status, json: async () => body });

function fakeFetch(routes) {
  return vi.fn(async (url, opts) => {
    const path = url.replace('https://erp/api', '');
    const handler = routes[`${opts.method} ${path}`];
    if (!handler) throw new Error(`ruta no simulada: ${opts.method} ${path}`);
    return handler(opts);
  });
}

const base = { baseUrl: 'https://erp/api', username: 'bot', password: 'x' };

describe('cliente del ERP', () => {
  it('entra, busca clientes por los últimos 8 dígitos del teléfono y por NIT', async () => {
    const fetchFn = fakeFetch({
      'POST /auth/login': () => json(200, { success: true, token: 'T' }),
      'GET /cliente': opts => {
        expect(opts.headers.Authorization).toBe('Bearer T');
        return json(200, { success: true, data: [{ cliente_id: 1, telefono: '55551234', nit: '1234567-8' }] });
      }
    });
    const erp = createErp({ ...base, fetchFn });
    expect((await erp.buscarClientePorTelefono('50255551234')).cliente_id).toBe(1);
    expect((await erp.buscarClientePorNit('12345678')).cliente_id).toBe(1);
    expect(await erp.buscarClientePorTelefono('50299998888')).toBeNull();
    // login una vez, clientes en caché
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('vuelve a entrar cuando el token venció', async () => {
    let n = 0;
    const fetchFn = fakeFetch({
      'POST /auth/login': () => json(200, { token: `T${++n}` }),
      'GET /cliente': opts => opts.headers.Authorization === 'Bearer T1'
        ? json(401, { success: false })
        : json(200, { success: true, data: [] })
    });
    await createErp({ ...base, fetchFn }).buscarClientePorTelefono('55551234');
    expect(n).toBe(2);
  });

  it('arma el catálogo con un precio por producto y omite productos inactivos', async () => {
    const fetchFn = fakeFetch({
      'POST /auth/login': () => json(200, { token: 'T' }),
      'GET /producto': () => json(200, { success: true, data: [{ producto_id: 10, tipo_carnico: 'pieza' }, { producto_id: 11, tipo_carnico: 'procesado' }] }),
      'GET /precios-cliente/vigentes/7': () => json(200, { success: true, data: [
        { producto_id: 10, tipo_item: 'producto', precio_final: 46, producto: { nombre: 'Lomo', codigo: 'RF1' } },
        { producto_id: 10, tipo_item: 'producto', precio_final: 40, producto: { nombre: 'Lomo', codigo: 'RF1' } },
        { producto_id: 11, tipo_item: 'producto', precio_final: 20, producto: { nombre: 'Chorizo', codigo: 'PR1' } },
        { producto_id: 99, tipo_item: 'producto', precio_final: 5, producto: { nombre: 'Inactivo' } },
        { subproducto_id: 3, tipo_item: 'subproducto', precio_final: 30, subproducto: { nombre: 'Molida', codigo: 'SB1' } }
      ] })
    });
    const items = await createErp({ ...base, fetchFn }).catalogoCliente(7);
    expect(items.map(i => [i.clave, i.tipo, i.precio])).toEqual([
      ['p11', 'producto', 20], ['p10', 'pieza_carne', 46], ['s3', 'subproducto', 30]
    ]);
  });

  it('registra el pedido con el vendedor del cliente y el formato del ERP', async () => {
    const fetchFn = fakeFetch({
      'POST /auth/login': () => json(200, { token: 'T' }),
      'POST /pedidos/registrar-con-precios': opts => json(201, { success: true, data: { numero_pedido: 'PED1', body: JSON.parse(opts.body) } })
    });
    const r = await createErp({ ...base, fetchFn }).registrarPedido({
      cliente: { cliente_id: 7, vendedor_id: 2 },
      lineas: [{ tipo: 'pieza_carne', id: 10, cantidad: 3, es_magra: true }, { tipo: 'subproducto', id: 3, cantidad: 2 }],
      fecha_entrega_programada: '2026-10-17',
      observaciones: 'x'
    });
    expect(r.body).toEqual({
      cliente_id: 7, vendedor_id: 2, fecha_entrega_programada: '2026-10-17', observaciones: 'x',
      detalles: [
        { tipo: 'pieza_carne', producto_id: 10, cantidad: 3, es_magra: true },
        { tipo: 'subproducto', subproducto_id: 3, cantidad: 2 }
      ]
    });
  });

  it('propaga el mensaje del ERP cuando rechaza el pedido', async () => {
    const fetchFn = fakeFetch({
      'POST /auth/login': () => json(200, { token: 'T' }),
      'POST /pedidos/registrar-con-precios': () => json(422, { success: false, code: 'LIMITE_CREDITO_EXCEDIDO', message: 'Excede el límite de crédito' })
    });
    await expect(createErp({ ...base, fetchFn }).registrarPedido({ cliente: { cliente_id: 7, vendedor_id: 2 }, lineas: [] }))
      .rejects.toMatchObject({ status: 422, code: 'LIMITE_CREDITO_EXCEDIDO' });
  });
});
