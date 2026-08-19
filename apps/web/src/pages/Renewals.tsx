import { Link } from "react-router-dom";
import { useLia } from "@/context/LiaContext";
import { Badge, Button, Card } from "@/components/ui";
import { daysUntil, fmtDate, fullName, money } from "@/lib/format";
import { renewalBucket } from "@/lib/renewals";
import { POLICY_LABEL } from "@/lib/types";
const BUCKETS = [
  { key: "90", label: "90 días — diagnóstico", min: 61, max: 90 },
  { key: "60", label: "60 días — propuesta", min: 31, max: 60 },
  { key: "30", label: "30 días — cierre", min: 8, max: 30 },
  { key: "7", label: "7 días — no se cae", min: 0, max: 7 },
  { key: "out", label: "Vencidas / hoy", min: -999, max: -1 },
] as const;

export function Renewals() {
  const { state, renewPolicy } = useLia();
  const rows = state.policies
    .filter((p) => p.status !== "cancelada")
    .map((p) => ({ p, d: daysUntil(p.endDate), c: state.clients.find((x) => x.id === p.clientId) }))
    .filter((r) => Number.isFinite(r.d));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold">Retención</p>
        <h2 className="font-serif text-3xl">Que no se te caiga una renovación</h2>
        <p className="mt-1 max-w-xl text-sm text-ink-soft">
          Un PAS pierde más plata por renovaciones olvidadas que por negocios que no cerró. Método
          90-60-30: Lía avisa, vos aparecés en el cierre.
        </p>
      </div>
      {rows.every((r) => !renewalBucket(r.d)) ? (
        <Card className="p-6 text-center text-sm text-ink-soft">
          No hay pólizas en ventana de renovación (90-60-30-7). Cuando se acerquen, Lía las sube a Hoy.
        </Card>
      ) : null}
      {BUCKETS.map((b) => {
        const items = rows.filter((r) => r.d >= b.min && r.d <= b.max);
        if (!items.length) return null;
        return (
          <div key={b.key} className="space-y-2">
            <h3 className="font-serif text-xl">{b.label}</h3>
            {items.map(({ p, d, c }) => (
              <Card key={p.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-[12rem] flex-1">
                  <p className="font-medium">{c ? fullName(c) : "Cliente"}</p>
                  <p className="text-sm text-ink-soft">
                    {POLICY_LABEL[p.type]} · {p.company} · vence {fmtDate(p.endDate)}
                  </p>
                </div>
                <p className="text-sm">{money(p.premium)} / año</p>
                <Badge tone={d < 0 ? "danger" : d <= 7 ? "gold" : "ink"}>
                  {d < 0 ? "Vencida" : `${d} días`}
                </Badge>
                <Link to={`/clientes/${p.clientId}`}>
                  <Button variant="ghost">Ficha</Button>
                </Link>
                <Button variant="ghost" onClick={() => void renewPolicy(p.id)}>
                  Registrar renovación
                </Button>
                {(() => {
                  const bucket = renewalBucket(d);
                  if (!bucket) return null;
                  return (
                    <Link to={`/whatsapp?cliente=${p.clientId}&renovacion=${p.id}&bucket=${bucket}`}>
                      <Button variant="gold" className="h-8 px-3 text-xs">
                        Mandar WhatsApp
                      </Button>
                    </Link>
                  );
                })()}
              </Card>
            ))}
          </div>
        );
      })}
    </div>
  );
}
