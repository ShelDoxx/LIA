import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useLia } from "@/context/LiaContext";
import { Button, Card } from "@/components/ui";
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
  const { state, save, refreshEntitlement, entitlement, entitlementStatus } = useLia();
  const [params] = useSearchParams();
  const sub = state.producer.subscription;
  const meetPending = sub?.status === "active" && sub.setupMeetPending;
  const [, setPendingPlan] = useState<SubscriptionPlan | null>(() => readPendingPlan());
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const autoTried = useRef(false);

  async function applyActivation(
    plan: SubscriptionPlan,
    setupMeetPending?: boolean,
    receipt?: { amount?: number; mpPaymentId?: string },
  ) {
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
    const bits = [
      plan === "setup" ? "Pago verificado. Plan Setup activo." : "Pago verificado. Plan Self activo.",
    ];
    if (receipt?.amount != null) bits.push(`${receipt.amount.toLocaleString("es-AR")} ARS`);
    if (receipt?.mpPaymentId) bits.push(`op. ${receipt.mpPaymentId}`);
    setMsg(bits.join(" · "));
    setErr("");
  }

  useEffect(() => {
    if (autoTried.current || sub?.status === "active") return;
    const planParam = params.get("plan");
    const plan: SubscriptionPlan | null =
      planParam === "setup" || planParam === "self" ? planParam : readPendingPlan();
    const op = extractMpReturnOperationId(params);
    if (!op) return;
    autoTried.current = true;
    void (async () => {
      setMsg("Verificando pago con Mercado Pago…");
      const byOp = await confirmMercadoPagoPayment(op, plan ?? "self");
      if (byOp.ok) {
        await applyActivation(byOp.plan ?? plan ?? "self", byOp.setupMeetPending);
      } else {
        setMsg("");
        setErr(byOp.error || "No se pudo verificar el retorno de Mercado Pago.");
      }
    })();
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
    void applyActivation(plan);
  }

  const showRenewalUrgency =
    entitlement?.renewalRequired &&
    entitlement.graceLabel &&
    (entitlementStatus === "active" || entitlementStatus === "expired");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold">Plan Estudio</p>
        <h1 className="mt-1 font-serif text-3xl text-forest">Elegí cómo querés arrancar</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Precios en dólares. El cobro es en pesos al tipo de cambio fijado. Pagás con tarjeta acá
          mismo; el plan se activa al instante.
        </p>
      </div>

      {msg ? <p className="text-sm text-gold">{msg}</p> : null}
      {err ? <p className="text-sm text-danger">{err}</p> : null}

      {entitlementStatus === "expired" ? (
        <Card className="border-danger/40 bg-red-50 p-5">
          <p className="font-serif text-xl text-forest">Membresía vencida</p>
          <p className="mt-2 text-sm text-ink-soft">
            El período terminó. Pagá de nuevo Self o Setup para reactivar el escritorio.
          </p>
        </Card>
      ) : showRenewalUrgency ? (
        <Card className="border-danger/40 bg-red-50 p-5">
          <p className="font-serif text-xl text-forest">Suscripción cancelada</p>
          <p className="mt-2 text-sm text-ink-soft">
            Seguis con acceso hasta el fin del período ya pago (
            <strong>{entitlement!.graceLabel}</strong>). Después hay que volver a activar.
          </p>
        </Card>
      ) : entitlement?.needsCardForMonthly && entitlementStatus === "active" ? (
        <Card className="border-gold/40 bg-gold/5 p-5">
          <p className="font-serif text-xl text-forest">Mes pago · cobro automático</p>
          <p className="mt-2 text-sm text-ink-soft">
            Tu pago ya está acreditado. Si Mercado Pago no pudo guardar la tarjeta (pasa con
            prepagas), cargá una crédito/débito en{" "}
            <Link to="/suscripcion" className="underline">
              Suscripción
            </Link>{" "}
            para el mes que viene. Si ya quedó enganchada, no tenés que hacer nada.
          </p>
        </Card>
      ) : null}

      {meetPending && !entitlement?.renewalRequired && entitlementStatus === "active" ? (
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
      ) : entitlementStatus === "active" &&
        !entitlement?.renewalRequired &&
        (sub?.status === "active" || Boolean(entitlement?.mpPaymentId)) ? (
        <Card className="p-6">
          <p className="font-serif text-xl text-forest">Ya tenés el plan activo.</p>
          <Link to="/">
            <Button className="mt-4">Ir a Hoy</Button>
          </Link>
        </Card>
      ) : (
        <CheckoutPlans
          producerName={state.producer.name}
          payerEmail={state.producer.email}
          onActivate={onDemoActivate}
          onPaid={(r) =>
            applyActivation(r.plan, r.setupMeetPending, {
              amount: r.amount,
              mpPaymentId: r.mpPaymentId,
            })
          }
        />
      )}
    </div>
  );
}
