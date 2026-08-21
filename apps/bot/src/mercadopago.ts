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
  /** En producción: sin secret = firma inválida (fail closed). */
  requireSecret?: boolean;
}): boolean {
  const { secret, xSignature, xRequestId, dataId, requireSecret } = opts;
  if (!secret) return !requireSecret; // dev sin secret OK; prod falla
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
  /** Usuario Lía que reclamó el pago (un pago = una cuenta). */
  userId?: string;
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
  // No matchear "49"/"149" sueltos: external_reference suele ser userId (UUID).
  if (/\bsetup\b/.test(r) || r.includes("usd 149")) return "setup";
  if (/\bself\b/.test(r) || r.includes("usd 49")) return "self";
  if (typeof amount === "number") {
    // ARS fijo (FX~1550): setup 230950 · self 75950. Legacy USD: 149 / 49.
    if (amount >= 150_000) return "setup";
    if (amount >= 100 && amount < 1_000) return "setup";
    return "self";
  }
  return "self";
}

/** Prioriza monto/referencia de MP; el claim del cliente solo empatando sin monto. */
function resolvePlan(amount?: number, ref?: string, claimed?: BillingPlan): BillingPlan {
  if (typeof amount === "number" || (ref && ref.trim())) {
    return detectPlan(amount, ref);
  }
  return claimed ?? detectPlan(amount, ref);
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

export { findApprovedChargeForPreapproval };

/** Espera cobro approved (MP a veces acredita async tras authorized). */
export async function waitForApprovedCharge(
  preId: string,
  accessToken: string,
  opts?: { attempts?: number; delayMs?: number },
): Promise<{ paymentId?: string; amount?: number } | null> {
  const attempts = opts?.attempts ?? 6;
  const delayMs = opts?.delayMs ?? 800;
  for (let i = 0; i < attempts; i++) {
    const hit = await findApprovedChargeForPreapproval(preId, accessToken);
    if (hit) return hit;
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

function ownershipOk(
  externalReference: string | undefined,
  userId: string | undefined,
): { ok: true } | { ok: false; detail: string } {
  if (!userId) return { ok: true };
  const ref = (externalReference ?? "").trim();
  if (!ref) {
    return {
      ok: false,
      detail:
        "Este pago no está vinculado a una cuenta Lía. Pagá desde /activar con sesión iniciada.",
    };
  }
  if (ref !== userId) {
    return {
      ok: false,
      detail: "Este pago pertenece a otra cuenta. Iniciá sesión con el email que usaste al pagar.",
    };
  }
  return { ok: true };
}

async function externalRefFromPreapproval(
  preapprovalId: string | undefined,
  accessToken: string,
): Promise<string | undefined> {
  if (!preapprovalId) return undefined;
  const res = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return undefined;
  const data = (await res.json()) as { external_reference?: string };
  return data.external_reference ? String(data.external_reference) : undefined;
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
      external_reference?: string;
      payment?: { id?: number; status?: string };
    };
    const payStatus = data.payment?.status;
    const amount = data.transaction_amount;
    const plan = detectPlan(amount, data.reason);
    let status: BillingActivation["status"] = "pending";
    if (isPaymentApproved(payStatus)) status = "active";
    else if (isDeadPaymentStatus(payStatus) || isDeadPaymentStatus(data.status)) status = "cancelled";
    const externalReference =
      data.external_reference ||
      (await externalRefFromPreapproval(data.preapproval_id, accessToken));
    const activation: BillingActivation = {
      id: crypto.randomUUID(),
      plan,
      status,
      externalReference,
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
    console.log(
      "[mp] authorized_payment",
      status,
      plan,
      amount,
      payStatus,
      externalReference ?? "no-ref",
      id,
    );
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
    // Ignorar validaciones MP / montos basura (p.ej. $0) — no desbloquean Estudio.
    const amountOk = typeof amount === "number" && amount >= 1;
    if (isPaymentApproved(data.status) && amountOk) status = "active";
    else if (isDeadPaymentStatus(data.status)) status = "cancelled";
    else if (isPaymentApproved(data.status) && !amountOk) {
      console.log("[mp] payment approved ignorado (monto inválido)", amount, id);
    }
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
  /** Usuario autenticado que reclama el pago. */
  userId?: string;
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
    // Mismo usuario reconfirma → OK. Activación huérfana (sin userId) → se vincula una sola vez.
    if (opts.userId && (!used.userId || used.userId === opts.userId)) {
      if (!used.userId) {
        used.userId = opts.userId;
        upsert(used);
      }
      return { ok: true, activation: used, detail: "already_active" };
    }
    return {
      ok: false,
      detail:
        "Este pago ya se usó para activar otra cuenta. Si fuiste vos, entrá con esa cuenta o pedí soporte.",
    };
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
      const owned = ownershipOk(data.external_reference, opts.userId);
      if (!owned.ok) return owned;
      const amount = data.transaction_amount;
      const plan = resolvePlan(
        amount,
        `${data.external_reference ?? ""} ${data.description ?? ""}`,
        opts.claimedPlan,
      );
      const activation: BillingActivation = {
        id: crypto.randomUUID(),
        plan,
        status: "active",
        userId: opts.userId,
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
      const externalReference = await externalRefFromPreapproval(
        data.preapproval_id,
        opts.accessToken,
      );
      const owned = ownershipOk(externalReference, opts.userId);
      if (!owned.ok) return owned;
      const amount = data.transaction_amount;
      const plan = resolvePlan(amount, undefined, opts.claimedPlan);
      const activation: BillingActivation = {
        id: crypto.randomUUID(),
        plan,
        status: "active",
        userId: opts.userId,
        externalReference,
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
        const owned = ownershipOk(data.external_reference, opts.userId);
        if (!owned.ok) return owned;
        // Obligatorio: cobro approved (no alcanza authorized sin plata)
        const charge = await findApprovedChargeForPreapproval(String(data.id ?? preId), opts.accessToken);
        if (!charge) {
          return {
            ok: false,
            detail: "La suscripción existe pero no hay cobro approved. Cancelado/rechazado no activa.",
          };
        }
        const amount = charge.amount ?? data.auto_recurring?.transaction_amount;
        const plan = resolvePlan(
          amount,
          `${data.external_reference ?? ""} ${data.reason ?? ""}`,
          opts.claimedPlan,
        );
        const activation: BillingActivation = {
          id: crypto.randomUUID(),
          plan,
          status: "active",
          userId: opts.userId,
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
 * Tras volver del checkout: SOLO con operationId (pago concreto).
 * Ya no “agarra el cobro reciente” — eso activaba varias cuentas con el mismo pago.
 */
export async function syncRecentApprovals(opts: {
  accessToken: string;
  plan?: BillingPlan;
  sinceIso?: string;
  operationId?: string;
  userId?: string;
}): Promise<{ ok: boolean; activation?: BillingActivation; detail?: string }> {
  const op = (opts.operationId ?? "").trim();
  if (!op) {
    return {
      ok: false,
      detail:
        "Para activar hace falta el número de operación de Mercado Pago. Así no se comparte un mismo pago entre cuentas.",
    };
  }
  return confirmByOperationId({
    operationId: op,
    accessToken: opts.accessToken,
    claimedPlan: opts.plan,
    userId: opts.userId,
  });
}
