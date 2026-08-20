import { createHmac, timingSafeEqual } from "node:crypto";
import { loadStore, saveStore } from "./botStore.js";

export type BillingPlan = "self" | "setup";

/**
 * Valida x-signature de Mercado Pago.
 * Manifest: id:{data.id};request-id:{x-request-id};ts:{ts};
 */
export function verifyMpWebhookSignature(opts: {
  secret: string;
  xSignature?: string;
  xRequestId?: string;
  dataId?: string;
}): boolean {
  const { secret, xSignature, xRequestId, dataId } = opts;
  if (!secret) return true; // sin secret configurado, no bloqueamos (dev)
  if (!xSignature) return false;

  const parts: Record<string, string> = {};
  for (const chunk of xSignature.split(",")) {
    const [k, ...rest] = chunk.trim().split("=");
    if (k) parts[k] = rest.join("=");
  }
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  const id = (dataId ?? "").toLowerCase();
  let manifest = "";
  if (id) manifest += `id:${id};`;
  if (xRequestId) manifest += `request-id:${xRequestId};`;
  manifest += `ts:${ts};`;

  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  try {
    const a = Buffer.from(v1, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export type BillingActivation = {
  id: string;
  plan: BillingPlan;
  status: "active" | "cancelled" | "pending";
  email?: string;
  externalReference?: string;
  mpPaymentId?: string;
  mpPreapprovalId?: string;
  amount?: number;
  currency?: string;
  setupMeetPending: boolean;
  createdAt: string;
  updatedAt: string;
  rawType?: string;
};

type Store = {
  activations: BillingActivation[];
};

const MAX = 200;
let store: Store = loadStore<Store>("billing", { activations: [] });

function persist() {
  saveStore("billing", store);
}

function upsert(next: BillingActivation) {
  const i = store.activations.findIndex(
    (a) =>
      a.id === next.id ||
      (next.mpPaymentId && a.mpPaymentId === next.mpPaymentId) ||
      (next.mpPreapprovalId && a.mpPreapprovalId === next.mpPreapprovalId) ||
      (next.externalReference && a.externalReference === next.externalReference),
  );
  if (i >= 0) store.activations[i] = { ...store.activations[i], ...next, updatedAt: new Date().toISOString() };
  else store.activations.unshift(next);
  if (store.activations.length > MAX) store.activations.length = MAX;
  persist();
}

function detectPlan(amount?: number, ref?: string): BillingPlan {
  const r = (ref ?? "").toLowerCase();
  if (r.includes("setup") || r.includes("149")) return "setup";
  if (r.includes("self") || r.includes("49")) return "self";
  if (typeof amount === "number") {
    if (amount >= 100) return "setup";
    return "self";
  }
  return "self";
}

/**
 * Procesa notificaciones de Mercado Pago (webhooks / IPN).
 * Acepta topic+id clásico o body JSON de webhooks nuevos.
 */
export async function handleMercadoPagoNotification(opts: {
  topic?: string;
  id?: string;
  body?: Record<string, unknown>;
  accessToken: string;
}): Promise<{ ok: boolean; activation?: BillingActivation; detail?: string }> {
  const { accessToken, body } = opts;
  let topic = opts.topic ?? "";
  let id = opts.id ?? "";

  if (body) {
    const type = String(body.type ?? body.topic ?? "");
    const data = body.data as { id?: string } | undefined;
    if (type) topic = type;
    if (data?.id) id = String(data.id);
    if (body.action && !topic) topic = String(body.action);
  }

  if (!accessToken) {
    return { ok: false, detail: "MP_ACCESS_TOKEN no configurado" };
  }

  // subscription_preapproval / subscription_authorized_payment / payment
  const topicNorm = topic.toLowerCase();
  if (topicNorm.includes("preapproval") || topicNorm === "subscription_preapproval") {
    if (!id) return { ok: false, detail: "falta id preapproval" };
    const res = await fetch(`https://api.mercadopago.com/preapproval/${id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return { ok: false, detail: `preapproval ${res.status}` };
    const data = (await res.json()) as {
      id?: string;
      status?: string;
      payer_email?: string;
      external_reference?: string;
      auto_recurring?: { transaction_amount?: number; currency_id?: string };
    };
    const amount = data.auto_recurring?.transaction_amount;
    const plan = detectPlan(amount, data.external_reference);
    const status = data.status === "authorized" || data.status === "active" ? "active" : "pending";
    const activation: BillingActivation = {
      id: crypto.randomUUID(),
      plan,
      status,
      email: data.payer_email,
      externalReference: data.external_reference,
      mpPreapprovalId: String(data.id ?? id),
      amount,
      currency: data.auto_recurring?.currency_id,
      setupMeetPending: plan === "setup" && status === "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      rawType: topic,
    };
    upsert(activation);
    console.log("[mp] preapproval", status, plan, data.payer_email ?? id);
    return { ok: true, activation };
  }

  if (topicNorm.includes("payment") || topicNorm === "subscription_authorized_payment") {
    if (!id && body?.data) id = String((body.data as { id?: string }).id ?? "");
    if (!id) return { ok: false, detail: "falta id payment" };
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return { ok: false, detail: `payment ${res.status}` };
    const data = (await res.json()) as {
      id?: number;
      status?: string;
      transaction_amount?: number;
      currency_id?: string;
      external_reference?: string;
      payer?: { email?: string };
    };
    const amount = data.transaction_amount;
    const plan = detectPlan(amount, data.external_reference);
    const status = data.status === "approved" ? "active" : "pending";
    const activation: BillingActivation = {
      id: crypto.randomUUID(),
      plan,
      status,
      email: data.payer?.email,
      externalReference: data.external_reference,
      mpPaymentId: String(data.id ?? id),
      amount,
      currency: data.currency_id,
      setupMeetPending: plan === "setup" && status === "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      rawType: topic,
    };
    upsert(activation);
    console.log("[mp] payment", status, plan, amount, data.payer?.email ?? id);
    return { ok: true, activation };
  }

  // Log unknown for debugging
  console.log("[mp] notificación sin handler", topic, id, JSON.stringify(body)?.slice(0, 200));
  return { ok: true, detail: "ignored" };
}

export function listActivations() {
  return store.activations;
}

export function findActivation(query: { email?: string; externalReference?: string }) {
  return store.activations.find((a) => {
    if (query.email && a.email?.toLowerCase() === query.email.toLowerCase()) return true;
    if (query.externalReference && a.externalReference === query.externalReference) return true;
    return false;
  });
}

function alreadyUsed(operationId: string): BillingActivation | undefined {
  return store.activations.find(
    (a) =>
      a.status === "active" &&
      (a.mpPaymentId === operationId || a.mpPreapprovalId === operationId),
  );
}

/**
 * Confirma un pago/suscripción con el ID de operación de Mercado Pago
 * (el que aparece en la pantalla de éxito).
 */
export async function confirmByOperationId(opts: {
  operationId: string;
  accessToken: string;
  claimedPlan?: BillingPlan;
}): Promise<{ ok: boolean; activation?: BillingActivation; detail?: string }> {
  const id = opts.operationId.replace(/\D/g, "");
  if (!id || id.length < 6) return { ok: false, detail: "ID de operación inválido" };
  if (!opts.accessToken) return { ok: false, detail: "MP_ACCESS_TOKEN no configurado" };

  const used = alreadyUsed(id);
  if (used) {
    return { ok: true, activation: used, detail: "already_active" };
  }

  const headers = { Authorization: `Bearer ${opts.accessToken}` };

  // 1) Pago único
  {
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, { headers });
    if (res.ok) {
      const data = (await res.json()) as {
        id?: number;
        status?: string;
        transaction_amount?: number;
        currency_id?: string;
        external_reference?: string;
        payer?: { email?: string };
        description?: string;
      };
      if (data.status !== "approved") {
        return { ok: false, detail: `Pago en estado: ${data.status ?? "desconocido"}` };
      }
      const amount = data.transaction_amount;
      const plan =
        opts.claimedPlan ??
        detectPlan(amount, `${data.external_reference ?? ""} ${data.description ?? ""}`);
      const activation: BillingActivation = {
        id: crypto.randomUUID(),
        plan,
        status: "active",
        email: data.payer?.email,
        externalReference: data.external_reference,
        mpPaymentId: String(data.id ?? id),
        amount,
        currency: data.currency_id,
        setupMeetPending: plan === "setup",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        rawType: "confirm.payment",
      };
      upsert(activation);
      console.log("[mp] confirm payment", plan, amount, id);
      return { ok: true, activation };
    }
  }

  // 2) Authorized payment (cobro de suscripción)
  {
    const res = await fetch(`https://api.mercadopago.com/authorized_payments/${id}`, { headers });
    if (res.ok) {
      const data = (await res.json()) as {
        id?: number;
        status?: string;
        transaction_amount?: number;
        currency_id?: string;
        preapproval_id?: string;
        payment?: { id?: number; status?: string };
      };
      const payStatus = data.payment?.status ?? data.status;
      if (payStatus !== "approved" && data.status !== "processed") {
        return { ok: false, detail: `Suscripción/cobro en estado: ${payStatus ?? data.status}` };
      }
      const amount = data.transaction_amount;
      const plan = opts.claimedPlan ?? detectPlan(amount);
      const activation: BillingActivation = {
        id: crypto.randomUUID(),
        plan,
        status: "active",
        mpPaymentId: String(data.payment?.id ?? data.id ?? id),
        mpPreapprovalId: data.preapproval_id,
        amount,
        currency: data.currency_id,
        setupMeetPending: plan === "setup",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        rawType: "confirm.authorized_payment",
      };
      upsert(activation);
      console.log("[mp] confirm authorized_payment", plan, amount, id);
      return { ok: true, activation };
    }
  }

  // 3) Preapproval (suscripción)
  {
    const res = await fetch(`https://api.mercadopago.com/preapproval/${id}`, { headers });
    if (res.ok) {
      const data = (await res.json()) as {
        id?: string;
        status?: string;
        payer_email?: string;
        external_reference?: string;
        reason?: string;
        auto_recurring?: { transaction_amount?: number; currency_id?: string };
      };
      if (data.status !== "authorized" && data.status !== "active") {
        return { ok: false, detail: `Suscripción en estado: ${data.status ?? "desconocido"}` };
      }
      const amount = data.auto_recurring?.transaction_amount;
      const plan =
        opts.claimedPlan ??
        detectPlan(amount, `${data.external_reference ?? ""} ${data.reason ?? ""}`);
      const activation: BillingActivation = {
        id: crypto.randomUUID(),
        plan,
        status: "active",
        email: data.payer_email,
        externalReference: data.external_reference,
        mpPreapprovalId: String(data.id ?? id),
        amount,
        currency: data.auto_recurring?.currency_id,
        setupMeetPending: plan === "setup",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        rawType: "confirm.preapproval",
      };
      upsert(activation);
      console.log("[mp] confirm preapproval", plan, amount, id);
      return { ok: true, activation };
    }
  }

  return {
    ok: false,
    detail:
      "No encontramos ese ID en Mercado Pago. Revisá el número de operación de la pantalla de éxito.",
  };
}
