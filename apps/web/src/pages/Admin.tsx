import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useLia } from "@/context/LiaContext";
import { Button, Card } from "@/components/ui";
import {
  adminSetEntitlement,
  fetchAdminUsers,
  type LiaEntitlement,
} from "@/lib/authApi";

type AdminUser = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  lastLoginAt: string;
  entitlement: LiaEntitlement;
};

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString("es-AR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function Admin() {
  const { isAdmin } = useLia();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [emailDevMode, setEmailDevMode] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr("");
    const r = await fetchAdminUsers();
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    setUsers(r.users as AdminUser[]);
    setEmailConfigured(r.emailConfigured);
    setEmailDevMode(r.emailDevMode);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!isAdmin) return <Navigate to="/" replace />;

  async function setStatus(userId: string, status: LiaEntitlement["status"], plan?: "self" | "setup") {
    setBusyId(userId);
    setMsg("");
    setErr("");
    const r = await adminSetEntitlement({ userId, status, plan });
    setBusyId(null);
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    setMsg(`Actualizado: ${status}${plan ? ` · ${plan}` : ""}`);
    await load();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold">Admin</p>
        <h1 className="mt-1 font-serif text-3xl text-forest">Altas y planes</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Usuarios registrados por OTP/Google y su entitlement en el servidor.
        </p>
      </div>

      <Card className="p-4">
        <p className="text-sm text-ink-soft">
          Email OTP:{" "}
          {emailConfigured ? (
            <span className="text-forest">Resend configurado</span>
          ) : emailDevMode ? (
            <span className="text-gold">Modo prueba (código en pantalla)</span>
          ) : (
            <span className="text-danger">Sin configurar</span>
          )}
        </p>
      </Card>

      {msg ? <p className="text-sm text-gold">{msg}</p> : null}
      {err ? <p className="text-sm text-danger">{err}</p> : null}

      <div className="flex justify-end">
        <Button variant="ghost" onClick={() => void load()}>
          Actualizar
        </Button>
      </div>

      <div className="space-y-3">
        {users.length === 0 ? (
          <Card className="p-6">
            <p className="text-sm text-ink-soft">Todavía no hay usuarios registrados.</p>
          </Card>
        ) : (
          users.map((u) => (
            <Card key={u.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-serif text-xl text-forest">{u.name}</p>
                  <p className="text-sm text-ink-soft">{u.email}</p>
                  <p className="mt-2 text-xs text-ink-soft">
                    Alta {fmt(u.createdAt)} · último login {fmt(u.lastLoginAt)}
                  </p>
                  <p className="mt-1 text-sm text-forest">
                    Plan: <strong>{u.entitlement.status}</strong>
                    {u.entitlement.plan ? ` · ${u.entitlement.plan}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="gold"
                    disabled={busyId === u.id}
                    onClick={() => void setStatus(u.id, "active", "self")}
                  >
                    Activar Self
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busyId === u.id}
                    onClick={() => void setStatus(u.id, "active", "setup")}
                  >
                    Activar Setup
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busyId === u.id}
                    onClick={() => void setStatus(u.id, "expired")}
                  >
                    Suspender
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busyId === u.id}
                    onClick={() => void setStatus(u.id, "none")}
                  >
                    Quitar plan
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
