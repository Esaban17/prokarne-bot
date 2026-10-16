# Prokarne Bot

Bot de ventas de Prokarne Guatemala para **WhatsApp, Instagram y Facebook Messenger**.
Muestra el catálogo con los precios de cada cliente, arma el pedido y lo registra en el
ERP como si fuera un vendedor.

Un solo webhook (`/api/webhook`) recibe los tres canales; `src/channels/parse.js` los
convierte al mismo formato y `src/bot.js` decide qué responder.

| Pieza | Dónde |
|---|---|
| Servidor | Vercel (funciones Node) |
| Base de datos | Neon Postgres (Marketplace de Vercel) |
| Mensajería | Meta Graph API: WhatsApp Cloud API y Messenger Platform |
| Pedidos y precios | API del ERP Prokarne, con un usuario de rol "Bot WhatsApp" |

## Configuración

Copia `.env.example` y llena las variables en Vercel (Settings > Environment Variables).

### 1. App de Meta
1. En [developers.facebook.com](https://developers.facebook.com/apps) crea una app de tipo **Empresa**.
2. Agrega el producto **WhatsApp**. En *API Setup* Meta te da un número de prueba gratis:
   copia el *Phone number ID* (`WHATSAPP_PHONE_NUMBER_ID`) y agrega hasta 5 teléfonos
   destinatarios para probar.
3. Para un token que no venza, en Business Settings crea un **usuario del sistema** con
   permisos `whatsapp_business_messaging` y `whatsapp_business_management`, y genera su
   token (`WHATSAPP_TOKEN`). El token temporal de *API Setup* dura 24 horas.
4. En *App settings > Basic* copia el **App secret** (`META_APP_SECRET`).

### 2. Messenger e Instagram
1. Necesitas una página de Facebook de Prokarne y una cuenta de Instagram profesional
   vinculada a esa página.
2. Agrega los productos **Messenger** e **Instagram** a la misma app, conecta la página y
   genera el token de la página (`FB_PAGE_TOKEN`); el id de la página es `FB_PAGE_ID`.
3. Mientras la app esté en modo desarrollo, solo responden las cuentas con rol en la app
   (administradores y testers). Para el público hay que pasar la revisión de Meta.

### 3. Webhook
En cada producto (WhatsApp, Messenger, Instagram) configura:
- **Callback URL:** `https://<tu-proyecto>.vercel.app/api/webhook`
- **Verify token:** el valor de `META_VERIFY_TOKEN` (cualquier texto que tú inventes)
- **Suscripciones:** `messages` (WhatsApp) y `messages`, `messaging_postbacks` (Messenger e Instagram)

### 4. Usuario del bot en el ERP
1. Crea un rol **"Bot WhatsApp"** con solo el módulo **pedidos**. No uses el rol "vendedor":
   el ERP limitaría al bot a los clientes de un solo vendedor.
2. Crea un usuario con ese rol, cambia su contraseña inicial y pon `ERP_USER` / `ERP_PASSWORD`.
3. Los pedidos quedan a nombre del vendedor asignado a cada cliente. Para clientes sin
   vendedor, pon en `ERP_VENDEDOR_ID` el empleado que debe recibirlos.

### 5. Base de datos
Conecta Neon desde Vercel > Storage. Luego, con `DATABASE_URL` en tu entorno:

```bash
npm install
npm run db:migrate
```

## Cómo conversa

- En WhatsApp reconoce al cliente por su número (últimos 8 dígitos contra `cliente.telefono`).
  En Messenger e Instagram le pide NIT y teléfono, y ambos deben ser del mismo cliente.
- Muestra el catálogo con los precios vigentes del cliente, arma el pedido en libras, enseña
  el resumen y solo registra en el ERP cuando el cliente confirma ese resumen.
- Pasa la conversación a un vendedor cuando lo piden, hay un reclamo o no logra resolver.
  Desde ese momento el bot deja de responder en esa conversación.
- Claude (`claude-opus-5-5`) interpreta los mensajes; las reglas de precios, crédito y
  existencias las sigue aplicando el ERP.

## Desarrollo

```bash
npm test
# Conversar con el bot en la terminal (catálogo de demostración, sin Meta):
ANTHROPIC_API_KEY=... node scripts/chat.js
```
