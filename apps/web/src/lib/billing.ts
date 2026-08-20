import { addDays, parseISO, differenceInDays } from "date-fns";

export type SubscriptionPlan = "self" | "setup";

export type Subscription = {
  status: "trial" | "active" | "expired" | "pending_payment";
  startedAt: string;
  trialEndsAt?: string;
  /** self = 49/mes · setup = 149 1er mes + 49 luego */
  plan?: SubscriptionPlan;
  /** Tras setup completo: mostrar CTA para coordinar meet */
  setupMeetPending?: boolean;
};

export function initTrial(): Subscription {
  const startedAt = new Date().toISOString();
  return {
    status: "trial",
    startedAt,
    trialEndsAt: addDays(new Date(), 14).toISOString(),
  };
}

export type SubStatus = "ok" | "trial" | "trial_ending" | "expired" | "pending_payment";

export function checkSubscription(sub?: Subscription): SubStatus {
  if (!sub) return "ok";
  if (sub.status === "active") return "ok";
  if (sub.status === "pending_payment") return "pending_payment";
  if (sub.status === "expired") return "expired";
  if (!sub.trialEndsAt) return "trial";
  const left = differenceInDays(parseISO(sub.trialEndsAt), new Date());
  if (left < 0) return "expired";
  if (left <= 3) return "trial_ending";
  return "trial";
}

export function trialDaysLeft(sub?: Subscription) {
  if (!sub?.trialEndsAt) return 0;
  return Math.max(0, differenceInDays(parseISO(sub.trialEndsAt), new Date()));
}

export function activateSubscription(
  sub: Subscription,
  opts?: { plan?: SubscriptionPlan; setupMeetPending?: boolean },
): Subscription {
  return {
    ...sub,
    status: "active",
    plan: opts?.plan ?? sub.plan,
    setupMeetPending: opts?.setupMeetPending ?? (opts?.plan === "setup" ? true : sub.setupMeetPending),
    startedAt: sub.startedAt || new Date().toISOString(),
  };
}

export function markMeetScheduled(sub: Subscription): Subscription {
  return { ...sub, setupMeetPending: false };
}

/** Checkout self-service: USD 49/mes */
let runtimeSelfUrl = "";
let runtimeSetupUrl = "";

export function setRuntimeCheckoutUrls(urls: { selfUrl?: string; setupUrl?: string }) {
  if (urls.selfUrl) runtimeSelfUrl = urls.selfUrl;
  if (urls.setupUrl) runtimeSetupUrl = urls.setupUrl;
}

export function checkoutSelfUrl() {
  return (
    runtimeSelfUrl ||
    (typeof import.meta !== "undefined" &&
      (import.meta.env?.VITE_MP_CHECKOUT_SELF_URL || import.meta.env?.VITE_MP_CHECKOUT_URL)) ||
    ""
  );
}

/** Checkout setup completo: USD 149 (1er mes incluido) → luego 49/mes */
export function checkoutSetupUrl() {
  return (
    runtimeSetupUrl ||
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_MP_CHECKOUT_SETUP_URL) ||
    ""
  );
}

export async function loadCheckoutConfigFromBot(): Promise<{
  selfUrl: string;
  setupUrl: string;
  mpConfigured: boolean;
}> {
  try {
    const { botUrl } = await import("@/lib/botBase");
    const res = await fetch(botUrl("/billing/checkout-config"));
    if (!res.ok) return { selfUrl: "", setupUrl: "", mpConfigured: false };
    const data = (await res.json()) as {
      selfUrl?: string;
      setupUrl?: string;
      mpConfigured?: boolean;
    };
    setRuntimeCheckoutUrls({ selfUrl: data.selfUrl, setupUrl: data.setupUrl });
    return {
      selfUrl: data.selfUrl ?? "",
      setupUrl: data.setupUrl ?? "",
      mpConfigured: Boolean(data.mpConfigured),
    };
  } catch {
    return { selfUrl: "", setupUrl: "", mpConfigured: false };
  }
}

/** Tu WhatsApp para coordinar el meet del setup completo */
export function setupWhatsApp(): string {
  const raw =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_SETUP_WHATSAPP) ||
    "5492346501704";
  return String(raw).replace(/\D/g, "");
}

export function setupMeetWhatsAppUrl(producerName?: string) {
  const phone = setupWhatsApp();
  const name = producerName?.trim() || "productor";
  const text = encodeURIComponent(
    `Hola, soy ${name}. Acabo de pagar el Setup completo de Lía y quiero coordinar el meet para configurar el estudio.`,
  );
  return `https://wa.me/${phone}?text=${text}`;
}

export type CheckoutChoice = "self" | "setup";

function rememberCheckout(choice: CheckoutChoice) {
  try {
    sessionStorage.setItem("lia_checkout_plan", choice);
    sessionStorage.setItem("lia_checkout_at", new Date().toISOString());
  } catch {
    /* ignore */
  }
}

export function readCheckoutSince(): string | undefined {
  try {
    return sessionStorage.getItem("lia_checkout_at") || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Abre MercadoPago según la opción.
 * Sin URL configurada: activa en local (dev/demo).
 * Con URL: NO activa hasta volver de pago / sync / operación.
 */
export function startCheckout(
  choice: CheckoutChoice,
  onLocalActivate: (plan: SubscriptionPlan) => void,
): "checkout" | "demo" {
  const url = choice === "setup" ? checkoutSetupUrl() : checkoutSelfUrl();
  const optimistic =
    typeof import.meta !== "undefined" &&
    import.meta.env?.VITE_CHECKOUT_OPTIMISTIC_ACTIVATE === "true";

  if (url) {
    if (optimistic) onLocalActivate(choice);
    rememberCheckout(choice);
    // Misma pestaña: el back_url de MP vuelve a /activar con ?paid=1
    window.location.assign(url);
    return "checkout";
  }
  onLocalActivate(choice);
  return "demo";
}

/** Extrae IDs típicos del return URL de Mercado Pago. */
export function extractMpReturnOperationId(params: URLSearchParams): string {
  const keys = [
    "payment_id",
    "collection_id",
    "preference_id",
    "merchant_order_id",
    "preapproval_id",
    "op",
    "operation",
    "id",
  ];
  for (const k of keys) {
    const v = params.get(k);
    if (v && v !== "null" && v !== "undefined") return v;
  }
  return "";
}

export async function confirmMercadoPagoPayment(
  operationId: string,
  plan?: SubscriptionPlan,
): Promise<{ ok: boolean; plan?: SubscriptionPlan; setupMeetPending?: boolean; error?: string }> {
  try {
    const { botUrl } = await import("@/lib/botBase");
    const res = await fetch(botUrl("/billing/confirm"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operationId, plan }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      plan?: SubscriptionPlan;
      setupMeetPending?: boolean;
      error?: string;
    };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "No se pudo confirmar el pago" };
    }
    return {
      ok: true,
      plan: data.plan ?? plan ?? "self",
      setupMeetPending: data.setupMeetPending,
    };
  } catch {
    return { ok: false, error: "No pude contactar al servidor de Lía" };
  }
}

/** Tras back_url: solo con operationId (nunca “último cobro reciente”). */
export async function syncAfterCheckout(
  plan?: SubscriptionPlan,
  since?: string,
  operationId?: string,
): Promise<{ ok: boolean; plan?: SubscriptionPlan; setupMeetPending?: boolean; error?: string }> {
  const op = (operationId || "").trim();
  if (!op) {
    return {
      ok: false,
      error: "Pegá el número de operación para activar (un pago = una cuenta).",
    };
  }
  return confirmMercadoPagoPayment(op, plan);
}
