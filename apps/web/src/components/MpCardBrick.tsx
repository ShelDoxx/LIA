import { useEffect, useState } from "react";
import { initMercadoPago, CardPayment } from "@mercadopago/sdk-react";
import type { SubscriptionPlan } from "@/lib/billing";
import { processBrickCardPayment, type BrickAmounts } from "@/lib/billing";
import { warmMercadoPago } from "@/lib/mpWarmup";
import { Button } from "@/components/ui";

type Props = {
  plan: SubscriptionPlan;
  publicKey: string;
  amounts: BrickAmounts;
  payerEmail?: string;
  onSuccess: (result: {
    plan: SubscriptionPlan;
    setupMeetPending?: boolean;
    amount?: number;
    mpPaymentId?: string;
  }) => void;
  onCancel: () => void;
};

type Phase = "form" | "charging" | "ok" | "error";

export function MpCardBrick({ plan, publicKey, amounts, payerEmail, onSuccess, onCancel }: Props) {
  const [sdkReady, setSdkReady] = useState(false);
  const [brickReady, setBrickReady] = useState(false);
  const [phase, setPhase] = useState<Phase>("form");
  const [err, setErr] = useState("");
  const [receipt, setReceipt] = useState<{ amount?: number; mpPaymentId?: string }>({});
  const amount = plan === "setup" ? amounts.arsSetup : amounts.arsSelf;

  useEffect(() => {
    if (!publicKey) return;
    warmMercadoPago(publicKey);
    initMercadoPago(publicKey, { locale: "es-AR" });
    setSdkReady(true);
  }, [publicKey]);

  if (!sdkReady || !publicKey) {
    return <p className="text-sm text-ink-soft">Preparando Mercado Pago…</p>;
  }

  if (phase === "ok") {
    return (
      <div className="space-y-4 rounded-xl border border-gold/40 bg-gold/5 p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-gold">Pago aprobado</p>
        <p className="font-serif text-2xl text-forest">Listo — cobro acreditado</p>
        <ul className="space-y-1 text-sm text-ink-soft">
          {receipt.amount != null ? (
            <li>
              Monto: <strong className="text-forest">{receipt.amount.toLocaleString("es-AR")} ARS</strong>
            </li>
          ) : null}
          {receipt.mpPaymentId ? (
            <li>
              Operación MP: <strong className="text-forest">{receipt.mpPaymentId}</strong>
            </li>
          ) : null}
          <li>Plan {plan === "setup" ? "Setup" : "Self"} activado.</li>
        </ul>
      </div>
    );
  }

  if (phase === "charging") {
    return (
      <div className="space-y-3 rounded-xl border border-line bg-cream/40 p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-gold">Cobrando</p>
        <p className="font-serif text-xl text-forest">Procesando con Mercado Pago…</p>
        <p className="text-sm text-ink-soft">
          A veces MP revisa el cobro unos segundos. No cierres esta ventana ni vuelvas a pagar.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-cream/40 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-gold">
          {plan === "setup" ? "Setup completo" : "Self-service"}
        </p>
        <p className="mt-1 font-serif text-xl text-forest">
          {plan === "setup"
            ? `USD ${amounts.usdSetup} · 1er mes`
            : `USD ${amounts.usdSelf} / mes`}
        </p>
        <p className="mt-1 text-sm text-ink-soft">
          Se cobra en pesos:{" "}
          <strong>{amount.toLocaleString("es-AR")} ARS</strong>
          {amounts.testMode ? " · monto de prueba" : null}
          {plan === "setup" && !amounts.testMode
            ? ` (después USD ${amounts.usdSelf}/mes = ${amounts.arsSelf.toLocaleString("es-AR")} ARS)`
            : plan === "setup" && amounts.testMode
              ? ` (después ${amounts.arsSelf.toLocaleString("es-AR")} ARS/mes)`
              : " · suscripción mensual"}
          {!amounts.testMode ? `. TC ${amounts.fxArs.toLocaleString("es-AR")}.` : "."}
        </p>
      </div>

      {phase === "error" || err ? (
        <div className="rounded-xl border border-danger/40 bg-red-50 p-4">
          <p className="text-sm font-medium text-danger">Pago no acreditado</p>
          <p className="mt-1 text-sm text-ink-soft">{err || "Reintentá o usá otra tarjeta."}</p>
        </div>
      ) : null}
      {!brickReady ? (
        <p className="text-sm text-ink-soft">Cargando formulario de tarjeta…</p>
      ) : null}

      <div className={brickReady ? undefined : "min-h-[280px] opacity-60"}>
        <CardPayment
          initialization={{
            amount,
            payer: payerEmail ? { email: payerEmail } : undefined,
          }}
          customization={{
            visual: { style: { theme: "default" } },
          }}
          onReady={() => setBrickReady(true)}
          onSubmit={async (formData) => {
            setErr("");
            setPhase("charging");
            const result = await processBrickCardPayment(plan, formData);
            if (!result.ok) {
              setPhase("error");
              setErr(result.error || "No se pudo procesar el pago");
              throw new Error(result.error || "payment_failed");
            }
            setReceipt({ amount: result.amount, mpPaymentId: result.mpPaymentId });
            setPhase("ok");
            onSuccess({
              plan: result.plan ?? plan,
              setupMeetPending: result.setupMeetPending,
              amount: result.amount,
              mpPaymentId: result.mpPaymentId,
            });
          }}
          onError={(error) => {
            console.error("[mp brick]", error);
            setPhase("error");
            setErr("Hubo un problema con el formulario de tarjeta.");
            setBrickReady(true);
          }}
        />
      </div>

      <Button variant="ghost" className="w-full" onClick={onCancel}>
        Volver a los planes
      </Button>
    </div>
  );
}
