import { botUrl } from "@/lib/botBase";
import type { LiaEntitlement } from "@/lib/authApi";
import { getSessionToken } from "@/lib/authApi";

/** Simula gracia corta (aviso + bloqueo). Admin o sesión propia. */
export async function simulateRenewalGrace(minutes = 3): Promise<{
  ok: boolean;
  entitlement?: LiaEntitlement;
  error?: string;
}> {
  try {
    const token = getSessionToken();
    if (!token) return { ok: false, error: "Sin sesión" };
    const res = await fetch(botUrl("/billing/simulate-renewal-grace"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ minutes }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      entitlement?: LiaEntitlement;
      error?: string;
    };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "No se pudo simular" };
    }
    return { ok: true, entitlement: data.entitlement };
  } catch {
    return { ok: false, error: "Sin conexión al bot" };
  }
}
