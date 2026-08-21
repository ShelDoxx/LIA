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
  mpCustomerId?: string;
  cardLastFour?: string;
  /** Fin del período pagado (ISO). Al vencer → expired. */
  periodEndsAt?: string;
  /** Debe renovar / cargar tarjeta antes de periodEndsAt */
  renewalRequired?: boolean;
  updatedAt: string;
};

/** Vista pública: incluye días/tiempo restante de gracia. */
export type EntitlementView = Entitlement & {
  daysLeft: number | null;
  graceLabel: string | null;
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

export function computePeriodEndsAt(opts: {
  periodDays: number;
  testGraceMinutes?: number;
  from?: Date;
}): string {
  const from = opts.from ?? new Date();
  const d = new Date(from.getTime());
  const testMin = Number(opts.testGraceMinutes ?? 0);
  if (testMin > 0) {
    d.setTime(d.getTime() + testMin * 60_000);
  } else {
    d.setDate(d.getDate() + Math.max(1, Math.round(opts.periodDays)));
  }
  return d.toISOString();
}

/** Fin de acceso tras cancelar / fallar cobro: período ya pago, no 3 días fijos. */
export function paidPeriodEndsAt(opts: {
  existingPeriodEndsAt?: string;
  nextPaymentDate?: string;
  periodDays: number;
}): string {
  const existing = opts.existingPeriodEndsAt;
  if (existing && new Date(existing).getTime() > Date.now()) return existing;
  const next = opts.nextPaymentDate;
  if (next && new Date(next).getTime() > Date.now()) return new Date(next).toISOString();
  return computePeriodEndsAt({ periodDays: Math.max(1, opts.periodDays) });
}

export function daysLeftUntil(iso?: string): number | null {
  if (!iso) return null;
  const end = new Date(iso).getTime();
  if (Number.isNaN(end)) return null;
  const ms = end - Date.now();
  if (ms <= 0) return 0;
  return Math.max(1, Math.ceil(ms / 86_400_000));
}

export function graceLabelUntil(iso?: string): string | null {
  if (!iso) return null;
  const end = new Date(iso).getTime();
  if (Number.isNaN(end)) return null;
  const ms = end - Date.now();
  if (ms <= 0) return "0 días";
  if (ms < 60_000) return "menos de 1 minuto";
  if (ms < 3_600_000) {
    const mins = Math.ceil(ms / 60_000);
    return `${mins} minuto${mins === 1 ? "" : "s"}`;
  }
  if (ms < 86_400_000) {
    const hours = Math.ceil(ms / 3_600_000);
    return `${hours} hora${hours === 1 ? "" : "s"}`;
  }
  const days = Math.ceil(ms / 86_400_000);
  return `${days} día${days === 1 ? "" : "s"}`;
}

export function upsertEntitlement(next: Entitlement) {
  const i = store.entitlements.findIndex((x) => x.userId === next.userId);
  if (i >= 0) store.entitlements[i] = next;
  else store.entitlements.push(next);
  persist();
}

/** Merge parcial preservando vault (customer/card) y refs MP. */
export function patchEntitlement(
  userId: string,
  patch: Partial<Omit<Entitlement, "userId">> & {
    clearPeriodEndsAt?: boolean;
  },
): Entitlement {
  const prev = getEntitlement(userId);
  const { clearPeriodEndsAt, ...rest } = patch;
  const next: Entitlement = {
    ...prev,
    ...Object.fromEntries(
      Object.entries(rest).filter(([, v]) => v !== undefined),
    ),
    userId,
    updatedAt: new Date().toISOString(),
  } as Entitlement;
  if (clearPeriodEndsAt) delete next.periodEndsAt;
  upsertEntitlement(next);
  return next;
}

export function findUserIdByPreapprovalId(preapprovalId: string): string | undefined {
  const hit = store.entitlements.find((e) => e.mpPreapprovalId === preapprovalId);
  return hit?.userId;
}

/** Si el período venció, persiste expired. */
export function getEntitlement(userId: string): Entitlement {
  let e =
    store.entitlements.find((x) => x.userId === userId) ?? {
      userId,
      status: "none" as const,
      updatedAt: new Date().toISOString(),
    };
  if (
    e.status === "active" &&
    e.periodEndsAt &&
    Date.now() >= new Date(e.periodEndsAt).getTime()
  ) {
    e = {
      ...e,
      status: "expired",
      updatedAt: new Date().toISOString(),
    };
    upsertEntitlement(e);
  }
  return e;
}

export function toEntitlementView(e: Entitlement): EntitlementView {
  return {
    ...e,
    daysLeft: daysLeftUntil(e.periodEndsAt),
    graceLabel: graceLabelUntil(e.periodEndsAt),
  };
}

export function getUserById(id: string) {
  return store.users.find((u) => u.id === id);
}

export function getUserByEmail(email: string) {
  const e = normEmail(email);
  return store.users.find((u) => u.email === e);
}

export function listUsers() {
  return store.users.map((u) => ({
    ...u,
    entitlement: toEntitlementView(getEntitlement(u.id)),
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
}):
  | { ok: true; user: AuthUser; sessionToken: string; entitlement: EntitlementView }
  | { ok: false; error: string } {
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
  return {
    ok: true,
    user,
    sessionToken,
    entitlement: toEntitlementView(getEntitlement(user.id)),
  };
}

export function sessionFromToken(
  token: string | undefined,
): { user: AuthUser; entitlement: EntitlementView } | null {
  if (!token) return null;
  purgeExpired();
  const row = store.sessions.find((s) => s.tokenHash === hash(token));
  if (!row || row.expiresAt < Date.now()) return null;
  const user = getUserById(row.userId);
  if (!user) return null;
  return { user, entitlement: toEntitlementView(getEntitlement(user.id)) };
}

export function revokeSession(token: string | undefined) {
  if (!token) return;
  store.sessions = store.sessions.filter((s) => s.tokenHash !== hash(token));
  persist();
}

/** Alta/sesión vía email verificado (legacy Google path). */
export function loginWithVerifiedEmail(opts: {
  email: string;
  name?: string;
  firebaseUid?: string;
}): { user: AuthUser; sessionToken: string; entitlement: EntitlementView } {
  const user = upsertUser(opts);
  const sessionToken = randomBytes(32).toString("hex");
  store.sessions.push({
    tokenHash: hash(sessionToken),
    userId: user.id,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  persist();
  return {
    user,
    sessionToken,
    entitlement: toEntitlementView(getEntitlement(user.id)),
  };
}
