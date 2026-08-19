/**
 * Rastrea la última vez que cada número envió un mensaje INBOUND.
 * Meta sólo permite texto libre dentro de las 24 h posteriores al último inbound.
 * Pasada la ventana hay que usar una plantilla aprobada.
 */
import { loadStore, saveStore } from "./botStore.js";

type WindowMap = Record<string, number>; // phone → unix ms

const WINDOW_MS = 24 * 60 * 60 * 1000;

let store: WindowMap = loadStore<WindowMap>("windows", {});

function key(phone: string) {
  return phone.replace(/\D/g, "").slice(-10);
}

/** Llama esto cada vez que llega un mensaje del cliente. */
export function touchWindow(phone: string) {
  store[key(phone)] = Date.now();
  saveStore("windows", store);
}

/** true → dentro de la ventana de 24 h, podés enviar texto libre. */
export function isWindowOpen(phone: string): boolean {
  const t = store[key(phone)];
  if (!t) return false;
  return Date.now() - t < WINDOW_MS;
}

/** Minutos restantes en la ventana (puede ser negativo = ya cerró). */
export function windowMinutesLeft(phone: string): number {
  const t = store[key(phone)];
  if (!t) return 0;
  return Math.floor((t + WINDOW_MS - Date.now()) / 60_000);
}
