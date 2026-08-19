import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DndContext, closestCorners, type DragEndEvent } from "@dnd-kit/core";
import { useLia } from "@/context/LiaContext";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { KanbanCard, KanbanColumn, columnFromOver, useKanbanSensors } from "@/components/KanbanDnd";
import { fullName, money } from "@/lib/format";
import {
  ALL_RAMOS,
  POLICY_LABEL,
  type Policy,
  type PolicyType,
  type Quote,
  type QuotePipeline,
  type QuoteStatus,
} from "@/lib/types";

/**
 * Tasa anual estimada por ramo (sobre suma asegurada).
 * Son valores referenciales de mercado AR — el productor los ajusta en la cotización real.
 */
const RATE: Partial<Record<PolicyType, number>> = {
  auto: 0.035,
  moto: 0.045,
  hogar: 0.004,
  comercio: 0.005,
  vida: 0.008,
  art: 0.06,
  caucion: 0.01,
  salud: 0.05,
  ap: 0.015,
  viajes: 0.04,
};

function estimatedPremium(ramo: PolicyType, suma: number): number {
  if (!suma || suma <= 0) return 0;
  return Math.round(suma * (RATE[ramo] ?? 0.03));
}

const GENERAL_COLS: { key: QuoteStatus; label: string }[] = [
  { key: "borrador", label: "Para armar" },
  { key: "enviada", label: "Enviada" },
  { key: "seguimiento", label: "Seguimiento" },
  { key: "ganada", label: "Ganada" },
  { key: "perdida", label: "Perdida" },
];

const VIDA_COLS: { key: QuoteStatus; label: string }[] = [
  { key: "anf", label: "ANF (Análisis)" },
  { key: "propuesta", label: "Propuesta" },
  { key: "examenes", label: "Exámenes Médicos / DJS" },
  { key: "emitida", label: "Emitida" },
];

const GENERAL_NEXT: Partial<Record<QuoteStatus, QuoteStatus>> = {
  borrador: "enviada",
  enviada: "seguimiento",
  seguimiento: "ganada",
};

const VIDA_NEXT: Partial<Record<QuoteStatus, QuoteStatus>> = {
  anf: "propuesta",
  propuesta: "examenes",
  examenes: "emitida",
};

function policyFromQuote(q: Quote): Policy {
  const start = new Date();
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + 1);
  const nextDue = new Date(start);
  nextDue.setDate(nextDue.getDate() + 30);
  const iso = start.toISOString();
  return {
    id: crypto.randomUUID(),
    clientId: q.clientId,
    company: q.companies[0] ?? "A definir",
    type: q.ramo,
    number: `ALTA-${q.id.slice(0, 8).toUpperCase()}`,
    status: "activa",
    startDate: iso,
    endDate: end.toISOString(),
    premium: 0,
    installment: 0,
    nextDueDate: nextDue.toISOString(),
    paymentMethod: "A definir",
    commissionRate: 0.2,
    coverage: `Alta desde cotización ${POLICY_LABEL[q.ramo]}`,
    updatedAt: iso,
  };
}

