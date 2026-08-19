import { packTargetCount, slotLabelForMode, type PackMode } from "@lia/nlu";
import { buildExpedienteFromPhotos } from "./buildPdf.js";
import { clientByPhone, rememberLead, studioName } from "./contextStore.js";
import { enqueueDoc, enqueueLead } from "./pendingDocs.js";
import {
  addPhoto,
  clearPack,
  getPack,
  hasConsentSent,
  isPackClose,
  markConsentSent,
  type PackPhoto,
} from "./packUtils.js";
import { ensureIdentifySession } from "./identify.js";
import { sendDocument, sendText } from "./whatsapp.js";

function bytesToBase64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64");
}

function resolveMode(phone: string): PackMode {
  const client = clientByPhone(phone);
  return client?.verified ? "full" : "prospect";
}

export async function finishPhonePack(phone: string): Promise<boolean> {
  const pack = getPack(phone);
  if (pack.photos.length === 0) {
    const mode = pack.mode;
    await sendText(
      phone,
      mode === "prospect"
        ? "Todavía no recibí fotos. Mandame DNI frente y dorso para armar tu ficha de consulta."
        : "Todavía no recibí fotos. Mandame DNI frente, dorso y tarjeta (o CBU).",
    );
    return false;
  }

  if (pack.mode === "prospect") {
    return finishProspectPack(phone, pack);
  }
  return finishAltaPack(phone, pack);
}

async function finishAltaPack(phone: string, pack: { photos: PackPhoto[] }) {
  const client = clientByPhone(phone);
  const clientLine = client
    ? `${client.firstName} · WhatsApp ${phone}`
    : `Cliente · WhatsApp ${phone}`;
  const studio = client?.producerName ?? studioName();

  const bytes = await buildExpedienteFromPhotos({
    studio,
    clientLine,
    photos: pack.photos,
  });

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `Expediente_${client?.firstName ?? "Cliente"}_${stamp}.pdf`;

  await sendDocument(
    phone,
    bytes,
    filename,
    "✅ Listo. Armé el expediente PDF con la documentación. Tu productor también lo ve en la ficha.",
  );

  enqueueDoc({
    id: crypto.randomUUID(),
    phone: phone.replace(/\D/g, ""),
    filename,
    dataBase64: bytesToBase64(bytes),
    uploadedAt: new Date().toISOString(),
  });

  clearPack(phone);
  return true;
}

async function finishProspectPack(phone: string, pack: { photos: PackPhoto[] }) {
  const studio = studioName();
  const clientLine = `Consulta WhatsApp · ${phone}`;
  const bytes = await buildExpedienteFromPhotos({
    studio,
    clientLine,
    photos: pack.photos,
  });

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `Consulta_DNI_${stamp}.pdf`;

  const client = clientByPhone(phone);
  if (!client?.verified) {
    const lead = {
      id: crypto.randomUUID(),
      phone: phone.replace(/\D/g, ""),
      firstName: "Prospecto",
      lastName: "WhatsApp",
    };
    enqueueLead(lead);
    rememberLead(phone, {
      firstName: "Prospecto",
      lastName: "WhatsApp",
      producerName: studio,
      policies: [],
      verified: false,
    });
  }

  enqueueDoc({
    id: crypto.randomUUID(),
    phone: phone.replace(/\D/g, ""),
    filename,
    dataBase64: bytesToBase64(bytes),
    uploadedAt: new Date().toISOString(),
  });

  await sendDocument(
    phone,
    bytes,
    filename,
    "Recibí tu DNI. Armé el expediente preliminar.",
  );

  await sendText(
    phone,
    `Tu consulta quedó pendiente de aprobación en ${studio}. Un productor te va a contactar para cotizar — todavía no tenés póliza emitida.\n\n¿Qué querés asegurar? (auto, vida, hogar, ART…) Si es urgente, escribí «humano».`,
  );

  clearPack(phone);
  return true;
}

function photoAck(mode: PackMode, count: number): string {
  const target = packTargetCount(mode);
  if (count >= target) {
    return mode === "prospect"
      ? `Recibí las ${count} fotos del DNI. Armo tu ficha pendiente de aprobación.`
      : `Recibí ${count} fotos. Armo el PDF y te lo mando por acá.`;
  }
  const got = slotLabelForMode(count - 1, mode);
  const next = slotLabelForMode(count, mode);
  if (mode === "prospect") {
    return `Recibí ${got} (${count}/${target}). Mandame ${next}. Con eso armo tu ficha de consulta — no hace falta tarjeta todavía.`;
  }
  return `Recibí la foto ${count} (${got}). Mandame ${next}. Con 4 armo solo; si ya están, escribí LISTO.`;
}

export async function handleIncomingPhoto(phone: string, bytes: Uint8Array, mime: string) {
  const mode = resolveMode(phone);
  ensureIdentifySession(phone);
  const before = getPack(phone, mode).photos.length;
  if (before === 0 && mode === "prospect" && !hasConsentSent(phone)) {
    await sendText(
      phone,
      `Al mandar fotos aceptás que ${studioName()} use tus datos para cotizar (Ley 25.326).`,
    );
    markConsentSent(phone);
  }
  const count = addPhoto(phone, {
    label: slotLabelForMode(before, mode),
    bytes,
    mime,
    name: `foto-${String(before + 1).padStart(2, "0")}.jpg`,
  });
  const pack = getPack(phone);
  const ack = photoAck(pack.mode, count);
  await sendText(phone, ack);
  if (count >= packTargetCount(pack.mode)) await finishPhonePack(phone);
}

export async function handleIncomingText(phone: string, text: string): Promise<boolean> {
  const pack = getPack(phone);
  if (isPackClose(text) && pack.photos.length > 0) {
    await finishPhonePack(phone);
    return true;
  }
  return false;
}

export function registerPhoto(phone: string, photo: PackPhoto) {
  return addPhoto(phone, photo);
}
