import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLia } from "@/context/LiaContext";
import { ImportCarteraModal } from "@/components/CsvImporter";
import { Badge, Button, Card, Field, inputClass, Modal } from "@/components/ui";
import { fullName, initials, normalizePhoneAR } from "@/lib/format";
import type { Client } from "@/lib/types";

export function Clients() {
  const { state, addClient, updateClient } = useLia();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const isDemo = state.producer.plan === "demo";

  const active = useMemo(
    () => state.clients.filter((c) => !(c.tags ?? []).includes("archivado")),
    [state.clients],
  );
  const archived = useMemo(
    () => state.clients.filter((c) => (c.tags ?? []).includes("archivado")),
    [state.clients],
  );

  const source = showArchived ? archived : active;
  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return source.filter((c) =>
      `${fullName(c)} ${c.dni ?? ""} ${c.city ?? ""} ${(c.tags ?? []).join(" ")}`.toLowerCase().includes(s),
    );
  }, [q, source]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-ink-soft">{active.length} en cartera{archived.length > 0 ? ` · ${archived.length} archivado${archived.length === 1 ? "" : "s"}` : ""}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            className={`${inputClass} w-56`}
            placeholder={showArchived ? "Filtrar archivados" : "Filtrar cartera"}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {archived.length > 0 && (
            <Button
              variant={showArchived ? "gold" : "ghost"}
              onClick={() => { setShowArchived((v) => !v); setQ(""); }}
            >
              {showArchived ? "Ver cartera" : `Archivados (${archived.length})`}
            </Button>
          )}
          {isDemo ? (
            <Link to="/activar">
              <Button variant="gold">Activar Plan Estudio</Button>
            </Link>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setImportOpen(true)}>
                Importar Cartera
              </Button>
              <Button onClick={() => setOpen(true)}>Nuevo cliente</Button>
            </>
          )}
        </div>
      </div>
      {showArchived && (
        <div className="rounded-md bg-gold/5 border border-gold/20 px-4 py-2 text-sm text-ink-soft">
          Leads archivados — no son clientes activos. Podés restaurarlos a la cartera.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.length === 0 && (
          <Card className="col-span-full p-8 text-center">
            {state.clients.length === 0 ? (
              <>
                <p className="font-serif text-xl">Todavía no hay clientes</p>
                <p className="mt-2 text-sm text-ink-soft">
                  Cargá uno acá o importá el CSV del portal en Marca. Plan Estudio arranca vacío a
                  propósito.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {isDemo ? (
                    <Link to="/activar">
                      <Button variant="gold">Activar Plan Estudio</Button>
                    </Link>
                  ) : (
                    <>
                      <Button onClick={() => setOpen(true)}>Nuevo cliente</Button>
                      <Button variant="ghost" onClick={() => setImportOpen(true)}>
                        Importar Cartera
                      </Button>
                    </>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="font-serif text-xl">Nadie coincide con ese filtro</p>
                <p className="mt-2 text-sm text-ink-soft">Probá otro nombre, DNI o importá cartera desde Marca.</p>
              </>
            )}
          </Card>
        )}
        {filtered.map((c) => {
          const pols = state.policies.filter((p) => p.clientId === c.id && p.status !== "cancelada");
          const lifeGap = (c.family ?? []).some((f) => f.relation === "conyuge" && !f.hasLifePolicy);
          const isArchived = (c.tags ?? []).includes("archivado");
          return isArchived ? (
            <Card key={c.id} className="h-full p-5 opacity-70">
              <div className="flex items-start gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-full bg-ink-soft text-sm text-paper">
                  {initials(c)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{fullName(c)}</p>
                  <p className="text-sm text-ink-soft">{c.phone || "Sin teléfono"}</p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="ghost"
                  className="text-xs"
                  onClick={() =>
                    void updateClient({
                      ...c,
                      tags: (c.tags ?? []).filter((t) => t !== "archivado"),
                    })
                  }
                >
                  Restaurar a cartera
                </Button>
              </div>
            </Card>
          ) : (
            <Link key={c.id} to={`/clientes/${c.id}`}>
              <Card className="h-full p-5 transition hover:-translate-y-0.5 hover:border-forest/30">
                <div className="flex items-start gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-full bg-forest text-sm text-paper">
                    {initials(c)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium">{fullName(c)}</p>
                    <p className="text-sm text-ink-soft">
                      {c.city} · DNI {c.dni}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {(c.tags ?? []).filter(t => t !== "archivado").map((t) => (
                    <Badge key={t} tone={t === "whatsapp-pendiente" ? "gold" : "forest"}>
                      {t === "whatsapp-pendiente" ? "WhatsApp pendiente" : t}
                    </Badge>
                  ))}
                  {lifeGap && <Badge tone="gold">Vida cónyuge</Badge>}
                </div>
                <p className="mt-4 text-sm text-ink-soft">
                  {pols.length} pólizas activas · grupo {(c.family ?? []).length + 1}
                </p>
              </Card>
            </Link>
          );
        })}
      </div>

      {!isDemo && open && <NewClient onClose={() => setOpen(false)} onSave={addClient} />}
      {!isDemo && importOpen && <ImportCarteraModal onClose={() => setImportOpen(false)} />}
    </div>
  );
}

function NewClient({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (c: Client) => void;
}) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    dni: "",
    phone: "",
    email: "",
    city: "",
  });
  return (
    <Modal onBackdrop={onClose}>
      <h2 className="font-serif text-2xl">Alta de cliente</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["firstName", "Nombre"],
              ["lastName", "Apellido"],
              ["dni", "DNI"],
              ["phone", "WhatsApp"],
              ["email", "Email"],
              ["city", "Ciudad"],
            ] as const
          ).map(([k, label]) => (
            <Field key={k} label={label}>
              <input
                className={inputClass}
                value={form[k]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              />
            </Field>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              if (!form.firstName || !form.lastName) return;
              onSave({
                id: crypto.randomUUID(),
                ...form,
                phone: normalizePhoneAR(form.phone),
                address: "",
                birthDate: new Date().toISOString(),
                notes: "",
                family: [],
                tags: ["Nuevo"],
                createdAt: new Date().toISOString(),
                lastContactAt: new Date().toISOString(),
              });
              onClose();
            }}
          >
            Guardar
          </Button>
        </div>
    </Modal>
  );
}
