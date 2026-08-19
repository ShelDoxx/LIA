import { addDays, parseISO, differenceInDays } from "date-fns";

export type Subscription = {
  status: "trial" | "active" | "expired";
  startedAt: string;
  trialEndsAt?: string;
};

export function initTrial(): Subscription {
  const startedAt = new Date().toISOString();
  return {
    status: "trial",
    startedAt,
    trialEndsAt: addDays(new Date(), 14).toISOString(),
  };
}

export type SubStatus = "ok" | "trial" | "trial_ending" | "expired";

export function checkSubscription(sub?: Subscription): SubStatus {
  if (!sub) return "ok";
  if (sub.status === "active") return "ok";
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

export function activateSubscription(sub: Subscription): Subscription {
  return { ...sub, status: "active" };
}

/** Link de pago Mercado Pago o Stripe. Sin URL, el escritorio activa en modo demo. */
export function checkoutUrl() {
  return (
    (typeof import.meta !== "undefined" &&
      (import.meta.env?.VITE_MP_CHECKOUT_URL || import.meta.env?.VITE_STRIPE_CHECKOUT_URL)) ||
    ""
  );
}

export function startCheckout(onDemoActivate: () => void) {
  const url = checkoutUrl();
  // Sin webhook de confirmación real, la única forma de que el paywall desbloquee
  // cuando existe URL de checkout es activar de forma optimista.
  // Podés desactivar esto con VITE_CHECKOUT_OPTIMISTIC_ACTIVATE="false".
  const optimistic =
    (typeof import.meta !== "undefined" &&
      import.meta.env?.VITE_CHECKOUT_OPTIMISTIC_ACTIVATE !== "false") ??
    true;
  if (url) {
    if (optimistic) onDemoActivate();
    window.open(url, "_blank", "noopener,noreferrer");
    return "checkout" as const;
  }
  onDemoActivate();
  return "demo" as const;
}
