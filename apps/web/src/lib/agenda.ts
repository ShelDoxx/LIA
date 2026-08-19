import { daysUntil, dueSoon, fullName, isBirthdayToday } from "./format";
import { differenceInDays, differenceInMonths, differenceInYears, parseISO } from "date-fns";
import type { Claim, LiaState } from "./types";
import { CLAIM_LABEL, ENDORSEMENT_TYPE_LABEL, POLICY_LABEL } from "./types";
import { generateRetentionMessage } from "@/data/ramos";
import { RENEWAL_BUCKET_LABEL, renewalBucket } from "./renewals";

export type AgendaItem = {
  id: string;
  urgency: "now" | "today" | "soon";
  title: string;
  detail: string;
  to: string;
  money?: number;
  kind?: "retention" | "mora" | "stuck_claim" | "renewal" | "payment_reminder";
};

export type RadarItem = {
  id: string;
  kind: "vida" | "silencio" | "combo" | "cotizacion" | "plata" | "infraseguro";
  title: string;
  detail: string;
  to: string;
};

function isStuckClaim(s: Claim): boolean {
  if (s.status !== "inspeccion" && s.status !== "liquidacion") return false;
  try {
    return differenceInDays(new Date(), parseISO(s.updatedAt ?? s.date)) > 5;
  } catch {
    return false;
  }
}

export function buildAgenda(state: LiaState): AgendaItem[] {
  const items: AgendaItem[] = [];

  for (const c of state.clients) {
    if (isBirthdayToday(c.birthDate)) {
      items.push({
        id: `bd-${c.id}`,
        urgency: "now",
        title: `Cumpleaños de ${fullName(c)}`,
        detail: "Lía ya saludó. Un audio tuyo cierra vida o referidos.",
        to: `/clientes/${c.id}`,
      });
    }
  }

  const vidaOn = !state.producer.activeRamos?.length || state.producer.activeRamos.includes("vida");
  if (vidaOn) {
    for (const p of state.policies) {
      if (p.type !== "vida" || p.status === "cancelada") continue;
      if (!isBirthdayToday(p.startDate)) continue;
      const yearsActive = differenceInYears(new Date(), parseISO(p.startDate));
      if (yearsActive < 1) continue;
      const c = state.clients.find((x) => x.id === p.clientId);
      const name = c ? fullName(c) : "Cliente";
      items.push({
        id: `ret-${p.id}`,
        urgency: "now",
        kind: "retention",
        title: `Cumpleaños de Póliza: Enviar mensaje de retención a ${name}`,
        detail: generateRetentionMessage(c?.firstName ?? "cliente", yearsActive),
        to: `/whatsapp?cliente=${p.clientId}&retencion=${yearsActive}`,
      });
    }
  }

  for (const conv of state.conversations.filter((x) => x.unread)) {
    const c = state.clients.find((x) => x.id === conv.clientId);
    items.push({
      id: `wa-${conv.id}`,
      urgency: "now",
      title: `${c ? c.firstName : "Cliente"} escribió al bot`,
      detail: conv.messages.at(-1)?.text ?? "Mensaje nuevo",
      to: "/whatsapp",
    });
  }

  for (const e of (state.endorsements ?? []).filter(
    (x) => x.status === "pendiente" || x.status === "procesando",
  )) {
    const c = state.clients.find((x) => x.id === e.clientId);
    const name = c ? fullName(c) : "Cliente";
    items.push({
      id: `end-${e.id}`,
      urgency: e.status === "pendiente" ? "now" : "today",
      title: `Endoso pendiente: ${ENDORSEMENT_TYPE_LABEL[e.type]} para ${name}`,
      detail: e.description,
      to: `/clientes/${e.clientId}`,
    });
  }

  for (const s of state.claims.filter((x) => x.status !== "cerrado")) {
    if (isStuckClaim(s)) {
      const c = state.clients.find((x) => x.id === s.clientId);
      const since = s.updatedAt ?? s.date;
      let days = 0;
      try {
        days = differenceInDays(new Date(), parseISO(since));
      } catch {
        days = 6;
      }
      items.push({
        id: `stuck-${s.id}`,
        urgency: "now",
        kind: "stuck_claim",
        title: "Siniestro Trabado - Seguimiento Requerido",
        detail: `${c ? fullName(c) : "Cliente"} · ${CLAIM_LABEL[s.status]} hace ${days} días. ${s.description}`,
        to: `/whatsapp?cliente=${s.clientId}&siniestro=${s.id}`,
      });
      continue;
    }
    const c = state.clients.find((x) => x.id === s.clientId);
    items.push({
      id: `s-${s.id}`,
      urgency: "today",
      title: `Siniestro abierto · ${c ? fullName(c) : "cliente"}`,
      detail: s.description,
      to: `/clientes/${s.clientId}`,
    });
  }

  for (const p of state.policies.filter((x) => x.status !== "cancelada")) {
    const c = state.clients.find((x) => x.id === p.clientId);
    const name = c ? fullName(c) : "Cliente";
    const endDays = daysUntil(p.endDate);
    const bucket = renewalBucket(endDays);
    if (bucket) {
      items.push({
        id: `ren-${p.id}`,
        urgency: bucket === "7" || bucket === "overdue" ? "now" : bucket === "30" ? "today" : "soon",
        kind: "renewal",
        title: `Renovación ${RENEWAL_BUCKET_LABEL[bucket]} · ${name}`,
        detail: `${POLICY_LABEL[p.type]} · ${p.company} · vence ${p.endDate.slice(0, 10)}`,
        to: `/whatsapp?cliente=${p.clientId}&renovacion=${p.id}&bucket=${bucket}`,
        money: p.premium,
      });
    }
  }

  const reminderDays = state.bot.paymentReminderDays ?? 3;
  for (const p of state.policies.filter((x) => x.status !== "cancelada")) {
    const c = state.clients.find((x) => x.id === p.clientId);
    const d = daysUntil(p.nextDueDate);
    if (d < 0) {
      items.push({
        id: `mora-${p.id}`,
        urgency: "now",
        kind: "mora",
        title: `${c ? fullName(c) : "Cliente"} en mora`,
        detail: `Cuota vencida hace ${Math.abs(d)} días · ${p.company}`,
        to: `/whatsapp?cliente=${p.clientId}&mora=${p.id}`,
        money: p.installment,
      });
    } else if (d > 0 && d <= reminderDays) {
      items.push({
        id: `rem-${p.id}`,
        urgency: d <= 1 ? "now" : "today",
        kind: "payment_reminder",
        title: `Cuota en ${d} día${d === 1 ? "" : "s"} · ${c ? fullName(c) : "Cliente"}`,
        detail: `Aviso ${d} día${d === 1 ? "" : "s"} antes · ${POLICY_LABEL[p.type]} · ${p.company}`,
        to: `/whatsapp?cliente=${p.clientId}&aviso=${p.id}`,
        money: p.installment,
      });
    } else if (dueSoon(p, 7)) {
      items.push({
        id: `due-${p.id}`,
        urgency: d <= 3 ? "now" : "today",
        title: `${c ? fullName(c) : "Cliente"} · ${POLICY_LABEL[p.type]}`,
        detail: d === 0 ? "Cuota hoy" : `Cuota en ${d} días · ${p.company}`,
        to: `/clientes/${p.clientId}`,
        money: p.installment,
      });
    }
  }

  for (const r of state.commissions.filter((x) => x.invoiceStatus === "pendiente")) {
    items.push({
      id: `inv-${r.id}`,
      urgency: "soon",
      title: `Emitir factura a ${r.company}`,
      detail: "Comisión producida sin factura",
      to: "/comisiones",
      money: r.pending,
    });
  }

  const rank = { now: 0, today: 1, soon: 2 };
  return items.sort((a, b) => rank[a.urgency] - rank[b.urgency]);
}

