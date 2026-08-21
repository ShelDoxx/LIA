import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CardPayment } from "@mercadopago/sdk-react";
import { Button, Card } from "@/components/ui";
import {
  attachMonthlyCard,
  cancelMembership,
  fetchMembership,
  type MembershipInfo,
} from "@/lib/membership";
import { loadCheckoutConfigFromBot, type BrickAmounts } from "@/lib/billing";
import { warmMercadoPago } from "@/lib/mpWarmup";
import { useLia } from "@/context/LiaContext";

export function MembershipPanel() {
  const { refreshEntitlement, entitlement } = useLia();
  const [info, setInfo] = useState<MembershipInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publicKey, setPublicKey] = useState("");
  const [amounts, setAmounts] = useState<BrickAmounts | null>(null);

  async function reload() {
    setLoading(true);
    const r = await fetchMembership();
    setLoading(false);
    if (r.ok) setInfo(r.subscription ?? null);
    else setErr(r.error || "Error");
  }

  useEffect(() => {
    void reload();
    void loadCheckoutConfigFromBot().then((cfg) => {
      setPublicKey(cfg.publicKey);
      setAmounts(cfg.amounts);
      if (cfg.publicKey) warmMercadoPago(cfg.publicKey);
    });
  }, []);

  async function onCancel() {
    const ok = window.confirm(
      "¿Cancelar la suscripción? Mercado Pago deja de cobrar el mes siguiente. Seguis con acceso hasta fin del período ya pago.",
    );
    if (!ok) return;
    setBusy(true);
    setErr("");
    setMsg("");
    const r = await cancelMembership();
    setBusy(false);
    if (!r.ok) {
      setErr(r.error || "No se pudo cancelar");
      return;
    }
    setMsg(r.message || "Suscripción cancelada.");
    await refreshEntitlement();
    await reload();
  }

  if (loading) {
    return (
      <Card className="space-y-2 p-6">
        <h2 className="font-serif text-2xl">Membresía</h2>
        <p className="text-sm text-ink-soft">Cargando…</p>
      </Card>
    );
  }

  const needsCard =
    Boolean(info?.needsCardForMonthly || entitlement?.needsCardForMonthly) &&
    !info?.mpPreapprovalId;
  const hasSub = Boolean(info?.mpPreapprovalId);

  return (
    <Card className="space-y-4 p-6">
      <h2 className="font-serif text-2xl">Membresía</h2>
      <p className="text-sm text-ink-soft">
        La tarjeta vive en Mercado Pago (no en Lía). El cobro mensual lo hace MP; acá ves el estado y
        podés cancelar.
      </p>

      {info ? (
        <ul className="space-y-1 text-sm text-ink-soft">
          <li>
            Estado: <strong className="text-forest">{info.status}</strong>
            {info.plan ? ` · plan ${info.plan}` : ""}
          </li>
          {info.cardLastFour ? (
            <li>
              Tarjeta: •••• <strong className="text-forest">{info.cardLastFour}</strong>
            </li>
          ) : null}
          {info.mpStatus ? (
            <li>
              Suscripción MP: <strong className="text-forest">{info.mpStatus}</strong>
            </li>
          ) : null}
          {info.amountArs != null ? (
            <li>Cobro mensual: {info.amountArs.toLocaleString("es-AR")} ARS</li>
          ) : null}
          {info.nextPaymentDate ? (
            <li>Próximo cobro: {new Date(info.nextPaymentDate).toLocaleDateString("es-AR")}</li>
          ) : null}
          {info.lastChargeAmount != null ? (
            <li>
              Último cobro:{" "}
              <strong className="text-forest">
                {info.lastChargeAmount.toLocaleString("es-AR")} ARS
              </strong>
              {info.lastChargeStatus ? ` · ${info.lastChargeStatus}` : ""}
            </li>
          ) : info.status === "active" && !info.mpPaymentId ? (
            <li className="text-danger">
              Sin cobro acreditado en Lía (revisá antes de confiar en el acceso).
            </li>
          ) : null}
          {info.mpPaymentId ? (
            <li>
              Operación MP: <strong className="text-forest">{info.mpPaymentId}</strong>
            </li>
          ) : null}
          {info.renewalRequired && info.graceLabel ? (
            <li className="text-danger">
              Suscripción cancelada · acceso hasta {info.graceLabel}
            </li>
          ) : null}
          {info.needsCardForMonthly && !info.mpPreapprovalId ? (
            <li className="text-forest">
              Mes ya pago · falta enganchar tarjeta para que el próximo mes se cobre solo.
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="text-sm text-ink-soft">
          Sin membresía activa.{" "}
          <Link to="/activar" className="underline">
            Activar plan
          </Link>
        </p>
      )}

      {msg ? <p className="text-sm text-gold">{msg}</p> : null}
      {err ? <p className="text-sm text-danger">{err}</p> : null}

      <div className="flex flex-wrap gap-2">
        {hasSub && info?.canCancel ? (
          <Button variant="ghost" disabled={busy} onClick={() => void onCancel()}>
            {busy ? "Cancelando…" : "Cancelar suscripción"}
          </Button>
        ) : null}
        {(needsCard || info?.needsCardForMonthly) && !showAttach ? (
          <Button variant="gold" onClick={() => setShowAttach(true)}>
            Guardar tarjeta (sin cobrar)
          </Button>
        ) : null}
        <Link to="/activar" className="inline-flex items-center text-sm text-forest underline">
          Ir a planes
        </Link>
      </div>

      {showAttach && publicKey && amounts ? (
        <div className="space-y-3 rounded-xl border border-gold/40 bg-gold/5 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gold">Sin cobro ahora</p>
          <p className="font-serif text-xl text-forest">Solo guardamos la tarjeta</p>
          <p className="text-sm text-ink-soft">
            No se debita nada hoy. El próximo cobro automático será de{" "}
            <strong>
              {amounts.arsSelf.toLocaleString("es-AR")} ARS
            </strong>{" "}
            (USD {amounts.usdSelf}/mes) cuando venza el período ya pago.
          </p>
          {saving ? (
            <p className="text-sm text-ink-soft">Guardando en Mercado Pago…</p>
          ) : null}
          <CardPayment
            initialization={{ amount: amounts.arsSelf }}
            customization={{
              visual: {
                style: { theme: "default" },
                texts: {
                  formTitle: "Tarjeta para renovación",
                  formSubmit: "Guardar tarjeta · sin cobrar",
                  installmentsSectionTitle: "Cuotas",
                  selectInstallments: "1",
                },
              } as Record<string, unknown>,
            }}
            onSubmit={async (formData) => {
              setErr("");
              setSaving(true);
              try {
                const r = await attachMonthlyCard(formData);
                if (!r.ok) {
                  setErr(r.error || "No se pudo guardar la tarjeta");
                  throw new Error(r.error || "fail");
                }
                setMsg(
                  r.cardLastFour
                    ? `Listo. Tarjeta •••• ${r.cardLastFour} guardada. No hubo cobro ahora; el próximo mes se debita solo.`
                    : "Listo. Tarjeta guardada para el cobro automático. No hubo cobro ahora.",
                );
                setShowAttach(false);
                await refreshEntitlement();
                await reload();
              } finally {
                setSaving(false);
              }
            }}
            onError={() => setErr("Error en el formulario de tarjeta")}
          />
          <Button variant="ghost" className="w-full" onClick={() => setShowAttach(false)}>
            Cancelar
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
