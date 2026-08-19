import { loadStore, saveStore } from "./botStore.js";

export type PendingDoc = {
  id: string;
  phone: string;
  clientId?: string;
  filename: string;
  dataBase64: string;
  uploadedAt: string;
};

export type PendingPhoneLink = {
  clientId: string;
  phone: string;
  matchedBy: string;
  name: string;
};

export type PendingLead = {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
};

export type PendingChatMessage = {
  id: string;
  phone: string;
  from: "client" | "lia";
  text: string;
  at: string;
  kind?: "text" | "image" | "file";
};

type Inbox = {
  docs: PendingDoc[];
  links: PendingPhoneLink[];
  leads: PendingLead[];
  messages: PendingChatMessage[];
};

const MAX = 50;

let inbox: Inbox = loadStore<Inbox>("pending", { docs: [], links: [], leads: [], messages: [] });
if (!Array.isArray(inbox.messages)) inbox.messages = [];

function persist() {
  saveStore("pending", inbox);
}

export function enqueueDoc(doc: PendingDoc) {
  inbox.docs.push(doc);
  if (inbox.docs.length > MAX) inbox.docs.shift();
  persist();
}

export function enqueuePhoneLink(link: PendingPhoneLink) {
  inbox.links.push(link);
  if (inbox.links.length > MAX) inbox.links.shift();
  persist();
}

export function enqueueLead(lead: PendingLead) {
  if (inbox.leads.some((l) => l.id === lead.id || l.phone === lead.phone)) return;
  inbox.leads.push(lead);
  if (inbox.leads.length > MAX) inbox.leads.shift();
  persist();
}

export function enqueueChatMessage(msg: PendingChatMessage) {
  if (inbox.messages.some((m) => m.id === msg.id)) return;
  inbox.messages.push(msg);
  const cap = MAX * 6;
  if (inbox.messages.length > cap) inbox.messages.splice(0, inbox.messages.length - cap);
  persist();
}

export function drainDocs(): PendingDoc[] {
  const out = [...inbox.docs];
  inbox.docs = [];
  persist();
  return out;
}

export function drainInbox() {
  const out = {
    docs: [...inbox.docs],
    links: [...inbox.links],
    leads: [...inbox.leads],
    messages: [...inbox.messages],
  };
  inbox = { docs: [], links: [], leads: [], messages: [] };
  persist();
  return out;
}
