import { config as envConfig } from "./config.js";
import { getWhatsAppConfig, isWhatsAppConfigured } from "./runtimeConfig.js";
import { isWindowOpen } from "./windowStore.js";

const GRAPH = `https://graph.facebook.com/${envConfig.graphVersion}`;

export { isWhatsAppConfigured as isConfigured };

/** Meta's AR test list often stores 54 + área + 15 + número (sin el 9). */
export function metaAllowlistVariantsAR(to: string): string[] {
  const d = to.replace(/\D/g, "");
  const variants = [d];
  let national = d;
  if (national.startsWith("549")) national = national.slice(3);
  else if (national.startsWith("54")) national = national.slice(2);
  if (national.startsWith("9") && national.length >= 10) national = national.slice(1);
  if (national.startsWith("0")) national = national.slice(1);
  if (national.length === 10 && !national.includes("15")) {
    if (national.startsWith("11")) variants.push(`541115${national.slice(2)}`);
    else {
      variants.push(`54${national.slice(0, 4)}15${national.slice(4)}`);
      variants.push(`54${national.slice(0, 3)}15${national.slice(3)}`);
    }
  }
  return [...new Set(variants.filter(Boolean))];
}

async function postMessage(to: string, payload: Record<string, unknown>) {
  const { token, phoneNumberId } = getWhatsAppConfig();
  return fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...payload, messaging_product: "whatsapp", to }),
  });
}

async function sendWithArAllowlistFallback(to: string, payload: Record<string, unknown>, label = "WhatsApp") {
  const variants = metaAllowlistVariantsAR(to);
  let lastBody = "";
  let lastStatus = 0;
  for (const phone of variants) {
    const res = await postMessage(phone, payload);
    if (res.ok) return res.json();
    lastStatus = res.status;
    lastBody = await res.text();
    if (!lastBody.includes("131030")) break;
    console.warn(`[whatsapp] 131030 con ${phone}, probando formato Meta (15)…`);
  }
  throw new Error(`${label} ${lastStatus}: ${lastBody}`);
}

export async function sendText(to: string, body: string) {
  if (!isWhatsAppConfigured()) {
    console.log("[demo] WhatsApp →", to, body.slice(0, 80) + (body.length > 80 ? "…" : ""));
    return { demo: true };
  }
  // Meta sólo acepta texto libre dentro de la ventana de 24 h post-inbound.
  if (!isWindowOpen(to)) {
    console.warn(
      `[whatsapp] ventana 24h cerrada para ${to}. ` +
      `Intentando plantilla hello_world como proactivo. ` +
      `Texto descartado: "${body.slice(0, 60)}…"`,
    );
    // Intento de plantilla proactiva; si falla (número no en lista de prueba, etc.) lanzará el error.
    return sendTemplate(to, "hello_world", "en_US", []);
  }
  return sendWithArAllowlistFallback(to, {
    type: "text",
    text: { preview_url: true, body },
  });
}

export async function sendTemplate(
  to: string,
  name: string,
  language: string,
  components: unknown[],
) {
  if (!isWhatsAppConfigured()) {
    console.log("[demo] template", name, to, components);
    return { demo: true };
  }
  return sendWithArAllowlistFallback(
    to,
    {
      type: "template",
      template: { name, language: { code: language }, components },
    },
    "WhatsApp template",
  );
}

export async function sendDocument(to: string, bytes: Uint8Array, filename: string, caption?: string) {
  const { token, phoneNumberId } = getWhatsAppConfig();
  const phone = to.replace(/\D/g, "");
  if (!isWhatsAppConfigured()) {
    console.log("[demo] document →", phone, filename, `${bytes.length} bytes`, caption ?? "");
    return { demo: true };
  }

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", "application/pdf");
  form.append("file", new Blob([Buffer.from(bytes)], { type: "application/pdf" }), filename);

  const upload = await fetch(`${GRAPH}/${phoneNumberId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!upload.ok) throw new Error(`media upload ${upload.status}: ${await upload.text()}`);
  const { id: mediaId } = (await upload.json()) as { id: string };

  const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone,
      type: "document",
      document: {
        id: mediaId,
        filename,
        caption: caption ?? "Expediente armado por Lía",
      },
    }),
  });
  if (!res.ok) throw new Error(`document send ${res.status}: ${await res.text()}`);
  return res.json();
}
