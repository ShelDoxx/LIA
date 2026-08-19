import type { LiaState } from "@/lib/types";

/** Secret compartido bot↔web. El productor lo copia de la consola del bot la primera vez. */
export function getLiaSecret(): string {
  return localStorage.getItem("lia_bot_secret") ?? "";
}

export function saveLiaSecret(s: string) {
  localStorage.setItem("lia_bot_secret", s);
}

function botHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const secret = getLiaSecret();
  return {
    "Content-Type": "application/json",
    ...(secret ? { "X-Lia-Secret": secret } : {}),
    ...extra,
  };
}

export type OutboundMessage = {
  phone: string;
  text: string;
  key?: string;
};

export type OutboundResult = {
  sent: number;
  failed: number;
  demo: boolean;
  whatsapp: boolean;
};

export function shouldSendWhatsApp(state: LiaState) {
  return state.bot.connected && state.bot.whatsappOutbound !== false;
}

export async function sendOutboundBatch(messages: OutboundMessage[]): Promise<OutboundResult> {
  if (!messages.length) return { sent: 0, failed: 0, demo: false, whatsapp: false };
  try {
    const res = await fetch("/api/bot/jobs/outbound", {
      method: "POST",
      headers: botHeaders(),
      body: JSON.stringify({ messages }),
    });
    if (!res.ok) return { sent: 0, failed: messages.length, demo: false, whatsapp: false };
    return (await res.json()) as OutboundResult;
  } catch {
    return { sent: 0, failed: messages.length, demo: false, whatsapp: false };
  }
}

export async function pushMetaConfigToBot(meta: {
  metaAccessToken?: string;
  metaPhoneNumberId?: string;
  metaVerifyToken?: string;
}): Promise<boolean> {
  try {
    const res = await fetch("/api/bot/config", {
      method: "POST",
      headers: botHeaders(),
      body: JSON.stringify({
        token: meta.metaAccessToken ?? "",
        phoneNumberId: meta.metaPhoneNumberId ?? "",
        verifyToken: meta.metaVerifyToken ?? "",
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function sendTestWhatsApp(
  phone: string,
  text?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/bot/test-message", {
      method: "POST",
      headers: botHeaders(),
      body: JSON.stringify({ phone: phone.replace(/\D/g, ""), text }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { ok: false, error: data.error || "Falló el envío." };
    return { ok: true };
  } catch {
    return { ok: false, error: "No pude contactar al bot en localhost:8787." };
  }
}
