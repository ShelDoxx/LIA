import express from "express";
import { config, isConfigured } from "./config.js";
import { verifyWebhookSignature, requireLiaSecret } from "./middleware.js";
import { replyTo, type BotClient } from "./nlu.js";
import { sendTemplate, sendText } from "./whatsapp.js";
import { runBirthdayGreetings, runPaymentReminders } from "./reminders.js";
import { clientByPhone, contextClientCount, fallbackClient, updateContext, type ContextPayload } from "./contextStore.js";
import { downloadWhatsAppMedia } from "./media.js";
import { drainInbox, enqueueChatMessage } from "./pendingDocs.js";
import { handleIdentify, canUseGeneralNlu, identifyReminder, ensureIdentifySession } from "./identify.js";
import { handleIncomingPhoto, handleIncomingText } from "./packHandler.js";
import { touchWindow, isWindowOpen } from "./windowStore.js";
import { policyById } from "./policyStore.js";
import {
  getWhatsAppConfig,
  isWhatsAppConfigured,
  isTokenExpired,
  tokenStatusMessage,
  publicConfig,
  setWhatsAppConfig,
} from "./runtimeConfig.js";
import { subscribeAppToWaba } from "./subscribeWaba.js";
import {
  confirmByOperationId,
  findActivation,
  handleMercadoPagoNotification,
  listActivations,
  syncRecentApprovals,
  verifyMpWebhookSignature,
} from "./mercadopago.js";
import {
  computePeriodEndsAt,
  createOtp,
  findUserIdByPreapprovalId,
  getUserById,
  listUsers,
  paidPeriodEndsAt,
  patchEntitlement,
  revokeSession,
  sessionFromToken,
  toEntitlementView,
  upsertEntitlement,
  verifyOtp,
  type EntitlementStatus,
} from "./auth.js";
import { sendOtpEmail } from "./mail.js";
import { computeBrickAmounts, processBrickCheckout, attachMonthlyWithCard } from "./mpBrick.js";
import {
  cancelPreapproval,
  fetchPreapproval,
} from "./mpSubscription.js";

function brickAmounts() {
  return computeBrickAmounts(config.mpUsdArsRate, {
    arsSelf: config.mpArsSelf,
    arsSetup: config.mpArsSetup,
  });
}

const app = express();

const ALLOWED_ORIGINS = [
  "https://app.lia-estudio.com",
  "https://lia-estudio.com",
  "https://www.lia-estudio.com",
  /^https:\/\/lia-[a-z0-9-]+\.pages\.dev$/,
];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.some((o) => (typeof o === "string" ? o === origin : o.test(origin)))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Lia-Secret, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(express.json());

function bearerToken(req: express.Request): string | undefined {
  const h = req.headers.authorization;
  if (typeof h === "string" && h.toLowerCase().startsWith("bearer ")) {
    return h.slice(7).trim();
  }
  return undefined;
}

app.post("/auth/request-otp", async (req, res) => {
  const email = String(req.body?.email ?? "");
  const name = typeof req.body?.name === "string" ? req.body.name : undefined;
  try {
    const otp = createOtp(email);
    const sent = await sendOtpEmail({
      to: otp.email,
      code: otp.code,
      resendApiKey: config.resendApiKey,
      from: config.emailFrom,
      devMode: config.emailDevMode,
    });
    if (!sent.ok) {
      res.status(503).json({
        ok: false,
        error:
          sent.detail === "email_not_configured"
            ? "Email no configurado. Pedí RESEND_API_KEY al admin."
            : "No pudimos enviar el email. Probá de nuevo en un minuto.",
      });
      return;
    }
    console.log("[auth] otp requested", otp.email, name ?? "", sent.detail);
    // Nunca exponer código en producción ni si Resend está configurado
    const useDevHint =
      config.emailDevMode && !config.resendApiKey && !config.isProduction;
    res.json({
      ok: true,
      email: otp.email,
      expiresInSec: 600,
      ...(useDevHint ? { devCode: otp.code } : {}),
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : "Email inválido" });
  }
});

app.post("/auth/verify-otp", (req, res) => {
  const email = String(req.body?.email ?? "");
  const code = String(req.body?.code ?? "");
  const name = typeof req.body?.name === "string" ? req.body.name : undefined;
  const result = verifyOtp({ email, code, name });
  if (!result.ok) {
    res.status(401).json({ ok: false, error: result.error });
    return;
  }
  res.json({
    ok: true,
    sessionToken: result.sessionToken,
    user: { id: result.user.id, email: result.user.email, name: result.user.name },
    entitlement: result.entitlement,
    isAdmin: config.adminEmails.includes(result.user.email),
  });
});

