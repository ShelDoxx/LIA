import { Link } from "react-router-dom";
import { useState } from "react";
import { useLia } from "@/context/LiaContext";
import { Badge, Button, Card } from "@/components/ui";
import { daysUntil, fmtDate, fullName, money } from "@/lib/format";
import type { Client, Policy } from "@/lib/types";
import { POLICY_LABEL } from "@/lib/types";

type Row = { p: Policy; d: number; c: Client | undefined };

export function Cobranzas() {
  const { state, claimAllMora } = useLia();
  const [bulkBusy, setBulkBusy] = useState(false);
  const rows: Row[] = state.policies
    .filter((p) => p.status !== "cancelada")
    .map((p) => ({ p, d: daysUntil(p.nextDueDate), c: state.clients.find((x) => x.id === p.clientId) }))
    .filter((r) => Number.isFinite(r.d))
    .sort((a, b) => a.d - b.d);

  const mora = rows.filter((r) => r.d < 0);
  const week = rows.filter((r) => r.d >= 0 && r.d <= 7);
  const rest = rows.filter((r) => r.d > 7);
  const atRisk = [...mora, ...week].reduce((a, r) => a + r.p.installment, 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold">Cobranzas</p>
        <h2 className="font-serif text-3xl">La plata que todavía no entró</h2>
        <p className="mt-1 text-sm text-ink-soft">
          {mora.length} en mora · {week.length} esta semana · {money(atRisk)} en juego. Cobrar marca
          la cuota pagada. Reclamar escribe al cliente.
        </p>
        {mora.length > 0 && (
          <Button
            variant="gold"
            className="mt-3"
            disabled={bulkBusy}
            onClick={() => {
              setBulkBusy(true);
              void claimAllMora().finally(() => setBulkBusy(false));
            }}
          >
            {bulkBusy ? "Enviando…" : `Reclamar todas las moras (${mora.length})`}
          </Button>
        )}
      </div>
      <Group title="En mora — acá se pierde la cartera" rows={mora} danger />
      <Group title="Esta semana" rows={week} />
      <Group title="Calendario" rows={rest} />
    </div>
  );
}

function Group({ title, rows, danger }: { title: string; rows: Row[]; danger?: boolean }) {
  const { markPremiumPaid } = useLia();
  if (!rows.length) return null;
  return (
    <div className="space-y-2">
      <h3 className={`font-serif text-xl ${danger ? "text-gold" : ""}`}>{title}</h3>
      {rows.map(({ p, d, c }) => (
        <Card key={p.id} className="flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-[12rem] flex-1">
            <p className="font-medium">{c ? fullName(c) : "Cliente"}</p>
            <p className="text-sm text-ink-soft">
              {POLICY_LABEL[p.type]} · {p.company} · {p.paymentMethod}
            </p>
          </div>
          <p className="font-serif text-lg">{money(p.installment)}</p>
          <Badge tone={d < 0 ? "danger" : d <= 3 ? "warn" : "ink"}>
            {d < 0 ? `${Math.abs(d)} días de atraso` : d === 0 ? "Hoy" : fmtDate(p.nextDueDate)}
          </Badge>
          <Button variant="gold" onClick={() => void markPremiumPaid(p.id)}>
            Cobrar
          </Button>
          {d < 0 ? (
            <Link to={`/whatsapp?cliente=${p.clientId}&mora=${p.id}`}>
              <Button variant="ghost">Reclamar</Button>
            </Link>
          ) : d <= 7 ? (
            <Link to={`/whatsapp?cliente=${p.clientId}&aviso=${p.id}`}>
              <Button variant="ghost">Aviso de cuota</Button>
            </Link>
          ) : null}
          <Link to={`/clientes/${p.clientId}`} className="text-xs text-gold">
            Ver ficha
          </Link>
        </Card>
      ))}
    </div>
  );
}
