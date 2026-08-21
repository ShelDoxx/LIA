import { Link } from "react-router-dom";
import { useLia } from "@/context/LiaContext";
import { CsvImporter } from "@/components/CsvImporter";
import { MetaWizard } from "@/components/MetaWizard";
import { Badge, Button, Card, Field, inputClass } from "@/components/ui";
import { ALL_RAMOS, POLICY_LABEL, type LiaState } from "@/lib/types";
import { useState } from "react";

function isLiaBackup(value: unknown): value is LiaState {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.clients) && Array.isArray(v.policies);
}

function downloadBackup(state: LiaState) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lia-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function Settings() {
  const { state, save, updateBot, restoreState, isAdmin, refreshEntitlement } = useLia();
  const p = state.producer;
  const [backupMsg, setBackupMsg] = useState("");
  const [graceMsg, setGraceMsg] = useState("");

  async function onSimulateGrace() {
    setGraceMsg("");
    const { simulateRenewalGrace } = await import("@/lib/renewalGrace");
    const r = await simulateRenewalGrace(3);
    if (!r.ok) {
      setGraceMsg(r.error || "Falló la simulación");
      return;
    }
    await refreshEntitlement();
    setGraceMsg(
      `Gracia activa: ${r.entitlement?.graceLabel ?? "3 minutos"}. Vas a ver el aviso rojo; al vencer te manda a Activar.`,
    );
  }

  async function onRestoreFile(file: File | undefined) {
    if (!file) return;
    setBackupMsg("");
    const ok = window.confirm(
      "Esto reemplaza los datos actuales (cartera, pólizas, WhatsApp, marca) por el JSON que subís. ¿Seguís?",
    );
    if (!ok) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isLiaBackup(parsed)) {
        setBackupMsg("Ese JSON no es un respaldo de Lía: faltan clients o policies.");
        return;
      }
      await restoreState(parsed);
      setBackupMsg("Respaldo restaurado. La cartera ya está en este dispositivo.");
    } catch {
      setBackupMsg("No pude leer el archivo. ¿Es un JSON de Lía?");
    }
  }

  async function onLogo(file: File | undefined) {
    if (!file) return;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("No pude leer el logo"));
      reader.readAsDataURL(file);
    });
    await updateBot({ studioLogo: dataUrl });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {p.plan === "estudio" ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-gold/30 bg-gold/5 p-5">
          <div>
            <p className="font-serif text-lg text-forest">Suscripción Plan Estudio</p>
            <p className="mt-1 text-sm text-ink-soft">Estado, próximo cobro y renovación automática.</p>
          </div>
          <Link to="/suscripcion">
            <Button variant="gold">Ver suscripción</Button>
          </Link>
        </Card>
      ) : null}
      <Card className="space-y-4 p-6">
        <h2 className="font-serif text-2xl">El estudio</h2>
        <Field label="Nombre del productor">
          <input
            className={inputClass}
            value={p.name}
            onChange={(e) => save({ ...state, producer: { ...p, name: e.target.value } })}
          />
        </Field>
        <Field label="Marca del estudio">
          <input
            className={inputClass}
            value={p.studioName}
            onChange={(e) => save({ ...state, producer: { ...p, studioName: e.target.value } })}
          />
        </Field>
        <Field label="Logo del estudio">
          <div className="flex flex-wrap items-center gap-4">
            <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-md border border-line bg-white">
              {state.bot.studioLogo ? (
                <img src={state.bot.studioLogo} alt="Logo del estudio" className="h-full w-full object-contain" />
              ) : (
                <span className="px-2 text-center text-[10px] text-ink-soft">Sin logo</span>
              )}
            </div>
            <div className="space-y-2">
              <label className="inline-flex cursor-pointer items-center rounded-md border border-line px-3 py-2 text-sm hover:bg-paper-2">
                Subir logo
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    void onLogo(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              {state.bot.studioLogo ? (
                <Button variant="ghost" className="text-xs" onClick={() => updateBot({ studioLogo: undefined })}>
                  Quitar
                </Button>
              ) : null}
              <p className="text-xs text-ink-soft">PNG o JPG. Se ve en el header y en la carátula del expediente.</p>
            </div>
          </div>
        </Field>
        <Field label="Matrícula SSN">
          <input
            className={inputClass}
            value={p.matricula}
            onChange={(e) => save({ ...state, producer: { ...p, matricula: e.target.value } })}
          />
        </Field>
        <Field label="Plan">
          <p className="rounded-md border border-line bg-paper-2 px-3 py-2 text-sm">
            {p.plan === "demo" ? "Demo (datos de muestra)" : "Estudio"}
            {p.subscription?.status === "active"
              ? ` · activo${p.subscription.plan ? ` (${p.subscription.plan})` : ""}`
              : p.plan === "estudio"
                ? " · pendiente de activación"
                : ""}
          </p>
          {p.plan === "estudio" && p.subscription?.status !== "active" ? (
            <Link to="/activar" className="mt-1 inline-block text-sm text-gold underline">
              Activar plan
            </Link>
          ) : null}
          {isAdmin ? (
            <div className="mt-3 space-y-2">
              <Button variant="ghost" className="text-xs" onClick={() => void onSimulateGrace()}>
                Probar aviso de renovación (3 min)
              </Button>
              {graceMsg ? <p className="text-xs text-ink-soft">{graceMsg}</p> : null}
            </div>
          ) : null}
        </Field>
        <Field label="WhatsApp del estudio">
          <input
            className={inputClass}
            value={p.phone}
            onChange={(e) => save({ ...state, producer: { ...p, phone: e.target.value } })}
          />
        </Field>
      </Card>

      <Card className="space-y-4 p-6">
        <h2 className="font-serif text-2xl">Ramos que operás</h2>
        <p className="text-sm text-ink-soft">
          No todos los estudios son auto. Si desmarcás un ramo, Lía no lo ofrece, el radar no lo
          empuja y Asistencias no lo muestra.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ALL_RAMOS.map((id) => {
            const on = (p.activeRamos ?? []).includes(id);
            return (
              <label key={id} className="flex items-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => {
                    const cur = p.activeRamos ?? [];
                    const next = on ? cur.filter((x) => x !== id) : [...cur, id];
                    if (!next.length) return;
                    save({ ...state, producer: { ...p, activeRamos: next } });
                  }}
                />
                {POLICY_LABEL[id]}
              </label>
            );
          })}
        </div>
      </Card>

      <Card className="space-y-4 p-6">
        <h2 className="font-serif text-2xl">La voz de Lía</h2>
        <p className="text-sm text-ink-soft">
          El cliente tiene que sentir que le escribe el estudio, no un bot. Ese es el cierre de la
          renovación.
        </p>
        <Field label="Saludo / menú">
          <textarea
            className={`${inputClass} min-h-24`}
            value={p.liaGreeting}
            onChange={(e) => save({ ...state, producer: { ...p, liaGreeting: e.target.value } })}
          />
        </Field>
        <Field label="Firma">
          <input
            className={inputClass}
            value={p.liaSignOff}
            onChange={(e) => save({ ...state, producer: { ...p, liaSignOff: e.target.value } })}
          />
        </Field>
      </Card>

      <Card className="space-y-3 p-6">
        <h2 className="font-serif text-2xl">Cartera y SSN</h2>
        <p className="text-sm text-ink-soft">
          Subí el CSV del portal de la aseguradora y Lía arma clientes y pólizas. Exportá con el
          mismo formato de la plantilla.
        </p>
        <CsvImporter compact />
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm">Datos de la cartera</p>
          <Badge tone="forest">En este dispositivo</Badge>
        </div>
        <p className="text-xs text-ink-soft">
          La cartera vive en IndexedDB de este navegador. Usá el respaldo JSON abajo para no
          perderla si borrás datos del sitio.
        </p>
      </Card>

      <Card className="space-y-4 p-6">
        <MetaWizard />
      </Card>

      <Card className="space-y-4 p-6">
        <h2 className="font-serif text-2xl">Copia de Seguridad Local</h2>
        <p className="text-sm text-ink-soft">
          El JSON es tu seguro si borrás el navegador. Restaurar pisa todo lo que hay ahora en este
          celular o PC.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => downloadBackup(state)}>Descargar Respaldo</Button>
          <label className="inline-flex cursor-pointer items-center rounded-md border border-line px-4 py-2 text-sm font-medium hover:bg-paper-2">
            Restaurar Respaldo
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                void onRestoreFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        {backupMsg ? <p className="text-sm text-ink-soft">{backupMsg}</p> : null}
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="bg-forest-deep p-6 text-paper">
          <p className="text-xs uppercase tracking-wide text-gold">Cómo se cobra a un colega</p>
          <p className="mt-2 font-serif text-3xl">Self USD 49 · Setup USD 149</p>
          <p className="mt-2 text-sm text-paper/70">
            Self-service a tu ritmo, o setup completo (1er mes incluido) con meet por WhatsApp.
          </p>
          <ul className="mt-4 space-y-1 text-sm text-paper/80">
            <li>PDF único para SMG LIFE y el resto: DNI + tarjeta en un archivo</li>
            <li>Renovaciones 90-60-30 y cobranzas en mora</li>
            <li>Radar: vida al cónyuge, silencio, cotizaciones</li>
            <li>WhatsApp con tu marca + bóveda</li>
          </ul>
          {p.plan === "estudio" && p.subscription?.status !== "active" ? (
            <Link to="/activar">
              <Button variant="gold" className="mt-5">
                Ver planes y activar
              </Button>
            </Link>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
