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

### 4. Base de datos
Conecta Neon desde Vercel > Storage. Luego, con `DATABASE_URL` en tu entorno:

```bash
npm install
npm run db:migrate
```

## Desarrollo

```bash
npm test
```
