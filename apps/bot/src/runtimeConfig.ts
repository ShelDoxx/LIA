import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as envConfig } from "./config.js";

type Runtime = {
  token: string;
  phoneNumberId: string;
  verifyToken: string;
  /** Unix timestamp (segundos) de expiración según Meta. 0 = nunca vence. */
  tokenExpiresAt?: number;
};

const STORE = join(dirname(fileURLToPath(import.meta.url)), "..", ".meta-runtime.json");

let runtime: Partial<Runtime> = loadStore();

function loadStore(): Partial<Runtime> {
  try {
    if (!existsSync(STORE)) return {};
    const parsed = JSON.parse(readFileSync(STORE, "utf8")) as Partial<Runtime>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function persist() {
  try {
    writeFileSync(STORE, JSON.stringify(runtime, null, 2), "utf8");
  } catch (err) {
    console.warn("[meta] no pude guardar credenciales locales", err);
  }
}

export function setWhatsAppConfig(partial: Partial<Runtime>) {
  runtime = { ...runtime, ...partial };
  persist();
  // Si cambia el token, consultamos a Meta cuándo vence (fuego y olvido).
  if (partial.token) void refreshTokenExpiry(partial.token);
}

/**
 * Consulta /debug_token en la Graph API para saber la fecha exacta de expiración.
 * expires_at = 0 → token permanente (system user). Lo guarda en runtime para /health.
 */
export async function refreshTokenExpiry(token: string): Promise<void> {
  try {
    const url = `https://graph.facebook.com/${envConfig.graphVersion}/debug_token?input_token=${token}&access_token=${token}`;
    const res = await fetch(url);
    if (!res.ok) return;
    const json = (await res.json()) as { data?: { expires_at?: number; is_valid?: boolean } };
    const expiresAt = json.data?.expires_at ?? 0;
    runtime = { ...runtime, tokenExpiresAt: expiresAt };
    persist();
    if (expiresAt === 0) {
      console.log("[meta] Token permanente (system user) — no vence.");
    } else {
      const d = new Date(expiresAt * 1000);
      console.log(`[meta] Token vence: ${d.toLocaleString("es-AR")}`);
    }
  } catch (err) {
    console.warn("[meta] No pude verificar expiración del token:", err);
  }
}

/**
 * Devuelve true solo si Meta confirmó una fecha de expiración y ya pasó.
 * Si es system-user (expires_at = 0) o aún no consultamos, devuelve false.
 */
export function isTokenExpired(): boolean {
  const exp = runtime.tokenExpiresAt;
  if (exp === undefined || exp === 0) return false;
  return Date.now() / 1000 > exp;
}

/** Texto de advertencia para mostrar en la UI, o null si está todo bien. */
export function tokenStatusMessage(): string | null {
  const exp = runtime.tokenExpiresAt;
  if (exp === undefined) return null; // todavía no consultamos
  if (exp === 0) return null; // permanente, ok
  const secsLeft = exp - Date.now() / 1000;
  if (secsLeft < 0) return "El token de WhatsApp venció. Andá a Ajustes → Meta y pegá uno nuevo (usá System User para que no expire nunca).";
  if (secsLeft < 3600) return `El token de WhatsApp vence en ${Math.ceil(secsLeft / 60)} minutos. Reemplazalo por un System User Token permanente.`;
  return null;
}

export function getWhatsAppConfig(): Runtime {
  return {
    token: runtime.token || envConfig.token,
    phoneNumberId: runtime.phoneNumberId || envConfig.phoneNumberId,
    verifyToken: runtime.verifyToken || envConfig.verifyToken,
  };
}

export function isWhatsAppConfigured() {
  const c = getWhatsAppConfig();
  return Boolean(c.token && c.phoneNumberId);
}

export function publicConfig() {
  const c = getWhatsAppConfig();
  return {
    whatsapp: isWhatsAppConfigured(),
    phoneNumberId: c.phoneNumberId ? mask(c.phoneNumberId) : "",
    verifyToken: c.verifyToken ? mask(c.verifyToken) : "",
    source: runtime.token || runtime.phoneNumberId ? "runtime" : "env",
  };
}

function mask(s: string) {
  if (s.length <= 4) return "****";
  return `${"*".repeat(Math.min(8, s.length - 4))}${s.slice(-4)}`;
}
