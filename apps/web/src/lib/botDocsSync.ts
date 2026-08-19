import { arMobileKey, normalizePhoneAR } from "@lia/nlu";
import type { Client, Conversation, LiaState, VaultDoc } from "@/lib/types";
import { getLiaSecret } from "@/lib/outbound";

type PendingDoc = {
  id: string;
  phone: string;
  filename: string;
  dataBase64: string;
  uploadedAt: string;
};

type PendingPhoneLink = {
  clientId: string;
  phone: string;
  matchedBy: string;
  name: string;
};

type PendingLead = {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
};

function phoneMatch(clientPhone: string, docPhone: string) {
  const a = arMobileKey(clientPhone);
  const b = arMobileKey(docPhone);
  return Boolean(a) && a === b;
}

export async function pullPendingBotDocs(state: LiaState): Promise<LiaState> {
  try {
    const secret = getLiaSecret();
    const res = await fetch("/api/bot/pending-docs", {
      headers: secret ? { "X-Lia-Secret": secret } : {},
    });
    if (!res.ok) return state;
    const body = (await res.json()) as {
      docs?: PendingDoc[];
      links?: PendingPhoneLink[];
      leads?: PendingLead[];
    };
    const docs = body.docs ?? [];
    const links = body.links ?? [];
    const leads = body.leads ?? [];
    if (!docs.length && !links.length && !leads.length) return state;

    let next = state;
    const now = new Date().toISOString();

    for (const link of links) {
      next = {
        ...next,
        clients: next.clients.map((c) =>
          c.id === link.clientId
            ? {
                ...c,
                phone: normalizePhoneAR(link.phone) || c.phone,
                lastContactAt: now,
                notes: c.notes
                  ? `${c.notes}\nWhatsApp verificado (${link.matchedBy}) ${now.slice(0, 10)}.`
                  : `WhatsApp verificado por ${link.matchedBy}.`,
                tags: c.tags.includes("whatsapp-verificado")
                  ? c.tags
                  : [...c.tags, "whatsapp-verificado"],
              }
            : c,
        ),
      };
    }

    for (const lead of leads) {
      if (next.clients.some((c) => c.id === lead.id || phoneMatch(c.phone, lead.phone))) continue;
      const client: Client = {
        id: lead.id,
        firstName: lead.firstName,
        lastName: lead.lastName,
        dni: "",
        email: "",
        phone: normalizePhoneAR(lead.phone),
        birthDate: "",
        address: "",
        city: "",
        notes: `Consulta por WhatsApp sin ficha. Número ${lead.phone}. Confirmá si es cliente.`,
        family: [],
        createdAt: now,
        tags: ["whatsapp-pendiente"],
        lastContactAt: now,
      };
      const conv: Conversation = {
        id: crypto.randomUUID(),
        clientId: client.id,
        phone: client.phone,
        lastAt: now,
        unread: 1,
        messages: [
          {
            id: crypto.randomUUID(),
            from: "lia",
            text: "Consulta WhatsApp: no estaba en la cartera. Pendiente de confirmar.",
            at: now,
          },
        ],
      };
      next = {
        ...next,
        clients: [client, ...next.clients],
        conversations: [conv, ...next.conversations],
      };
    }

    for (const d of docs) {
      const client = next.clients.find((c) => phoneMatch(c.phone, d.phone));
      if (!client) continue;
      if (next.documents.some((x) => x.clientId === client.id && x.name === d.filename)) continue;
      const vault: VaultDoc = {
        id: d.id,
        clientId: client.id,
        type: "expediente",
        name: d.filename,
        uploadedAt: d.uploadedAt,
        sizeLabel: `${Math.max(1, Math.round((d.dataBase64.length * 3) / 4 / 1024))} KB`,
        dataUrl: `data:application/pdf;base64,${d.dataBase64}`,
        source: "whatsapp",
      };
      next = { ...next, documents: [vault, ...next.documents] };
    }
    return next;
  } catch {
    return state;
  }
}
