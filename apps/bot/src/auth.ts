import { createHash, randomBytes, randomInt } from "node:crypto";
import { loadStore, saveStore } from "./botStore.js";

export type EntitlementStatus = "none" | "trial" | "active" | "expired";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  lastLoginAt: string;
  firebaseUid?: string;
};

export type Entitlement = {
  userId: string;
  status: EntitlementStatus;
  plan?: "self" | "setup";
  mpPaymentId?: string;
  mpPreapprovalId?: string;
  updatedAt: string;
};

type OtpRow = {
  email: string;
  codeHash: string;
  expiresAt: number;
  attempts: number;
};

type SessionRow = {
  tokenHash: string;
  userId: string;
  expiresAt: number;
};

type Store = {
  users: AuthUser[];
  entitlements: Entitlement[];
  otps: OtpRow[];
  sessions: SessionRow[];
};

const MAX_OTP_ATTEMPTS = 5;
const OTP_TTL_MS = 10 * 60_000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60_000;

let store: Store = loadStore<Store>("auth", {
  users: [],
  entitlements: [],
  otps: [],
  sessions: [],
});

function persist() {
  saveStore("auth", store);
}

function normEmail(email: string) {
  return email.trim().toLowerCase();
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function purgeExpired() {
  const now = Date.now();
  store.otps = store.otps.filter((o) => o.expiresAt > now);
  store.sessions = store.sessions.filter((s) => s.expiresAt > now);
}

export function getUserById(id: string) {
  return store.users.find((u) => u.id === id);
}

export function getUserByEmail(email: string) {
  const e = normEmail(email);
  return store.users.find((u) => u.email === e);
}

export function getEntitlement(userId: string): Entitlement {
  return (
    store.entitlements.find((x) => x.userId === userId) ?? {
      userId,
      status: "none",
      updatedAt: new Date().toISOString(),
    }
  );
}

export function upsertEntitlement(next: Entitlement) {
  const i = store.entitlements.findIndex((x) => x.userId === next.userId);
  if (i >= 0) store.entitlements[i] = next;
  else store.entitlements.push(next);
  persist();
}

export function listUsers() {
  return store.users.map((u) => ({
    ...u,
    entitlement: getEntitlement(u.id),
  }));
}

function upsertUser(opts: { email: string; name?: string; firebaseUid?: string }): AuthUser {
  const email = normEmail(opts.email);
  const existing = store.users.find((u) => u.email === email);
  const now = new Date().toISOString();
  if (existing) {
    existing.lastLoginAt = now;
    if (opts.name?.trim()) existing.name = opts.name.trim();
    if (opts.firebaseUid) existing.firebaseUid = opts.firebaseUid;
    persist();
    return existing;
  }
  const user: AuthUser = {
    id: crypto.randomUUID(),
    email,
    name: opts.name?.trim() || email.split("@")[0] || "Productor",
    createdAt: now,
    lastLoginAt: now,
    firebaseUid: opts.firebaseUid,
  };
  store.users.unshift(user);
  if (!store.entitlements.some((e) => e.userId === user.id)) {
    store.entitlements.push({
      userId: user.id,
      status: "none",
      updatedAt: now,
    });
  }
  persist();
  return user;
}

export function createOtp(emailRaw: string): { email: string; code: string; expiresAt: number } {
  purgeExpired();
  const email = normEmail(emailRaw);
  if (!email.includes("@")) throw new Error("Email inválido");
  const code = String(randomInt(100000, 999999));
  store.otps = store.otps.filter((o) => o.email !== email);
  store.otps.push({
    email,
    codeHash: hash(code),
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
  });
  persist();
  return { email, code, expiresAt: Date.now() + OTP_TTL_MS };
}

export function verifyOtp(opts: {
  email: string;
  code: string;
  name?: string;
}): { ok: true; user: AuthUser; sessionToken: string; entitlement: Entitlement } | { ok: false; error: string } {
  purgeExpired();
  const email = normEmail(opts.email);
  const row = store.otps.find((o) => o.email === email);
  if (!row) return { ok: false, error: "Pedí un código nuevo" };
  if (row.expiresAt < Date.now()) {
    store.otps = store.otps.filter((o) => o.email !== email);
    persist();
    return { ok: false, error: "El código expiró. Pedí uno nuevo." };
  }
  row.attempts += 1;
  if (row.attempts > MAX_OTP_ATTEMPTS) {
    store.otps = store.otps.filter((o) => o.email !== email);
    persist();
    return { ok: false, error: "Demasiados intentos. Pedí un código nuevo." };
  }
  if (row.codeHash !== hash(opts.code.trim())) {
    persist();
    return { ok: false, error: "Código incorrecto" };
  }
  store.otps = store.otps.filter((o) => o.email !== email);
  const user = upsertUser({ email, name: opts.name });
  const sessionToken = randomBytes(32).toString("hex");
  store.sessions.push({
    tokenHash: hash(sessionToken),
    userId: user.id,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  persist();
  return { ok: true, user, sessionToken, entitlement: getEntitlement(user.id) };
}

export function sessionFromToken(token: string | undefined): { user: AuthUser; entitlement: Entitlement } | null {
  if (!token) return null;
  purgeExpired();
  const row = store.sessions.find((s) => s.tokenHash === hash(token));
  if (!row || row.expiresAt < Date.now()) return null;
  const user = getUserById(row.userId);
  if (!user) return null;
  return { user, entitlement: getEntitlement(user.id) };
}

export function revokeSession(token: string | undefined) {
  if (!token) return;
  store.sessions = store.sessions.filter((s) => s.tokenHash !== hash(token));
  persist();
}

/** Alta/sesión vía Google (ya verificado por Firebase en el cliente). */
export function loginWithVerifiedEmail(opts: {
  email: string;
  name?: string;
  firebaseUid?: string;
}): { user: AuthUser; sessionToken: string; entitlement: Entitlement } {
  const user = upsertUser(opts);
  const sessionToken = randomBytes(32).toString("hex");
  store.sessions.push({
    tokenHash: hash(sessionToken),
    userId: user.id,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  persist();
  return { user, sessionToken, entitlement: getEntitlement(user.id) };
}
