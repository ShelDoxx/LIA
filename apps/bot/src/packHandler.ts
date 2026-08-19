import { buildExpedienteFromPhotos } from "./buildPdf.js";
import { clientByPhone } from "./contextStore.js";
import { enqueueDoc } from "./pendingDocs.js";
import {
  addPhoto,
  clearPack,
  getPack,
  isPackClose,
  slotLabel,
  type PackPhoto,
} from "./packUtils.js";
import { sendDocument, sendText } from "./whatsapp.js";

function bytesToBase64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64");
}

export async function finishPhonePack(phone: string): Promise<boolean> {
  const pack = getPack(phone);
  if (pack.photos.length === 0) {
    await sendText(phone, "Todavía no recibí fotos. Mandame DNI frente, dorso y tarjeta (o CBU).");
    return false;
  }

  const client = clientByPhone(phone);
  const clientLine = client
    ? `${client.firstName} · WhatsApp ${phone}`
    : `Cliente · WhatsApp ${phone}`;
  const studio = client?.producerName ?? "Estudio Lía";

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

export async function handleIncomingPhoto(phone: string, bytes: Uint8Array, mime: string) {
  const before = getPack(phone).photos.length;
  const count = addPhoto(phone, {
    label: slotLabel(before),
    bytes,
    mime,
    name: `foto-${String(before + 1).padStart(2, "0")}.jpg`,
  });
  const ack =
    count >= 4
      ? `Recibí ${count} fotos. Armo el PDF y te lo mando por acá.`
      : `Recibí la foto ${count} (${slotLabel(count - 1)}). Mandame ${slotLabel(count)}. Con 4 armo solo; si ya están, escribí LISTO.`;
  await sendText(phone, ack);
  if (count >= 4) await finishPhonePack(phone);
}

export async function handleIncomingText(phone: string, text: string): Promise<boolean> {
  if (isPackClose(text) && getPack(phone).photos.length > 0) {
    await finishPhonePack(phone);
    return true;
  }
  return false;
}

export function registerPhoto(phone: string, photo: PackPhoto) {
  return addPhoto(phone, photo);
}
