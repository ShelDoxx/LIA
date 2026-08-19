import { format, parseISO, differenceInDays, isSameMonth, isSameDay, isValid } from "date-fns";
import { es } from "date-fns/locale";
import type { Client, Policy } from "./types";

export function money(n: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);
}

export function fullName(c: Pick<Client, "firstName" | "lastName">) {
  return `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || "Sin nombre";
}

export function initials(c: Pick<Client, "firstName" | "lastName">) {
  const a = (c.firstName ?? "").trim()[0] ?? "";
  const b = (c.lastName ?? "").trim()[0] ?? "";
  return `${a}${b}`.toUpperCase() || "?";
}

function safeDate(iso?: string) {
  if (!iso || !iso.trim()) return null;
  const d = parseISO(iso);
  return isValid(d) ? d : null;
}

export function fmtDate(iso?: string) {
  const d = safeDate(iso);
  return d ? format(d, "d MMM yyyy", { locale: es }) : "—";
}

export function fmtDateTime(iso?: string) {
  const d = safeDate(iso);
  return d ? format(d, "d MMM · HH:mm", { locale: es }) : "—";
}

export function daysUntil(iso?: string) {
  const d = safeDate(iso);
  if (!d) return Number.NaN;
  return differenceInDays(d, new Date());
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

export function isBirthdayThisMonth(iso?: string) {
  const d = safeDate(iso);
  if (!d) return false;
  return d.getMonth() === new Date().getMonth();
}

export function isBirthdayToday(iso?: string) {
  const d = safeDate(iso);
  if (!d) return false;
  const now = new Date();
  return d.getDate() === now.getDate() && d.getMonth() === now.getMonth();
}

export function dueThisMonth(p: Policy) {
  const d = safeDate(p.nextDueDate);
  return Boolean(d) && isSameMonth(d!, new Date()) && p.status !== "cancelada";
}

export function dueSoon(p: Policy, days = 30) {
  const n = daysUntil(p.nextDueDate);
  return Number.isFinite(n) && n >= 0 && n <= days && p.status !== "cancelada";
}

export { isSameDay };

export { arMobileKey, normalizePhoneAR } from "@lia/nlu";
