/**
 * Verifica un Firebase ID token contra Identity Toolkit (sin firebase-admin).
 * Requiere FIREBASE_WEB_API_KEY (misma API key del proyecto web).
 */
export async function verifyFirebaseIdToken(
  idToken: string,
  apiKey: string,
): Promise<{ email: string; uid: string; name?: string } | null> {
  const token = idToken.trim();
  if (!token || !apiKey) return null;
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: token }),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      users?: Array<{ localId?: string; email?: string; displayName?: string }>;
    };
    const u = data.users?.[0];
    if (!u?.email || !u.localId) return null;
    return {
      email: u.email,
      uid: u.localId,
      name: u.displayName,
    };
  } catch {
    return null;
  }
}
