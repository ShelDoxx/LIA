import heic2any from "heic2any";

export function isHeicFile(file: File) {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return (
    type === "image/heic" ||
    type === "image/heif" ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
}

export async function heicToJpegFile(file: File): Promise<File> {
  const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
  const blob = Array.isArray(converted) ? converted[0] : converted;
  const name = file.name.replace(/\.(heic|heif)$/i, ".jpg");
  return new File([blob], name.endsWith(".jpg") ? name : `${name}.jpg`, { type: "image/jpeg" });
}

export async function normalizePackFile(file: File): Promise<File> {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (isPdf || !isHeicFile(file)) return file;
  try {
    return await heicToJpegFile(file);
  } catch {
    throw new Error("No pude leer el HEIC del iPhone. Pedile que la mande de nuevo o en JPG.");
  }
}

export async function normalizePackFiles(files: File[]): Promise<File[]> {
  const out: File[] = [];
  for (const file of files) {
    out.push(await normalizePackFile(file));
  }
  return out;
}
