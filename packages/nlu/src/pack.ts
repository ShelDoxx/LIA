import { foldText } from "./fold";

export const PHOTO_SLOTS = ["DNI frente", "DNI dorso", "Tarjeta frente", "Tarjeta dorso"];

/** Alta en compañía (cliente verificado): DNI + medio de pago. */
export const PROSPECT_PHOTO_SLOTS = ["DNI frente", "DNI dorso"];

export type PackMode = "full" | "prospect";

export function slotLabel(index: number) {
  return PHOTO_SLOTS[index] ?? `Documento ${index + 1}`;
}

export function prospectSlotLabel(index: number) {
  return PROSPECT_PHOTO_SLOTS[index] ?? `Documento ${index + 1}`;
}

export function slotLabelForMode(index: number, mode: PackMode) {
  return mode === "full" ? slotLabel(index) : prospectSlotLabel(index);
}

export function packTargetCount(mode: PackMode) {
  return mode === "full" ? PHOTO_SLOTS.length : PROSPECT_PHOTO_SLOTS.length;
}

export function isPackClose(text: string) {
  const t = foldText(text).trim();
  return /^(listo|ya esta|ya estan|son todas|termine|es todo|arma(me)? el pdf|armar pdf)\b/.test(t);
}

export function asksForPack(text: string) {
  const t = foldText(text);
  return /te mando( las)? fotos|alta smg|expediente|dni frente|fotos del dni|documentacion|armar pdf/.test(t);
}
