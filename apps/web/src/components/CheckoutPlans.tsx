import { Button, Card } from "@/components/ui";
import {
  checkoutSelfUrl,
  checkoutSetupUrl,
  setupMeetWhatsAppUrl,
  startCheckout,
  type SubscriptionPlan,
} from "@/lib/billing";

type Props = {
  producerName?: string;
  onActivate: (plan: SubscriptionPlan) => void;
  compact?: boolean;
};

export function CheckoutPlans({ producerName, onActivate, compact }: Props) {
  const hasSelf = Boolean(checkoutSelfUrl());
  const hasSetup = Boolean(checkoutSetupUrl());
  const hasAny = hasSelf || hasSetup;

  function pick(plan: SubscriptionPlan) {
    const mode = startCheckout(plan, onActivate);
    if (mode === "demo" && plan === "setup") {
      window.open(setupMeetWhatsAppUrl(producerName), "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div className={compact ? "grid gap-3" : "grid gap-4 md:grid-cols-2"}>
      <Card className="border-line p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-gold">Self-service</p>
        <h3 className="mt-1 font-serif text-2xl text-forest">USD 49 / mes</h3>
        <p className="mt-2 text-sm text-ink-soft">
          Activás solo. Configurás Meta, cartera y WhatsApp con el instructivo de la app.
        </p>
        <ul className="mt-3 space-y-1 text-sm text-ink-soft">
          <li>· Acceso completo Plan Estudio</li>
          <li>· Onboarding guiado en pantalla</li>
          <li>· Sin reunión con nosotros</li>
        </ul>
        <Button variant="ghost" className="mt-5 w-full py-3" onClick={() => pick("self")}>
          {hasSelf || !hasAny ? "Elegir Self-service" : "Configurá el link MP (self)"}
        </Button>
      </Card>

      <Card className="border-gold/40 bg-gold/5 p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-gold">Setup completo</p>
        <h3 className="mt-1 font-serif text-2xl text-forest">USD 149 · 1er mes</h3>
        <p className="mt-1 text-sm text-ink-soft">Después USD 49 / mes</p>
        <p className="mt-2 text-sm text-ink-soft">
          Te configuramos el estudio con vos. Al pagar, coordinamos el meet por WhatsApp.
        </p>
        <ul className="mt-3 space-y-1 text-sm text-ink-soft">
          <li>· Primer mes incluido en los 149</li>
          <li>· Meta + WhatsApp + cartera juntos</li>
          <li>· Meet de setup por WhatsApp</li>
        </ul>
        <Button variant="gold" className="mt-5 w-full py-3" onClick={() => pick("setup")}>
          {hasSetup || !hasAny ? "Elegir Setup completo" : "Configurá el link MP (setup)"}
        </Button>
      </Card>

      {!hasAny && (
        <p className="text-xs text-ink-soft md:col-span-2">
          Sin links de Mercado Pago en env, se activa en este dispositivo (modo demo). En producción
          pegá <code>VITE_MP_CHECKOUT_SELF_URL</code> y <code>VITE_MP_CHECKOUT_SETUP_URL</code>.
        </p>
      )}
    </div>
  );
}