app.get("/auth/me", (req, res) => {
  const sess = sessionFromToken(bearerToken(req));
  if (!sess) {
    res.status(401).json({ ok: false, error: "Sesión inválida" });
    return;
  }
  const isAdmin = config.adminEmails.includes(sess.user.email);
  res.json({
    ok: true,
    user: { id: sess.user.id, email: sess.user.email, name: sess.user.name },
    entitlement: sess.entitlement,
    isAdmin,
  });
});

app.post("/auth/logout", (req, res) => {
  revokeSession(bearerToken(req));
  res.json({ ok: true });
});

app.get("/auth/admin/users", (req, res) => {
  const secret = req.headers["x-lia-secret"];
  const sess = sessionFromToken(bearerToken(req));
  const adminOk =
    secret === config.liaSecret || (sess && config.adminEmails.includes(sess.user.email));
  if (!adminOk) {
    res.sendStatus(401);
    return;
  }
  res.json({
    ok: true,
    users: listUsers().map((u) => ({
      ...u,
      isAdmin: config.adminEmails.includes(u.email),
    })),
    emailConfigured: Boolean(config.resendApiKey),
    emailDevMode: config.emailDevMode && !config.resendApiKey,
  });
});

/** Admin: activar / pausar plan de un usuario */
app.post("/auth/admin/entitlement", (req, res) => {
  const secret = req.headers["x-lia-secret"];
  const sess = sessionFromToken(bearerToken(req));
  const adminOk =
    secret === config.liaSecret || (sess && config.adminEmails.includes(sess.user.email));
  if (!adminOk) {
    res.sendStatus(401);
    return;
  }
  const userId = String(req.body?.userId ?? "");
  const status = String(req.body?.status ?? "") as EntitlementStatus;
  const plan =
    req.body?.plan === "setup" ? "setup" : req.body?.plan === "self" ? "self" : undefined;
  if (!userId || !["none", "trial", "active", "expired"].includes(status)) {
    res.status(400).json({ ok: false, error: "userId y status válidos requeridos" });
    return;
  }
  const prev = listUsers().find((u) => u.id === userId);
  if (!prev) {
    res.status(404).json({ ok: false, error: "Usuario no encontrado" });
    return;
  }
  const periodEndsAt =
    typeof req.body?.periodEndsAt === "string" && req.body.periodEndsAt
      ? String(req.body.periodEndsAt)
      : req.body?.periodEndsAt === null
        ? undefined
        : prev.entitlement.periodEndsAt;
  const renewalRequired =
    typeof req.body?.renewalRequired === "boolean"
      ? req.body.renewalRequired
      : prev.entitlement.renewalRequired;
  upsertEntitlement({
    userId,
    status,
    plan: plan ?? prev.entitlement.plan,
    mpPaymentId: prev.entitlement.mpPaymentId,
    mpPreapprovalId: prev.entitlement.mpPreapprovalId,
    mpCustomerId: prev.entitlement.mpCustomerId,
    cardLastFour: prev.entitlement.cardLastFour,
    periodEndsAt,
    renewalRequired,
    updatedAt: new Date().toISOString(),
  });
  console.log("[auth] admin entitlement", sess?.user.email ?? "secret", userId, status, plan);
  res.json({
    ok: true,
    entitlement: listUsers().find((u) => u.id === userId)?.entitlement,
  });
});

/**
 * Solo admin: simula gracia corta (aviso + bloqueo) sin borrar la suscripción MP.
 * Body: { minutes?: number, userId?: string }
 */
app.post("/billing/simulate-renewal-grace", (req, res) => {
  const sess = sessionFromToken(bearerToken(req));
  if (!sess || !config.adminEmails.includes(sess.user.email)) {
    res.status(401).json({ ok: false, error: "Solo admin" });
    return;
  }
  const targetId =
    typeof req.body?.userId === "string" && req.body.userId
      ? String(req.body.userId)
      : sess.user.id;
  const minutes = Math.max(1, Math.min(60 * 24, Number(req.body?.minutes ?? 3)));
  const periodEndsAt = computePeriodEndsAt({
    periodDays: 30,
    testGraceMinutes: minutes,
  });
  const prev = listUsers().find((u) => u.id === targetId)?.entitlement;
  patchEntitlement(targetId, {
    status: "active",
    plan: prev?.plan ?? "setup",
    periodEndsAt,
    renewalRequired: true,
  });
  const view = toEntitlementView(listUsers().find((u) => u.id === targetId)!.entitlement);
  console.log("[billing] simulate-renewal-grace", targetId, periodEndsAt, view.graceLabel);
  res.json({ ok: true, entitlement: view, periodEndsAt, minutes });
});

