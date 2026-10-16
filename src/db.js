import { neon } from '@neondatabase/serverless';

let sql;
const db = () => (sql ??= neon(process.env.DATABASE_URL));

// Guarda el mensaje entrante. Devuelve null si Meta ya lo había enviado
// (reintento), para no responder ni registrar el pedido dos veces.
export async function saveIncoming(msg) {
  const [conv] = await db()`
    INSERT INTO conversacion (canal, usuario_id, nombre)
    VALUES (${msg.channel}, ${msg.userId}, ${msg.name})
    ON CONFLICT (canal, usuario_id) DO UPDATE
      SET nombre = COALESCE(EXCLUDED.nombre, conversacion.nombre), actualizado = now()
    RETURNING id, cliente_erp_id, estado`;
  const inserted = await db()`
    INSERT INTO mensaje (conversacion_id, direccion, meta_id, texto)
    VALUES (${conv.id}, 'entrada', ${msg.messageId}, ${msg.text})
    ON CONFLICT (meta_id) DO NOTHING
    RETURNING id`;
  return inserted.length ? conv : null;
}

export async function saveOutgoing(conversationId, text) {
  await db()`
    INSERT INTO mensaje (conversacion_id, direccion, texto)
    VALUES (${conversationId}, 'salida', ${text})`;
}

export async function saveState(conversationId, estado) {
  await db()`
    UPDATE conversacion SET estado = ${JSON.stringify(estado)}::jsonb, actualizado = now()
    WHERE id = ${conversationId}`;
}
