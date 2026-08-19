import { seedState } from "@/data/seed";
import type { LiaState, Producer } from "@/lib/types";

/** Cartera vacía para plan Estudio (sin datos demo de venta). */
export function estudioState(overrides: Partial<Producer> & { name?: string; email?: string }): LiaState {
  const seed = seedState();
  const name = overrides.name?.trim() || "Productor";
  const email = overrides.email?.trim() || "";
  return {
    producer: {
      ...seed.producer,
      ...overrides,
      id: crypto.randomUUID(),
      name,
      email,
      studioName: overrides.studioName ?? `Estudio ${name}`,
      plan: "estudio",
      // Sin "días gratis": empieza bloqueado hasta activar con pago.
      subscription: { status: "expired", startedAt: new Date().toISOString() },
    },
    bot: {
      ...seed.bot,
      connected: false,
      whatsappOutbound: true,
    },
    clients: [],
    policies: [],
    claims: [],
    documents: [],
    commissions: [],
    conversations: [],
    quotes: [],
    endorsements: [],
    doneAgenda: [],
    automationLog: [],
  };
}
