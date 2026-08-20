import { randomBytes } from "node:crypto";

export const config = {
  port: Number(process.env.PORT ?? 8787),
  token: process.env.WHATSAPP_TOKEN ?? "",
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
  verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? "lia-verify",
  /** Secreto de la app Meta (App Settings → Basic). Necesario para validar webhook. */
  appSecret: process.env.META_APP_SECRET ?? "",
  /**
   * Secreto compartido para las rutas internas (web → bot).
   * Si no está en env se genera uno nuevo por cada arranque.
   * Para persistirlo: exportar LIA_BOT_SECRET y usarlo en vite.config.ts como VITE_BOT_SECRET.
   */
  liaSecret: process.env.LIA_BOT_SECRET ?? randomBytes(20).toString("hex"),
  graphVersion: "v21.0",
  /** Access Token de Mercado Pago (suscripciones / webhooks) */
  mpAccessToken: process.env.MP_ACCESS_TOKEN ?? "",
  /** Links públicos de checkout (no son secretos) */
  mpCheckoutSelfUrl: process.env.MP_CHECKOUT_SELF_URL ?? "",
  mpCheckoutSetupUrl: process.env.MP_CHECKOUT_SETUP_URL ?? "",
  /** Clave secreta del webhook (MP → Notificaciones → revelar) */
  mpWebhookSecret: process.env.MP_WEBHOOK_SECRET ?? "",
  /** URL pública del webhook (para documentar / health) */
  mpWebhookPublicUrl:
    process.env.MP_WEBHOOK_PUBLIC_URL ?? "https://api.lia-estudio.com/mercadopago/webhook",
  /** back_url de retorno post-pago */
  mpBackUrlBase: process.env.MP_BACK_URL_BASE ?? "https://app.lia-estudio.com/activar",
  /** Forzar firma Meta (set REQUIRE_META_SIGNATURE=true en el server) */
  requireMetaSignature: process.env.REQUIRE_META_SIGNATURE === "true",
};

export function isConfigured() {
  return Boolean(config.token && config.phoneNumberId);
}
