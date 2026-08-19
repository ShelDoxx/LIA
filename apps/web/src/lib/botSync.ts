import type { LiaState } from "@/lib/types";

export function buildBotContextPayload(state: LiaState) {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://lia.app";
  return {
    producerName: state.producer.name,
    producerPhone: state.producer.phone.replace(/\D/g, ""),
    activeRamos: state.producer.activeRamos ?? [],
    clients: state.clients.map((c) => ({
      phone: c.phone.replace(/\D/g, ""),
      firstName: c.firstName,
      lastName: c.lastName,
      dni: c.dni,
      clientId: c.id,
      policies: state.policies
        .filter((p) => p.clientId === c.id && p.status !== "cancelada")
        .map((p) => ({
          id: p.id,
          type: p.type,
          number: p.number,
          company: p.company,
          plate: p.plate,
          nextDueDate: p.nextDueDate,
          endDate: p.endDate,
          installment: p.installment,
          cuponUrl: `${origin}/c/${p.id}/cupon`,
          pdfUrl: `${origin}/c/${p.id}/poliza`,
        })),
      documents: state.documents
        .filter((d) => d.clientId === c.id)
        .map((d) => ({ type: d.type, name: d.name })),
    })),
  };
}

export async function syncBotContext(state: LiaState): Promise<boolean> {
  try {
    const res = await fetch("/api/bot/context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildBotContextPayload(state)),
    });
    return res.ok;
  } catch {
    return false;
  }
}