const demoClient: BotClient = {
  firstName: "",
  producerName: "tu productor",
  policies: [
    {
      type: "auto",
      number: "AU-441-22981",
      company: "Sancor Seguros",
      plate: "AE 441 CD",
      nextDueDate: new Date(Date.now() + 3 * 86400000).toISOString(),
      cuponUrl: "https://lia.app/c/p1/cupon",
      pdfUrl: "https://lia.app/c/p1/poliza",
    },
    {
      type: "vida",
      number: "VI-100-8821",
      company: "Zurich",
      nextDueDate: new Date(Date.now() + 18 * 86400000).toISOString(),
      cuponUrl: "https://lia.app/c/p2/cupon",
      pdfUrl: "https://lia.app/c/p2/poliza",
    },
  ],
  documents: [
    { type: "poliza", name: "Póliza auto AE441CD.pdf" },
    { type: "cupon", name: "Cupón cuota 08.pdf" },
  ],
};

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    whatsapp: isWhatsAppConfigured(),
    tokenExpired: isTokenExpired(),
    tokenWarning: tokenStatusMessage(),
    name: "Lía",
    contextClients: contextClientCount(),
  });
});

app.get("/config/status", (_req, res) => {
  res.json(publicConfig());
});

app.post("/config", requireLiaSecret, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  setWhatsAppConfig({
    token: typeof body.token === "string" ? body.token : undefined,
    phoneNumberId: typeof body.phoneNumberId === "string" ? body.phoneNumberId : undefined,
    verifyToken: typeof body.verifyToken === "string" ? body.verifyToken : undefined,
  });
  const waba = await subscribeAppToWaba();
  res.json({ ok: true, ...publicConfig(), waba });
});

app.post("/meta/subscribe-waba", requireLiaSecret, async (req, res) => {
  const hint = typeof req.body?.wabaId === "string" ? req.body.wabaId : undefined;
  const waba = await subscribeAppToWaba(hint);
  res.status(waba.ok ? 200 : 502).json(waba);
});

/** Envío proactivo: mora, cuota, renovación desde el escritorio web. */
app.post("/jobs/outbound", requireLiaSecret, async (req, res) => {
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  let sent = 0;
  let failed = 0;
  const demo = !isWhatsAppConfigured();
  for (const raw of messages) {
    const phone = String(raw?.phone ?? "").replace(/\D/g, "");
    const text = String(raw?.text ?? "");
    if (!phone || !text) continue;
    try {
      await sendText(phone, text);
      sent += 1;
    } catch (err) {
      console.error("outbound fail", phone, err);
      failed += 1;
    }
  }
  res.json({ sent, failed, demo, whatsapp: isWhatsAppConfigured() });
});

function explainWhatsAppError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const jsonStart = raw.indexOf("{");
  if (jsonStart < 0) return raw;
  try {
    const parsed = JSON.parse(raw.slice(jsonStart)) as {
      error?: { code?: number; message?: string; error_data?: { details?: string } };
    };
    const code = parsed.error?.code;
    const details = parsed.error?.error_data?.details || parsed.error?.message || raw;
    if (code === 131030) {
      return "Tu celular no está en la lista de prueba de Meta. En API Setup → destinatarios, agregalo como 549… (con 9, sin 15), verificá el código de WhatsApp y reintentá.";
    }
    if (code === 131047) {
      return "Meta todavía no deja texto libre. Primero tenés que recibir la plantilla (o escribirle vos al número de prueba).";
    }
    return details;
  } catch {
    return raw;
  }
}

app.post("/test-message", requireLiaSecret, async (req, res) => {
  const phone = String(req.body?.phone ?? "").replace(/\D/g, "");
  const text = String(req.body?.text ?? "Hola desde Lía — conexión Meta OK. Tu estudio ya puede enviar mensajes.");
  if (!phone) {
    res.status(400).json({ ok: false, error: "phone requerido" });
    return;
  }
  try {
    // Fuera de la ventana de 24 h Meta exige plantilla (igual que el botón de Facebook).
    await sendTemplate(phone, "hello_world", "en_US", []);
    res.json({ ok: true, demo: !isWhatsAppConfigured(), via: "template" });
  } catch (templateErr) {
    try {
      await sendText(phone, text);
      res.json({ ok: true, demo: !isWhatsAppConfigured(), via: "text" });
    } catch (err) {
      res.status(502).json({ ok: false, error: explainWhatsAppError(err) || explainWhatsAppError(templateErr) });
    }
  }
});

