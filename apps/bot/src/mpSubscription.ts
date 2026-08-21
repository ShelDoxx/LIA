/**
 * Suscripciones Mercado Pago (preapproval) + vault de tarjeta (customer/cards).
 * Lía nunca guarda PAN/CVV: solo IDs de MP (customer, card, preapproval).
 *
 * Docs:
 * - https://www.mercadopago.com.ar/developers/es/docs/subscriptions/subscription-management
 * - POST /preapproval · PUT /preapproval/{id} status=canceled
 * - POST /v1/customers · POST /v1/customers/{id}/cards
 */
import { randomUUID } from "node:crypto";
import type { BrickAmounts, BillingPlan } from "./mpBrickTypes.js";

export type CardForm = {
  token: string;
  payment_method_id: string;
  issuer_id?: string | number;
  installments?: number;
  payer?: {
    email?: string;
    identification?: { type?: string; number?: string };
  };
};

export async function mpFetch(
  path: string,
  accessToken: string,
  init?: RequestInit & { idempotencyKey?: string },
) {
  const method = (init?.method ?? "GET").toUpperCase();
  const needsIdempotency = method === "POST" || method === "PUT" || method === "PATCH";
  const idem =
    init?.idempotencyKey ||
    (needsIdempotency ? randomUUID().replace(/-/g, "").slice(0, 64) : undefined);
  const { idempotencyKey: _drop, ...rest } = init ?? {};
  const res = await fetch(`https://api.mercadopago.com${path}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(idem ? { "X-Idempotency-Key": idem } : {}),
      ...(rest.headers ?? {}),
    },
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json };
}

export async function findOrCreateCustomer(opts: {
  accessToken: string;
  email: string;
}): Promise<string | undefined> {
  const email = opts.email.trim().toLowerCase();
  const search = await mpFetch(
    `/v1/customers/search?email=${encodeURIComponent(email)}`,
    opts.accessToken,
  );
  const results = (search.json.results as Array<{ id?: string }> | undefined) ?? [];
  if (results[0]?.id) return String(results[0].id);
  const created = await mpFetch("/v1/customers", opts.accessToken, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  if (created.ok && created.json.id) return String(created.json.id);
  console.warn("[mp] customer create failed", created.status, JSON.stringify(created.json).slice(0, 300));
  return undefined;
}

function nextMonthIso() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

/** Espera a que un pago deje de estar in_process/pending. */
async function waitForPaymentStatus(
  paymentId: string,
  accessToken: string,
  opts?: { attempts?: number; delayMs?: number },
): Promise<Record<string, unknown> | null> {
  const attempts = opts?.attempts ?? 12;
  const delayMs = opts?.delayMs ?? 2500;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, delayMs));
    const res = await mpFetch(`/v1/payments/${paymentId}`, accessToken);
    if (!res.ok) continue;
    const st = String(res.json.status ?? "").toLowerCase();
    if (st !== "in_process" && st !== "pending") return res.json;
  }
  const last = await mpFetch(`/v1/payments/${paymentId}`, accessToken);
  return last.ok ? last.json : null;
}

export async function listCustomerCards(opts: {
  accessToken: string;
  customerId: string;
}): Promise<Array<{ id: string; lastFour?: string }>> {
  const cards = await mpFetch(`/v1/customers/${opts.customerId}/cards`, opts.accessToken);
  const raw = cards.json;
  const list = Array.isArray(raw)
    ? raw
    : ((raw as { data?: unknown[] }).data ?? (raw as { results?: unknown[] }).results ?? []);
  return (list as Array<{ id?: string | number; last_four_digits?: string }>).
    filter((c) => c.id != null).
    map((c) => ({
      id: String(c.id),
      lastFour: c.last_four_digits ? String(c.last_four_digits) : undefined,
    }));
}

/** Guarda referencia de tarjeta en el customer (token de un solo uso). */
export async function saveCardToCustomer(opts: {
  accessToken: string;
  customerId: string;
  token: string;
}): Promise<{ cardId?: string; lastFour?: string }> {
  const saved = await mpFetch(`/v1/customers/${opts.customerId}/cards`, opts.accessToken, {
    method: "POST",
    body: JSON.stringify({ token: opts.token }),
  });
  if (!saved.ok) {
    console.warn("[mp] save card", saved.status, JSON.stringify(saved.json).slice(0, 300));
    return {};
  }
  return {
    cardId: saved.json.id != null ? String(saved.json.id) : undefined,
    lastFour: saved.json.last_four_digits ? String(saved.json.last_four_digits) : undefined,
  };
}

export async function createMonthlyPreapproval(opts: {
  accessToken: string;
  userId: string;
  email: string;
  amounts: BrickAmounts;
  backUrl: string;
  cardTokenId?: string;
  cardId?: string;
  /** Si true, primer cobro el mes que viene (post-setup). */
  startNextMonth?: boolean;
  reasonSuffix?: string;
}): Promise<{ ok: boolean; preapprovalId?: string; detail?: string; status?: string }> {
  if (!opts.cardTokenId && !opts.cardId) {
    return { ok: false, detail: "Falta tarjeta (token o card_id)" };
  }
  const body: Record<string, unknown> = {
    reason: `Lía Estudio — USD ${opts.amounts.usdSelf}/mes${opts.reasonSuffix ?? ""}`,
    external_reference: opts.userId,
    payer_email: opts.email,
    auto_recurring: {
      frequency: 1,
      frequency_type: "months",
      ...(opts.startNextMonth ? { start_date: nextMonthIso() } : {}),
      transaction_amount: opts.amounts.arsSelf,
      currency_id: "ARS",
    },
    back_url: opts.backUrl,
    status: "authorized",
  };
  if (opts.cardTokenId) body.card_token_id = opts.cardTokenId;
  if (opts.cardId) body.card_id = /^\d+$/.test(opts.cardId) ? Number(opts.cardId) : opts.cardId;

  const created = await mpFetch("/preapproval", opts.accessToken, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!created.ok) {
    console.error("[mp] create preapproval", created.status, JSON.stringify(created.json).slice(0, 500));
    return {
      ok: false,
      detail:
        (typeof created.json.message === "string" && created.json.message) ||
        "No se pudo crear la suscripción",
    };
  }
  const status = String(created.json.status ?? "").toLowerCase();
  const preId = String(created.json.id ?? "");
  if (status !== "authorized" && status !== "active") {
    return {
      ok: false,
      detail: `Suscripción en estado "${status || "?"}".`,
      status,
      preapprovalId: preId || undefined,
    };
  }
  return { ok: true, preapprovalId: preId, status };
}

/** Cancela preapprovals authorized/pending del mismo user (evita cobros huérfanos al reintentar). */
export async function cancelOrphanPreapprovalsForUser(opts: {
  accessToken: string;
  userId: string;
  keepId?: string;
}): Promise<number> {
  const search = await mpFetch(
    `/preapproval/search?external_reference=${encodeURIComponent(opts.userId)}&status=authorized`,
    opts.accessToken,
  );
  const results =
    (search.json.results as Array<{ id?: string; status?: string }> | undefined) ?? [];
  // También pending
  const searchPending = await mpFetch(
    `/preapproval/search?external_reference=${encodeURIComponent(opts.userId)}&status=pending`,
    opts.accessToken,
  );
  const pending =
    (searchPending.json.results as Array<{ id?: string; status?: string }> | undefined) ?? [];
  const all = [...results, ...pending];
  let n = 0;
  const seen = new Set<string>();
  for (const row of all) {
    const id = row.id ? String(row.id) : "";
    if (!id || seen.has(id) || id === opts.keepId) continue;
    seen.add(id);
    const st = String(row.status ?? "").toLowerCase();
    if (st === "cancelled" || st === "canceled" || st === "paused") continue;
    const r = await cancelPreapproval({ accessToken: opts.accessToken, preapprovalId: id });
    if (r.ok) {
      n += 1;
      console.log("[mp] orphan preapproval cancelled", id, opts.userId);
    }
  }
  return n;
}

/** Cancela suscripción en MP (status canceled). */
export async function cancelPreapproval(opts: {
  accessToken: string;
  preapprovalId: string;
}): Promise<{ ok: boolean; detail?: string; status?: string }> {
  const updated = await mpFetch(`/preapproval/${opts.preapprovalId}`, opts.accessToken, {
    method: "PUT",
    body: JSON.stringify({ status: "canceled" }),
  });
  if (!updated.ok) {
    console.error("[mp] cancel preapproval", updated.status, JSON.stringify(updated.json).slice(0, 400));
    return {
      ok: false,
      detail:
        (typeof updated.json.message === "string" && updated.json.message) ||
        "No se pudo cancelar en Mercado Pago",
    };
  }
  return { ok: true, status: String(updated.json.status ?? "canceled") };
}

export async function fetchPreapproval(opts: {
  accessToken: string;
  preapprovalId: string;
}): Promise<{
  ok: boolean;
  status?: string;
  amount?: number;
  nextPaymentDate?: string;
  payerEmail?: string;
  cardId?: string;
}> {
  const res = await mpFetch(`/preapproval/${opts.preapprovalId}`, opts.accessToken);
  if (!res.ok) return { ok: false };
  const ar = res.json.auto_recurring as
    | { transaction_amount?: number; start_date?: string }
    | undefined;
  const summarized = res.json.summarized as { next_payment_date?: string } | undefined;
  return {
    ok: true,
    status: String(res.json.status ?? ""),
    amount: ar?.transaction_amount,
    nextPaymentDate: summarized?.next_payment_date || ar?.start_date,
    payerEmail: res.json.payer_email ? String(res.json.payer_email) : undefined,
    cardId: res.json.card_id != null ? String(res.json.card_id) : undefined,
  };
}

export type CheckoutResult = {
  ok: boolean;
  plan?: BillingPlan;
  setupMeetPending?: boolean;
  mpPaymentId?: string;
  mpPreapprovalId?: string;
  mpCustomerId?: string;
  cardLastFour?: string;
  amount?: number;
  detail?: string;
  needsCardForMonthly?: boolean;
};

export async function processBrickCheckout(opts: {
  accessToken: string;
  plan: BillingPlan;
  amounts: BrickAmounts;
  userId: string;
  userEmail: string;
  card: CardForm;
  backUrl: string;
}): Promise<CheckoutResult> {
  const email = (opts.card.payer?.email || opts.userEmail).trim().toLowerCase();
  if (!opts.card.token) return { ok: false, detail: "Falta token de tarjeta" };
  if (!email.includes("@")) return { ok: false, detail: "Email de pagador inválido" };

  const customerId = await findOrCreateCustomer({
    accessToken: opts.accessToken,
    email,
  });

  // Limpiar suscripciones huérfanas de reintentos anteriores (mismo userId).
  try {
    await cancelOrphanPreapprovalsForUser({
      accessToken: opts.accessToken,
      userId: opts.userId,
    });
  } catch (err) {
    console.warn("[mp] orphan cleanup failed", err);
  }

  /**
   * Self y Setup: cobrar YA con /v1/payments (approved inmediato).
   * El preapproval de MP demora ~1h en el 1er authorized_payment — no sirve
   * para desbloquear acceso en el checkout.
   * Después enganchamos suscripción mensual con start_date = +1 mes.
   */
  const isSetup = opts.plan === "setup";
  const amount = isSetup ? opts.amounts.arsSetup : opts.amounts.arsSelf;
  const paymentBody: Record<string, unknown> = {
    transaction_amount: amount,
    token: opts.card.token,
    description: isSetup
      ? `Lía Estudio — Setup USD ${opts.amounts.usdSetup} (1er mes)`
      : `Lía Estudio — Self USD ${opts.amounts.usdSelf}/mes`,
    installments: Number(opts.card.installments || 1),
    payment_method_id: opts.card.payment_method_id,
    external_reference: opts.userId,
    metadata: { lia_plan: opts.plan, lia_user_id: opts.userId },
    payer: customerId
      ? {
          type: "customer",
          id: customerId,
          email,
          identification: opts.card.payer?.identification,
        }
      : {
          email,
          identification: opts.card.payer?.identification,
        },
  };
  if (opts.card.issuer_id) paymentBody.issuer_id = Number(opts.card.issuer_id);

  const pay = await mpFetch("/v1/payments", opts.accessToken, {
    method: "POST",
    // Una clave por intento de cobro (user + plan + token prefix) evita dobles cobros en retry.
    idempotencyKey: `${opts.userId}:${opts.plan}:${opts.card.token.slice(0, 24)}`.slice(0, 64),
    body: JSON.stringify(paymentBody),
  });
  if (!pay.ok) {
    console.error("[mp] payment", opts.plan, pay.status, JSON.stringify(pay.json).slice(0, 500));
    return {
      ok: false,
      detail:
        (typeof pay.json.message === "string" && pay.json.message) ||
        (isSetup ? "No se pudo cobrar el Setup" : "No se pudo cobrar el plan Self"),
    };
  }

  let payJson = pay.json;
  let payStatus = String(payJson.status ?? "").toLowerCase();
  const paymentId = String(payJson.id ?? "");
  // MP a veces responde in_process/pending y acredita (o rechaza) segundos después.
  if (paymentId && (payStatus === "in_process" || payStatus === "pending")) {
    console.log("[mp] payment waiting resolution", paymentId, payStatus);
    const resolved = await waitForPaymentStatus(paymentId, opts.accessToken, {
      attempts: 12,
      delayMs: 2500,
    });
    if (resolved) {
      payJson = resolved;
      payStatus = String(resolved.status ?? "").toLowerCase();
    }
  }

  if (payStatus !== "approved") {
    const detail = String(payJson.status_detail ?? "");
    console.warn("[mp] payment not approved", paymentId, payStatus, detail);
    if (payStatus === "in_process" || payStatus === "pending") {
      return {
        ok: false,
        detail:
          "Mercado Pago todavía está revisando el cobro. En unos minutos, si lo acredita, el plan se activa solo. No vuelvas a pagar de inmediato.",
        mpPaymentId: paymentId || undefined,
      };
    }
    if (payStatus === "rejected" || payStatus === "cancelled" || payStatus === "canceled") {
      return {
        ok: false,
        detail: detail
          ? `Mercado Pago rechazó el pago (${detail}). Probá otra tarjeta.`
          : "Mercado Pago rechazó el pago. Probá otra tarjeta.",
        mpPaymentId: paymentId || undefined,
      };
    }
    return {
      ok: false,
      detail: `Mercado Pago no aprobó el pago (estado: ${payStatus || "?"}).`,
      mpPaymentId: paymentId || undefined,
    };
  }
  // Regla dura: sin payment id + monto real no hay activación.
  const charged = Number(payJson.transaction_amount ?? amount);
  if (!paymentId || !(charged >= 15)) {
    console.error("[mp] cobro inválido para activar", paymentId, charged, opts.plan);
    return {
      ok: false,
      detail: "Mercado Pago no acreditó un cobro válido. Reintentá o usá otra tarjeta.",
    };
  }

  const payCard = payJson.card as
    | { id?: string | number; last_four_digits?: string; tags?: string[] }
    | undefined;
  const isPrepaid = Array.isArray(payCard?.tags) && payCard.tags.includes("prepaid");
  let cardId = payCard?.id != null ? String(payCard.id) : undefined;
  let lastFour = payCard?.last_four_digits ? String(payCard.last_four_digits) : undefined;

  // 1) Tarjetas vaultables: MP suele devolver card.id. Si no, intentamos guardar el token.
  if (customerId && !cardId && opts.card.token) {
    const saved = await saveCardToCustomer({
      accessToken: opts.accessToken,
      customerId,
      token: opts.card.token,
    });
    if (saved.cardId) {
      cardId = saved.cardId;
      lastFour = saved.lastFour ?? lastFour;
      console.log("[mp] card vaulted post-charge", cardId);
    }
  }
  if (customerId && !cardId) {
    const existing = await listCustomerCards({
      accessToken: opts.accessToken,
      customerId,
    });
    if (existing[0]) {
      cardId = existing[0].id;
      lastFour = existing[0].lastFour ?? lastFour;
    }
  }

  // 2) Enganche mensual automático (sin pedir “Guardar” al cliente).
  //    Preferimos card_id; si no hay (p.ej. prepaga), reintentamos con el mismo token.
  let preapprovalId: string | undefined;
  const subBase = {
    accessToken: opts.accessToken,
    userId: opts.userId,
    email,
    amounts: opts.amounts,
    backUrl: opts.backUrl,
    startNextMonth: true as const,
    reasonSuffix: isSetup ? " (post-setup)" : " (post-self)",
  };
  if (cardId) {
    const sub = await createMonthlyPreapproval({ ...subBase, cardId });
    if (sub.ok) preapprovalId = sub.preapprovalId;
    else console.warn("[mp]", opts.plan, "preapproval card_id failed", sub.detail);
  }
  if (!preapprovalId && opts.card.token) {
    const sub = await createMonthlyPreapproval({
      ...subBase,
      cardTokenId: opts.card.token,
    });
    if (sub.ok) {
      preapprovalId = sub.preapprovalId;
      console.log("[mp] preapproval via card_token_id", preapprovalId);
    } else {
      console.warn("[mp]", opts.plan, "preapproval token failed", sub.detail, {
        isPrepaid,
      });
    }
  }
  if (!preapprovalId) {
    console.warn(
      "[mp]",
      opts.plan,
      "paid — sin suscripción automática",
      isPrepaid ? "prepaid" : "no-card",
    );
  }

  return {
    ok: true,
    plan: opts.plan,
    setupMeetPending: isSetup,
    mpPaymentId: paymentId,
    mpPreapprovalId: preapprovalId,
    mpCustomerId: customerId,
    cardLastFour: lastFour,
    amount: charged,
    detail: isSetup
      ? preapprovalId
        ? "setup_paid_and_subscribed"
        : "setup_paid"
      : preapprovalId
        ? "self_paid_and_subscribed"
        : "self_paid",
    needsCardForMonthly: !preapprovalId,
  };
}

/**
 * Engancha cobro mensual con un nuevo token (cuando Setup no dejó card_id).
 * Cobra a partir del mes siguiente si startNextMonth.
 */
export async function attachMonthlyWithCard(opts: {
  accessToken: string;
  amounts: BrickAmounts;
  userId: string;
  userEmail: string;
  card: CardForm;
  backUrl: string;
  startNextMonth?: boolean;
}): Promise<CheckoutResult> {
  const email = (opts.card.payer?.email || opts.userEmail).trim().toLowerCase();
  if (!opts.card.token) return { ok: false, detail: "Falta token de tarjeta" };

  const customerId = await findOrCreateCustomer({
    accessToken: opts.accessToken,
    email,
  });

  // Preferir guardar en vault y suscribir con card_id (reutilizable).
  let cardId: string | undefined;
  let lastFour: string | undefined;
  if (customerId) {
    const saved = await saveCardToCustomer({
      accessToken: opts.accessToken,
      customerId,
      token: opts.card.token,
    });
    cardId = saved.cardId;
    lastFour = saved.lastFour;
  }

  const created = await createMonthlyPreapproval({
    accessToken: opts.accessToken,
    userId: opts.userId,
    email,
    amounts: opts.amounts,
    backUrl: opts.backUrl,
    cardId,
    // Si no se pudo guardar, usar el token (solo si save falló — token ya consumido si save ok)
    cardTokenId: cardId ? undefined : opts.card.token,
    startNextMonth: opts.startNextMonth !== false,
    reasonSuffix: " (renovación)",
  });

  if (!created.ok) {
    // Si guardamos la tarjeta pero el token se consumió y falló card_id path, reintentar no ayuda
    return { ok: false, detail: created.detail };
  }

  return {
    ok: true,
    plan: "self",
    mpPreapprovalId: created.preapprovalId,
    mpCustomerId: customerId,
    cardLastFour: lastFour,
    amount: opts.amounts.arsSelf,
    detail: "monthly_attached",
    needsCardForMonthly: false,
  };
}
