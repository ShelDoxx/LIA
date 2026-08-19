import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { normalizePackFile } from "@/lib/heic";

export type PackInput = {
  title: string;
  subtitle: string;
  studio: string;
  clientLine: string;
  index: string[];
  files: Array<{ label: string; file: File }>;
  logoDataUrl?: string;
};

export async function fileToJpegDataUrl(file: File, max = 1400, quality = 0.8): Promise<string> {
  const jpeg = await normalizePackFile(file);
  const bytes = await fileToJpeg(jpeg, max, quality);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:image/jpeg;base64,${btoa(bin)}`;
}

async function fileToJpeg(file: File, max = 1600, quality = 0.82): Promise<Uint8Array> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("No pude leer la imagen. Probá JPG o PNG."));
      el.src = url;
    });
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas no disponible");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Fallo al comprimir"))), "image/jpeg", quality);
    });
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

function fit(pageW: number, pageH: number, imgW: number, imgH: number, margin: number) {
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2 - 28;
  const s = Math.min(maxW / imgW, maxH / imgH);
  const w = imgW * s;
  const h = imgH * s;
  return { w, h, x: (pageW - w) / 2, y: (pageH - h) / 2 - 8 };
}

function latin(s: string) {
  return s
    .replace(/[—–]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, "...")
    .normalize("NFC");
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function embedLogo(pdf: PDFDocument, dataUrl: string) {
  const bytes = dataUrlToBytes(dataUrl);
  if (dataUrl.includes("image/png")) return pdf.embedPng(bytes);
  try {
    return await pdf.embedJpg(bytes);
  } catch {
    return pdf.embedPng(bytes);
  }
}

export async function buildExpedientePdf(input: PackInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const A4: [number, number] = [595, 842];

  const cover = pdf.addPage(A4);
  cover.drawRectangle({ x: 0, y: 780, width: 595, height: 62, color: rgb(0.05, 0.08, 0.14) });
  cover.drawText("Lia  ·  Expediente", { x: 40, y: 804, size: 14, font: bold, color: rgb(0.96, 0.95, 0.92) });
  cover.drawText(latin(input.studio), { x: 40, y: 788, size: 10, font, color: rgb(0.77, 0.27, 0.18) });
  if (input.logoDataUrl) {
    try {
      const logo = await embedLogo(pdf, input.logoDataUrl);
      const maxH = 40;
      const maxW = 90;
      const scale = Math.min(maxH / logo.height, maxW / logo.width);
      const w = logo.width * scale;
      const h = logo.height * scale;
      cover.drawRectangle({
        x: 595 - 48 - w,
        y: 791,
        width: w + 16,
        height: h + 10,
        color: rgb(1, 1, 1),
      });
      cover.drawImage(logo, { x: 595 - 40 - w, y: 796, width: w, height: h });
    } catch {
      /* logo opcional */
    }
  }
  cover.drawText(latin(input.title), { x: 40, y: 720, size: 22, font: bold, color: rgb(0.07, 0.08, 0.11) });
  cover.drawText(latin(input.subtitle), { x: 40, y: 694, size: 11, font, color: rgb(0.35, 0.34, 0.32) });
  cover.drawText(latin(input.clientLine), { x: 40, y: 660, size: 12, font, color: rgb(0.07, 0.08, 0.11) });
  cover.drawText("Un solo PDF. Listo para el portal de la compania.", {
    x: 40,
    y: 630,
    size: 11,
    font,
    color: rgb(0.77, 0.27, 0.18),
  });
  cover.drawText("Contenido", { x: 40, y: 580, size: 13, font: bold, color: rgb(0.07, 0.08, 0.11) });
  input.index.forEach((line, i) => {
    cover.drawText(latin(`${i + 1}.  ${line}`).slice(0, 90), {
      x: 48,
      y: 552 - i * 18,
      size: 11,
      font,
      color: rgb(0.15, 0.16, 0.2),
    });
  });

  for (const item of input.files) {
    const isPdf = item.file.type === "application/pdf" || item.file.name.toLowerCase().endsWith(".pdf");
    if (isPdf) {
      const src = await PDFDocument.load(await item.file.arrayBuffer());
      const copied = await pdf.copyPages(src, src.getPageIndices());
      copied.forEach((p) => pdf.addPage(p));
      continue;
    }
    const jpg = await fileToJpeg(await normalizePackFile(item.file));
    const img = await pdf.embedJpg(jpg);
    const page = pdf.addPage(A4);
    page.drawText(latin(item.label), { x: 40, y: 812, size: 9, font: bold, color: rgb(0.35, 0.34, 0.32) });
    const box = fit(A4[0], A4[1], img.width, img.height, 36);
    page.drawImage(img, { x: box.x, y: box.y, width: box.w, height: box.h });
  }

  return pdf.save();
}

export function downloadPdf(bytes: Uint8Array, filename: string) {
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