/** Sincroniza cartera desde el escritorio web (IndexedDB → bot en memoria). */
app.post("/context", requireLiaSecret, (req, res) => {
  const body = req.body as ContextPayload;
  if (!body?.producerName || !Array.isArray(body.clients)) {
    res.status(400).json({ ok: false, error: "payload inválido" });
    return;
  }
  updateContext(body);
  res.json({ ok: true, clients: contextClientCount() });
});

app.get("/pending-docs", requireLiaSecret, (_req, res) => {
  res.json(drainInbox());
});

/** Webhook Mercado Pago (Suscripciones + pagos). Configurar en MP → Notificaciones. */
app.post("/mercadopago/webhook", async (req, res) => {
  const body = req.body as Record<string, unknown>;
  console.log("[mp] webhook POST", JSON.stringify({
    query: req.query,
    type: body?.type,
    action: body?.action,
    data: body?.data,
    headers: {
      sig: req.headers["x-signature"] ? "present" : "missing",
      reqId: req.headers["x-request-id"],
    },
  }).slice(0, 500));
  const data = body?.data as { id?: string } | undefined;
  const dataId = String(data?.id ?? req.query["data.id"] ?? req.query.id ?? "");
  const okSig = verifyMpWebhookSignature({
    secret: config.mpWebhookSecret,
    xSignature: typeof req.headers["x-signature"] === "string" ? req.headers["x-signature"] : undefined,
    xRequestId: typeof req.headers["x-request-id"] === "string" ? req.headers["x-request-id"] : undefined,
    dataId,
    requireSecret: config.isProduction,
  });
  if (!okSig) {
    console.warn("[mp] firma webhook inválida — rechazado");
    res.sendStatus(401);
    return;
  }
  res.sendStatus(200);
  try {
    const topic = String(req.query.topic ?? req.query.type ?? body?.type ?? "");
    const id = String(req.query.id ?? req.query["data.id"] ?? dataId);
    const result = await handleMercadoPagoNotification({
      topic,
      id,
      body,
      accessToken: config.mpAccessToken,
    });
    const act = result.activation;
    const userId =
      (act?.externalReference && getUserById(act.externalReference)?.id) ||
      (act?.mpPreapprovalId && findUserIdByPreapprovalId(act.mpPreapprovalId)) ||
      undefined;
    if (act && userId) {
      const prev = listUsers().find((u) => u.id === userId)?.entitlement;
      if (act.status === "active") {
        patchEntitlement(userId, {
          status: "active",
          plan: act.plan ?? prev?.plan,
          mpPaymentId: act.mpPaymentId ?? prev?.mpPaymentId,
          mpPreapprovalId: act.mpPreapprovalId ?? prev?.mpPreapprovalId,
          renewalRequired: false,
          clearPeriodEndsAt: true,
        });
        console.log("[mp] webhook → entitlement", userId, act.plan);
      } else if (act.status === "cancelled") {
        let nextPaymentDate: string | undefined;
        if (act.mpPreapprovalId && config.mpAccessToken) {
          const pre = await fetchPreapproval({
            accessToken: config.mpAccessToken,
            preapprovalId: act.mpPreapprovalId,
          });
          nextPaymentDate = pre.nextPaymentDate;
        }
        const periodEndsAt = paidPeriodEndsAt({
          existingPeriodEndsAt: prev?.periodEndsAt,
          nextPaymentDate,
          membershipStartedAt: prev?.membershipStartedAt,
          periodDays: config.billingPeriodDays,
        });
        patchEntitlement(userId, {
          status: "active",
          plan: prev?.plan ?? act.plan,
          mpPaymentId: prev?.mpPaymentId ?? act.mpPaymentId,
          mpPreapprovalId: act.mpPreapprovalId ?? prev?.mpPreapprovalId,
          periodEndsAt,
          renewalRequired: true,
        });
        console.log("[mp] webhook → renewal grace", userId, periodEndsAt);
      }
    }
  } catch (err) {
    console.error("[mp] webhook error", err);
  }
});

app.get("/mercadopago/webhook", async (req, res) => {
  // IPN clásico / healthcheck — no muta entitlements (usar POST firmado).
  try {
    const result = await handleMercadoPagoNotification({
      topic: String(req.query.topic ?? ""),
      id: String(req.query.id ?? ""),
      accessToken: config.mpAccessToken,
    });
    res.json({ ok: result.ok, detail: result.detail ?? "ipn_ack" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false });
  }
});

