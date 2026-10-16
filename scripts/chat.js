// Prueba el bot en la terminal, sin Meta ni base de datos.
//   ANTHROPIC_API_KEY=... node scripts/chat.js            -> ERP de demostración
//   ANTHROPIC_API_KEY=... ERP_API_URL=... ERP_USER=... ERP_PASSWORD=... \
//     node scripts/chat.js 50255551234                    -> ERP real, como ese número
import readline from 'node:readline/promises';
import { responder, resumirCliente } from '../src/agent.js';
import { createErp } from '../src/erp.js';

const demoCliente = { cliente_id: 1, nombre: 'Cliente de prueba', vendedor_id: 1 };
const demoErp = {
  buscarClientePorTelefono: async () => demoCliente,
  buscarClientePorNit: async () => demoCliente,
  catalogoCliente: async () => [
    { clave: 'p1', tipo: 'pieza_carne', id: 1, nombre: 'Lomo de res', precio: 45.5 },
    { clave: 'p2', tipo: 'pieza_carne', id: 2, nombre: 'Puyazo', precio: 52 },
    { clave: 'p3', tipo: 'pieza_carne', id: 3, nombre: 'Costilla de cerdo', precio: 28.75 },
    { clave: 's1', tipo: 'subproducto', id: 1, nombre: 'Carne molida especial', precio: 31 }
  ],
  registrarPedido: async ({ lineas }) => ({
    numero_pedido: 'PED-DEMO',
    total: lineas.reduce((s, l) => s + l.precio * l.cantidad, 0)
  })
};

const telefono = process.argv[2] ?? '50200000000';
const erp = process.env.ERP_API_URL ? createErp() : demoErp;
const estado = {};
const cliente = await erp.buscarClientePorTelefono(telefono);
if (cliente) estado.cliente = resumirCliente(cliente);
console.log(estado.cliente ? `Cliente: ${estado.cliente.nombre}` : 'Cliente no identificado', '(Ctrl+C para salir)\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
for (;;) {
  const texto = await rl.question('Tú: ');
  console.log(`\nBot: ${await responder({ texto, canal: 'whatsapp', estado, erp })}\n`);
  if (estado.humano) { console.log(`[Pasado a vendedor: ${estado.humano.motivo}]`); break; }
}
rl.close();
