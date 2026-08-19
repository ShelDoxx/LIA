import { Link } from "react-router-dom";
import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { useLia } from "@/context/LiaContext";

export function OnboardingBanner() {
  const { state } = useLia();
  const [step, setStep] = useState(() => Number(localStorage.getItem("lia-onboard-step") || "0"));

  const demoClient = state.conversations[0]?.clientId;
  const empty = state.clients.length === 0;
  const botDisconnected = !state.bot.connected;

  const steps = botDisconnected
    ? [
        {
          title: "1. Configurá el Bot de WhatsApp",
          body: "Sin Bot conectado no salen mensajes reales. En Ajustes → Meta Cloud API pegá: Access Token, Phone Number ID, Verify Token y el secret del bot. Webhook: https://api.lia-estudio.com/webhook. Después tocá “Guardar y activar”.",
          cta: "Abrir Meta Cloud API",
          to: "/ajustes",
        },
        ...(empty
          ? [
              {
                title: "2. Importá cartera",
                body: "Estudio arranca vacío a propósito. Subí el CSV del portal en Marca.",
                cta: "Ir a Marca",
                to: "/ajustes",
              },
              {
                title: "3. Cargá un cliente",
                body: "O uno a mano en Clientes, con WhatsApp y DNI.",
                cta: "Clientes",
                to: "/clientes",
              },
              {
                title: "4. Mirá Hoy",
                body: "Cuando haya pólizas, la agenda te ordena mora y renovaciones.",
                cta: "Ir a Hoy",
                to: "/",
              },
            ]
          : [
              {
                title: "2. Mirá Hoy",
                body: "La agenda te ordena mora, renovaciones, retención y siniestros trabados.",
                cta: "Ir a Hoy",
                to: "/",
              },
              {
                title: "3. Probá WhatsApp",
                body: "Mandá 4 fotos como el cliente: Lía arma el PDF y lo deja en la ficha.",
                cta: "Abrir WhatsApp",
                to: demoClient ? `/whatsapp?cliente=${demoClient}` : "/whatsapp",
              },
              {
                title: "4. Importá cartera",
                body: "Subí el CSV del portal de la aseguradora en Marca y seguí produciendo.",
                cta: "Ir a Marca",
                to: "/ajustes",
              },
            ]),
      ]
    : empty
      ? [
          {
            title: "1. Importá cartera",
            body: "Estudio arranca vacío a propósito. Subí el CSV del portal en Marca.",
            cta: "Ir a Marca",
            to: "/ajustes",
          },
          {
            title: "2. Cargá un cliente",
            body: "O uno a mano en Clientes, con WhatsApp y DNI.",
            cta: "Clientes",
            to: "/clientes",
          },
          {
            title: "3. Mirá Hoy",
            body: "Cuando haya pólizas, la agenda te ordena mora y renovaciones.",
            cta: "Ir a Hoy",
            to: "/",
          },
        ]
      : [
          {
            title: "1. Mirá Hoy",
            body: "La agenda te ordena mora, renovaciones, retención y siniestros trabados.",
            cta: "Ir a Hoy",
            to: "/",
          },
          {
            title: "2. Probá WhatsApp",
            body: "Mandá 4 fotos como el cliente: Lía arma el PDF y lo deja en la ficha.",
            cta: "Abrir WhatsApp",
            to: demoClient ? `/whatsapp?cliente=${demoClient}` : "/whatsapp",
          },
          {
            title: "3. Importá cartera",
            body: "Subí el CSV del portal de la aseguradora en Marca y seguí produciendo.",
            cta: "Ir a Marca",
            to: "/ajustes",
          },
        ];

  if (step >= steps.length) return null;

  const current = steps[step];

  function advance() {
    const next = step + 1;
    localStorage.setItem("lia-onboard-step", String(next));
    setStep(next);
  }

  return (
    <Card className="border-gold/30 bg-gold/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold">Primeros pasos</p>
          <h3 className="mt-1 font-serif text-xl">{current.title}</h3>
          <p className="mt-2 max-w-lg text-sm text-ink-soft">{current.body}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={current.to}>
            <Button variant="gold" onClick={advance}>
              {current.cta}
            </Button>
          </Link>
          <Button variant="ghost" onClick={advance}>
            Saltear
          </Button>
        </div>
      </div>
      <p className="mt-3 text-xs text-ink-soft">
        Paso {step + 1} de {steps.length}
      </p>
    </Card>
  );
}
