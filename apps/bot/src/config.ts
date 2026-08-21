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
  /** Public Key (Brick en el front — no es secreto de API) */
  mpPublicKey: process.env.MP_PUBLIC_KEY ?? "",
  /** Tipo de cambio ARS por 1 USD (cobro fijo: 49×TC / 149×TC) */
  mpUsdArsRate: Number(process.env.MP_USD_ARS_RATE ?? 1550),
  /**
   * Override ARS para prueba real en MP (ej. 10 y 20).
   * Si están vacíos → 49×TC / 149×TC.
   */
  mpArsSelf: process.env.MP_ARS_SELF ? Number(process.env.MP_ARS_SELF) : undefined,
  mpArsSetup: process.env.MP_ARS_SETUP ? Number(process.env.MP_ARS_SETUP) : undefined,
  /** Links públicos de checkout (legacy; Brick es el camino principal) */
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
  /** Resend API key para OTP por email */
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  /** Remitente Resend (dominio verificado) */
  emailFrom: process.env.EMAIL_FROM ?? "Lía <onboarding@resend.dev>",
  /** Sin Resend: loguea el código en el server (solo pruebas) */
  emailDevMode: process.env.EMAIL_DEV_MODE === "true",
  /** Emails admin (comma-separated) */
  adminEmails: (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  isProduction: process.env.NODE_ENV === "production",
  /**
   * Días de acceso tras Setup si no quedó suscripción mensual (default 30 = 1 mes).
   * Si BILLING_TEST_GRACE_MINUTES > 0, se usa ese valor en minutos (solo para prueba).
   */
  billingPeriodDays: Number(process.env.BILLING_PERIOD_DAYS ?? 30),
  billingTestGraceMinutes: Number(process.env.BILLING_TEST_GRACE_MINUTES ?? 0),
};

export function isConfigured() {
  return Boolean(config.token && config.phoneNumberId);
}
