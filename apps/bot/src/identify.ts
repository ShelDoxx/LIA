import { matchIdentity, parseIdentityCue } from "@lia/nlu";
import {
  clientById,
  clientByPhone,
  identityRecords,
  linkPhoneToClient,
  rememberLead,
  studioName,
} from "./contextStore.js";
import { enqueueLead, enqueuePhoneLink } from "./pendingDocs.js";
import { loadStore, saveStore } from "./botStore.js";

type Session =
  | { step: "need_id" }
  | { step: "confirm"; clientId: string; matchedBy: string }
  | { step: "need_name" };

const RAW = loadStore<Record<string, Session>>("sessions", {});
const sessions = new Map<string, Session>(Object.entries(RAW));

function persistSessions() {
  saveStore("sessions", Object.fromEntries(sessions));
}

function askId() {
  return `Hola, soy Lía de ${studioName()}. Al seguir este chat aceptás que usemos tus datos para gestionar tu seguro (Ley 25.326).

Para ayudarte, pasame tu DNI (sin puntos). Si ya sos cliente del estudio, también sirve patente o número de póliza.`;
}

export function handleIdentify(phone: string, text: string): string | null {
  const known = clientByPhone(phone);
  if (known?.verified) {
    sessions.delete(phone);
    persistSessions();
    return null;
  }

  const cue = parseIdentityCue(text);
  let session = sessions.get(phone);

  if (cue.kind === "handoff") {
    return `Ahora mismo le aviso a ${studioName()}. Te escribe en breve.`;
  }

  if (!session) {
    sessions.set(phone, { step: "need_id" });
    persistSessions();
    if (cue.kind !== "dni" && cue.kind !== "plate" && cue.kind !== "policy") {
      return askId();
    }
    session = sessions.get(phone)!;
  }

  if (session.step === "confirm") {
    if (cue.kind === "yes") {
      const client = clientById(session.clientId);
      sessions.delete(phone);
      persistSessions();
      if (!client) return askId();
      linkPhoneToClient(phone, client);
      enqueuePhoneLink({
        clientId: session.clientId,
        phone,
        matchedBy: session.matchedBy,
        name: `${client.firstName} ${client.lastName ?? ""}`.trim(),
      });
      return `Listo, ${client.firstName}. Quedó este WhatsApp en tu ficha. ¿En qué te ayudo?`;
    }
    if (cue.kind === "no") {
      sessions.set(phone, { step: "need_id" });
      persistSessions();
      return "Ok. Pasame DNI, patente o número de póliza para buscar de nuevo.";
    }
  }

  if (session.step === "need_name") {
    if (cue.kind === "name") {
      const lead = {
        id: crypto.randomUUID(),
        phone,
        firstName: cue.firstName,
        lastName: cue.lastName,
      };
      enqueueLead(lead);
      rememberLead(phone, {
        firstName: cue.firstName,
        lastName: cue.lastName,
        producerName: studioName(),
        policies: [],
        verified: false,
      });
      sessions.delete(phone);
      persistSessions();
      return `Gracias, ${cue.firstName}. No figurás todavía en la cartera con ese dato, así que lo dejo como consulta para que ${studioName()} lo confirme. Si es urgente, escribí «humano».`;
    }
    return "Decime nombre y apellido (ejemplo: Ana Pérez).";
  }

  if (cue.kind === "dni" || cue.kind === "plate" || cue.kind === "policy") {
    const hits = matchIdentity(cue, identityRecords());
    if (hits.length === 1) {
      const hit = hits[0];
      sessions.set(phone, { step: "confirm", clientId: hit.clientId, matchedBy: cue.kind });
      persistSessions();
      const dniHint = hit.dni ? ` DNI ${hit.dni}` : "";
      return `Encontré una ficha: ${hit.firstName} ${hit.lastName}.${dniHint} ¿Sos vos? Respondé sí o no.`;
    }
    if (hits.length > 1) {
      return "Encontré más de una ficha. Pasame el DNI para distinguirte.";
    }
    sessions.set(phone, { step: "need_name" });
    persistSessions();
    return "No te encontré en la cartera con ese DNI. Decime nombre y apellido (ejemplo: Ana Pérez). Si querés cotizar, mandame foto frente y dorso del DNI — armo tu ficha pendiente de aprobación del productor.";
  }

  if (cue.kind === "name" && session.step === "need_id") {
    const hits = matchIdentity(cue, identityRecords());
    if (hits.length === 1) {
      sessions.set(phone, { step: "confirm", clientId: hits[0].clientId, matchedBy: "name" });
      persistSessions();
      return `¿Sos ${hits[0].firstName} ${hits[0].lastName}? Para confirmar, mejor pasame DNI o patente. Si es así, respondé sí.`;
    }
    sessions.set(phone, { step: "need_name" });
    return handleIdentify(phone, text);
  }

  return "Pasame DNI (sin puntos), patente o número de póliza. Así confirmo que estás en la cartera.";
}