export function buildRadar(state: LiaState): RadarItem[] {
  const items: RadarItem[] = [];
  const active = state.producer.activeRamos ?? [];
  const on = (ramo: keyof typeof POLICY_LABEL) => !active.length || active.includes(ramo);
  const typesByClient = (id: string) => new Set(state.policies.filter((p) => p.clientId === id).map((p) => p.type));

  for (const c of state.clients) {
    for (const f of (c.family ?? []).filter((m) => m.relation === "conyuge" && !m.hasLifePolicy)) {
      if (!on("vida")) break;
      items.push({
        id: `life-${f.id}`,
        kind: "vida",
        title: `Vida para ${f.firstName} ${f.lastName}`,
        detail: `Cónyuge de ${fullName(c)}. El 360° existe para este cierre.`,
        to: `/clientes/${c.id}`,
      });
    }
    const t = typesByClient(c.id);
    if (on("hogar") && t.has("auto") && !t.has("hogar")) {
      items.push({
        id: `home-${c.id}`,
        kind: "combo",
        title: `Hogar a ${c.firstName}`,
        detail: "Tiene auto y no tiene hogar. Combo clásico.",
        to: `/clientes/${c.id}`,
      });
    }
    const silent = (Date.now() - new Date(c.lastContactAt).getTime()) / 86400000;
    if (silent >= 45) {
      items.push({
        id: `sil-${c.id}`,
        kind: "silencio",
        title: `${fullName(c)} lleva ${Math.floor(silent)} días en silencio`,
        detail: "Riesgo de que se lleve la cartera otro PAS.",
        to: `/clientes/${c.id}`,
      });
    }
  }

  if (on("vida")) {
    for (const p of state.policies) {
      if (p.type !== "vida" || p.status === "cancelada") continue;
      const since = p.updatedAt ?? p.startDate;
      if (differenceInMonths(new Date(), parseISO(since)) < 12) continue;
      const c = state.clients.find((x) => x.id === p.clientId);
      items.push({
        id: `infra-${p.id}`,
        kind: "infraseguro",
        title: "Revisión de Suma Asegurada (Infraseguro)",
        detail: `La póliza de ${c ? fullName(c) : "el cliente"} tiene más de 1 año. Contactar para actualizar valores.`,
        to: `/clientes/${p.clientId}`,
      });
    }
  }

  for (const q of state.quotes.filter(
    (x) =>
      (x.status === "enviada" ||
        x.status === "seguimiento" ||
        x.status === "borrador" ||
        x.status === "anf" ||
        x.status === "propuesta" ||
        x.status === "examenes") &&
      on(x.ramo),
  )) {
    const c = state.clients.find((x) => x.id === q.clientId);
    items.push({
      id: `q-${q.id}`,
      kind: "cotizacion",
      title: `Cotización ${POLICY_LABEL[q.ramo]} · ${c ? fullName(c) : ""}`,
      detail: `${q.status} · ${q.companies.join(", ")}`,
      to: `/clientes/${q.clientId}`,
    });
  }

  for (const r of state.commissions.filter((x) => x.pending > 0)) {
    items.push({
      id: `cash-${r.id}`,
      kind: "plata",
      title: `${r.company}: hay plata en la calle`,
      detail: "Pendiente de cobro o de factura",
      to: "/comisiones",
    });
  }

  return items;
}
