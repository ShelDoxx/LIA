/**
 * Persistencia de estado efímero del bot.
 * Cada módulo tiene su propio archivo JSON en el root del paquete bot.
 * Si el proceso cae y vuelve a levantarse, lee el archivo y retoma donde quedó.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function storePath(name: string) {
  return join(ROOT, `.${name}-store.json`);
}

export function loadStore<T>(name: string, fallback: T): T {
  try {
    const path = storePath(name);
    if (!existsSync(path)) return fallback;
    const parsed = JSON.parse(readFileSync(path, "utf8")) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function saveStore<T>(name: string, data: T): void {
  try {
    writeFileSync(storePath(name), JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.warn(`[botStore] no pude guardar ${name}:`, err);
  }
}