export function Quotes() {
  const { state, save, addPolicy, addQuote, startDocCollection } = useLia();
  const navigate = useNavigate();
  const sensors = useKanbanSensors();
  const [board, setBoard] = useState<QuotePipeline>("general");
  const [pending, setPending] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  const cols = board === "vida" ? VIDA_COLS : GENERAL_COLS;
  const nextMap = board === "vida" ? VIDA_NEXT : GENERAL_NEXT;
  const won: QuoteStatus[] = board === "vida" ? ["emitida"] : ["ganada", "perdida"];
  const columnIds = cols.map((c) => c.key);
  const boardQuotes = state.quotes.filter(
    (q) => (q.pipelineType ?? (q.ramo === "vida" ? "vida" : "general")) === board,
  );
  const itemToColumn = new Map(boardQuotes.map((q) => [q.id, q.status]));

  async function moveQuote(q: Quote, status: QuoteStatus) {
    if (q.status === status) return;
    if (status === "ganada" || status === "emitida") {
      setPending(q);
      return;
    }
    await save({
      ...state,
      quotes: state.quotes.map((x) => (x.id === q.id ? { ...x, status, pipelineType: board } : x)),
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const q = boardQuotes.find((x) => x.id === String(active.id));
    if (!q) return;
    const next = columnFromOver(over.id, itemToColumn, columnIds) as QuoteStatus | null;
    if (next) void moveQuote(q, next);
  }

  async function confirmWon() {
    if (!pending) return;
    setBusy(true);
    try {
      const q = pending;
      const status: QuoteStatus = q.pipelineType === "vida" || board === "vida" ? "emitida" : "ganada";
      await save({
        ...state,
        quotes: state.quotes.map((x) =>
          x.id === q.id ? { ...x, status, pipelineType: q.pipelineType ?? board } : x,
        ),
      });
      await addPolicy(policyFromQuote(q));
      await startDocCollection(q.clientId);
      setPending(null);
      navigate(`/whatsapp?cliente=${q.clientId}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold">Producción nueva</p>
          <h2 className="font-serif text-3xl">Cotizaciones que no se enfrían</h2>
          <p className="mt-1 max-w-xl text-sm text-ink-soft">
            Patrimoniales y vida no se mezclan. Vida pasa por ANF, propuesta y exámenes / DJS antes de
            emitir. Arrastrá la tarjeta (también en el celular). Si la marcás emitida o ganada, Lía
            arma la póliza y pide el DNI por WhatsApp.
          </p>
        </div>
        <Button onClick={() => setNewOpen(true)}>Nueva cotización</Button>
      </div>

      <div className="flex w-fit gap-1 rounded-full bg-paper-2 p-1">
        <button
          type="button"
          onClick={() => setBoard("general")}
          className={`rounded-full px-4 py-2 text-sm ${board === "general" ? "bg-white shadow-sm" : "text-ink-soft"}`}
        >
          Ramos patrimoniales
        </button>
        <button
          type="button"
          onClick={() => setBoard("vida")}
          className={`rounded-full px-4 py-2 text-sm ${board === "vida" ? "bg-white shadow-sm" : "text-ink-soft"}`}
        >
          Ramo vida
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
        <div className={`grid gap-3 ${board === "vida" ? "lg:grid-cols-4" : "lg:grid-cols-5"}`}>
          {cols.map((col) => {
            const items = boardQuotes.filter((q) => q.status === col.key);
            return (
              <KanbanColumn
                key={col.key}
                id={col.key}
                itemIds={items.map((q) => q.id)}
                title={col.label}
              >
                {items.map((q) => {
                  const c = state.clients.find((x) => x.id === q.clientId);
                  const next = nextMap[col.key];
                  return (
                    <KanbanCard key={q.id} id={q.id}>
                      <p className="font-medium">{c ? fullName(c) : "Cliente"}</p>
                      <p className="text-sm text-ink-soft">
                        {POLICY_LABEL[q.ramo]} · {q.companies.join(", ")}
                      </p>
                      {q.sumaAsegurada ? (
                        <p className="mt-1 text-xs text-ink-soft">
                          SA {money(q.sumaAsegurada)}
                          {q.estimatedPremium
                            ? ` · Prima est. ${money(q.estimatedPremium)}/año`
                            : ""}
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Link to={`/clientes/${q.clientId}`} onPointerDown={(e) => e.stopPropagation()}>
                          <Button variant="ghost" className="px-2 py-1 text-xs">
                            360°
                          </Button>
                        </Link>
                        {next && !won.includes(col.key) && (
                          <Button
                            variant="gold"
                            className="px-2 py-1 text-xs"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={() => void moveQuote(q, next)}
                          >
                            Avanzar
                          </Button>
                        )}
                      </div>
                    </KanbanCard>
                  );
                })}
              </KanbanColumn>
            );
          })}
        </div>
      </DndContext>

      {newOpen && (
        <NewQuoteModal
          clients={state.clients}
          board={board}
          onClose={() => setNewOpen(false)}
          onSave={async (q) => {
            await addQuote(q);
            setNewOpen(false);
          }}
        />
      )}

      {pending && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-forest-deep/50 p-4">
          <Card className="max-w-md space-y-4 bg-paper p-6">
            <h3 className="font-serif text-2xl">
              {board === "vida" ? "Emitir vida" : "Cerrar como ganada"}
            </h3>
            <p className="text-sm text-ink-soft">
              ¿Crear póliza para{" "}
              <strong>
                {(() => {
                  const c = state.clients.find((x) => x.id === pending.clientId);
                  return c ? fullName(c) : "este cliente";
                })()}
              </strong>{" "}
              y pedir documentación por WhatsApp?
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" disabled={busy} onClick={() => setPending(null)}>
                Cancelar
              </Button>
              <Button variant="gold" disabled={busy} onClick={() => void confirmWon()}>
                {busy ? "Armando…" : "Sí, crear y pedir docs"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function NewQuoteModal({
  clients,
  board,
  onClose,
  onSave,
}: {
  clients: { id: string; firstName: string; lastName: string }[];
  board: QuotePipeline;
  onClose: () => void;
  onSave: (q: Quote) => Promise<void>;
}) {
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [ramo, setRamo] = useState<PolicyType>("auto");
  const [companies, setCompanies] = useState("Sancor Seguros, La Caja");
  const [sumaRaw, setSumaRaw] = useState("");
  const [notes, setNotes] = useState("");

  const pipeline = board;
  const initialStatus: QuoteStatus = pipeline === "vida" ? "anf" : "borrador";
  const suma = Number(sumaRaw.replace(/\D/g, "")) || 0;
  const prima = estimatedPremium(ramo, suma);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
      <Card className="w-full max-w-lg space-y-4 bg-paper p-6">
        <h2 className="font-serif text-2xl">Nueva cotización</h2>
        <Field label="Cliente">
          <select className={inputClass} value={clientId} onChange={(e) => setClientId(e.target.value)}>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.firstName} {c.lastName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ramo">
          <select
            className={inputClass}
            value={ramo}
            onChange={(e) => {
              setRamo(e.target.value as PolicyType);
              setSumaRaw("");
            }}
          >
            {ALL_RAMOS.map((r) => (
              <option key={r} value={r}>
                {POLICY_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Compañías (separadas por coma)">
          <input className={inputClass} value={companies} onChange={(e) => setCompanies(e.target.value)} />
        </Field>
        <Field
          label="Suma asegurada (opcional)"
          hint={prima > 0 ? <span className="text-forest font-medium">Prima est. {money(prima)}/año · {money(Math.round(prima / 12))}/mes</span> : undefined}
        >
          <input
            className={inputClass}
            placeholder="Ej. 10000000"
            value={sumaRaw}
            onChange={(e) => setSumaRaw(e.target.value)}
          />
        </Field>
        {prima > 0 && (
          <p className="rounded-md bg-forest/5 border border-forest/20 px-3 py-2 text-xs text-ink-soft">
            Estimación orientativa con tasa de mercado ({((RATE[ramo] ?? 0.03) * 100).toFixed(1)}% anual sobre SA).
            Ajustá con la tarifa real de la compañía antes de enviar.
          </p>
        )}
        <Field label="Notas (opcional)">
          <input className={inputClass} placeholder="Marca del auto, antigüedad, condición…" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!clientId}
            onClick={() =>
              onSave({
                id: crypto.randomUUID(),
                clientId,
                ramo,
                status: ramo === "vida" ? "anf" : initialStatus,
                pipelineType: ramo === "vida" ? "vida" : pipeline,
                companies: companies.split(",").map((s) => s.trim()).filter(Boolean),
                createdAt: new Date().toISOString(),
                sumaAsegurada: suma || undefined,
                estimatedPremium: prima || undefined,
                notes: notes.trim() || undefined,
              })
            }
          >
            Crear
          </Button>
        </div>
      </Card>
    </div>
  );
}
