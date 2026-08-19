import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { CommissionRow, LiaState } from "@/lib/types";

/** Agrega comisión producida del mes desde pólizas activas, conservando cobros y facturas. */
export function recalcCommissionsFromPolicies(state: LiaState): CommissionRow[] {
  const period = format(new Date(), "MMM yyyy", { locale: es });
  const byCompany = new Map<string, number>();

  for (const p of state.policies.filter((x) => x.status !== "cancelada")) {
    const slice = p.premium * p.commissionRate;
    byCompany.set(p.company, (byCompany.get(p.company) ?? 0) + slice);
  }

  const prev = new Map(state.commissions.map((r) => [r.company, r]));

  return [...byCompany.entries()]
    .map(([company, producedRaw]) => {
      const produced = Math.round(producedRaw);
      const old = prev.get(company);
      const received = old?.received ?? 0;
      const pending = Math.max(0, produced - received);
      return {
        id: old?.id ?? crypto.randomUUID(),
        company,
        period: old?.period ?? period,
        produced,
        received,
        pending,
        invoiceStatus:
          old?.invoiceStatus ?? (pending > 0 ? ("pendiente" as const) : ("cobrada" as const)),
        invoiceRef: old?.invoiceRef,
      };
    })
    .sort((a, b) => b.pending - a.pending);
}

/** Número correlativo para seguimiento interno (no es factura AFIP). */
export function nextInvoiceRef(rows: CommissionRow[]): string {
  const nums = rows
    .map((r) => r.invoiceRef?.match(/(\d+)$/)?.[1])
    .filter((x): x is string => Boolean(x))
    .map(Number);
  const n = (nums.length ? Math.max(...nums) : 500) + 1;
  return `INT-${String(n).padStart(4, "0")}`;
}

export function emitCommissionInvoice(rows: CommissionRow[], id: string): CommissionRow[] {
  const ref = nextInvoiceRef(rows);
  return rows.map((x) =>
    x.id === id ? { ...x, invoiceStatus: "emitida" as const, invoiceRef: ref } : x,
  );
}
