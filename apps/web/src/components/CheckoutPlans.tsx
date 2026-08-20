import { useEffect, useState } from "react";
import { Button, Card } from "@/components/ui";
import {
  checkoutSelfUrl,
  checkoutSetupUrl,
  loadCheckoutConfigFromBot,
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
  const [ready, setReady] = useState(false);
  const [selfUrl, setSelfUrl] = useState(checkoutSelfUrl());
  const [setupUrl, setSetupUrl] = useState(checkoutSetupUrl());

  useEffect(() => {
    let cancelled = false;
    void loadCheckoutConfigFromBot().then((cfg) => {
      if (cancelled) return;
      setSelfUrl(cfg.selfUrl || checkoutSelfUrl());
      setSetupUrl(cfg.setupUrl || checkoutSetupUrl());
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const hasSelf = Boolean(selfUrl);
  const hasSetup = Boolean(setupUrl);
  const hasAny = hasSelf || hasSetup;

  function pick(plan: SubscriptionPlan) {
    const mode = startCheckout(plan, onActivate);
    if (mode === "unavailable") {
      window.alert(
        "El cobro no está configurado todavía. Escribinos por WhatsApp o pedí activación al admin.",
      );
      return;
    }
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
        <Button
          variant="ghost"
          className="mt-5 w-full py-3"
          disabled={!ready && !hasAny}
          onClick={() => pick("self")}
        >
          Elegir Self-service
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
        <Button
          variant="gold"
          className="mt-5 w-full py-3"
          disabled={!ready && !hasAny}
          onClick={() => pick("setup")}
        >
          Elegir Setup completo
        </Button>
      </Card>

      {!hasAny && ready && (
        <p className="text-xs text-ink-soft md:col-span-2">
          Links de cobro no disponibles. Contactá soporte o pedí activación manual al admin.
        </p>
      )}
    </div>
  );
}
