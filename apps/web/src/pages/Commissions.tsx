import { Link } from "react-router-dom";
import { AlertTriangle, Wallet } from "lucide-react";
import { useLia } from "@/context/LiaContext";
import { Badge, Button, Card } from "@/components/ui";
import { daysUntil, money } from "@/lib/format";
import { emitCommissionInvoice } from "@/lib/commissions";

export function Commissions() {
  const { state, save, recalcCommissions } = useLia();
  const produced = (state.commissions ?? []).reduce((a, r) => a + r.produced, 0);
  const received = (state.commissions ?? []).reduce((a, r) => a + r.received, 0);
  const pending = (state.commissions ?? []).reduce((a, r) => a + r.pending, 0);
  const toInvoice = (state.commissions ?? []).filter((r) => r.invoiceStatus === "pendiente");
  const toInvoiceAmount = toInvoice.reduce((a, r) => a + r.pending, 0);
  const overdue = state.policies.filter(
    (p) => p.status !== "cancelada" && Number.isFinite(daysUntil(p.nextDueDate)) && daysUntil(p.nextDueDate) < 0,
  );
  const moraRisk = overdue.reduce((a, p) => a + p.installment, 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold">Caja</p>
        <h2 className="font-serif text-3xl">Tu plata y la del cliente, por separado</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Comisión es lo que te debe la compañía. Mora es la cuota que todavía no pagó el asegurado.
        </p>
        <Button variant="ghost" className="mt-3 text-sm" onClick={() => void recalcCommissions()}>
          Recalcular comisiones desde cartera
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold">Tu ganancia</p>
            <Wallet className="shrink-0 text-gold" size={28} />
          </div>
          <h3 className="mt-4 font-serif text-2xl">Comisiones Pendientes a Facturar</h3>
          <p className="mt-3 font-serif text-4xl text-gold md:text-5xl">{money(toInvoiceAmount)}</p>
          <p className="mt-3 text-sm text-ink-soft">
            {toInvoice.length} compañía{toInvoice.length === 1 ? "" : "s"} sin factura emitida. Esto no es
            la cuota del cliente.
          </p>
        </Card>
        <Card className="border-warn/40 bg-amber-50/40 p-6">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-warn">Deuda del cliente</p>
            <AlertTriangle className="shrink-0 text-warn" size={28} />
          </div>
          <h3 className="mt-4 font-serif text-2xl">Riesgo de Mora</h3>
          <p className="mt-3 font-serif text-4xl md:text-5xl">{money(moraRisk)}</p>
          <p className="mt-3 text-sm text-ink-soft">
            {overdue.length} cuota{overdue.length === 1 ? "" : "s"} vencida
            {overdue.length === 1 ? "" : "s"}. Esto es lo que debe el cliente, no tu comisión.
          </p>
          <Link to="/cobranzas" className="mt-4 inline-block text-sm text-gold">
            Ir a cobranzas →
          </Link>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs uppercase text-ink-soft">Producido</p>
          <p className="font-serif text-3xl">{money(produced)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase text-ink-soft">Cobrado</p>
          <p className="font-serif text-3xl">{money(received)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase text-ink-soft">Comisión por cobrar</p>
          <p className="font-serif text-3xl">{money(pending)}</p>
        </Card>
      </div>

      <Card className="overflow-hidden p-0">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper-2 text-xs uppercase text-ink-soft">
            <tr>
              <th className="px-4 py-3">Aseguradora</th>
              <th className="px-4 py-3">Período</th>
              <th className="px-4 py-3">Producido</th>
              <th className="px-4 py-3">Cobrado</th>
              <th className="px-4 py-3">Pendiente</th>
              <th className="px-4 py-3">Factura</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {state.commissions.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="px-4 py-3 font-medium">{r.company}</td>
                <td className="px-4 py-3">{r.period}</td>
                <td className="px-4 py-3">{money(r.produced)}</td>
                <td className="px-4 py-3">{money(r.received)}</td>
                <td className="px-4 py-3">{money(r.pending)}</td>
                <td className="px-4 py-3">
                  <Badge
                    tone={r.invoiceStatus === "cobrada" ? "forest" : r.invoiceStatus === "emitida" ? "gold" : "warn"}
                  >
                    {r.invoiceStatus === "pendiente"
                      ? "Hay que emitir"
                      : r.invoiceStatus === "emitida"
                        ? r.invoiceRef
                        : "Cobrada"}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  {r.invoiceStatus === "pendiente" && (
                    <Button
                      variant="ghost"
                      className="text-xs"
                      onClick={() =>
                        save({
                          ...state,
                          commissions: emitCommissionInvoice(state.commissions, r.id),
                        })
                      }
                    >
                      Marcar emitida
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {toInvoice.length > 0 && (
        <p className="text-sm text-ink-soft">
          {toInvoice.length} nota{toInvoice.length > 1 ? "s" : ""} interna
          {toInvoice.length > 1 ? "s" : ""} pendiente{toInvoice.length > 1 ? "s" : ""} (seguimiento de
          comisión, no factura AFIP).
        </p>
      )}
    </div>
  );
}