app.get("/billing/checkout-config", (_req, res) => {
  const amounts = brickAmounts();
  res.json({
    ok: true,
    selfUrl: config.mpCheckoutSelfUrl || "",
    setupUrl: config.mpCheckoutSetupUrl || "",
    mpConfigured: Boolean(config.mpAccessToken),
    brickEnabled: Boolean(config.mpAccessToken && config.mpPublicKey),
    publicKey: config.mpPublicKey || "",
    amounts,
    testMode: Boolean(amounts.testMode),
    webhookUrl: config.mpWebhookPublicUrl,
    backUrlSelf: `${config.mpBackUrlBase}?paid=1&plan=self`,
    backUrlSetup: `${config.mpBackUrlBase}?paid=1&plan=setup`,
  });
});

/** Card Payment Brick → cobro / suscripción (sesión requerida). */
app.post("/billing/process-card", async (req, res) => {
  const sess = sessionFromToken(bearerToken(req));
  if (!sess) {
    res.status(401).json({ ok: false, error: "Iniciá sesión para pagar" });
    return;
  }
  if (!config.mpAccessToken) {
    res.status(503).json({ ok: false, error: "Mercado Pago no configurado" });
    return;
  }
  const plan = req.body?.plan === "setup" ? "setup" : req.body?.plan === "self" ? "self" : null;
  if (!plan) {
    res.status(400).json({ ok: false, error: "Plan inválido" });
    return;
  }
  const amounts = brickAmounts();
  try {
    const result = await processBrickCheckout({
      accessToken: config.mpAccessToken,
      plan,
      amounts,
      userId: sess.user.id,
      userEmail: sess.user.email,
      backUrl: `${config.mpBackUrlBase}?paid=1&plan=${plan}`,
      card: {
        token: String(req.body?.token ?? ""),
        payment_method_id: String(req.body?.payment_method_id ?? ""),
        issuer_id: req.body?.issuer_id,
        installments: req.body?.installments,
        payer: req.body?.payer,
      },
    });
    if (!result.ok) {
      res.status(400).json({ ok: false, error: result.detail || "No se pudo procesar el pago" });
      return;
    }
    const renewalRequired =
      Boolean(result.needsCardForMonthly) || (result.plan === "setup" && !result.mpPreapprovalId);
    const periodEndsAt = renewalRequired
      ? computePeriodEndsAt({
          periodDays: config.billingPeriodDays,
          testGraceMinutes: config.billingTestGraceMinutes,
        })
      : undefined;
    patchEntitlement(sess.user.id, {
      status: "active",
      plan: result.plan ?? plan,
      mpPaymentId: result.mpPaymentId,
      mpPreapprovalId: result.mpPreapprovalId,
      mpCustomerId: result.mpCustomerId,
      cardLastFour: result.cardLastFour,
      ...(renewalRequired
        ? { periodEndsAt, renewalRequired: true }
        : { renewalRequired: false, clearPeriodEndsAt: true }),
    });
    console.log(
      "[billing] brick → entitlement",
      sess.user.email,
      result.plan,
      result.mpPaymentId ?? result.mpPreapprovalId,
      renewalRequired ? `renewal_grace_until=${periodEndsAt}` : "ok",
    );
    const entitlement = toEntitlementView(
      listUsers().find((u) => u.id === sess.user.id)!.entitlement,
    );
    res.json({
      ok: true,
      plan: result.plan,
      setupMeetPending: result.setupMeetPending,
      amount: result.amount,
      detail: result.detail,
      renewalRequired,
      periodEndsAt,
      needsCardForMonthly: result.needsCardForMonthly,
      entitlement,
    });
  } catch (err) {
    console.error("[billing] process-card", err);
    res.status(500).json({ ok: false, error: "Error al procesar el cobro" });
  }
});

/** Engancha cobro mensual (tarjeta) cuando Setup no dejó suscripción. */
app.post("/billing/attach-card", async (req, res) => {
  const sess = sessionFromToken(bearerToken(req));
  if (!sess) {
    res.status(401).json({ ok: false, error: "Iniciá sesión" });
    return;
  }
  if (!config.mpAccessToken) {
    res.status(503).json({ ok: false, error: "Mercado Pago no configurado" });
    return;
  }
  const amounts = brickAmounts();
  try {
    const result = await attachMonthlyWithCard({
      accessToken: config.mpAccessToken,
      amounts,
      userId: sess.user.id,
      userEmail: sess.user.email,
      backUrl: `${config.mpBackUrlBase}?paid=1&plan=self`,
      startNextMonth: true,
      card: {
        token: String(req.body?.token ?? ""),
        payment_method_id: String(req.body?.payment_method_id ?? ""),
        issuer_id: req.body?.issuer_id,
        installments: req.body?.installments,
        payer: req.body?.payer,
      },
    });
    if (!result.ok) {
      res.status(400).json({ ok: false, error: result.detail || "No se pudo guardar la tarjeta" });
      return;
    }
    patchEntitlement(sess.user.id, {
      status: "active",
      mpPreapprovalId: result.mpPreapprovalId,
      mpCustomerId: result.mpCustomerId,
      cardLastFour: result.cardLastFour,
      renewalRequired: false,
      clearPeriodEndsAt: true,
    });
    res.json({
      ok: true,
      entitlement: toEntitlementView(
        listUsers().find((u) => u.id === sess.user.id)!.entitlement,
      ),
      mpPreapprovalId: result.mpPreapprovalId,
      cardLastFour: result.cardLastFour,
    });
  } catch (err) {
    console.error("[billing] attach-card", err);
    res.status(500).json({ ok: false, error: "Error al enganchar el cobro mensual" });
  }
});

