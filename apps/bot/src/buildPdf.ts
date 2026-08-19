import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { PackPhoto } from "./packUtils.js";

function latin(s: string) {
  return s
    .replace(/[—–]/g, "-")
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/…/g, "...")
    .normalize("NFC");
}

function fit(pageW: number, pageH: number, imgW: number, imgH: number, margin: number) {
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2 - 28;
  const s = Math.min(maxW / imgW, maxH / imgH);
  const w = imgW * s;
  const h = imgH * s;
  return { w, h, x: (pageW - w) / 2, y: (pageH - h / 2) - 8 };
}

async function embedImage(pdf: PDFDocument, bytes: Uint8Array, mime: string) {
  if (mime.includes("png")) return pdf.embedPng(bytes);
  try {
    return await pdf.embedJpg(bytes);
  } catch {
    return pdf.embedPng(bytes);
  }
}

export async function buildExpedienteFromPhotos(opts: {
  studio: string;
  clientLine: string;
  photos: PackPhoto[];
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const A4: [number, number] = [595, 842];

  const cover = pdf.addPage(A4);
  cover.drawRectangle({ x: 0, y: 780, width: 595, height: 62, color: rgb(0.05, 0.08, 0.14) });
  cover.drawText("Lia  ·  Expediente", { x: 40, y: 804, size: 14, font: bold, color: rgb(0.96, 0.95, 0.92) });
  cover.drawText(latin(opts.studio), { x: 40, y: 788, size: 10, font, color: rgb(0.77, 0.27, 0.18) });
  cover.drawText("Expediente WhatsApp", { x: 40, y: 720, size: 22, font: bold, color: rgb(0.07, 0.08, 0.11) });
  cover.drawText(latin(opts.clientLine), { x: 40, y: 690, size: 12, font, color: rgb(0.07, 0.08, 0.11) });
  opts.photos.forEach((p, i) => {
    cover.drawText(latin(`${i + 1}. ${p.label}`), {
      x: 48,
      y: 650 - i * 18,
      size: 11,
      font,
      color: rgb(0.15, 0.16, 0.2),
    });
  });

  for (const item of opts.photos) {
    const img = await embedImage(pdf, item.bytes, item.mime);
    const page = pdf.addPage(A4);
    page.drawText(latin(item.label), { x: 40, y: 812, size: 9, font: bold, color: rgb(0.35, 0.34, 0.32) });
    const box = fit(A4[0], A4[1], img.width, img.height, 36);
    page.drawImage(img, { x: box.x, y: box.y, width: box.w, height: box.h });
  }

  return pdf.save();
}
