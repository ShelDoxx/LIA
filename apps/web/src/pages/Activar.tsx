import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useLia } from "@/context/LiaContext";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { CheckoutPlans } from "@/components/CheckoutPlans";
import {
  activateSubscription,
  checkoutSelfUrl,
  checkoutSetupUrl,
  confirmMercadoPagoPayment,
  markMeetScheduled,
  setupMeetWhatsAppUrl,
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

  async function confirmPaid(planHint?: SubscriptionPlan) {
    const id = operationId.trim();
    if (!id) {
      setErr("Pegá el número de operación de Mercado Pago (pantalla de éxito).");
      return;
    }
    setBusy(true);
    setErr("");
    setMsg("");
    const plan = planHint ?? pendingPlan ?? "self";
    const result = await confirmMercadoPagoPayment(id, plan);
    setBusy(false);
    if (!result.ok) {
      setErr(result.error || "No se pudo verificar el pago");
      return;
    }
    applyActivation(result.plan ?? plan, result.setupMeetPending);
  }

  // Si vuelve con ?paid=1&op=ID — verificar automático
  useEffect(() => {
    const paid = params.get("paid") === "1" || params.get("status") === "approved";
    const op = params.get("op") || params.get("operation") || "";
    const planParam = params.get("plan");
    const plan: SubscriptionPlan | null =
      planParam === "setup" || planParam === "self" ? planParam : readPendingPlan();
    if (op) setOperationId(op);
    if (!paid || !op || sub?.status === "active") return;
    void (async () => {
      setBusy(true);
      const result = await confirmMercadoPagoPayment(op, plan ?? "self");
      setBusy(false);
      if (result.ok) applyActivation(result.plan ?? plan ?? "self", result.setupMeetPending);
      else setErr(result.error || "No se pudo verificar");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onFocus() {
      setPendingPlan(readPendingPlan());
    }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

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

  // Solo demo local si no hay links MP (nunca en prod con checkout real)
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
          Self-service a tu ritmo, o setup completo con meet por WhatsApp.
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
              En la pantalla verde de Mercado Pago aparece <strong>Operación</strong> (ej.{" "}
              174755167318). Pegalo acá: Lía consulta a MP y solo activa si el pago es real.
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
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => void confirmPaid("self")}
              >
                {busy ? "Verificando…" : "Verificar Self (49)"}
              </Button>
              <Button
                variant="gold"
                disabled={busy}
                onClick={() => void confirmPaid("setup")}
              >
                {busy ? "Verificando…" : "Verificar Setup (149)"}
              </Button>
            </div>
            {pendingPlan ? (
              <p className="mt-3 text-xs text-ink-soft">
                Habías elegido: {pendingPlan === "setup" ? "Setup completo" : "Self-service"}.
              </p>
            ) : null}
          </Card>
          <CheckoutPlans producerName={state.producer.name} onActivate={onDemoActivate} />
        </>
      )}
    </div>
  );
}
