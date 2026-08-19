import { useState } from "react";
import { Button, Field, inputClass } from "@/components/ui";
import { ALL_RAMOS, POLICY_LABEL, type Policy, type PolicyType } from "@/lib/types";

type Props = {
  clients: Array<{ id: string; firstName: string; lastName: string }>;
  defaultClientId?: string;
  initial?: Policy;
  onSave: (p: Policy) => void;
  onCancel: () => void;
};

function isoDate(value: string) {
  if (!value) return new Date().toISOString();
  return new Date(`${value}T12:00:00`).toISOString();
}

function dateInput(iso: string) {
  try {
    return iso.slice(0, 10);
  } catch {
    return "";
  }
}

export function PolicyForm({ clients, defaultClientId, initial, onSave, onCancel }: Props) {
  const [clientId, setClientId] = useState(initial?.clientId ?? defaultClientId ?? clients[0]?.id ?? "");
  const [type, setType] = useState<PolicyType>(initial?.type ?? "auto");
  const [company, setCompany] = useState(initial?.company ?? "");
  const [number, setNumber] = useState(initial?.number ?? "");
  const [coverage, setCoverage] = useState(initial?.coverage ?? "");
  const [plate, setPlate] = useState(initial?.plate ?? "");
  const [premium, setPremium] = useState(String(initial?.premium ?? ""));
  const [installment, setInstallment] = useState(String(initial?.installment ?? ""));
  const [commissionRate, setCommissionRate] = useState(String((initial?.commissionRate ?? 0.15) * 100));
  const [endDate, setEndDate] = useState(dateInput(initial?.endDate ?? ""));
  const [nextDueDate, setNextDueDate] = useState(dateInput(initial?.nextDueDate ?? ""));
  const [paymentMethod, setPaymentMethod] = useState(initial?.paymentMethod ?? "CBU");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId || !company.trim() || !number.trim()) return;
    const prem = Number(premium) || 0;
    const inst = Number(installment) || Math.round(prem / 12);
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      clientId,
      company: company.trim(),
      type,
      number: number.trim(),
      status: initial?.status ?? "activa",
      startDate: initial?.startDate ?? new Date().toISOString(),
      endDate: isoDate(endDate),
      premium: prem,
      installment: inst,
      nextDueDate: isoDate(nextDueDate || endDate),
      paymentMethod,
      commissionRate: Math.max(0, Number(commissionRate) || 15) / 100,
      coverage: coverage.trim() || POLICY_LABEL[type],
      plate: plate.trim() || undefined,
      updatedAt: new Date().toISOString(),
    });
  }

  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
      {!defaultClientId && (
        <Field label="Cliente">
          <select className={inputClass} value={clientId} onChange={(e) => setClientId(e.target.value)} required>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.firstName} {c.lastName}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Ramo">
        <select className={inputClass} value={type} onChange={(e) => setType(e.target.value as PolicyType)}>
          {ALL_RAMOS.map((r) => (
            <option key={r} value={r}>
              {POLICY_LABEL[r]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Compañía">
        <input className={inputClass} value={company} onChange={(e) => setCompany(e.target.value)} required />
      </Field>
      <Field label="Nº póliza">
        <input className={inputClass} value={number} onChange={(e) => setNumber(e.target.value)} required />
      </Field>
      <Field label="Patente / bien">
        <input className={inputClass} value={plate} onChange={(e) => setPlate(e.target.value)} />
      </Field>
      <Field label="Cobertura">
        <input className={inputClass} value={coverage} onChange={(e) => setCoverage(e.target.value)} />
      </Field>
      <Field label="Prima anual">
        <input className={inputClass} type="number" value={premium} onChange={(e) => setPremium(e.target.value)} />
      </Field>
      <Field label="Cuota">
        <input className={inputClass} type="number" value={installment} onChange={(e) => setInstallment(e.target.value)} />
      </Field>
      <Field label="Comisión %">
        <input className={inputClass} type="number" value={commissionRate} onChange={(e) => setCommissionRate(e.target.value)} />
      </Field>
      <Field label="Vigencia hasta">
        <input className={inputClass} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
      </Field>
      <Field label="Próximo cobro (cuota)">
        <input className={inputClass} type="date" value={nextDueDate} onChange={(e) => setNextDueDate(e.target.value)} />
      </Field>
      <Field label="Medio de pago">
        <select className={inputClass} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
          <option>CBU</option>
          <option>Tarjeta</option>
          <option>Rapipago</option>
          <option>Efectivo</option>
        </select>
      </Field>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit">{initial ? "Guardar" : "Cargar póliza"}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
