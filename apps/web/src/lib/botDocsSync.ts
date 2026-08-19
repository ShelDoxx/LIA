import { arMobileKey, normalizePhoneAR } from "@lia/nlu";
import type { ChatMessage, Client, Conversation, LiaState, VaultDoc } from "@/lib/types";
import { botUrl } from "@/lib/botBase";
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

type PendingChatMessage = {
  id: string;
  phone: string;
  from: "client" | "lia";
  text: string;
  at: string;
  kind?: "text" | "image" | "file";
};

function phoneMatch(clientPhone: string, docPhone: string) {
  const a = arMobileKey(clientPhone);
  const b = arMobileKey(docPhone);
  return Boolean(a) && a === b;
}

function toChatMessage(m: PendingChatMessage): ChatMessage {
  return {
    id: m.id,
    from: m.from,
    text: m.text,
    at: m.at,
    kind: m.kind === "image" ? "image" : m.kind === "file" ? "file" : undefined,
  };
}

function mergeMessages(conv: Conversation, incoming: PendingChatMessage[]): Conversation {
  const ids = new Set(conv.messages.map((m) => m.id));
  const added = incoming.filter((m) => !ids.has(m.id)).map(toChatMessage);
  if (!added.length) return conv;
  const messages = [...conv.messages, ...added].sort((a, b) => a.at.localeCompare(b.at));
  const clientMsgs = added.filter((m) => m.from === "client").length;
  return {
    ...conv,
    messages,
    lastAt: messages.at(-1)!.at,
    unread: conv.unread + clientMsgs,
  };
}

function ensureThread(state: LiaState, phone: string, now: string): LiaState {
  const normalized = normalizePhoneAR(phone) || phone.replace(/\D/g, "");
  let client = state.clients.find((c) => phoneMatch(c.phone, normalized));
  let next = state;

  if (!client) {
    client = {
      id: crypto.randomUUID(),
      firstName: "Contacto",
      lastName: "WhatsApp",
      dni: "",
      email: "",
      phone: normalized,
      birthDate: "",
      address: "",
      city: "",
      notes: "Escritura por WhatsApp. Completá DNI y confirmá en ficha.",
      family: [],
      createdAt: now,
      tags: ["whatsapp-prospecto"],
      lastContactAt: now,
    };
    next = { ...next, clients: [client, ...next.clients] };
  }

  const existingConv = next.conversations.find(
    (c) => c.clientId === client!.id || phoneMatch(c.phone, normalized),
  );
  if (existingConv) return next;

  const conv: Conversation = {
    id: crypto.randomUUID(),
    clientId: client.id,
    phone: normalized,
    lastAt: now,
    unread: 0,
    messages: [],
  };
  return { ...next, conversations: [conv, ...next.conversations] };
}

export async function pullPendingBotDocs(state: LiaState): Promise<LiaState> {
  try {
    const secret = getLiaSecret();
    const res = await fetch(botUrl("/pending-docs"), {
      headers: secret ? { "X-Lia-Secret": secret } : {},
    });
    if (!res.ok) return state;
    const body = (await res.json()) as {
      docs?: PendingDoc[];
      links?: PendingPhoneLink[];
      leads?: PendingLead[];
      messages?: PendingChatMessage[];
    };
    const docs = body.docs ?? [];
    const links = body.links ?? [];
    const leads = body.leads ?? [];
    const messages = body.messages ?? [];
    if (!docs.length && !links.length && !leads.length && !messages.length) return state;

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
        notes: `Lead WhatsApp · ${lead.phone}. Confirmá DNI en ficha.`,
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
        unread: 0,
        messages: [],
      };
      next = {
        ...next,
        clients: [client, ...next.clients],
        conversations: [conv, ...next.conversations],
      };
    }

    if (messages.length) {
      const byPhone = new Map<string, PendingChatMessage[]>();
      for (const m of messages) {
        const key = arMobileKey(m.phone) || m.phone.replace(/\D/g, "");
        if (!key) continue;
        const list = byPhone.get(key) ?? [];
        list.push(m);
        byPhone.set(key, list);
      }
      for (const [, batch] of byPhone) {
        const phone = batch[0]!.phone;
        next = ensureThread(next, phone, batch.at(-1)!.at);
        const normalized = normalizePhoneAR(phone) || phone.replace(/\D/g, "");
        const client = next.clients.find((c) => phoneMatch(c.phone, normalized));
        if (!client) continue;
        const conv = next.conversations.find(
          (c) => c.clientId === client.id || phoneMatch(c.phone, normalized),
        );
        if (!conv) continue;
        const merged = mergeMessages(conv, batch);
        next = {
          ...next,
          conversations: next.conversations.map((c) => (c.id === conv.id ? merged : c)),
        };
      }
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
