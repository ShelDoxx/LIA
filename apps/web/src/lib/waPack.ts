import { buildExpedientePdf, downloadPdf, fileToJpegDataUrl } from "@/lib/buildPdf";
import { normalizePackFile } from "@/lib/heic";
import type { Client, Producer, VaultDoc } from "@/lib/types";
import { fullName } from "@/lib/format";
import { PHOTO_SLOTS, asksForPack, isPackClose, slotLabel } from "@/lib/packNlu";

export { PHOTO_SLOTS, asksForPack, isPackClose, slotLabel };

export type PackPhoto = {
  label: string;
  dataUrl: string;
  name: string;
  kind: "image" | "file";
};

export function packInstructions(firstName: string) {
  return `${firstName}, mandame las fotos por acá, aunque sean JPG o HEIC del iPhone:
1) DNI frente
2) DNI dorso
3) Tarjeta frente
4) Tarjeta dorso (o CBU)

Con 4 fotos las armo solas. Si son menos, escribí LISTO y armo igual. El PDF queda en tu ficha.`;
}

export function receivedAck(count: number) {
  const got = slotLabel(count - 1);
  if (count >= 4) {
    return `Recibí ${count} fotos (última: ${got}). Armo el PDF y lo dejo en tu ficha.`;
  }
  return `Recibí la foto ${count} (${got}). Mandame ${slotLabel(count)}. Con 4 armo el PDF solo. Si ya están todas, escribí LISTO.`;
}

export async function filesToPackPhotos(files: File[], startIndex: number): Promise<PackPhoto[]> {
  const normalized = await Promise.all(files.map((file) => normalizePackFile(file)));
  const out: PackPhoto[] = [];
  for (let i = 0; i < normalized.length; i++) {
    const file = normalized[i];
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const dataUrl = isPdf ? await blobToDataUrl(file) : await fileToJpegDataUrl(file);
    out.push({
      label: slotLabel(startIndex + i),
      dataUrl,
      name: file.name || `${slotLabel(startIndex + i)}.jpg`,
      kind: isPdf ? "file" : "image",
    });
  }
  return out;
}

export async function assembleClientPdf(opts: {
  producer: Producer;
  client: Client;
  photos: PackPhoto[];
  logoDataUrl?: string;
}): Promise<{ doc: VaultDoc; filename: string; bytes: Uint8Array }> {
  const files = await Promise.all(
    opts.photos.map(async (p) => ({
      label: p.label,
      file: await dataUrlToFile(p.dataUrl, p.name),
    })),
  );
  const bytes = await buildExpedientePdf({
    title: "Expediente WhatsApp",
    subtitle: "Armado automatico desde el chat",
    studio: opts.producer.studioName,
    clientLine: `${fullName(opts.client)}  ·  DNI ${opts.client.dni}  ·  ${opts.client.phone}`,
    index: opts.photos.map((p) => `${p.label} - ${p.name}`),
    files,
    logoDataUrl: opts.logoDataUrl,
  });
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `WhatsApp_${opts.client.lastName}_${stamp}.pdf`;
  downloadPdf(bytes, filename);
  const doc: VaultDoc = {
    id: crypto.randomUUID(),
    clientId: opts.client.id,
    type: "expediente",
    name: filename,
    uploadedAt: new Date().toISOString(),
    sizeLabel: `${Math.max(1, Math.round(bytes.length / 1024))} KB`,
    dataUrl: bytesToDataUrl(bytes, "application/pdf"),
    source: "whatsapp",
  };
  return { doc, filename, bytes };
}

export function packedReply(_firstName?: string, _filename?: string, _count?: number) {
  return "✅ ¡Listo! Armé el expediente PDF con la documentación.";
}

async function blobToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("No pude leer el archivo"));
    reader.readAsDataURL(file);
  });
}

export function bytesToDataUrl(bytes: Uint8Array, mime: string) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${mime};base64,${btoa(bin)}`;
}

async function dataUrlToFile(dataUrl: string, name: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const mime = blob.type || (name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");
  const fileName = name.includes(".") ? name : mime.includes("pdf") ? `${name}.pdf` : `${name}.jpg`;
  return new File([blob], fileName, { type: mime });
}
