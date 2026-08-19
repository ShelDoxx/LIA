export { PHOTO_SLOTS, isPackClose, slotLabel } from "@lia/nlu";

export type PackPhoto = {
  label: string;
  bytes: Uint8Array;
  mime: string;
  name: string;
};

export type PhonePack = {
  phone: string;
  photos: PackPhoto[];
  updatedAt: number;
};

const packs = new Map<string, PhonePack>();

function key(phone: string) {
  const d = phone.replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : d;
}

export function getPack(phone: string): PhonePack {
  const k = key(phone);
  const existing = packs.get(k);
  if (existing) return existing;
  const pack: PhonePack = { phone: k, photos: [], updatedAt: Date.now() };
  packs.set(k, pack);
  return pack;
}

export function addPhoto(phone: string, photo: PackPhoto) {
  const pack = getPack(phone);
  pack.photos.push(photo);
  pack.updatedAt = Date.now();
  return pack.photos.length;
}

export function clearPack(phone: string) {
  packs.delete(key(phone));
}
