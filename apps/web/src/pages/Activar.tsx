import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useLia } from "@/context/LiaContext";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { CheckoutPlans } from "@/components/CheckoutPlans";
import {
  activateSubscription,
  checkoutSelfUrl,
  checkoutSetupUrl,
  confirmMercadoPagoPayment,
  extractMpReturnOperationId,
  markMeetScheduled,
  readCheckoutSince,
  setupMeetWhatsAppUrl,
  syncAfterCheckout,
  type SubscriptionPlan,
} from "@/lib/billing";

function readPendingPlan(): SubscriptionPlan | null {
  try {
    const p = sessionStorage.getItem("lia_checkout_plan");
    if (p === "self" || p === "setup") return p;
  } catch {
    /* ignore */
  }
  return null;
}

function clearPendingPlan() {
  try {
    sessionStorage.removeItem("lia_checkout_plan");
    sessionStorage.removeItem("lia_checkout_at");
  } catch {
    /* ignore */
  }
}

export function Activar() {
  const { state, save } = useLia();
  const [params] = useSearchParams();
  const sub = state.producer.subscription;
  const meetPending = sub?.status === "active" && sub.setupMeetPending;
  const [pendingPlan, setPendingPlan] = useState<SubscriptionPlan | null>(() => readPendingPlan());
  const [operationId, setOperationId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const autoTried = useRef(false);

  function applyActivation(plan: SubscriptionPlan, setupMeetPending?: boolean) {
    clearPendingPlan();
    setPendingPlan(null);
    void save({
      ...state,
      producer: {
        ...state.producer,
        plan: "estudio",
        subscription: activateSubscription(
          sub ?? { status: "expired", startedAt: new Date().toISOString() },
          {
            plan,
            setupMeetPending: setupMeetPending ?? plan === "setup",
          },
        ),
      },
    });
    setMsg(plan === "setup" ? "Pago verificado. Plan activo — coordiná el meet." : "Pago verificado. Plan Self activo.");
    setErr("");
  }

  async function tryAutoActivate(opts?: {
    op?: string;
    plan?: SubscriptionPlan | null;
    silent?: boolean;
  }) {
    if (sub?.status === "active") return true;
    const plan = opts?.plan ?? pendingPlan ?? readPendingPlan() ?? "self";
    const op = (opts?.op || operationId).trim();
    const silent = Boolean(opts?.silent);

    if (!silent) {
      setBusy(true);
      setErr("");
      setMsg("Verificando pago con Mercado Pago…");
    }

    if (op) {
      const byOp = await confirmMercadoPagoPayment(op, plan);
      if (byOp.ok) {
        applyActivation(byOp.plan ?? plan, byOp.setupMeetPending);
        setBusy(false);
        return true;
      }
      if (!silent && !opts?.op) {
        /* keep going to sync */
      } else if (!silent && opts?.op) {
        setBusy(false);
        setMsg("");
        setErr(byOp.error || "No se pudo verificar ese número de operación.");
        return false;
      }
    }

    const synced = await syncAfterCheckout(plan, readCheckoutSince());
    if (!silent) setBusy(false);
    if (synced.ok) {
      applyActivation(synced.plan ?? plan, synced.setupMeetPending);
      return true;
    }
    if (!silent) {
      setMsg("");
      setErr(synced.error || "Todavía no vemos el cobro aprobado.");
    }
    return false;
  }

  async function confirmPaid() {
    if (!operationId.trim()) {
      setErr("Pegá el número de operación de Mercado Pago (pantalla de éxito).");
      return;
    }
    await tryAutoActivate({ op: operationId, plan: pendingPlan ?? "self" });
  }

  // Vuelta desde MP (back_url) o params de checkout
  useEffect(() => {
    if (autoTried.current || sub?.status === "active") return;
    const status = params.get("status") || params.get("collection_status") || "";
    const paid =
      params.get("paid") === "1" ||
      status === "approved" ||
      status === "authorized" ||
      Boolean(params.get("preapproval_id"));
    const planParam = params.get("plan");
    const plan: SubscriptionPlan | null =
      planParam === "setup" || planParam === "self" ? planParam : readPendingPlan();
    const op = extractMpReturnOperationId(params);
    if (op) setOperationId(op);
    if (!paid && !op) return;
    autoTried.current = true;
    void tryAutoActivate({ op, plan });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Al volver a la pestaña después de pagar: reintentar sync
  useEffect(() => {
    function onFocus() {
      setPendingPlan(readPendingPlan());
      if (sub?.status === "active" || busy) return;
      if (!readPendingPlan() && !readCheckoutSince()) return;
      void tryAutoActivate({ plan: readPendingPlan(), silent: true });
    }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") onFocus();
    });
    return () => {
      window.removeEventListener("focus", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub?.status, busy]);

  // Poll corto mientras haya checkout pendiente
  useEffect(() => {
    if (sub?.status === "active") return;
    if (!readCheckoutSince() && !pendingPlan) return;
    let n = 0;
    const t = window.setInterval(() => {
      n += 1;
      if (n > 12) {
        window.clearInterval(t);
        return;
      }
      void tryAutoActivate({ plan: readPendingPlan() ?? pendingPlan, silent: true });
    }, 5000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPlan, sub?.status]);

  function openMeet() {
    window.open(setupMeetWhatsAppUrl(state.producer.name), "_blank", "noopener,noreferrer");
    if (sub) {
      void save({
        ...state,
        producer: {
          ...state.producer,
          subscription: markMeetScheduled(sub),
        },
      });
    }
  }

  function onDemoActivate(plan: SubscriptionPlan) {
    if (checkoutSelfUrl() || checkoutSetupUrl()) {
      setErr("Con Mercado Pago activo no se puede activar sin verificar el pago.");
      return;
    }
    applyActivation(plan);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold">Plan Estudio</p>
        <h1 className="mt-1 font-serif text-3xl text-forest">Elegí cómo querés arrancar</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Self-service a tu ritmo, o setup completo con meet por WhatsApp. Después de pagar, Mercado
          Pago te vuelve acá y Lía activa sola si el cobro quedó aprobado.
        </p>
      </div>

      {msg ? <p className="text-sm text-gold">{msg}</p> : null}
      {err ? <p className="text-sm text-danger">{err}</p> : null}

      {meetPending ? (
        <Card className="border-gold/40 bg-gold/5 p-6">
          <h2 className="font-serif text-2xl text-forest">Plan activo · coordinemos el setup</h2>
          <p className="mt-2 text-sm text-ink-soft">
            Pagaste Setup completo. Escribime por WhatsApp y agendamos el meet.
          </p>
          <Button variant="gold" className="mt-5 py-3" onClick={openMeet}>
            Abrir WhatsApp para coordinar
          </Button>
          <Link to="/" className="mt-3 block text-sm text-forest underline">
            Ir al escritorio
          </Link>
        </Card>
      ) : sub?.status === "active" ? (
        <Card className="p-6">
          <p className="font-serif text-xl text-forest">Ya tenés el plan activo.</p>
          <Link to="/">
            <Button className="mt-4">Ir a Hoy</Button>
          </Link>
        </Card>
      ) : (
        <>
          <Card className="border-gold/40 bg-gold/5 p-5">
            <p className="font-serif text-xl text-forest">Ya pagué — verificar</p>
            <p className="mt-2 text-sm text-ink-soft">
              Si no activó sola al volver, pegá el número de <strong>Operación</strong> de la
              pantalla verde de Mercado Pago.
            </p>
            <div className="mt-4">
              <Field label="Número de operación MP">
                <input
                  className={inputClass}
                  value={operationId}
                  onChange={(e) => setOperationId(e.target.value)}
                  placeholder="174755167318"
                  inputMode="numeric"
                />
              </Field>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="gold" disabled={busy} onClick={() => void confirmPaid()}>
                {busy ? "Verificando con Mercado Pago…" : "Verificar pago y activar"}
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => void tryAutoActivate({ plan: pendingPlan ?? "self" })}
              >
                Buscar cobro reciente
              </Button>
            </div>
          </Card>
          <CheckoutPlans producerName={state.producer.name} onActivate={onDemoActivate} />
        </>
      )}
    </div>
  );
}
