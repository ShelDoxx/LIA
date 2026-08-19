import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLia } from "@/context/LiaContext";
import { PolicyForm } from "@/components/PolicyForm";
import { Badge, Button, Card, inputClass } from "@/components/ui";
import { daysUntil, fmtDate, fullName, money } from "@/lib/format";
import { POLICY_LABEL, type Policy } from "@/lib/types";

export function Policies() {
  const { state, addPolicy, updatePolicy } = useLia();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Policy | null>(null);
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const s = q.toLowerCase().trim();
    return state.policies.filter((p) => {
      if (!s) return true;
      const c = state.clients.find((x) => x.id === p.clientId);
      const hay = `${c?.firstName ?? ""} ${c?.lastName ?? ""} ${p.company} ${p.number} ${POLICY_LABEL[p.type]} ${p.plate ?? ""}`.toLowerCase();
      return hay.includes(s);
    });
  }, [q, state.policies, state.clients]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {state.policies.length > 0 && (
          <input
            className={`${inputClass} w-56`}
            placeholder="Filtrar póliza, cliente, cia"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        )}
        <Button
          disabled={state.clients.length === 0}
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          Nueva póliza
        </Button>
      </div>

      {open && (
        <Card className="p-5">
          <PolicyForm
            clients={state.clients}
            initial={editing ?? undefined}
            onCancel={() => {
              setOpen(false);
              setEditing(null);
            }}
            onSave={(p) => {
              if (editing) void updatePolicy(p);
              else void addPolicy(p);
              setOpen(false);
              setEditing(null);
            }}
          />
        </Card>
      )}

      {state.policies.length === 0 && !open ? (
        <div className="rounded-2xl border border-line bg-white/70 p-8 text-center">
          <p className="font-serif text-2xl">Todavía no hay pólizas</p>
          <p className="mt-2 text-sm text-ink-soft">
            Cargá una acá, importá CSV en Marca, o ganá una cotización.
          </p>
          {state.clients.length === 0 ? (
            <Link to="/clientes" className="mt-4 inline-block">
              <Button>Primero un cliente</Button>
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-white/70">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper-2 text-xs uppercase tracking-wide text-ink-soft">
              <tr>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Ramo</th>
                <th className="px-4 py-3">Compañía</th>
                <th className="px-4 py-3">Nº</th>
                <th className="px-4 py-3">Cuota</th>
                <th className="px-4 py-3">Próximo cobro</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-ink-soft" colSpan={8}>
                    Nada coincide con “{q}”.
                  </td>
                </tr>
              ) : (
                rows.map((p) => {
                  const c = state.clients.find((x) => x.id === p.clientId);
                  const d = daysUntil(p.nextDueDate);
                  return (
                    <tr key={p.id} className="border-t border-line">
                      <td className="px-4 py-3">
                        <Link to={`/clientes/${p.clientId}`} className="font-medium hover:text-forest">
                          {c ? fullName(c) : "—"}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{POLICY_LABEL[p.type]}</td>
                      <td className="px-4 py-3">{p.company}</td>
                      <td className="px-4 py-3 text-ink-soft">{p.number}</td>
                      <td className="px-4 py-3">{money(p.installment)}</td>
                      <td className="px-4 py-3">{fmtDate(p.nextDueDate)}</td>
                      <td className="px-4 py-3">
                        <Badge
                          tone={
                            p.status === "cancelada"
                              ? "ink"
                              : Number.isFinite(d) && (p.status === "por_vencer" || d <= 7)
                                ? "warn"
                                : "forest"
                          }
                        >
                          {p.status.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="text-xs text-gold"
                            onClick={() => {
                              setEditing(p);
                              setOpen(true);
                            }}
                          >
                            Editar
                          </button>
                          {p.status !== "cancelada" && (
                            <button
                              type="button"
                              className="text-xs text-ink-soft hover:text-forest"
                              onClick={() =>
                                void updatePolicy({
                                  ...p,
                                  status: "cancelada",
                                  updatedAt: new Date().toISOString(),
                                })
                              }
                            >
                              Cancelar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
