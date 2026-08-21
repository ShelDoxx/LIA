import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CreditCard } from "lucide-react";
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

function statusLabel(info: MembershipInfo | null, entitlementStatus: string | null) {
  if (!info && entitlementStatus !== "active") return "Sin plan activo";
  if (info?.renewalRequired) return "Cancelada · acceso hasta fin de período";
  if (info?.mpStatus === "authorized" || info?.mpStatus === "active") return "Activa";
  if (info?.status === "active") return "Activa";
  if (info?.status === "expired") return "Vencida";
  return info?.status || "—";
}

function planLabel(plan?: "self" | "setup") {
  if (plan === "setup") return "Setup completo";
  if (plan === "self") return "Self-service";
  return "Plan Estudio";
}

export function Subscription() {
  const { refreshEntitlement, entitlement, entitlementStatus } = useLia();
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
    else setErr(r.error || "No se pudo cargar la suscripción");
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
      "¿Cancelar la renovación automática? Mercado Pago no vuelve a cobrar. Seguis con acceso hasta el fin del período ya pago.",
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
    setMsg(r.message || "Renovación automática cancelada.");
    await refreshEntitlement();
    await reload();
  }

  const needsFallbackCard =
    Boolean(info?.needsCardForMonthly || entitlement?.needsCardForMonthly) &&
    !info?.mpPreapprovalId;
  const hasAutoRenew = Boolean(info?.mpPreapprovalId) && info?.canCancel;
  const periodEnd = info?.periodEndsAt || info?.nextPaymentDate;

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="font-serif text-xl text-ink-soft">Cargando suscripción…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold">Cuenta</p>
        <h1 className="mt-1 flex items-center gap-2 font-serif text-3xl text-forest">
          <CreditCard className="h-7 w-7 text-gold" aria-hidden />
          Suscripción
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          Estado del Plan Estudio, próximo cobro y tarjeta en Mercado Pago. Lía no guarda los datos
          de tu tarjeta.
        </p>
      </div>

      {msg ? <p className="text-sm text-gold">{msg}</p> : null}
      {err ? <p className="text-sm text-danger">{err}</p> : null}

      <Card className="overflow-hidden p-0">
        <div className="border-b border-line bg-cream/50 px-6 py-5">
          <p className="text-xs font-medium uppercase tracking-wide text-gold">
            {planLabel(info?.plan ?? entitlement?.plan)}
          </p>
          <p className="mt-1 font-serif text-2xl text-forest">
            {statusLabel(info, entitlementStatus)}
          </p>
          {info?.amountArs != null ? (
            <p className="mt-1 text-sm text-ink-soft">
              {info.amountArs.toLocaleString("es-AR")} ARS / mes
              {amounts && !amounts.testMode ? ` · USD ${amounts.usdSelf}` : null}
            </p>
          ) : amounts ? (
            <p className="mt-1 text-sm text-ink-soft">
              USD {amounts.usdSelf}/mes · {amounts.arsSelf.toLocaleString("es-AR")} ARS
            </p>
          ) : null}
        </div>

        <dl className="grid gap-4 px-6 py-5 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-soft">Próximo cobro</dt>
            <dd className="mt-1 text-sm text-forest">
              {info?.nextPaymentDate
                ? new Date(info.nextPaymentDate).toLocaleDateString("es-AR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                : periodEnd
                  ? new Date(periodEnd).toLocaleDateString("es-AR", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })
                  : hasAutoRenew
                    ? "Según Mercado Pago"
                    : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-soft">Tarjeta</dt>
            <dd className="mt-1 text-sm text-forest">
              {info?.cardLastFour ? `•••• ${info.cardLastFour}` : "Gestionada por Mercado Pago"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-soft">Último cobro</dt>
            <dd className="mt-1 text-sm text-forest">
              {info?.lastChargeAmount != null
                ? `${info.lastChargeAmount.toLocaleString("es-AR")} ARS${
                    info.lastChargeStatus ? ` · ${info.lastChargeStatus}` : ""
                  }`
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-soft">Operación MP</dt>
            <dd className="mt-1 break-all font-mono text-xs text-forest">
              {info?.mpPaymentId || "—"}
            </dd>
          </div>
          {info?.mpStatus ? (
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-soft">Estado en MP</dt>
              <dd className="mt-1 text-sm text-forest">{info.mpStatus}</dd>
            </div>
          ) : null}
          {info?.renewalRequired && info.graceLabel ? (
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-danger">Acceso restante</dt>
              <dd className="mt-1 text-sm text-danger">{info.graceLabel}</dd>
            </div>
          ) : null}
        </dl>

        <div className="flex flex-wrap gap-2 border-t border-line px-6 py-4">
          {hasAutoRenew ? (
            <Button variant="ghost" disabled={busy} onClick={() => void onCancel()}>
              {busy ? "Cancelando…" : "Cancelar renovación automática"}
            </Button>
          ) : null}
          {entitlementStatus !== "active" ? (
            <Link to="/activar">
              <Button variant="gold">Activar plan</Button>
            </Link>
          ) : null}
          <Link to="/activar" className="inline-flex items-center text-sm text-forest underline">
            Ver planes
          </Link>
        </div>
      </Card>

      {hasAutoRenew ? (
        <p className="text-sm text-ink-soft">
          La tarjeta quedó vinculada al pagar. Cada mes Mercado Pago debita solo; no tenés que
          volver a cargar nada.
        </p>
      ) : null}

      {needsFallbackCard ? (
        <Card className="space-y-3 border-gold/40 bg-gold/5 p-5">
          <p className="font-serif text-xl text-forest">Renovación automática pendiente</p>
          <p className="text-sm text-ink-soft">
            Tu mes ya está pago. Mercado Pago no pudo dejar la tarjeta para el cobro del mes que
            viene (pasa a menudo con prepagas). Si querés renovación automática, cargá una
            crédito/débito — <strong>sin cobro ahora</strong>.
          </p>
          {!showAttach ? (
            <Button variant="gold" onClick={() => setShowAttach(true)}>
              Vincular tarjeta para el próximo mes
            </Button>
          ) : publicKey && amounts ? (
            <div className="space-y-3 rounded-xl border border-line bg-paper p-4">
              <p className="text-sm text-ink-soft">
                No se debita hoy. Próximo cobro programado:{" "}
                {amounts.arsSelf.toLocaleString("es-AR")} ARS.
              </p>
              {saving ? <p className="text-sm text-ink-soft">Guardando…</p> : null}
              <CardPayment
                initialization={{ amount: amounts.arsSelf }}
                customization={{
                  visual: {
                    style: { theme: "default" },
                    texts: {
                      formSubmit: "Vincular · sin cobrar",
                    },
                  } as Record<string, unknown>,
                }}
                onSubmit={async (formData) => {
                  setErr("");
                  setSaving(true);
                  try {
                    const r = await attachMonthlyCard(formData);
                    if (!r.ok) {
                      setErr(r.error || "No se pudo vincular");
                      throw new Error(r.error || "fail");
                    }
                    setMsg(
                      r.cardLastFour
                        ? `Tarjeta •••• ${r.cardLastFour} vinculada. Sin cobro ahora.`
                        : "Tarjeta vinculada. Sin cobro ahora.",
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
      ) : null}
    </div>
  );
}
