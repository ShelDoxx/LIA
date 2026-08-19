import { normalizePhoneAR } from "@/lib/format";
import type { Client, LiaState } from "@/lib/types";

function hydrateClient(c: Client): { client: Client; changed: boolean } {
  const family = c.family ?? [];
  const tags = c.tags ?? [];
  const firstName = c.firstName ?? "";
  const lastName = c.lastName ?? "";
  const dni = c.dni ?? "";
  const email = c.email ?? "";
  const phone = c.phone ?? "";
  const birthDate = c.birthDate ?? "";
  const address = c.address ?? "";
  const city = c.city ?? "";
  const notes = c.notes ?? "";
  const createdAt = c.createdAt || new Date().toISOString();
  const lastContactAt = c.lastContactAt || createdAt;
  const changed =
    family !== c.family ||
    tags !== c.tags ||
    firstName !== c.firstName ||
    lastName !== c.lastName ||
    dni !== c.dni ||
    email !== c.email ||
    phone !== c.phone ||
    birthDate !== c.birthDate ||
    address !== c.address ||
    city !== c.city ||
    notes !== c.notes ||
    createdAt !== c.createdAt ||
    lastContactAt !== c.lastContactAt;
  if (!changed) return { client: c, changed: false };
  return {
    changed: true,
    client: {
      ...c,
      firstName,
      lastName,
      dni,
      email,
      phone,
      birthDate,
      address,
      city,
      notes,
      family,
      tags,
      createdAt,
      lastContactAt,
    },
  };
}

/** Unifica teléfonos de clientes al formato Meta 549… y completa fichas incompletas. */
export function normalizeStatePhones(state: LiaState): { state: LiaState; changed: boolean } {
  let changed = false;
  const clients = (state.clients ?? []).map((raw) => {
    const { client, changed: shape } = hydrateClient(raw);
    if (shape) changed = true;
    const n = normalizePhoneAR(client.phone);
    if (!n || client.phone.replace(/\D/g, "") === n) return client;
    changed = true;
    return { ...client, phone: n };
  });
  const conversations = (state.conversations ?? []).map((conv) => {
    const client = clients.find((c) => c.id === conv.clientId);
    const messages = conv.messages ?? [];
    let next = conv;
    if (messages !== conv.messages) {
      changed = true;
      next = { ...next, messages };
    }
    if (client && next.phone !== client.phone) {
      changed = true;
      next = { ...next, phone: client.phone };
    }
    return next;
  });
  const policies = (state.policies ?? []).map((p) => {
    if (typeof p.premium === "number" && typeof p.installment === "number") return p;
    changed = true;
    return { ...p, premium: p.premium ?? 0, installment: p.installment ?? 0 };
  });
  if (!changed) return { state, changed: false };
  return { state: { ...state, clients, conversations, policies }, changed: true };
}
