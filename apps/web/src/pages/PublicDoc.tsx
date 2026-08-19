import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { LiaMark } from "@/components/LiaMark";
import { Badge, Card } from "@/components/ui";
import { useLia } from "@/context/LiaContext";
import { fmtDate, fullName, money } from "@/lib/format";
import { POLICY_LABEL, type PolicyType } from "@/lib/types";
import { botUrl } from "@/lib/botBase";

type PublicPolicy = {
  id: string;
  clientName: string;
  type: string;
  number: string;
  company: string;
  nextDueDate: string;
  endDate: string;
  installment: number;
};

export function PublicDoc() {
  const { policyId, kind } = useParams<{ policyId: string; kind: string }>();
  const { state } = useLia();
  const [policy, setPolicy] = useState<PublicPolicy | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!policyId) return;
    const local = state.policies.find((p) => p.id === policyId);
    if (local) {
      const c = state.clients.find((x) => x.id === local.clientId);
      setPolicy({
        id: local.id,
        clientName: c ? fullName(c) : "Asegurado",
        type: local.type,
        number: local.number,
        company: local.company,
        nextDueDate: local.nextDueDate,
        endDate: local.endDate,
        installment: local.installment,
      });
      setError(false);
      return;
    }
    void fetch(botUrl(`/public/policy/${policyId}`))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("404"))))
      .then((b: { policy: PublicPolicy }) => {
        setPolicy(b.policy);
        setError(false);
      })
      .catch(() => setError(true));
  }, [policyId, state.policies, state.clients]);

  const isCupon = kind === "cupon";

  return (
    <div className="min-h-screen bg-paper px-4 py-10">
      <div className="mx-auto max-w-lg space-y-6">
        <LiaMark className="text-3xl text-forest" />
        {error && (
          <Card className="p-6">
            <p className="font-serif text-xl">Documento no disponible</p>
            <p className="mt-2 text-sm text-ink-soft">
              Pedile el cupón o la póliza a tu productor. Este link funciona cuando el estudio tiene
              Lía activo.
            </p>
          </Card>
        )}
        {policy && (
          <Card className="p-6">
            <Badge tone={isCupon ? "gold" : "forest"}>{isCupon ? "Cupón de pago" : "Póliza"}</Badge>
            <h1 className="mt-3 font-serif text-2xl">{policy.clientName}</h1>
            <p className="mt-1 text-sm text-ink-soft">
              {POLICY_LABEL[policy.type as PolicyType] ?? policy.type} · {policy.company}
            </p>
            <dl className="mt-6 space-y-3 text-sm">
              <div className="flex justify-between border-b border-line pb-2">
                <dt className="text-ink-soft">Nº póliza</dt>
                <dd className="font-medium">{policy.number}</dd>
              </div>
              {isCupon ? (
                <>
                  <div className="flex justify-between border-b border-line pb-2">
                    <dt className="text-ink-soft">Cuota</dt>
                    <dd className="font-serif text-lg">{money(policy.installment)}</dd>
                  </div>
                  <div className="flex justify-between border-b border-line pb-2">
                    <dt className="text-ink-soft">Vencimiento</dt>
                    <dd>{fmtDate(policy.nextDueDate)}</dd>
                  </div>
                </>
              ) : (
                <div className="flex justify-between border-b border-line pb-2">
                  <dt className="text-ink-soft">Vigencia hasta</dt>
                  <dd>{fmtDate(policy.endDate)}</dd>
                </div>
              )}
            </dl>
            <p className="mt-6 rounded-md bg-paper-2 p-3 text-xs text-ink-soft">
              {isCupon
                ? "Pagá por Rapipago, Pago Fácil, CBU o el canal que te indicó tu productor."
                : "Para el frente de póliza completo, escribile a tu productor por WhatsApp."}
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
