import { useState } from "react";
import { DndContext, closestCorners, type DragEndEvent } from "@dnd-kit/core";
import { useLia } from "@/context/LiaContext";
import { Badge, Button, Card, Field, inputClass } from "@/components/ui";
import { KanbanCard, KanbanColumn, columnFromOver, useKanbanSensors } from "@/components/KanbanDnd";
import { fmtDate, fullName } from "@/lib/format";
import { CLAIM_LABEL, POLICY_LABEL, type Claim, type ClaimStatus, type PolicyType } from "@/lib/types";

const COLS: { key: ClaimStatus; label: string }[] = [
  { key: "denuncia", label: "Denuncia" },
  { key: "inspeccion", label: "Inspección" },
  { key: "liquidacion", label: "Liquidación" },
  { key: "cerrado", label: "Cerrado" },
];

export function Siniestros() {
  const { state, updateClaim, addClaim } = useLia();
  const [open, setOpen] = useState(false);
  const sensors = useKanbanSensors();
  const columnIds = COLS.map((c) => c.key);
  const itemToColumn = new Map(state.claims.map((s) => [s.id, s.status]));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const claim = state.claims.find((x) => x.id === String(active.id));
    if (!claim) return;
    const next = columnFromOver(over.id, itemToColumn, columnIds) as ClaimStatus | null;
    if (next && claim.status !== next) void updateClaim({ ...claim, status: next });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold">Siniestros</p>
          <h2 className="font-serif text-3xl">De la denuncia al cierre</h2>
          <p className="mt-1 max-w-xl text-sm text-ink-soft">
            Arrastrá la tarjeta (mouse o dedo). Si un trámite se traba más de 5 días, Lía lo sube a Hoy.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>Nuevo siniestro</Button>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
        <div className="grid gap-3 lg:grid-cols-4">
          {COLS.map((col) => {
            const items = state.claims.filter((s) => s.status === col.key);
            return (
              <KanbanColumn key={col.key} id={col.key} itemIds={items.map((s) => s.id)} title={col.label}>
                {items.length === 0 && (
                  <p className="px-2 py-4 text-center text-xs text-ink-soft">Sin casos en esta etapa</p>
                )}
                {items.map((s) => {
                  const c = state.clients.find((x) => x.id === s.clientId);
                  const p = state.policies.find((x) => x.id === s.policyId);
                  return (
                    <KanbanCard key={s.id} id={s.id}>
                      <p className="font-medium">{c ? fullName(c) : "Cliente"}</p>
                      <p className="text-sm text-ink-soft">
                        {p ? POLICY_LABEL[p.type] : "Ramo"}
                        {p ? ` · ${p.company}` : ""}
                      </p>
                      <p className="mt-2 text-xs text-ink-soft">{fmtDate(s.date)}</p>
                      <p className="mt-1 line-clamp-2 text-sm">{s.description}</p>
                      <div className="mt-2">
                        <Badge
                          tone={
                            s.status === "cerrado" ? "forest" : s.status === "denuncia" ? "danger" : "warn"
                          }
                        >
                          {CLAIM_LABEL[s.status]}
                        </Badge>
                      </div>
                    </KanbanCard>
                  );
                })}
              </KanbanColumn>
            );
          })}
        </div>
      </DndContext>
      {open && (
        <NewClaimModal
          clients={state.clients}
          policies={state.policies}
          onClose={() => setOpen(false)}
          onSave={async (c) => {
            await addClaim(c);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function NewClaimModal({
  clients,
  policies,
  onClose,
  onSave,
}: {
  clients: { id: string; firstName: string; lastName: string }[];
  policies: { id: string; clientId: string; type: PolicyType; company: string; number: string }[];
  onClose: () => void;
  onSave: (c: Claim) => Promise<void>;
}) {
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const clientPolicies = policies.filter((p) => p.clientId === clientId);
  const [policyId, setPolicyId] = useState(clientPolicies[0]?.id ?? "");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
      <Card className="w-full max-w-lg space-y-4 bg-paper p-6">
        <h2 className="font-serif text-2xl">Denuncia de siniestro</h2>
        <Field label="Cliente">
          <select
            className={inputClass}
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              const first = policies.find((p) => p.clientId === e.target.value);
              setPolicyId(first?.id ?? "");
            }}
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.firstName} {c.lastName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Póliza">
          <select className={inputClass} value={policyId} onChange={(e) => setPolicyId(e.target.value)}>
            {clientPolicies.map((p) => (
              <option key={p.id} value={p.id}>
                {POLICY_LABEL[p.type]} · {p.company} · {p.number}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Qué pasó">
          <textarea
            className={`${inputClass} min-h-24`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ej. Granizo en techo, choque en maniobra…"
          />
        </Field>
        <Field label="Monto estimado (opcional)">
          <input
            className={inputClass}
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="1850000"
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!clientId || !policyId || !description.trim()}
            onClick={() => {
              const now = new Date().toISOString();
              onSave({
                id: crypto.randomUUID(),
                policyId,
                clientId,
                date: now,
                description: description.trim(),
                status: "denuncia",
                updatedAt: now,
                amount: amount ? Number(amount) : undefined,
              });
            }}
          >
            Guardar
          </Button>
        </div>
      </Card>
    </div>
  );
}
