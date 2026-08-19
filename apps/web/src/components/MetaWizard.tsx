import { useState } from "react";
import { useLia } from "@/context/LiaContext";
import { Badge, Button, Field, inputClass } from "@/components/ui";
import { fetchBotHealth } from "@/lib/botApi";
import {
  getLiaSecret,
  pushMetaConfigToBot,
  saveLiaSecret,
  sendTestWhatsApp,
} from "@/lib/outbound";

const WEBHOOK_URL = "http://localhost:8787/webhook";

export function MetaWizard() {
  const { state, updateBot } = useLia();
  const b = state.bot;
  const [msg, setMsg] = useState("");
  const [testPhone, setTestPhone] = useState(state.producer.phone.replace(/\D/g, "") || "54911");
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState(getLiaSecret());
  const [tokenWarning, setTokenWarning] = useState<string | null>(null);

  const webhookHint = WEBHOOK_URL;

  async function saveMeta() {
    setBusy(true);
    setMsg("");
    await updateBot({
      metaAccessToken: b.metaAccessToken,
      metaPhoneNumberId: b.metaPhoneNumberId,
      metaVerifyToken: b.metaVerifyToken,
    });
    const ok = await pushMetaConfigToBot(b);
    const health = await fetchBotHealth();
    await updateBot({ connected: health.ok });
    setMsg(
      ok
        ? health.whatsapp
          ? "Credenciales guardadas · WhatsApp Meta en línea."
          : "Credenciales en el bot. Sin token válido aún — probá el mensaje de test (modo demo loguea en consola del bot)."
        : "No pude contactar al bot. ¿Corre npm run dev:bot?",
    );
    setBusy(false);
  }

  async function testConnection() {
    setBusy(true);
    setMsg("");
    const health = await fetchBotHealth();
    await updateBot({ connected: health.ok });
    setTokenWarning(health.tokenWarning ?? null);
    setMsg(
      health.ok
        ? `Bot OK · ${health.contextClients ?? 0} clientes${health.whatsapp ? " · Meta live" : " · demo log"}`
        : "Bot apagado en localhost:8787.",
    );
    setBusy(false);
  }

  async function testMessage() {
    setBusy(true);
    setMsg("");
    const result = await sendTestWhatsApp(testPhone);
    setMsg(
      result.ok
        ? "Plantilla enviada. Buscá en WhatsApp un chat de +1 555 202 4071 (número de prueba de Meta)."
        : result.error || "Falló el envío. Revisá token, Phone Number ID y que el bot esté corriendo.",
    );
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-2xl">Meta Cloud API</h2>
        <Badge tone={state.bot.connected ? "forest" : "danger"}>
          {state.bot.connected ? "Bot en línea" : "Bot apagado"}
        </Badge>
      </div>
      <p className="text-sm text-ink-soft">
        WhatsApp real ya envía y recibe si el bot está en línea y Meta está verificado. Guardá token y
        Phone Number ID, tildá envío real, y usá ngrok para el webhook.
      </p>
      <p className="text-sm text-ink-soft">
        Cuando tengas token y Phone Number ID, pegálos acá. El bot los usa para enviar mora, cuotas
        y renovaciones al celular del cliente.
      </p>

      <Field
        label="Access Token"
        hint={
          <span>
            Usá un{" "}
            <a
              href="https://business.facebook.com/settings/system-users"
              target="_blank"
              rel="noreferrer"
              className="underline text-forest"
            >
              System User Token
            </a>{" "}
            — no vence nunca. Los tokens de prueba duran 1 hora.
          </span>
        }
      >
        <input
          className={inputClass}
          type="password"
          autoComplete="off"
          placeholder="EAAxxxx…"
          value={b.metaAccessToken ?? ""}
          onChange={(e) => void updateBot({ metaAccessToken: e.target.value })}
        />
      </Field>
      <Field label="Phone Number ID">
        <input
          className={inputClass}
          placeholder="105678901234567"
          value={b.metaPhoneNumberId ?? ""}
          onChange={(e) => void updateBot({ metaPhoneNumberId: e.target.value })}
        />
      </Field>
      <Field label="Verify Token (webhook)">
        <input
          className={inputClass}
          placeholder="lia-verify"
          value={b.metaVerifyToken ?? ""}
          onChange={(e) => void updateBot({ metaVerifyToken: e.target.value })}
        />
      </Field>

      <div className="rounded-md bg-paper-2 p-3 text-xs text-ink-soft">
        <p className="font-medium text-forest">URL del webhook en Meta</p>
        <p className="mt-1 break-all font-mono">{webhookHint}</p>
        <p className="mt-2">
          En local usá ngrok (<code className="text-[10px]">ngrok http 8787</code>) y pegá la URL pública
          acá. Verify token = el mismo de arriba. Suscripción: messages.
        </p>
      </div>

      <label className="flex items-center justify-between text-sm">
        Enviar WhatsApp real (mora, cuota, renovación)
        <input
          type="checkbox"
          checked={b.whatsappOutbound !== false}
          onChange={(e) => void updateBot({ whatsappOutbound: e.target.checked })}
        />
      </label>

      <label className="flex items-center justify-between text-sm">
        Aviso de cuota (días antes)
        <input
          type="number"
          min={1}
          max={14}
          className="w-16 rounded-md border border-line px-2 py-1 text-center"
          value={b.paymentReminderDays}
          onChange={(e) =>
            void updateBot({ paymentReminderDays: Math.max(1, Number(e.target.value) || 3) })
          }
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => void saveMeta()}>
          Guardar y activar
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => void testConnection()}>
          Probar bot
        </Button>
      </div>

      <p className="text-xs text-ink-soft">
        Si Meta te pone un <strong>15</strong> al agregar el celular, dejalo: es el formato de su lista de
        prueba. En Lía usá <code>549…</code> (con 9, sin 15); el bot reintenta solo.
      </p>
      <Field label="Teléfono de prueba (549…)">
        <div className="flex gap-2">
          <input
            className={inputClass}
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
          />
          <Button variant="gold" disabled={busy} onClick={() => void testMessage()}>
            Enviar test
          </Button>
        </div>
      </Field>

      {tokenWarning ? (
        <div className="rounded-md bg-danger/10 border border-danger/30 px-3 py-2 text-sm text-danger flex gap-2 items-start">
          <span className="mt-0.5">⚠</span>
          <span>{tokenWarning}</span>
        </div>
      ) : null}

      {msg ? <p className="text-sm text-ink-soft">{msg}</p> : null}

      <div className="border-t border-line pt-4 space-y-2">
        <p className="text-xs font-medium text-ink-soft uppercase tracking-wide">Seguridad (avanzado)</p>
        <Field label="Secret bot↔web (X-Lia-Secret)">
          <div className="flex gap-2">
            <input
              className={inputClass}
              type="password"
              autoComplete="off"
              placeholder="Copiá el secret de la consola del bot"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
            <Button
              variant="ghost"
              onClick={() => {
                saveLiaSecret(secret);
                setMsg("Secret guardado.");
              }}
            >
              Guardar
            </Button>
          </div>
        </Field>
        <p className="text-xs text-ink-soft">
          Al arrancar el bot sin <code>LIA_BOT_SECRET</code> en env, imprime el secret en la consola.
          Copialo acá para que la app web pueda hablar con el bot de forma segura.
        </p>
      </div>
    </div>
  );
}