/** Estado de membresía / suscripción MP. */
app.get("/billing/subscription", async (req, res) => {
  const sess = sessionFromToken(bearerToken(req));
  if (!sess) {
    res.status(401).json({ ok: false, error: "Iniciá sesión" });
    return;
  }
  const ent = listUsers().find((u) => u.id === sess.user.id)?.entitlement;
  if (!ent) {
    res.json({ ok: true, subscription: null });
    return;
  }
  let mpStatus: string | undefined;
  let nextPaymentDate: string | undefined;
  let amount: number | undefined;
  if (ent.mpPreapprovalId && config.mpAccessToken) {
    const pre = await fetchPreapproval({
      accessToken: config.mpAccessToken,
      preapprovalId: ent.mpPreapprovalId,
    });
    if (pre.ok) {
      mpStatus = pre.status;
      nextPaymentDate = pre.nextPaymentDate;
      amount = pre.amount;
    }
  }
  res.json({
    ok: true,
    subscription: {
      status: ent.status,
      plan: ent.plan,
      renewalRequired: Boolean(ent.renewalRequired),
      periodEndsAt: ent.periodEndsAt,
      daysLeft: ent.daysLeft,
      graceLabel: ent.graceLabel,
      mpPreapprovalId: ent.mpPreapprovalId,
      mpCustomerId: ent.mpCustomerId,
      cardLastFour: ent.cardLastFour,
      mpStatus,
      nextPaymentDate,
      amountArs: amount,
      canCancel:
        Boolean(ent.mpPreapprovalId) &&
        mpStatus !== "canceled" &&
        mpStatus !== "cancelled" &&
        mpStatus !== "paused",
    },
  });
});

/** Cancela la suscripción en Mercado Pago desde Lía. */
app.post("/billing/cancel-subscription", async (req, res) => {
  const sess = sessionFromToken(bearerToken(req));
  if (!sess) {
    res.status(401).json({ ok: false, error: "Iniciá sesión" });
    return;
  }
  if (!config.mpAccessToken) {
    res.status(503).json({ ok: false, error: "Mercado Pago no configurado" });
    return;
  }
  const prev = listUsers().find((u) => u.id === sess.user.id)?.entitlement;
  const preId = prev?.mpPreapprovalId;
  if (!preId) {
    res.status(400).json({ ok: false, error: "No hay suscripción activa para cancelar" });
    return;
  }
  const canceled = await cancelPreapproval({
    accessToken: config.mpAccessToken,
    preapprovalId: preId,
  });
  const pre = await fetchPreapproval({
    accessToken: config.mpAccessToken,
    preapprovalId: preId,
  });
  const mpCanceled =
    canceled.ok ||
    pre.status === "canceled" ||
    pre.status === "cancelled";
  if (!mpCanceled) {
    res.status(400).json({ ok: false, error: canceled.detail || "No se pudo cancelar" });
    return;
  }
  const periodEndsAt = paidPeriodEndsAt({
    existingPeriodEndsAt: prev?.periodEndsAt,
    nextPaymentDate: pre.nextPaymentDate,
    membershipStartedAt: prev?.membershipStartedAt,
    periodDays: config.billingPeriodDays,
  });
  patchEntitlement(sess.user.id, {
    status: "active",
    plan: prev?.plan,
    mpPaymentId: prev?.mpPaymentId,
    mpPreapprovalId: preId,
    mpCustomerId: prev?.mpCustomerId,
    cardLastFour: prev?.cardLastFour,
    periodEndsAt,
    renewalRequired: true,
  });
  console.log("[billing] cancel subscription", sess.user.email, preId, periodEndsAt);
  res.json({
    ok: true,
    entitlement: toEntitlementView(
      listUsers().find((u) => u.id === sess.user.id)!.entitlement,
    ),
    message: "Suscripción cancelada. Seguis con acceso hasta fin del período pagado.",
  });
});

