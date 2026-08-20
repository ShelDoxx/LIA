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
    sessionStorage.removeItem("lia_checkout_at");
  } catch {
    /* ignore */
  }
}

export function Activar() {
  const { state, save, refreshEntitlement } = useLia();
  const [params] = useSearchParams();
  const sub = state.producer.subscription;
  const meetPending = sub?.status === "active" && sub.setupMeetPending;
  const [pendingPlan, setPendingPlan] = useState<SubscriptionPlan | null>(() => readPendingPlan());
  const [operationId, setOperationId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const autoTried = useRef(false);

  async function applyActivation(plan: SubscriptionPlan, setupMeetPending?: boolean) {
    clearPendingPlan();
    setPendingPlan(null);
    await save({
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
    await refreshEntitlement();
    setMsg(plan === "setup" ? "Pago verificado. Plan activo — coordiná el meet." : "Pago verificado. Plan Self activo.");
    setErr("");
  }

  async function tryAutoActivate(opts?: { op?: string; plan?: SubscriptionPlan | null }) {
    if (sub?.status === "active") return true;
    const plan = opts?.plan ?? pendingPlan ?? readPendingPlan() ?? "self";
    const op = (opts?.op || operationId).trim();
    if (!op) {
      setErr("Pegá el número de operación de Mercado Pago (un pago = una sola cuenta).");
      return false;
    }
    setBusy(true);
    setErr("");
    setMsg("Verificando pago con Mercado Pago…");
    const byOp = await confirmMercadoPagoPayment(op, plan);
    setBusy(false);
    if (byOp.ok) {
      applyActivation(byOp.plan ?? plan, byOp.setupMeetPending);
      return true;
    }
    setMsg("");
    setErr(byOp.error || "No se pudo verificar ese número de operación.");
    return false;
  }

  async function confirmPaid() {
    await tryAutoActivate({ op: operationId, plan: pendingPlan ?? "self" });
  }

  // Solo auto si MP devolvió un id de operación en la URL
  useEffect(() => {
    if (autoTried.current || sub?.status === "active") return;
    const planParam = params.get("plan");
    const plan: SubscriptionPlan | null =
      planParam === "setup" || planParam === "self" ? planParam : readPendingPlan();
    const op = extractMpReturnOperationId(params);
    if (op) setOperationId(op);
    if (!op) return;
    autoTried.current = true;
    void tryAutoActivate({ op, plan });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onFocus() {
      setPendingPlan(readPendingPlan());
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
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
          Self-service o setup completo. Un pago de Mercado Pago activa una sola cuenta: pegá el
          número de operación para verificar.
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
              Pegá el número de <strong>Operación</strong> de la pantalla verde. Ese número solo
              puede activar <strong>una</strong> cuenta.
            </p>
            <div className="mt-4">
              <Field label="Número de operación MP">
                <input
                  className={inputClass}
                  value={operationId}
                  onChange={(e) => setOperationId(e.target.value)}
                  placeholder="174778901606"
                  inputMode="numeric"
                />
              </Field>
            </div>
            <div className="mt-4">
              <Button variant="gold" disabled={busy} onClick={() => void confirmPaid()}>
                {busy ? "Verificando con Mercado Pago…" : "Verificar pago y activar"}
              </Button>
            </div>
          </Card>
          <CheckoutPlans producerName={state.producer.name} onActivate={onDemoActivate} />
        </>
      )}
    </div>
  );
}
