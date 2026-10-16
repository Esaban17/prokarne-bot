// Decide qué responder. En el paso 1 solo saluda; en el paso 2 aquí van
// el catálogo, el carrito y la confirmación del pedido en el ERP.

export function reply(msg) {
  if (msg.unsupported) {
    return 'Por ahora solo puedo leer mensajes de texto. ¿Me escribes lo que necesitas?';
  }
  const nombre = msg.name ? ` ${msg.name.split(' ')[0]}` : '';
  return `¡Hola${nombre}! Soy el asistente de ventas de Prokarne. ` +
    'Muy pronto podrás ver el catálogo y hacer tu pedido por aquí.';
}
