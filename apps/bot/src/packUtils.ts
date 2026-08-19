export {
  PHOTO_SLOTS,
  PROSPECT_PHOTO_SLOTS,
  isPackClose,
  slotLabel,
  prospectSlotLabel,
  slotLabelForMode,
  packTargetCount,
  type PackMode,
} from "@lia/nlu";

import { loadStore, saveStore } from "./botStore.js";

export type PackPhoto = {
  label: string;
  bytes: Uint8Array;
  mime: string;
  name: string;
};

export type PhonePack = {
  phone: string;
  photos: PackPhoto[];
  mode: import("@lia/nlu").PackMode;
  updatedAt: number;
  consentSent?: boolean;
};

type StoredPhoto = {
  label: string;
  mime: string;
  name: string;
  dataBase64: string;
};

type StoredPack = {
  phone: string;
  photos: StoredPhoto[];
  mode: import("@lia/nlu").PackMode;
  updatedAt: number;
  consentSent?: boolean;
};

const PACK_TTL_MS = 48 * 60 * 60 * 1000;

function key(phone: string) {
  const d = phone.replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : d;
}

function hydratePacks(): Map<string, PhonePack> {
  const raw = loadStore<Record<string, StoredPack>>("packs", {});
  const map = new Map<string, PhonePack>();
  const now = Date.now();
  for (const [k, v] of Object.entries(raw)) {
    if (now - v.updatedAt > PACK_TTL_MS) continue;
    map.set(k, {
      phone: v.phone,
      mode: v.mode,
      updatedAt: v.updatedAt,
      consentSent: v.consentSent,
      photos: v.photos.map((p) => ({
        label: p.label,
        mime: p.mime,
        name: p.name,
        bytes: Buffer.from(p.dataBase64, "base64"),
      })),
    });
  }
  return map;
}

const packs = hydratePacks();

function persistPacks() {
  const out: Record<string, StoredPack> = {};
  const now = Date.now();
  for (const [k, pack] of packs) {
    if (now - pack.updatedAt > PACK_TTL_MS) {
      packs.delete(k);
      continue;
    }
    out[k] = {
      phone: pack.phone,
      mode: pack.mode,
      updatedAt: pack.updatedAt,
      consentSent: pack.consentSent,
      photos: pack.photos.map((p) => ({
        label: p.label,
        mime: p.mime,
        name: p.name,
        dataBase64: Buffer.from(p.bytes).toString("base64"),
      })),
    };
  }
  saveStore("packs", out);
}

export function getPack(phone: string, defaultMode: import("@lia/nlu").PackMode = "prospect"): PhonePack {
  const k = key(phone);
  const existing = packs.get(k);
  if (existing) return existing;
  const pack: PhonePack = { phone: k, photos: [], mode: defaultMode, updatedAt: Date.now() };
  packs.set(k, pack);
  persistPacks();
  return pack;
}

export function addPhoto(phone: string, photo: PackPhoto) {
  const pack = getPack(phone);
  pack.photos.push(photo);
  pack.updatedAt = Date.now();
  persistPacks();
  return pack.photos.length;
}

export function markConsentSent(phone: string) {
  const pack = getPack(phone);
  pack.consentSent = true;
  pack.updatedAt = Date.now();
  persistPacks();
}

export function hasConsentSent(phone: string) {
  return Boolean(getPack(phone).consentSent);
}

export function clearPack(phone: string) {
  packs.delete(key(phone));
  persistPacks();
}
