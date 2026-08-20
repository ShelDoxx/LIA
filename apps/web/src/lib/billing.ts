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
export function checkoutSelfUrl() {
  return (
    (typeof import.meta !== "undefined" &&
      (import.meta.env?.VITE_MP_CHECKOUT_SELF_URL || import.meta.env?.VITE_MP_CHECKOUT_URL)) ||
    ""
  );
}

/** Checkout setup completo: USD 149 (1er mes incluido) → luego 49/mes */
export function checkoutSetupUrl() {
  return (
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_MP_CHECKOUT_SETUP_URL) || ""
  );
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

/**
 * Abre MercadoPago según la opción.
 * Sin URL configurada: activa en local (dev/demo).
 * Con URL: NO activa hasta volver de pago / webhook (salvo VITE_CHECKOUT_OPTIMISTIC_ACTIVATE=true).
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
    const sep = url.includes("?") ? "&" : "?";
    // back_url hint si el link de MP lo permite vía query (algunos init_point lo ignoran)
    window.open(url, "_blank", "noopener,noreferrer");
    // Guardar intención para la pantalla /activar
    try {
      sessionStorage.setItem("lia_checkout_plan", choice);
    } catch {
      /* ignore */
    }
    void sep;
    return "checkout";
  }
  onLocalActivate(choice);
  return "demo";
}

/** @deprecated usar startCheckout("self" | "setup", ...) */
export function checkoutUrl() {
  return checkoutSelfUrl();
}
