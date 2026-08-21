/**
 * Suscripciones Mercado Pago (preapproval) + vault de tarjeta (customer/cards).
 * Lía nunca guarda PAN/CVV: solo IDs de MP (customer, card, preapproval).
 *
 * Docs:
 * - https://www.mercadopago.com.ar/developers/es/docs/subscriptions/subscription-management
 * - POST /preapproval · PUT /preapproval/{id} status=canceled
 * - POST /v1/customers · POST /v1/customers/{id}/cards
 */
import type { BrickAmounts, BillingPlan } from "./mpBrickTypes.js";
import { waitForApprovedCharge } from "./mercadopago.js";

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

export async function mpFetch(path: string, accessToken: string, init?: RequestInit) {
  const res = await fetch(`https://api.mercadopago.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
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

  if (opts.plan === "self") {
    // Suscripción mensual: MP guarda la tarjeta en el preapproval y cobra solo.
    const created = await createMonthlyPreapproval({
      accessToken: opts.accessToken,
      userId: opts.userId,
      email,
      amounts: opts.amounts,
      backUrl: opts.backUrl,
      cardTokenId: opts.card.token,
      startNextMonth: false,
    });
    if (!created.ok || !created.preapprovalId) {
      return { ok: false, detail: created.detail || "No se pudo crear la suscripción" };
    }
    const charge = await waitForApprovedCharge(created.preapprovalId, opts.accessToken);
    if (!charge) {
      return {
        ok: false,
        detail:
          "La suscripción se creó pero Mercado Pago aún no acreditó el cobro. Esperá unos segundos y verificá, o reintentá.",
        mpPreapprovalId: created.preapprovalId,
        mpCustomerId: customerId,
      };
    }
    return {
      ok: true,
      plan: "self",
      setupMeetPending: false,
      mpPreapprovalId: created.preapprovalId,
      mpPaymentId: charge.paymentId,
      mpCustomerId: customerId,
      amount: charge.amount ?? opts.amounts.arsSelf,
      detail: "subscription_charged",
    };
  }

  // Setup: 1er mes (pago único) + enganche de suscripción 49/mes
  const paymentBody: Record<string, unknown> = {
    transaction_amount: opts.amounts.arsSetup,
    token: opts.card.token,
    description: `Lía Estudio — Setup USD ${opts.amounts.usdSetup} (1er mes)`,
    installments: Number(opts.card.installments || 1),
    payment_method_id: opts.card.payment_method_id,
    external_reference: opts.userId,
    metadata: { lia_plan: "setup", lia_user_id: opts.userId },
    payer: {
      email,
      identification: opts.card.payer?.identification,
      ...(customerId ? { type: "customer", id: customerId } : {}),
    },
  };
  if (opts.card.issuer_id) paymentBody.issuer_id = Number(opts.card.issuer_id);

  const pay = await mpFetch("/v1/payments", opts.accessToken, {
    method: "POST",
    body: JSON.stringify(paymentBody),
  });
  if (!pay.ok) {
    console.error("[mp] payment setup", pay.status, JSON.stringify(pay.json).slice(0, 500));
    return {
      ok: false,
      detail:
        (typeof pay.json.message === "string" && pay.json.message) ||
        "No se pudo cobrar el Setup",
    };
  }
  const payStatus = String(pay.json.status ?? "").toLowerCase();
  const paymentId = String(pay.json.id ?? "");
  if (payStatus !== "approved") {
    return {
      ok: false,
      detail: `Mercado Pago no aprobó el pago (estado: ${payStatus || "?"}).`,
    };
  }

  const payCard = pay.json.card as
    | { id?: string | number; last_four_digits?: string }
    | undefined;
  let cardId = payCard?.id != null ? String(payCard.id) : undefined;
  let lastFour = payCard?.last_four_digits ? String(payCard.last_four_digits) : undefined;

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

  let preapprovalId: string | undefined;
  if (cardId) {
    const sub = await createMonthlyPreapproval({
      accessToken: opts.accessToken,
      userId: opts.userId,
      email,
      amounts: opts.amounts,
      backUrl: opts.backUrl,
      cardId,
      startNextMonth: true,
      reasonSuffix: " (post-setup)",
    });
    if (sub.ok) preapprovalId = sub.preapprovalId;
    else console.warn("[mp] setup paid but monthly sub failed", sub.detail);
  } else {
    console.warn("[mp] setup paid — sin card_id; el usuario debe enganchar el cobro mensual");
  }

  return {
    ok: true,
    plan: "setup",
    setupMeetPending: true,
    mpPaymentId: paymentId,
    mpPreapprovalId: preapprovalId,
    mpCustomerId: customerId,
    cardLastFour: lastFour,
    amount: opts.amounts.arsSetup,
    detail: preapprovalId ? "setup_paid_and_subscribed" : "setup_paid",
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
