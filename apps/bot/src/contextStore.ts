import { arMobileKey, type IdentityRecord } from "@lia/nlu";
import type { BotClient } from "./nlu.js";
import { indexPolicies } from "./policyStore.js";
import { metaAllowlistVariantsAR } from "./whatsapp.js";

export type ContextPayload = {
  producerName: string;
  producerPhone?: string;
  activeRamos: string[];
  clients: Array<{
    phone: string;
    firstName: string;
    lastName?: string;
    dni?: string;
    clientId: string;
    policies: Array<{
      id: string;
      type: string;
      number: string;
      company: string;
      plate?: string;
      nextDueDate: string;
      endDate: string;
      installment: number;
      cuponUrl: string;
      pdfUrl: string;
    }>;
    documents?: BotClient["documents"];
  }>;
};

const store = new Map<string, BotClient>();
let identity: IdentityRecord[] = [];
let studio: { producerName: string; activeRamos: string[] } = {
  producerName: "tu productor",
  activeRamos: [],
};

function phoneKeys(phone: string): string[] {
  const d = phone.replace(/\D/g, "");
  const keys = new Set<string>();
  if (!d) return [];
  keys.add(d);
  if (d.length >= 10) keys.add(d.slice(-10));
  const k = arMobileKey(phone);
  if (k) keys.add(`k:${k}`);
  for (const v of metaAllowlistVariantsAR(d)) {
    keys.add(v);
    if (v.length >= 10) keys.add(v.slice(-10));
    const vk = arMobileKey(v);
    if (vk) keys.add(`k:${vk}`);
  }
  return [...keys];
}

function remember(phone: string, client: BotClient) {
  for (const key of phoneKeys(phone)) store.set(key, client);
}

export function updateContext(payload: ContextPayload) {
  store.clear();
  studio = {
    producerName: payload.producerName || "tu productor",
    activeRamos: payload.activeRamos ?? [],
  };
  identity = payload.clients.map((c) => ({
    clientId: c.clientId,
    firstName: c.firstName,
    lastName: c.lastName ?? "",
    dni: c.dni ?? "",
    plates: c.policies.map((p) => p.plate ?? "").filter(Boolean),
    policyNumbers: c.policies.map((p) => p.number).filter(Boolean),
  }));

  for (const c of payload.clients) {
    const client: BotClient = {
      clientId: c.clientId,
      firstName: c.firstName,
      lastName: c.lastName,
      producerName: payload.producerName,
      policies: c.policies.map((p) => ({
        type: p.type,
        number: p.number,
        company: p.company,
        plate: p.plate,
        nextDueDate: p.nextDueDate,
        cuponUrl: p.cuponUrl,
        pdfUrl: p.pdfUrl,
      })),
      documents: c.documents,
      activeRamos: payload.activeRamos,
      verified: true,
    };
    remember(c.phone, client);
  }
  if (payload.producerPhone) {
    const first = payload.producerName.trim().split(/\s+/)[0] ?? "";
    const placeholder = !first || /^(vos|demo|productor)$/i.test(first);
    remember(payload.producerPhone, {
      firstName: placeholder ? "" : first,
      producerName: payload.producerName,
      policies: [],
      activeRamos: payload.activeRamos,
      verified: false,
    });
  }
  indexPolicies(payload.clients);
}

export function clientByPhone(from: string): BotClient | undefined {
  for (const key of phoneKeys(from)) {
    const hit = store.get(key);
    if (hit) return hit;
  }
  return undefined;
}

export function clientById(id: string): BotClient | undefined {
  for (const c of store.values()) {
    if (c.clientId === id) return c;
  }
  return undefined;
}

export function linkPhoneToClient(phone: string, client: BotClient) {
  remember(phone, { ...client, verified: true });
}

export function rememberLead(phone: string, client: BotClient) {
  remember(phone, { ...client, verified: false });
}

export function identityRecords(): IdentityRecord[] {
  return identity;
}

export function fallbackClient(): BotClient {
  return {
    firstName: "",
    producerName: studio.producerName,
    policies: [],
    activeRamos: studio.activeRamos,
    verified: false,
  };
}

export function studioName() {
  return studio.producerName;
}

export function contextClientCount() {
  return store.size;
}
