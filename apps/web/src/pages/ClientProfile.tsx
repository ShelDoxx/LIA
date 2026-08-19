import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useLia } from "@/context/LiaContext";
import { Badge, Button, Card, Field, inputClass } from "@/components/ui";
import { daysUntil, fmtDate, fullName, initials, money, normalizePhoneAR } from "@/lib/format";
import {
  ENDORSEMENT_STATUS_LABEL,
  ENDORSEMENT_TYPE_LABEL,
  POLICY_LABEL,
  type Client,
  type DocType,
  type Endorsement,
  type EndorsementType,
  type FamilyMember,
  type Policy,
} from "@/lib/types";
import { PolicyForm } from "@/components/PolicyForm";
import { FileText, Files, Phone, Upload } from "lucide-react";

const tabs = ["Resumen", "Familia", "Pólizas", "Siniestros", "Bóveda", "Trámites / Endosos"] as const;

export function ClientProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { state, updateClient, addDocument, addEndorsement, updateEndorsement, addPolicy, updatePolicy } = useLia();
  const client = state.clients.find((c) => c.id === id);
  const [tab, setTab] = useState<(typeof tabs)[number]>("Resumen");
  const [policyOpen, setPolicyOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
  const [editingClient, setEditingClient] = useState(false);

  const policies = state.policies.filter((p) => p.clientId === id);
  const claims = state.claims.filter((c) => c.clientId === id);
  const docs = state.documents.filter((d) => d.clientId === id);
  const endorsements = (state.endorsements ?? []).filter((e) => e.clientId === id);
  const conv = state.conversations.find((c) => c.clientId === id);

  if (!client) {
    return (
      <p>
        Cliente no encontrado. <Link to="/clientes">Volver</Link>
      </p>
    );
  }

  const annual = policies.reduce((a, p) => a + p.premium, 0);

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-wrap items-start gap-5">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-forest font-serif text-2xl text-paper">
            {initials(client)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-serif text-3xl">{fullName(client)}</h2>
              {(client.tags ?? []).map((t) => (
                <Badge key={t} tone={t === "whatsapp-pendiente" ? "gold" : "forest"}>
                  {t === "whatsapp-pendiente" ? "WhatsApp pendiente" : t === "whatsapp-verificado" ? "WhatsApp OK" : t}
                </Badge>
              ))}
            </div>
            <p className="mt-1 text-sm text-ink-soft">
              {client.dni ? `DNI ${client.dni}` : "Sin DNI"}
              {client.city ? ` · ${client.city}` : ""}
              {client.address ? ` · ${client.address}` : ""}
              {client.referredBy ? ` · Traído por ${client.referredBy}` : ""}
            </p>
            {client.tags?.includes("whatsapp-pendiente") ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <p className="text-sm text-gold">
                  Entró por WhatsApp y no matcheó cartera.
                </p>
                <Button
                  variant="gold"
                  onClick={() =>
                    void updateClient({
                      ...client,
                      tags: [
                        ...(client.tags ?? []).filter((t) => t !== "whatsapp-pendiente"),
                        "whatsapp-verificado",
                      ],
                    })
                  }
                >
                  Es cliente
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (!window.confirm("¿Mover a leads archivados? Podés recuperarlo desde Clientes → Archivados.")) return;
                    void updateClient({
                      ...client,
                      tags: [
                        ...(client.tags ?? []).filter(
                          (t) => t !== "whatsapp-pendiente" && t !== "whatsapp-verificado",
                        ),
                        "archivado",
                      ],
                    }).then(() => navigate("/clientes"));
                  }}
                >
                  No es cliente
                </Button>
              </div>
            ) : null}
            <p className="mt-2 text-sm">{client.notes}</p>
          </div>
          <div className="flex gap-2">
            <a href={`https://wa.me/${client.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">
              <Button variant="gold">
                <Phone size={16} /> WhatsApp
              </Button>
            </a>
            <Link to={`/expediente?cliente=${client.id}`}>
              <Button variant="ghost">
                <Files size={16} /> Armar PDF
              </Button>
            </Link>
            <Link to={`/whatsapp?cliente=${client.id}`}>
              <Button variant="ghost">Ver hilo de Lía</Button>
            </Link>
            <Button variant="ghost" onClick={() => setEditingClient((v) => !v)}>
              {editingClient ? "Cerrar ficha" : "Editar cliente"}
            </Button>
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          <Mini k="Pólizas" v={String(policies.length)} />
          <Mini k="Prima anual" v={money(annual)} />
          <Mini k="Siniestros" v={String(claims.length)} />
          <Mini k="Grupo familiar" v={String((client.family ?? []).length + 1)} />
        </div>
      </Card>

      <div className="flex gap-1 overflow-x-auto rounded-full bg-paper-2 p-1">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-2 text-sm ${tab === t ? "bg-white shadow-sm" : "text-ink-soft"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Resumen" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-serif text-xl">Datos de contacto</h3>
              {!editingClient && (
                <button type="button" className="text-xs text-gold" onClick={() => setEditingClient(true)}>
                  Editar
                </button>
              )}
            </div>
            {editingClient ? (
              <ClientEditForm
                client={client}
                onCancel={() => setEditingClient(false)}
                onSave={(next) => {
                  void updateClient(next);
                  setEditingClient(false);
                }}
              />
            ) : (
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-ink-soft">Email</dt>
                  <dd>{client.email || "—"}</dd>
                </div>
                <div>
                  <dt className="text-ink-soft">WhatsApp</dt>
                  <dd>{client.phone || "—"}</dd>
                </div>
                <div>
                  <dt className="text-ink-soft">Nacimiento</dt>
                  <dd>{fmtDate(client.birthDate)}</dd>
                </div>
                <div>
                  <dt className="text-ink-soft">Cliente desde</dt>
                  <dd>{fmtDate(client.createdAt)}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-ink-soft">Dirección</dt>
                  <dd>{client.address || "—"}</dd>
                </div>
              </dl>
            )}
          </Card>
          <Card className="p-5">
            <h3 className="mb-3 font-serif text-xl">Último WhatsApp</h3>
            {conv ? (
              <div className="space-y-2">
                {conv.messages.slice(-3).map((m) => (
                  <p key={m.id} className="text-sm">
                    <span className="text-ink-soft">{m.from === "lia" ? "Lía" : client.firstName}: </span>
                    {m.text}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-soft">Todavía no hay hilo con Lía.</p>
            )}
          </Card>
        </div>
      )}

      {tab === "Familia" && (
        <FamilyTab
          members={client.family ?? []}
          onAdd={(m) => updateClient({ ...client, family: [...(client.family ?? []), m] })}
        />
      )}

      {tab === "Pólizas" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button
              onClick={() => {
                setEditingPolicy(null);
                setPolicyOpen(true);
              }}
            >
              Nueva póliza
            </Button>
          </div>
          {policies.length === 0 && !policyOpen ? (
            <p className="text-sm text-ink-soft">Sin pólizas. Cargá una o importá CSV en Marca.</p>
          ) : null}
          {policyOpen && (
            <Card className="p-5">
              <PolicyForm
                clients={state.clients}
                defaultClientId={client.id}
                initial={editingPolicy ?? undefined}
                onCancel={() => {
                  setPolicyOpen(false);
                  setEditingPolicy(null);
                }}
                onSave={(p) => {
                  if (editingPolicy) void updatePolicy(p);
                  else void addPolicy(p);
                  setPolicyOpen(false);
                  setEditingPolicy(null);
                }}
              />
            </Card>
          )}
          {policies.map((p) => (
            <Card key={p.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {POLICY_LABEL[p.type]} · {p.company}
                  </p>
                  <p className="text-sm text-ink-soft">
                    {p.number} {p.plate ? `· ${p.plate}` : ""} · {p.coverage}
                  </p>
                </div>
                <Badge tone={p.status === "cancelada" ? "ink" : p.status === "por_vencer" ? "warn" : "forest"}>
                  {p.status.replace("_", " ")}
                </Badge>
              </div>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
                <span>Vence {fmtDate(p.endDate)}</span>
                <span>Cuota {money(p.installment)}</span>
                <span>
                  Próximo cobro {fmtDate(p.nextDueDate)} ({daysUntil(p.nextDueDate)} días)
                </span>
                <span>Comisión {(p.commissionRate * 100).toFixed(0)}%</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  className="text-xs"
                  onClick={() => {
                    setEditingPolicy(p);
                    setPolicyOpen(true);
                  }}
                >
                  Editar
                </Button>
                {p.status !== "cancelada" && (
                  <Button
                    variant="ghost"
                    className="text-xs"
                    onClick={() => void updatePolicy({ ...p, status: "cancelada", updatedAt: new Date().toISOString() })}
                  >
                    Cancelar póliza
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === "Siniestros" && (
        <div className="space-y-3">
          {claims.length === 0 && <p className="text-sm text-ink-soft">Sin siniestros cargados.</p>}
          {claims.map((s) => {
            const p = policies.find((x) => x.id === s.policyId);
            return (
              <Card key={s.id} className="p-5">
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="font-medium">{fmtDate(s.date)}</p>
                    <p className="text-sm text-ink-soft">
                      {p ? `${POLICY_LABEL[p.type]} ${p.company}` : "Póliza"} · {s.description}
                    </p>
                  </div>
                  <Badge
                    tone={
                      s.status === "cerrado" ? "forest" : s.status === "denuncia" ? "danger" : "warn"
                    }
                  >
                    {s.status === "denuncia"
                      ? "Denuncia"
                      : s.status === "inspeccion"
                        ? "Inspección"
                        : s.status === "liquidacion"
                          ? "Liquidación"
                          : "Cerrado"}
                  </Badge>
                </div>
                {s.amount ? <p className="mt-2 text-sm">{money(s.amount)}</p> : null}
              </Card>
            );
          })}
        </div>
      )}

      {tab === "Trámites / Endosos" && (
        <EndorsementsTab
          clientId={client.id}
          policies={policies}
          endorsements={endorsements}
          onAdd={addEndorsement}
          onUpdate={updateEndorsement}
        />
      )}

      {tab === "Bóveda" && (
        <Vault
          clientId={client.id}
          docs={docs}
          onUpload={(file) =>
            addDocument({
              id: crypto.randomUUID(),
              clientId: client.id,
              type: guessDoc(file.name),
              name: file.name,
              uploadedAt: new Date().toISOString(),
              sizeLabel: `${Math.max(1, Math.round(file.size / 1024))} KB`,
            })
          }
        />
      )}
    </div>
  );
}

function Mini({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl bg-paper-2 px-3 py-3">
      <p className="text-xs text-ink-soft">{k}</p>
      <p className="font-serif text-xl">{v}</p>
    </div>
  );
}

function FamilyTab({
  members,
  onAdd,
}: {
  members: FamilyMember[];
  onAdd: (m: FamilyMember) => void;
}) {
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [relation, setRelation] = useState<FamilyMember["relation"]>("conyuge");
  const [birthDate, setBirthDate] = useState("");
  const [dni, setDni] = useState("");
  const [hasLifePolicy, setHasLifePolicy] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) return;
    onAdd({
      id: crypto.randomUUID(),
      relation,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      birthDate: birthDate ? new Date(birthDate).toISOString() : new Date().toISOString(),
      dni: dni.trim() || undefined,
      hasLifePolicy,
    });
    setFirstName("");
    setLastName("");
    setRelation("conyuge");
    setBirthDate("");
    setDni("");
    setHasLifePolicy(false);
    setOpen(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => setOpen((v) => !v)}>{open ? "Cancelar" : "Agregar familiar"}</Button>
      </div>
      {members.length === 0 && !open ? (
        <p className="text-sm text-ink-soft">Sin grupo familiar cargado. El radar de vida parte de acá.</p>
      ) : null}
      {members.map((m) => (
        <Card key={m.id} className="flex items-center justify-between p-4">
          <div>
            <p className="font-medium">
              {m.firstName} {m.lastName}
            </p>
            <p className="text-sm capitalize text-ink-soft">
              {m.relation} · {fmtDate(m.birthDate)}
              {m.dni ? ` · DNI ${m.dni}` : ""}
            </p>
          </div>
          {m.hasLifePolicy ? (
            <Badge tone="forest">Tiene vida</Badge>
          ) : (
            <Badge tone="gold">Oportunidad vida</Badge>
          )}
        </Card>
      ))}
      {open && (
        <Card className="space-y-3 p-4">
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
            <Field label="Nombre">
              <input className={inputClass} value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </Field>
            <Field label="Apellido">
              <input className={inputClass} value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </Field>
            <Field label="Vínculo">
              <select className={inputClass} value={relation} onChange={(e) => setRelation(e.target.value as FamilyMember["relation"])}>
                <option value="conyuge">Cónyuge</option>
                <option value="hijo">Hijo/a</option>
                <option value="padre">Padre/madre</option>
                <option value="otro">Otro</option>
              </select>
            </Field>
            <Field label="Nacimiento">
              <input className={inputClass} type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
            </Field>
            <Field label="DNI">
              <input className={inputClass} value={dni} onChange={(e) => setDni(e.target.value)} placeholder="Opcional" />
            </Field>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input type="checkbox" checked={hasLifePolicy} onChange={(e) => setHasLifePolicy(e.target.checked)} />
              Ya tiene póliza de vida
            </label>
            <div className="sm:col-span-2">
              <Button type="submit">Guardar familiar</Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}

const ENDORSEMENT_TYPES: EndorsementType[] = ["vehiculo", "suma_asegurada", "cobertura", "otro"];

function EndorsementsTab({
  clientId,
  policies,
  endorsements,
  onAdd,
  onUpdate,
}: {
  clientId: string;
  policies: Policy[];
  endorsements: Endorsement[];
  onAdd: (e: Endorsement) => Promise<void>;
  onUpdate: (e: Endorsement) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const ordered = [...endorsements].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">
          {endorsements.length === 0
            ? "Sin trámites cargados. Un endoso es el trámite más frecuente: cambio de auto, suma o cobertura."
            : `${endorsements.length} trámite${endorsements.length === 1 ? "" : "s"} en esta ficha.`}
        </p>
        <Button onClick={() => setOpen(true)} disabled={policies.length === 0}>
          Nuevo Trámite
        </Button>
      </div>
      {policies.length === 0 && (
        <p className="text-sm text-ink-soft">Cargá una póliza antes de pedir un endoso.</p>
      )}
      {ordered.map((e) => {
        const p = policies.find((x) => x.id === e.policyId);
        return (
          <Card key={e.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{ENDORSEMENT_TYPE_LABEL[e.type]}</p>
                <p className="text-sm text-ink-soft">
                  {p ? `${POLICY_LABEL[p.type]} · ${p.company} · ${p.number}` : "Póliza"} ·{" "}
                  {fmtDate(e.createdAt)}
                </p>
                <p className="mt-2 text-sm">{e.description}</p>
              </div>
              <Badge
                tone={
                  e.status === "completado" ? "forest" : e.status === "pendiente" ? "gold" : "warn"
                }
              >
                {ENDORSEMENT_STATUS_LABEL[e.status]}
              </Badge>
            </div>
            {e.status !== "completado" && (
              <div className="mt-3 flex flex-wrap gap-2">
                {e.status === "pendiente" && (
                  <Button
                    variant="ghost"
                    className="h-8 px-3 text-xs"
                    onClick={() => void onUpdate({ ...e, status: "procesando" })}
                  >
                    Marcar en proceso
                  </Button>
                )}
                {e.status === "procesando" && (
                  <Button
                    variant="gold"
                    className="h-8 px-3 text-xs"
                    onClick={() => void onUpdate({ ...e, status: "completado" })}
                  >
                    Completado
                  </Button>
                )}
              </div>
            )}
          </Card>
        );
      })}
      {open && (
        <NewEndorsementModal
          clientId={clientId}
          policies={policies}
          onClose={() => setOpen(false)}
          onSave={async (e) => {
            await onAdd(e);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function NewEndorsementModal({
  clientId,
  policies,
  onClose,
  onSave,
}: {
  clientId: string;
  policies: Policy[];
  onClose: () => void;
  onSave: (e: Endorsement) => Promise<void>;
}) {
  const [policyId, setPolicyId] = useState(policies[0]?.id ?? "");
  const [type, setType] = useState<EndorsementType>("vehiculo");
  const [description, setDescription] = useState("");

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-ink/40 p-4">
      <Card className="w-full max-w-lg space-y-4 bg-paper p-6">
        <h2 className="font-serif text-2xl">Nuevo trámite</h2>
        <p className="text-sm text-ink-soft">
          Endoso sobre una póliza vigente: cambio de vehículo, suma asegurada u otra modificación.
        </p>
        <Field label="Póliza afectada">
          <select
            className={inputClass}
            value={policyId}
            onChange={(e) => setPolicyId(e.target.value)}
          >
            {policies.map((p) => (
              <option key={p.id} value={p.id}>
                {POLICY_LABEL[p.type]} · {p.company} · {p.number}
                {p.plate ? ` · ${p.plate}` : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tipo de trámite">
          <select
            className={inputClass}
            value={type}
            onChange={(e) => setType(e.target.value as EndorsementType)}
          >
            {ENDORSEMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {ENDORSEMENT_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Nota breve">
          <textarea
            className={`${inputClass} min-h-24`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ej. Cambia el auto, sube capital a $80M, agrega granizo…"
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!policyId || !description.trim()}
            onClick={() =>
              onSave({
                id: crypto.randomUUID(),
                policyId,
                clientId,
                type,
                status: "pendiente",
                createdAt: new Date().toISOString(),
                description: description.trim(),
              })
            }
          >
            Guardar
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Vault({
  clientId,
  docs,
  onUpload,
}: {
  clientId: string;
  docs: {
    id: string;
    name: string;
    type: DocType;
    sizeLabel: string;
    uploadedAt: string;
    dataUrl?: string;
    source?: string;
    archived?: boolean;
  }[];
  onUpload: (file: File) => void;
}) {
  const grouped = useMemo(() => {
    const g: Record<string, typeof docs> = {};
    for (const d of docs) {
      g[d.type] = g[d.type] ? [...g[d.type], d] : [d];
    }
    return g;
  }, [docs]);

  return (
    <div className="space-y-4">
      <Link
        to={`/expediente?cliente=${clientId}`}
        className="flex items-center justify-between rounded-md border border-gold/40 bg-gold/5 px-4 py-3 text-sm"
      >
        <span>
          El cliente manda fotos por WhatsApp: Lía arma el PDF y lo deja acá, en esta ficha. También
          podés armarlo a mano.
        </span>
        <span className="text-gold">Expediente →</span>
      </Link>
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-white/50 py-8 text-sm text-ink-soft">
        <Upload size={16} /> Subir PDF o foto (póliza, DNI, certificado)
        <input
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
          }}
        />
      </label>
      {Object.entries(grouped).map(([type, list]) => (
        <div key={type}>
          <p className="mb-2 text-xs uppercase tracking-wide text-ink-soft">{type}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {list.map((d) => (
              <Card key={d.id} className="flex items-center gap-3 p-4">
                <FileText className="text-forest" size={18} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{d.name}</p>
                  <p className="text-xs text-ink-soft">
                    {d.sizeLabel} · {fmtDate(d.uploadedAt)}
                    {d.source === "whatsapp" ? " · WhatsApp" : ""}
                    {d.archived ? " · Solo metadata" : ""}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  className="ml-auto px-3 py-1 text-xs"
                  disabled={d.archived || !d.dataUrl}
                  onClick={() => {
                    if (d.archived || !d.dataUrl) return;
                    const a = document.createElement("a");
                    a.href = d.dataUrl;
                    a.download = d.name;
                    a.click();
                  }}
                >
                  {d.archived ? "Archivado (Solo Metadata)" : d.dataUrl ? "Abrir" : "—"}
                </Button>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ClientEditForm({
  client,
  onSave,
  onCancel,
}: {
  client: Client;
  onSave: (c: Client) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    firstName: client.firstName,
    lastName: client.lastName,
    dni: client.dni,
    phone: client.phone,
    email: client.email,
    city: client.city,
    address: client.address,
    notes: client.notes,
    birthDate: client.birthDate?.slice(0, 10) ?? "",
  });

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...client,
          ...form,
          phone: normalizePhoneAR(form.phone),
          birthDate: form.birthDate ? new Date(`${form.birthDate}T12:00:00`).toISOString() : client.birthDate,
        });
      }}
    >
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
      <Field label="Nacimiento">
        <input
          className={inputClass}
          type="date"
          value={form.birthDate}
          onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
        />
      </Field>
      <Field label="Dirección">
        <input
          className={inputClass}
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
        />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Notas">
          <textarea
            className={`${inputClass} min-h-20`}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </Field>
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit">Guardar</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function guessDoc(name: string): DocType {
  const n = name.toLowerCase();
  if (n.includes("dni")) return "dni";
  if (n.includes("cupon") || n.includes("cupón")) return "cupon";
  if (n.includes("cert")) return "certificado";
  if (n.includes("pol") || n.includes("pól")) return "poliza";
  return "otro";
}
