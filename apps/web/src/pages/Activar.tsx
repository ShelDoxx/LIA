import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useLia } from "@/context/LiaContext";
import { Button, Card } from "@/components/ui";
import { CheckoutPlans } from "@/components/CheckoutPlans";
import {
  activateSubscription,
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
  const [msg, setMsg] = useState("");

  function onActivate(plan: SubscriptionPlan) {
    clearPendingPlan();
    setPendingPlan(null);
    void save({
      ...state,
      producer: {
        ...state.producer,
        plan: "estudio",
        subscription: activateSubscription(
          sub ?? { status: "expired", startedAt: new Date().toISOString() },
          { plan, setupMeetPending: plan === "setup" },
        ),
      },
    });
    setMsg(plan === "setup" ? "Plan activo. Coordiná el meet." : "Plan Self activo.");
  }

  // Vuelta desde Mercado Pago: ?paid=1&plan=self|setup
  useEffect(() => {
    const paid = params.get("paid") === "1" || params.get("status") === "approved";
    const planParam = params.get("plan");
    const plan: SubscriptionPlan | null =
      planParam === "setup" || planParam === "self" ? planParam : readPendingPlan();
    if (!paid || !plan) return;
    if (sub?.status === "active") return;
    onActivate(plan);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Si eligió un plan y vuelve del tab de MP, ofrecer confirmar
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

      {meetPending ? (
        <Card className="border-gold/40 bg-gold/5 p-6">
          <h2 className="font-serif text-2xl text-forest">Plan activo · coordinemos el setup</h2>
          <p className="mt-2 text-sm text-ink-soft">
            Pagaste Setup completo. Escribime por WhatsApp y agendamos el meet para dejar Meta,
            WhatsApp y cartera listos.
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
          {pendingPlan ? (
            <Card className="border-gold/40 bg-gold/5 p-5">
              <p className="font-serif text-xl text-forest">¿Ya pagaste en Mercado Pago?</p>
              <p className="mt-2 text-sm text-ink-soft">
                Si el pago figura aprobado, activá el plan acá. Elegiste{" "}
                <strong>{pendingPlan === "setup" ? "Setup completo" : "Self-service"}</strong>.
              </p>
              <Button variant="gold" className="mt-4 py-3" onClick={() => onActivate(pendingPlan)}>
                Ya pagué — activar plan
              </Button>
            </Card>
          ) : (
            <Card className="border-line p-5">
              <p className="font-medium text-forest">¿Ya pagaste y seguís bloqueado?</p>
              <p className="mt-1 text-sm text-ink-soft">
                Mercado Pago aprobó el pago pero a veces el aviso no llega. Activá acá según lo que
                pagaste.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="ghost" onClick={() => onActivate("self")}>
                  Activar Self (49)
                </Button>
                <Button variant="gold" onClick={() => onActivate("setup")}>
                  Activar Setup (149)
                </Button>
              </div>
            </Card>
          )}
          <CheckoutPlans producerName={state.producer.name} onActivate={onActivate} />
        </>
      )}
    </div>
  );
}