/** Confirma pago con ID de operación de MP (pantalla de éxito). Requiere sesión. */
app.post("/billing/confirm", async (req, res) => {
  const sess = sessionFromToken(bearerToken(req));
  if (!sess) {
    res.status(401).json({ ok: false, error: "Iniciá sesión para activar el plan" });
    return;
  }
  const operationId = String(req.body?.operationId ?? req.body?.id ?? "");
  const claimed = req.body?.plan === "setup" ? "setup" : req.body?.plan === "self" ? "self" : undefined;
  try {
    const result = await confirmByOperationId({
      operationId,
      accessToken: config.mpAccessToken,
      claimedPlan: claimed,
      userId: sess.user.id,
    });
    if (!result.ok || !result.activation || result.activation.status !== "active") {
      res.status(400).json({ ok: false, error: result.detail || "No se pudo confirmar el pago" });
      return;
    }
    const act = result.activation;
    patchEntitlement(sess.user.id, {
      status: "active",
      plan: act.plan,
      mpPaymentId: act.mpPaymentId,
      mpPreapprovalId: act.mpPreapprovalId,
      renewalRequired: false,
      clearPeriodEndsAt: true,
    });
    console.log("[billing] confirm → entitlement", sess.user.email, act.plan, act.mpPaymentId ?? act.mpPreapprovalId);
    res.json({
      ok: true,
      plan: act.plan,
      setupMeetPending: act.setupMeetPending,
      amount: act.amount,
      detail: result.detail,
      entitlement: toEntitlementView(listUsers().find((u) => u.id === sess.user.id)!.entitlement),
    });
  } catch (err) {
    console.error("[mp] confirm error", err);
    res.status(500).json({ ok: false, error: "Error al hablar con Mercado Pago" });
  }
});

/**
 * Tras volver de MP (back_url ?paid=1): confirma con operationId + sesión.
 */
app.post("/billing/sync-after-checkout", async (req, res) => {
  const sess = sessionFromToken(bearerToken(req));
  if (!sess) {
    res.status(401).json({ ok: false, error: "Iniciá sesión para activar el plan" });
    return;
  }
  const plan = req.body?.plan === "setup" ? "setup" : req.body?.plan === "self" ? "self" : undefined;
  const sinceIso = typeof req.body?.since === "string" ? req.body.since : undefined;
  const operationId = String(req.body?.operationId ?? req.body?.op ?? "");
  try {
    const result = await syncRecentApprovals({
      accessToken: config.mpAccessToken,
      plan,
      sinceIso,
      operationId,
      userId: sess.user.id,
    });
    if (!result.ok || !result.activation || result.activation.status !== "active") {
      res.status(404).json({ ok: false, error: result.detail || "Sin cobro aprobado todavía" });
      return;
    }
    const act = result.activation;
    patchEntitlement(sess.user.id, {
      status: "active",
      plan: act.plan,
      mpPaymentId: act.mpPaymentId,
      mpPreapprovalId: act.mpPreapprovalId,
      renewalRequired: false,
      clearPeriodEndsAt: true,
    });
    res.json({
      ok: true,
      plan: act.plan,
      setupMeetPending: act.setupMeetPending,
      detail: result.detail,
      entitlement: toEntitlementView(listUsers().find((u) => u.id === sess.user.id)!.entitlement),
    });
  } catch (err) {
    console.error("[mp] sync-after-checkout", err);
    res.status(500).json({ ok: false, error: "Error al sincronizar con Mercado Pago" });
  }
});

app.get("/billing/activations", requireLiaSecret, (_req, res) => {
  res.json({ activations: listActivations() });
});

/** Público: estado por ref (si el checkout guardó external_reference). */
app.get("/billing/status", (req, res) => {
  const email = String(req.query.email ?? "");
  const externalReference = String(req.query.ref ?? "");
  if (!email && !externalReference) {
    res.status(400).json({ ok: false, error: "ref o email requerido" });
    return;
  }
  const hit = findActivation({
    email: email || undefined,
    externalReference: externalReference || undefined,
  });
  res.json({
    ok: true,
    active: hit?.status === "active",
    plan: hit?.plan,
    setupMeetPending: hit?.setupMeetPending,
  });
});
app.get("/public/policy/:id", (req, res) => {
  const p = policyById(req.params.id);
  if (!p) {
    res.status(404).json({ ok: false });
    return;
  }
  res.json({ ok: true, policy: p });
});

function resolveClient(from: string): BotClient {
  return clientByPhone(from) ?? fallbackClient();
}

