import { useMemo, useState } from "react";
import { ASSISTANCE_LINES, RAMO_PLAYBOOK, playbook } from "@/data/ramos";
import { Badge, Card, inputClass } from "@/components/ui";
import { useLia } from "@/context/LiaContext";
import { POLICY_LABEL, type PolicyType } from "@/lib/types";

export function Emergencias() {
  const { state } = useLia();
  const ramos = state.producer.activeRamos?.length
    ? state.producer.activeRamos
    : RAMO_PLAYBOOK.map((r) => r.id);
  const [ramo, setRamo] = useState<PolicyType>(ramos.includes("auto") ? "auto" : ramos[0]);
  const current = ramos.includes(ramo) ? ramo : ramos[0];
  const [q, setQ] = useState("");
  const book = playbook(current);
  const inPortfolio = useMemo(
    () => new Set(state.policies.filter((p) => p.type === current).map((p) => p.company)),
    [state.policies, current],
  );
  const rows = ASSISTANCE_LINES.filter(
    (e) => e.ramo === current && e.company.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="space-y-5">
      <div className="max-w-2xl">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold">Cada ramo es otro juego</p>
        <h2 className="font-serif text-3xl">Asistencias por ramo</h2>
        <p className="mt-2 text-sm text-ink-soft">
          Grúa es auto. Vida pide beneficiarios. Hogar manda plomero. ART denuncia laboral. El
          estudio elige qué ramos opera; Lía solo responde esos.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {RAMO_PLAYBOOK.filter((r) => ramos.includes(r.id)).map((r) => (
          <button
            key={r.id}
            onClick={() => setRamo(r.id)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              ramo === r.id ? "bg-forest-deep text-paper" : "border border-line bg-white"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {book && (
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-gold">{POLICY_LABEL[current]}</p>
          <p className="mt-1 font-serif text-2xl">{book.assistanceLabel}</p>
          <p className="mt-2 text-sm text-ink-soft">El cliente suele decir: {book.whatClientSays}</p>
          <p className="mt-3 text-sm">{book.firstStep}</p>
        </Card>
      )}

      <input
        className={`${inputClass} max-w-sm`}
        placeholder="Buscar compañía"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <div className="grid gap-3 lg:grid-cols-2">
        {rows.map((e) => (
          <Card key={`${e.company}-${e.ramo}`} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <p className="font-serif text-xl">{e.company}</p>
              {inPortfolio.has(e.company) && <Badge tone="forest">En tu cartera</Badge>}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-ink-soft">{book?.assistanceLabel ?? "Asistencia"}</dt>
                <dd className="font-medium">{e.assistance}</dd>
              </div>
              <div>
                <dt className="text-ink-soft">Denuncia / mesa</dt>
                <dd className="font-medium">{e.claims}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-ink-soft">{e.notes}</p>
          </Card>
        ))}
        {!rows.length && (
          <p className="text-sm text-ink-soft">No hay números cargados para este ramo. Agregalos cuando conectes compañías.</p>
        )}
      </div>
    </div>
  );
}
