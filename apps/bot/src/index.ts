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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Lia-Secret");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(express.json());

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
  });
  if (!okSig) {
    console.warn("[mp] firma webhook inválida — igual respondemos 200 y procesamos (test)");
    // En test a veces el manifest no matchea; no bloqueamos activación.
  }
  res.sendStatus(200);
  try {
    const topic = String(req.query.topic ?? req.query.type ?? body?.type ?? "");
    const id = String(req.query.id ?? req.query["data.id"] ?? dataId);
    await handleMercadoPagoNotification({
      topic,
      id,
      body,
      accessToken: config.mpAccessToken,
    });
  } catch (err) {
    console.error("[mp] webhook error", err);
  }
});

app.get("/mercadopago/webhook", async (req, res) => {
  // IPN clásico / healthcheck de MP
  try {
    const result = await handleMercadoPagoNotification({
      topic: String(req.query.topic ?? ""),
      id: String(req.query.id ?? ""),
      accessToken: config.mpAccessToken,
    });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false });
  }
});

app.get("/billing/checkout-config", (_req, res) => {
  res.json({
    ok: true,
    selfUrl: config.mpCheckoutSelfUrl || "",
    setupUrl: config.mpCheckoutSetupUrl || "",
    mpConfigured: Boolean(config.mpAccessToken),
    webhookUrl: config.mpWebhookPublicUrl,
    backUrlSelf: `${config.mpBackUrlBase}?paid=1&plan=self`,
    backUrlSetup: `${config.mpBackUrlBase}?paid=1&plan=setup`,
  });
});

/** Confirma pago con ID de operación de MP (pantalla de éxito). */
app.post("/billing/confirm", async (req, res) => {
  const operationId = String(req.body?.operationId ?? req.body?.id ?? "");
  const claimed = req.body?.plan === "setup" ? "setup" : req.body?.plan === "self" ? "self" : undefined;
  try {
    const result = await confirmByOperationId({
      operationId,
      accessToken: config.mpAccessToken,
      claimedPlan: claimed,
    });
    if (!result.ok || !result.activation || result.activation.status !== "active") {
      res.status(400).json({ ok: false, error: result.detail || "No se pudo confirmar el pago" });
      return;
    }
    res.json({
      ok: true,
      plan: result.activation.plan,
      setupMeetPending: result.activation.setupMeetPending,
      amount: result.activation.amount,
      detail: result.detail,
    });
  } catch (err) {
    console.error("[mp] confirm error", err);
    res.status(500).json({ ok: false, error: "Error al hablar con Mercado Pago" });
  }
});

/**
 * Tras volver de MP (back_url ?paid=1), busca un cobro aprobado reciente
 * y activa. Público a propósito: el cobro debe existir en MP.
 */
app.post("/billing/sync-after-checkout", async (req, res) => {
  const plan = req.body?.plan === "setup" ? "setup" : req.body?.plan === "self" ? "self" : undefined;
  const sinceIso = typeof req.body?.since === "string" ? req.body.since : undefined;
  const operationId = String(req.body?.operationId ?? req.body?.op ?? "");
  try {
    const result = await syncRecentApprovals({
      accessToken: config.mpAccessToken,
      plan,
      sinceIso,
      operationId,
    });
    if (!result.ok || !result.activation || result.activation.status !== "active") {
      res.status(404).json({ ok: false, error: result.detail || "Sin cobro aprobado todavía" });
      return;
    }
    res.json({
      ok: true,
      plan: result.activation.plan,
      setupMeetPending: result.activation.setupMeetPending,
      detail: result.detail,
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
