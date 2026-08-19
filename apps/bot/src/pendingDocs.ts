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

type Inbox = {
  docs: PendingDoc[];
  links: PendingPhoneLink[];
  leads: PendingLead[];
};

const MAX = 50;

let inbox: Inbox = loadStore<Inbox>("pending", { docs: [], links: [], leads: [] });

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

export function drainDocs(): PendingDoc[] {
  const out = [...inbox.docs];
  inbox.docs = [];
  persist();
  return out;
}

export function drainInbox() {
  const out = { docs: [...inbox.docs], links: [...inbox.links], leads: [...inbox.leads] };
  inbox = { docs: [], links: [], leads: [] };
  persist();
  return out;
}
