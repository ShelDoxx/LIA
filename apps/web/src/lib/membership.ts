import { botUrl } from "@/lib/botBase";
import { getSessionToken, type LiaEntitlement } from "@/lib/authApi";

export type MembershipInfo = {
  status: string;
  plan?: "self" | "setup";
  renewalRequired?: boolean;
  periodEndsAt?: string;
  daysLeft?: number | null;
  graceLabel?: string | null;
  mpPreapprovalId?: string;
  mpCustomerId?: string;
  cardLastFour?: string;
  mpStatus?: string;
  nextPaymentDate?: string;
  amountArs?: number;
  canCancel?: boolean;
};

export async function fetchMembership(): Promise<{
  ok: boolean;
  subscription?: MembershipInfo | null;
  error?: string;
}> {
  try {
    const token = getSessionToken();
    if (!token) return { ok: false, error: "Sin sesión" };
    const res = await fetch(botUrl("/billing/subscription"), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      subscription?: MembershipInfo | null;
      error?: string;
    };
    if (!res.ok || !data.ok) return { ok: false, error: data.error || "No se pudo cargar" };
    return { ok: true, subscription: data.subscription ?? null };
  } catch {
    return { ok: false, error: "Sin conexión" };
  }
}

export async function cancelMembership(): Promise<{
  ok: boolean;
  entitlement?: LiaEntitlement;
  message?: string;
  error?: string;
}> {
  try {
    const token = getSessionToken();
    if (!token) return { ok: false, error: "Sin sesión" };
    const res = await fetch(botUrl("/billing/cancel-subscription"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      entitlement?: LiaEntitlement;
      message?: string;
      error?: string;
    };
    if (!res.ok || !data.ok) return { ok: false, error: data.error || "No se pudo cancelar" };
    return { ok: true, entitlement: data.entitlement, message: data.message };
  } catch {
    return { ok: false, error: "Sin conexión" };
  }
}

export async function attachMonthlyCard(formData: object): Promise<{
  ok: boolean;
  error?: string;
  cardLastFour?: string;
}> {
  try {
    const token = getSessionToken();
    if (!token) return { ok: false, error: "Sin sesión" };
    const res = await fetch(botUrl("/billing/attach-card"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(formData),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      cardLastFour?: string;
    };
    if (!res.ok || !data.ok) return { ok: false, error: data.error || "No se pudo guardar" };
    return { ok: true, cardLastFour: data.cardLastFour };
  } catch {
    return { ok: false, error: "Sin conexión" };
  }
}
