import { config as envConfig } from "./config.js";
import { getWhatsAppConfig, isWhatsAppConfigured } from "./runtimeConfig.js";

const GRAPH = `https://graph.facebook.com/${envConfig.graphVersion}`;

async function graphJson(path: string, token: string, method = "GET") {
  const res = await fetch(`${GRAPH}/${path.replace(/^\//, "")}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json() as Promise<Record<string, unknown>>;
}

async function resolveWabaId(token: string, phoneNumberId: string, hint?: string): Promise<string | undefined> {
  if (hint) return hint.replace(/\D/g, "");

  const direct = await graphJson(`${phoneNumberId}?fields=whatsapp_business_account`, token);
  const nested = direct.whatsapp_business_account as { id?: string } | undefined;
  if (nested?.id) return nested.id;

  const accounts = await graphJson("me?fields=whatsapp_business_accounts{id,name}", token);
  const list = (accounts.whatsapp_business_accounts as { data?: { id?: string }[] } | undefined)?.data;
  if (list?.[0]?.id) return list[0].id;

  return undefined;
}

export async function subscribeAppToWaba(wabaHint?: string): Promise<{ ok: boolean; wabaId?: string; error?: string }> {
  if (!isWhatsAppConfigured()) return { ok: false, error: "sin credenciales" };
  const { token, phoneNumberId } = getWhatsAppConfig();

  const wabaId = await resolveWabaId(token, phoneNumberId, wabaHint);
  if (!wabaId) {
    return { ok: false, error: "no pude leer el WABA. Pasá el WhatsApp Business Account ID." };
  }

  const sub = (await graphJson(`${wabaId}/subscribed_apps`, token, "POST")) as {
    success?: boolean;
    error?: { message?: string };
  };
  if (sub.success === true) {
    console.log("[meta] app suscripta al WABA", wabaId);
    return { ok: true, wabaId };
  }
  return { ok: false, wabaId, error: sub.error?.message || "subscribed_apps falló" };
}
