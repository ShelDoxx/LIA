import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useLia } from "@/context/LiaContext";
import { Badge, Button, Card } from "@/components/ui";
import {
  adminSetEntitlement,
  fetchAdminUsers,
  type LiaEntitlement,
} from "@/lib/authApi";
import { fetchBotHealth } from "@/lib/botApi";
import { loadCheckoutConfigFromBot } from "@/lib/billing";

type AdminUser = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  lastLoginAt: string;
  entitlement: LiaEntitlement;
  isAdmin?: boolean;
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

type Props = { mode?: "home" | "users" };

export function Admin({ mode = "home" }: Props) {
  const { isAdmin } = useLia();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [emailDevMode, setEmailDevMode] = useState(false);
  const [botOk, setBotOk] = useState<boolean | null>(null);
  const [waLive, setWaLive] = useState(false);
  const [mpOk, setMpOk] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setErr("");
    setLoading(true);
    const [r, health, checkout] = await Promise.all([
      fetchAdminUsers(),
      fetchBotHealth(),
      loadCheckoutConfigFromBot(),
    ]);
    setBotOk(health.ok);
    setWaLive(Boolean(health.whatsapp));
    setMpOk(Boolean(checkout.selfUrl || checkout.setupUrl));
    if (!r.ok) {
      setErr(r.error);
      setLoading(false);
      return;
    }
    setUsers(r.users as AdminUser[]);
    setEmailConfigured(r.emailConfigured);
    setEmailDevMode(r.emailDevMode);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const customers = useMemo(() => users.filter((u) => !u.isAdmin), [users]);

  const stats = useMemo(() => {
    const active = customers.filter((u) => u.entitlement.status === "active").length;
    const pending = customers.filter((u) => u.entitlement.status === "none").length;
    const suspended = customers.filter(
      (u) => u.entitlement.status === "expired" || u.entitlement.status === "trial",
    ).length;
    return { total: customers.length, active, pending, suspended };
  }, [customers]);

  if (!isAdmin) return <Navigate to="/" replace />;

  async function setStatus(
    userId: string,
    status: LiaEntitlement["status"],
    plan?: "self" | "setup",
  ) {
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

  const showUsers = mode === "users" || mode === "home";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {mode === "home" ? (
        <>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold">Ops</p>
            <h1 className="mt-1 font-serif text-3xl text-forest md:text-4xl">Consola Lía</h1>
            <p className="mt-2 text-sm text-ink-soft">
              Altas, planes y salud del sistema — separado del escritorio del productor.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4">
              <p className="text-xs uppercase tracking-wide text-ink-soft">Usuarios</p>
              <p className="mt-1 font-serif text-3xl text-forest">{stats.total}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs uppercase tracking-wide text-ink-soft">Activos</p>
              <p className="mt-1 font-serif text-3xl text-forest">{stats.active}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs uppercase tracking-wide text-ink-soft">Sin plan</p>
              <p className="mt-1 font-serif text-3xl text-forest">{stats.pending}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs uppercase tracking-wide text-ink-soft">Otros</p>
              <p className="mt-1 font-serif text-3xl text-forest">{stats.suspended}</p>
            </Card>
          </div>

          <Card className="p-5">
            <h2 className="font-serif text-xl text-forest">Estado del sistema</h2>
            <ul className="mt-4 space-y-3 text-sm">
              <li className="flex items-center justify-between gap-3 border-b border-line/60 pb-2">
                <span>API / bot</span>
                <Badge tone={botOk ? "forest" : "gold"}>{botOk ? "Online" : "Caído / sin respuesta"}</Badge>
              </li>
              <li className="flex items-center justify-between gap-3 border-b border-line/60 pb-2">
                <span>WhatsApp Meta</span>
                <Badge tone={waLive ? "forest" : "gold"}>{waLive ? "Live" : "Demo / sin token"}</Badge>
              </li>
              <li className="flex items-center justify-between gap-3 border-b border-line/60 pb-2">
                <span>Email OTP (Resend)</span>
                <Badge tone={emailConfigured ? "forest" : "gold"}>
                  {emailConfigured ? "Configurado" : emailDevMode ? "Modo prueba" : "Falta"}
                </Badge>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span>Checkout Mercado Pago</span>
                <Badge tone={mpOk ? "forest" : "gold"}>{mpOk ? "Links cargados" : "Sin links"}</Badge>
              </li>
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/admin/usuarios">
                <Button variant="gold">Gestionar usuarios</Button>
              </Link>
              <Button variant="ghost" onClick={() => void load()}>
                Actualizar
              </Button>
            </div>
          </Card>
        </>
      ) : (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold">Ops</p>
            <h1 className="mt-1 font-serif text-3xl text-forest">Usuarios</h1>
            <p className="mt-2 text-sm text-ink-soft">Activá, suspendé o quitá planes con un clic.</p>
          </div>
          <Button variant="ghost" onClick={() => void load()}>
            Actualizar
          </Button>
        </div>
      )}

      {msg ? <p className="text-sm text-gold">{msg}</p> : null}
      {err ? <p className="text-sm text-danger">{err}</p> : null}

      {showUsers && mode === "users" ? (
        <div className="space-y-3">
          {loading ? (
            <Card className="p-6">
              <p className="text-sm text-ink-soft">Cargando usuarios…</p>
            </Card>
          ) : customers.length === 0 ? (
            <Card className="p-6">
              <p className="text-sm text-ink-soft">
                Todavía no hay productores registrados (los admins no aparecen acá).
              </p>
            </Card>
          ) : (
            customers.map((u) => (
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
      ) : null}

      {mode === "home" && stats.pending > 0 ? (
        <Card className="border-gold/40 bg-gold/5 p-4 text-sm">
          Hay <strong>{stats.pending}</strong> usuario{stats.pending === 1 ? "" : "s"} sin plan.{" "}
          <Link to="/admin/usuarios" className="underline">
            Revisar →
          </Link>
        </Card>
      ) : null}
    </div>
  );
}
