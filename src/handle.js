import { responder, resumirCliente } from './agent.js';
import { sendText } from './channels/send.js';
import { saveIncoming, saveOutgoing, saveState } from './db.js';
import { createErp } from './erp.js';

// Tras 12 h sin mensajes la conversación con Claude empieza de cero (se
// conserva el cliente identificado). Así la historia nunca se recorta.
const SESION_MS = 12 * 60 * 60 * 1000;

let erp;
const getErp = () => (erp ??= createErp());

export async function handleMessage(msg, deps = {}) {
  const { save = saveIncoming, out = saveOutgoing, state = saveState, send = sendText, agent = responder, erpClient = getErp() } = deps;

  const conv = await save(msg);
  if (!conv) return; // reintento de Meta, ya atendido

  const estado = conv.estado ?? {};
  // Con un vendedor a cargo el bot solo guarda los mensajes.
  if (estado.humano) return;

  if (!estado.ultimo || Date.now() - estado.ultimo > SESION_MS || estado.pedido_confirmado) {
    estado.historial = [];
    estado.carrito = [];
    estado.resumen_mostrado = false;
    delete estado.pedido_confirmado;
  }
  estado.ultimo = Date.now();

  // En WhatsApp el número identifica al cliente; en Messenger e Instagram no
  // hay teléfono y el bot lo pide.
  if (!estado.cliente && msg.channel === 'whatsapp') {
    const cliente = await erpClient.buscarClientePorTelefono(msg.userId).catch(err => {
      console.error('ERP no disponible al identificar cliente:', err.message);
      return null;
    });
    if (cliente) estado.cliente = resumirCliente(cliente);
  }

  let texto;
  if (msg.unsupported) {
    texto = 'Por ahora solo puedo leer mensajes de texto. ¿Me escribes lo que necesitas?';
  } else {
    try {
      texto = await agent({ texto: msg.text, canal: msg.channel, estado, erp: erpClient });
    } catch (err) {
      console.error('Error del asistente:', err);
      texto = 'Disculpa, tuve un problema para procesar tu mensaje. ¿Me lo puedes repetir en un momento?';
    }
  }

  await state(conv.id, estado);
  if (texto) {
    await send(msg.channel, msg.userId, texto);
    await out(conv.id, texto);
  }
}
