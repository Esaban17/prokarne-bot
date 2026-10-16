-- Una conversación por persona y canal.
CREATE TABLE IF NOT EXISTS conversacion (
  id             SERIAL PRIMARY KEY,
  canal          TEXT NOT NULL CHECK (canal IN ('whatsapp', 'messenger', 'instagram')),
  usuario_id     TEXT NOT NULL,          -- número de WhatsApp o id de Messenger/Instagram
  nombre         TEXT,
  cliente_erp_id INTEGER,                -- cliente del ERP, cuando se identifica
  estado         JSONB NOT NULL DEFAULT '{}'::jsonb,  -- carrito y paso del flujo
  creado         TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (canal, usuario_id)
);

CREATE TABLE IF NOT EXISTS mensaje (
  id              BIGSERIAL PRIMARY KEY,
  conversacion_id INTEGER NOT NULL REFERENCES conversacion(id) ON DELETE CASCADE,
  direccion       TEXT NOT NULL CHECK (direccion IN ('entrada', 'salida')),
  meta_id         TEXT UNIQUE,           -- id de Meta; evita procesar dos veces un reintento
  texto           TEXT,
  creado          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mensaje_conversacion_idx ON mensaje (conversacion_id, creado);
