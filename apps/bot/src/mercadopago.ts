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

/** Solo plata acreditada. cancelled / rejected / pending / refunded = no. */
function isPaymentApproved(status?: string): boolean {
  return (status ?? "").toLowerCase() === "approved";
}

function isDeadPaymentStatus(status?: string): boolean {
  const s = (status ?? "").toLowerCase();
  return (
    s === "cancelled" ||
    s === "canceled" ||
    s === "rejected" ||
    s === "refunded" ||
    s === "charged_back" ||
    s === "cancelled_by_timeout"
  );
}

async function findApprovedChargeForPreapproval(
  preId: string,
  accessToken: string,
): Promise<{ paymentId?: string; amount?: number } | null> {
  const res = await fetch(
    `https://api.mercadopago.com/authorized_payments/search?preapproval_id=${encodeURIComponent(preId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    results?: Array<{
      payment?: { id?: number; status?: string };
      transaction_amount?: number;
      status?: string;
    }>;
  };
  for (const row of data.results ?? []) {
    if (isPaymentApproved(row.payment?.status)) {
      return {
        paymentId: row.payment?.id ? String(row.payment.id) : undefined,
        amount: row.transaction_amount,
      };
    }
  }
  return null;
}

/**
 * Procesa notificaciones de Mercado Pago (webhooks / IPN).
 * Acepta topic+id clásico o body JSON de webhooks nuevos.
 * Regla dura: status "active" en Lía SOLO con pago approved.
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
    const preStatus = (data.status ?? "").toLowerCase();
    // cancelled / paused → never active
    let status: BillingActivation["status"] = "pending";
    let paymentId: string | undefined;
    if (preStatus === "cancelled" || preStatus === "paused") {
      status = "cancelled";
    } else if (preStatus === "authorized" || preStatus === "active") {
      const charge = await findApprovedChargeForPreapproval(String(data.id ?? id), accessToken);
      if (charge) {
        status = "active";
        paymentId = charge.paymentId;
      } else {
        status = "pending";
        console.log("[mp] preapproval sin cobro approved — no activo", data.id ?? id, preStatus);
      }
    }
    const activation: BillingActivation = {
      id: crypto.randomUUID(),
      plan,
      status,
      email: data.payer_email,
      externalReference: data.external_reference,
      mpPreapprovalId: String(data.id ?? id),
      mpPaymentId: paymentId,
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

  if (
    topicNorm.includes("authorized_payment") ||
    topicNorm === "subscription_authorized_payment"
  ) {
    if (!id && body?.data) id = String((body.data as { id?: string }).id ?? "");
    if (!id) return { ok: false, detail: "falta id authorized_payment" };
    const res = await fetch(`https://api.mercadopago.com/authorized_payments/${id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return { ok: false, detail: `authorized_payment ${res.status}` };
    const data = (await res.json()) as {
      id?: number;
      status?: string;
      transaction_amount?: number;
      currency_id?: string;
      preapproval_id?: string;
      reason?: string;
      payment?: { id?: number; status?: string };
    };
    const payStatus = data.payment?.status;
    const amount = data.transaction_amount;
    const plan = detectPlan(amount, data.reason);
    let status: BillingActivation["status"] = "pending";
    if (isPaymentApproved(payStatus)) status = "active";
    else if (isDeadPaymentStatus(payStatus) || isDeadPaymentStatus(data.status)) status = "cancelled";
    const activation: BillingActivation = {
      id: crypto.randomUUID(),
      plan,
      status,
      mpPaymentId: String(data.payment?.id ?? data.id ?? id),
      mpPreapprovalId: data.preapproval_id,
      amount,
      currency: data.currency_id,
      setupMeetPending: plan === "setup" && status === "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      rawType: topic,
    };
    upsert(activation);
    console.log("[mp] authorized_payment", status, plan, amount, payStatus, id);
    return { ok: true, activation };
  }

  if (topicNorm.includes("payment") && !topicNorm.includes("authorized")) {
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
      description?: string;
    };
    const amount = data.transaction_amount;
    const plan = detectPlan(amount, `${data.external_reference ?? ""} ${data.description ?? ""}`);
    let status: BillingActivation["status"] = "pending";
    if (isPaymentApproved(data.status)) status = "active";
    else if (isDeadPaymentStatus(data.status)) status = "cancelled";
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
    console.log("[mp] payment", status, plan, amount, data.status, data.payer?.email ?? id);
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
  const raw = opts.operationId.trim();
  const id = raw.replace(/\D/g, "");
  const maybeUuid = raw.replace(/\s/g, "");
  if ((!id || id.length < 6) && maybeUuid.length < 12) {
    return { ok: false, detail: "ID de operación inválido" };
  }
  if (!opts.accessToken) return { ok: false, detail: "MP_ACCESS_TOKEN no configurado" };

  const used = alreadyUsed(id || maybeUuid);
  if (used) {
    return { ok: true, activation: used, detail: "already_active" };
  }

  const headers = { Authorization: `Bearer ${opts.accessToken}` };

  // 1) Pago único / cobro
  if (id) {
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, { headers });
    if (res.ok) {
      const data = (await res.json()) as {
        id?: number;
        status?: string;
        status_detail?: string;
        transaction_amount?: number;
        currency_id?: string;
        external_reference?: string;
        payer?: { email?: string };
        description?: string;
      };
      if (data.status !== "approved") {
        return {
          ok: false,
          detail: `Mercado Pago no aprobó el pago (estado: ${data.status ?? "?"}${
            data.status_detail ? ` · ${data.status_detail}` : ""
          }). Sin cobro aprobado no se activa.`,
        };
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
  if (id) {
    const res = await fetch(`https://api.mercadopago.com/authorized_payments/${id}`, { headers });
    if (res.ok) {
      const data = (await res.json()) as {
        id?: number;
        status?: string;
        rejection_code?: string;
        transaction_amount?: number;
        currency_id?: string;
        preapproval_id?: string;
        payment?: { id?: number; status?: string; status_detail?: string };
      };
      const payStatus = data.payment?.status;
      if (!isPaymentApproved(payStatus)) {
        return {
          ok: false,
          detail: `Mercado Pago no cobró la suscripción (estado: ${payStatus ?? data.status}${
            data.rejection_code ? ` · ${data.rejection_code}` : ""
          }). Sin cobro approved no se activa.`,
        };
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

  // 3) Preapproval (suscripción) — id alfanumérico
  {
    const preId = /[a-f0-9]{20,}/i.test(maybeUuid) ? maybeUuid : id;
    if (preId) {
      const res = await fetch(`https://api.mercadopago.com/preapproval/${preId}`, { headers });
      if (res.ok) {
        const data = (await res.json()) as {
          id?: string;
          status?: string;
          payer_email?: string;
          external_reference?: string;
          reason?: string;
          auto_recurring?: { transaction_amount?: number; currency_id?: string };
          summarized?: { charged_quantity?: number | null; last_charged_amount?: number | null };
        };
        if (data.status !== "authorized" && data.status !== "active") {
          return {
            ok: false,
            detail: `La suscripción está en estado "${data.status ?? "desconocido"}". Cancelada/pausada no activa.`,
          };
        }
        // Obligatorio: cobro approved (no alcanza authorized sin plata)
        const charge = await findApprovedChargeForPreapproval(String(data.id ?? preId), opts.accessToken);
        if (!charge) {
          return {
            ok: false,
            detail: "La suscripción existe pero no hay cobro approved. Cancelado/rechazado no activa.",
          };
        }
        const amount = charge.amount ?? data.auto_recurring?.transaction_amount;
        const plan =
          opts.claimedPlan ??
          detectPlan(amount, `${data.external_reference ?? ""} ${data.reason ?? ""}`);
        const activation: BillingActivation = {
          id: crypto.randomUUID(),
          plan,
          status: "active",
          email: data.payer_email,
          externalReference: data.external_reference,
          mpPreapprovalId: String(data.id ?? preId),
          mpPaymentId: charge.paymentId,
          amount,
          currency: data.auto_recurring?.currency_id,
          setupMeetPending: plan === "setup",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          rawType: "confirm.preapproval",
        };
        upsert(activation);
        console.log("[mp] confirm preapproval", plan, amount, preId);
        return { ok: true, activation };
      }
    }
  }

  return {
    ok: false,
    detail:
      "No encontramos ese ID en Mercado Pago. Revisá el número de operación de la pantalla de éxito (pago aprobado).",
  };
}

/**
 * Tras volver del checkout (back_url), busca cobros/suscripciones recientes
 * aprobados en MP y los marca activos en Lía.
 */
export async function syncRecentApprovals(opts: {
  accessToken: string;
  plan?: BillingPlan;
  sinceIso?: string;
}): Promise<{ ok: boolean; activation?: BillingActivation; detail?: string }> {
  if (!opts.accessToken) return { ok: false, detail: "MP_ACCESS_TOKEN no configurado" };
  const headers = { Authorization: `Bearer ${opts.accessToken}` };
  const sinceMs = opts.sinceIso ? Date.parse(opts.sinceIso) : Date.now() - 24 * 60 * 60_000;
  const since = Number.isFinite(sinceMs) ? sinceMs : Date.now() - 24 * 60 * 60_000;

  // Primero: ya activado en el store (p.ej. webhook/sync anterior)
  const fromStore = store.activations.find((a) => {
    if (a.status !== "active") return false;
    if (opts.plan && a.plan !== opts.plan) return false;
    const t = Date.parse(a.updatedAt || a.createdAt);
    return Number.isFinite(t) && t >= since - 60_000;
  });
  if (fromStore) return { ok: true, activation: fromStore, detail: "from_store" };

  // 1) Suscripciones recientes
  const preRes = await fetch("https://api.mercadopago.com/preapproval/search?limit=20", {
    headers,
  });
  if (preRes.ok) {
    const preData = (await preRes.json()) as {
      results?: Array<{
        id?: string;
        status?: string;
        reason?: string;
        date_created?: string;
        payer_email?: string;
        external_reference?: string;
        auto_recurring?: { transaction_amount?: number; currency_id?: string };
      }>;
    };
    for (const pre of preData.results ?? []) {
      const created = pre.date_created ? Date.parse(pre.date_created) : 0;
      if (created && created < since - 60_000) continue;
      if (pre.status !== "authorized" && pre.status !== "active") continue;

      // Exigir cobro aprobado (no alcanza con adhesión pending/cancelled)
      let chargedOk = false;
      let paymentId: string | undefined;
      let amount = pre.auto_recurring?.transaction_amount;
      if (pre.id) {
        const apRes = await fetch(
          `https://api.mercadopago.com/authorized_payments/search?preapproval_id=${pre.id}`,
          { headers },
        );
        if (apRes.ok) {
          const apData = (await apRes.json()) as {
            results?: Array<{
              payment?: { id?: number; status?: string };
              transaction_amount?: number;
              status?: string;
            }>;
          };
          for (const row of apData.results ?? []) {
            if (isPaymentApproved(row.payment?.status)) {
              chargedOk = true;
              paymentId = row.payment?.id ? String(row.payment.id) : undefined;
              amount = row.transaction_amount ?? amount;
              break;
            }
          }
        }
      }
      if (!chargedOk) continue;

      const plan =
        opts.plan ??
        detectPlan(amount, `${pre.external_reference ?? ""} ${pre.reason ?? ""}`);
      if (paymentId) {
        const used = alreadyUsed(paymentId);
        if (used?.status === "active") return { ok: true, activation: used, detail: "already_active" };
      }
      if (pre.id) {
        const usedPre = alreadyUsed(pre.id);
        if (usedPre?.status === "active") {
          return { ok: true, activation: usedPre, detail: "already_active" };
        }
      }

      const activation: BillingActivation = {
        id: crypto.randomUUID(),
        plan,
        status: "active",
        email: pre.payer_email,
        externalReference: pre.external_reference,
        mpPaymentId: paymentId,
        mpPreapprovalId: pre.id,
        amount,
        currency: pre.auto_recurring?.currency_id,
        setupMeetPending: plan === "setup",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        rawType: "sync.preapproval",
      };
      upsert(activation);
      console.log("[mp] sync preapproval", plan, pre.id);
      return { ok: true, activation };
    }
  }

  // 2) Ya no hace falta buscar otra vez en store (se hizo al inicio)

  return {
    ok: false,
    detail:
      "Todavía no vemos un cobro aprobado reciente. Si acabás de pagar, esperá unos segundos o pegá el número de operación.",
  };
}
