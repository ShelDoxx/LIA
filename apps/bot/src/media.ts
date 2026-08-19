import { config as envConfig } from "./config.js";
import { getWhatsAppConfig, isWhatsAppConfigured } from "./runtimeConfig.js";

const GRAPH = `https://graph.facebook.com/${envConfig.graphVersion}`;

export async function downloadWhatsAppMedia(mediaId: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const { token } = getWhatsAppConfig();
  if (!isWhatsAppConfigured()) {
    throw new Error("WhatsApp no configurado");
  }
  const metaRes = await fetch(`${GRAPH}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!metaRes.ok) throw new Error(`media meta ${metaRes.status}`);
  const meta = (await metaRes.json()) as { url?: string; mime_type?: string };
  if (!meta.url) throw new Error("sin url de media");
  const fileRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!fileRes.ok) throw new Error(`media download ${fileRes.status}`);
  const buf = new Uint8Array(await fileRes.arrayBuffer());
  return { bytes: buf, mime: meta.mime_type ?? fileRes.headers.get("content-type") ?? "image/jpeg" };
}
