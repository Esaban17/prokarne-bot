// Cliente de la API del ERP Prokarne. Entra con el usuario del rol
// "Bot WhatsApp" (solo módulo `pedidos`) y renueva el token cuando vence.
//
// Rutas usadas (todas bajo /api, ver prokarne-erp-backend/src/routes):
//   POST /auth/login                          -> token JWT (24 h)
//   GET  /cliente                             -> clientes activos
//   GET  /producto                            -> productos activos (tipo_carnico)
//   GET  /precios-cliente/vigentes/:clienteId -> precios negociados del cliente
//   POST /pedidos/registrar-con-precios       -> crea el pedido

const CACHE_MS = 5 * 60 * 1000;

export class ErpError extends Error {
  constructor(status, body) {
    super(body?.message || `ERP respondió ${status}`);
    this.status = status;
    this.code = body?.code;
    this.data = body?.data;
  }
}

export function createErp({
  baseUrl = process.env.ERP_API_URL,
  username = process.env.ERP_USER,
  password = process.env.ERP_PASSWORD,
  fetchFn = globalThis.fetch,
  now = () => Date.now()
} = {}) {
  let token = null;
  const cache = new Map();

  async function login() {
    const res = await fetchFn(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const body = await res.json().catch(() => ({}));
    // Si el usuario aún debe cambiar su contraseña inicial, el ERP no da token.
    if (!res.ok || !body.token) throw new ErpError(res.status, body);
    token = body.token;
  }

  async function request(method, path, payload, retried = false) {
    if (!token) await login();
    const res = await fetchFn(`${baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: payload ? JSON.stringify(payload) : undefined
    });
    if (res.status === 401 && !retried) {
      token = null;
      return request(method, path, payload, true);
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.success === false) throw new ErpError(res.status, body);
    return body.data;
  }

  async function cached(key, load) {
    const hit = cache.get(key);
    if (hit && now() - hit.at < CACHE_MS) return hit.value;
    const value = await load();
    cache.set(key, { at: now(), value });
    return value;
  }

  const clientes = () => cached('clientes', () => request('GET', '/cliente'));
  const productos = () => cached('productos', () => request('GET', '/producto'));

  return {
    // Guatemala usa 8 dígitos; WhatsApp manda el número con 502 al frente.
    async buscarClientePorTelefono(telefono) {
      const ultimos8 = String(telefono).replace(/\D/g, '').slice(-8);
      if (ultimos8.length < 8) return null;
      const lista = await clientes();
      return lista.find(c => String(c.telefono ?? '').replace(/\D/g, '').slice(-8) === ultimos8) ?? null;
    },

    async buscarClientePorNit(nit) {
      const limpio = String(nit).replace(/[^0-9a-z]/gi, '').toUpperCase();
      if (!limpio) return null;
      const lista = await clientes();
      return lista.find(c => String(c.nit ?? '').replace(/[^0-9a-z]/gi, '').toUpperCase() === limpio) ?? null;
    },

    // Catálogo del cliente = sus precios vigentes, uno por producto (el más
    // reciente gana, la API ya los devuelve ordenados por creado_en desc).
    async catalogoCliente(clienteId) {
      const [precios, prods] = await Promise.all([
        cached(`precios:${clienteId}`, () => request('GET', `/precios-cliente/vigentes/${clienteId}`)),
        productos()
      ]);
      const tipoCarnico = new Map(prods.map(p => [p.producto_id, p.tipo_carnico]));
      const vistos = new Set();
      const items = [];
      for (const p of precios) {
        const esSub = p.tipo_item === 'subproducto' || (p.subproducto_id && !p.producto_id);
        const id = esSub ? p.subproducto_id : p.producto_id;
        const key = `${esSub ? 's' : 'p'}${id}`;
        if (!id || vistos.has(key)) continue;
        // Un producto inactivo no aparece en /producto: no se ofrece.
        if (!esSub && !tipoCarnico.has(id)) continue;
        vistos.add(key);
        const item = esSub ? p.subproducto : p.producto;
        items.push({
          clave: key,
          tipo: esSub ? 'subproducto' : tipoCarnico.get(id) === 'pieza' ? 'pieza_carne' : 'producto',
          id,
          nombre: item?.nombre ?? `Producto ${id}`,
          codigo: item?.codigo ?? null,
          precio: p.precio_final
        });
      }
      return items.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    },

    // El pedido queda a nombre del vendedor asignado al cliente; si no tiene,
    // al empleado configurado para el bot (ERP_VENDEDOR_ID).
    async registrarPedido({ cliente, lineas, fecha_entrega_programada, observaciones }) {
      const vendedor_id = cliente.vendedor_id ?? cliente.empleado?.empleado_id ?? process.env.ERP_VENDEDOR_ID;
      if (!vendedor_id) throw new ErpError(400, { message: 'El cliente no tiene vendedor y falta ERP_VENDEDOR_ID' });
      return request('POST', '/pedidos/registrar-con-precios', {
        cliente_id: cliente.cliente_id,
        vendedor_id: Number(vendedor_id),
        fecha_entrega_programada,
        observaciones,
        detalles: lineas.map(l =>
          l.tipo === 'subproducto'
            ? { tipo: 'subproducto', subproducto_id: l.id, cantidad: l.cantidad }
            : { tipo: l.tipo, producto_id: l.id, cantidad: l.cantidad, es_magra: !!l.es_magra }
        )
      });
    }
  };
}