function logInbound(
  from: string,
  msg: { id?: string; timestamp?: string; type?: string; text?: { body?: string } },
) {
  const phone = from.replace(/\D/g, "");
  const at = msg.timestamp
    ? new Date(Number(msg.timestamp) * 1000).toISOString()
    : new Date().toISOString();
  let text = msg.text?.body?.trim() ?? "";
  let kind: "text" | "image" | "file" = "text";
  if (msg.type === "image") {
    text = text || "📷 Foto enviada";
    kind = "image";
  } else if (msg.type === "document") {
    text = text || "📎 Documento enviado";
    kind = "file";
  }
  if (!text) return;
  enqueueChatMessage({
    id: String(msg.id ?? crypto.randomUUID()),
    phone,
    from: "client",
    text,
    at,
    kind,
  });
}

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const verifyToken = getWhatsAppConfig().verifyToken;
  if (mode === "subscribe" && token === verifyToken) {
    res.status(200).send(challenge);
    return;
  }
  res.sendStatus(403);
});

app.post("/webhook", verifyWebhookSignature, async (req, res) => {
  res.sendStatus(200);
  try {
    const change = req.body?.entry?.[0]?.changes?.[0]?.value;
    const messages = change?.messages;
    const statuses = change?.statuses;
    if (Array.isArray(statuses) && !Array.isArray(messages)) {
      console.log("[webhook] status", statuses.map((s: { status?: string }) => s.status).join(","));
      return;
    }
    if (!Array.isArray(messages)) {
      console.log("[webhook] POST sin messages", JSON.stringify(req.body)?.slice(0, 300));
      return;
    }
    console.log("[webhook] inbound", messages.map((m: { from?: string; type?: string }) => `${m.from}:${m.type}`).join(", "));
    for (const msg of messages) {
      const from = msg.from as string;
      logInbound(from, msg);
      // Registrar inbound: abre/renueva la ventana de 24 h de Meta.
      touchWindow(from);
      if (msg.type === "image" && msg.image?.id) {
        try {
          const { bytes, mime } = await downloadWhatsAppMedia(String(msg.image.id));
          await handleIncomingPhoto(from, bytes, mime);
        } catch {
          await sendText(
            from,
            "Recibí la imagen pero no pude procesarla. Probá JPG o mandá de a una foto.",
          );
        }
        continue;
      }
      if (msg.type === "document" && msg.document?.id) {
        try {
          const { bytes, mime } = await downloadWhatsAppMedia(String(msg.document.id));
          await handleIncomingPhoto(from, bytes, mime.includes("pdf") ? mime : "image/jpeg");
        } catch {
          await sendText(from, "Recibí el archivo. Si es PDF o foto, mandame el resto y escribí LISTO.");
        }
        continue;
      }
      if (msg.type !== "text" || !msg.text?.body) continue;
      const body = String(msg.text.body);
      if (await handleIncomingText(from, body)) continue;
      const identify = handleIdentify(from, body);
      if (identify) {
        await sendText(from, identify);
        continue;
      }
      if (!canUseGeneralNlu(from)) {
        await sendText(from, identifyReminder(from));
        continue;
      }
      const answer = replyTo(body, resolveClient(from));
      await sendText(from, answer);
    }
  } catch (err) {
    console.error(err);
  }
});

app.post("/simulate", requireLiaSecret, (req, res) => {
  const text = String(req.body?.text ?? "");
  const phone = String(req.body?.phone ?? "");
  res.json({ reply: replyTo(text, phone ? resolveClient(phone) : demoClient) });
});

app.post("/jobs/reminders", requireLiaSecret, async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const result = await runPaymentReminders(rows, Number(req.body?.daysBefore ?? 3));
  res.json(result);
});

app.post("/jobs/birthdays", requireLiaSecret, async (req, res) => {
  const people = Array.isArray(req.body?.people) ? req.body.people : [];
  const result = await runBirthdayGreetings(people);
  res.json(result);
});

app.listen(config.port, () => {
  console.log(
    `Lía bot en http://localhost:${config.port} · WhatsApp ${isWhatsAppConfigured() ? "live" : "demo (log)"}`,
  );
  if (!process.env.LIA_BOT_SECRET) {
    console.log(
      `[auth] LIA_BOT_SECRET no está en env. Secret de sesión: ${config.liaSecret}\n` +
      `       Para fijarlo: set LIA_BOT_SECRET=${config.liaSecret} (Windows) o export LIA_BOT_SECRET=... (Linux)`,
    );
  }
  const warn = tokenStatusMessage();
  if (warn) console.warn(`[meta] ${warn}`);
});
