import { botUrl } from "@/lib/botBase";

const SESSION_KEY = "lia-session-token";

export type LiaEntitlement = {
  userId: string;
  status: "none" | "trial" | "active" | "expired";
  plan?: "self" | "setup";
  updatedAt?: string;
};

export type LiaAuthUser = {
  id: string;
  email: string;
  name: string;
};

export function getSessionToken(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function setSessionToken(token: string | null) {
  try {
    if (token) localStorage.setItem(SESSION_KEY, token);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export async function requestOtp(email: string, name?: string) {
  const res = await fetch(botUrl("/auth/request-otp"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, name }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    email?: string;
    devCode?: string;
  };
  if (!res.ok || !data.ok) {
    return { ok: false as const, error: data.error || "No se pudo enviar el código" };
  }
  return { ok: true as const, email: data.email ?? email, devCode: data.devCode };
}

export async function verifyOtp(email: string, code: string, name?: string) {
  const res = await fetch(botUrl("/auth/verify-otp"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code, name }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    sessionToken?: string;
    user?: LiaAuthUser;
    entitlement?: LiaEntitlement;
  };
  if (!res.ok || !data.ok || !data.sessionToken || !data.user) {
    return { ok: false as const, error: data.error || "Código inválido" };
  }
  setSessionToken(data.sessionToken);
  return {
    ok: true as const,
    user: data.user,
    entitlement: data.entitlement,
    sessionToken: data.sessionToken,
  };
}

export async function sessionFromGoogle(opts: {
  email: string;
  name?: string;
  firebaseUid?: string;
}) {
  const res = await fetch(botUrl("/auth/session-google"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    sessionToken?: string;
    user?: LiaAuthUser;
    entitlement?: LiaEntitlement;
  };
  if (!res.ok || !data.ok || !data.sessionToken || !data.user) {
    return { ok: false as const, error: data.error || "No se pudo crear sesión" };
  }
  setSessionToken(data.sessionToken);
  return {
    ok: true as const,
    user: data.user,
    entitlement: data.entitlement,
    sessionToken: data.sessionToken,
  };
}

export async function fetchAuthMe() {
  const token = getSessionToken();
  if (!token) return { ok: false as const, error: "Sin sesión" };
  const res = await fetch(botUrl("/auth/me"), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    user?: LiaAuthUser;
    entitlement?: LiaEntitlement;
    isAdmin?: boolean;
  };
  if (!res.ok || !data.ok || !data.user) {
    return { ok: false as const, error: data.error || "Sesión inválida" };
  }
  return {
    ok: true as const,
    user: data.user,
    entitlement: data.entitlement,
    isAdmin: Boolean(data.isAdmin),
  };
}

export async function logoutSession() {
  const token = getSessionToken();
  if (token) {
    try {
      await fetch(botUrl("/auth/logout"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      /* ignore */
    }
  }
  setSessionToken(null);
}
