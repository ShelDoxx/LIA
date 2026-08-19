import { botUrl } from "@/lib/botBase";

export type BotHealth = {
  ok: boolean;
  contextClients?: number;
  whatsapp?: boolean;
  tokenExpired?: boolean;
  tokenWarning?: string | null;
};

export async function fetchBotHealth(): Promise<BotHealth> {
  try {
    const res = await fetch(botUrl("/health"));
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as Record<string, unknown>;
    return {
      ok: Boolean(data.ok),
      contextClients: typeof data.contextClients === "number" ? data.contextClients : undefined,
      whatsapp: Boolean(data.whatsapp),
      tokenExpired: Boolean(data.tokenExpired),
      tokenWarning: typeof data.tokenWarning === "string" ? data.tokenWarning : null,
    };
  } catch {
    return { ok: false };
  }
}

export async function simulateBotReply(phone: string, text: string): Promise<string | null> {
  try {
    const res = await fetch(botUrl("/simulate"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, phone: phone.replace(/\D/g, "") }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { reply?: string };
    return typeof data.reply === "string" ? data.reply : null;
  } catch {
    return null;
  }
}
