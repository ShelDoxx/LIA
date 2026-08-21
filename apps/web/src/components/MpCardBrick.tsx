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
  onSuccess: (result: { plan: SubscriptionPlan; setupMeetPending?: boolean }) => void;
  onCancel: () => void;
};

export function MpCardBrick({ plan, publicKey, amounts, payerEmail, onSuccess, onCancel }: Props) {
  const [sdkReady, setSdkReady] = useState(false);
  const [brickReady, setBrickReady] = useState(false);
  const [err, setErr] = useState("");
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
          <strong>
            {amount.toLocaleString("es-AR")} ARS
          </strong>
          {amounts.testMode ? " · monto de prueba" : null}
          {plan === "setup" && !amounts.testMode
            ? ` (después USD ${amounts.usdSelf}/mes = ${amounts.arsSelf.toLocaleString("es-AR")} ARS)`
            : plan === "setup" && amounts.testMode
              ? ` (después ${amounts.arsSelf.toLocaleString("es-AR")} ARS/mes)`
              : " · suscripción mensual"}
          {!amounts.testMode ? `. TC ${amounts.fxArs.toLocaleString("es-AR")}.` : "."}
        </p>
      </div>

      {err ? <p className="text-sm text-danger">{err}</p> : null}
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
            const result = await processBrickCardPayment(plan, formData);
            if (!result.ok) {
              setErr(result.error || "No se pudo procesar el pago");
              throw new Error(result.error || "payment_failed");
            }
            onSuccess({
              plan: result.plan ?? plan,
              setupMeetPending: result.setupMeetPending,
            });
          }}
          onError={(error) => {
            console.error("[mp brick]", error);
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
