import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useLia } from "@/context/LiaContext";
import { Badge, Button, Card, Field, inputClass } from "@/components/ui";
import { PACK_TEMPLATES } from "@/data/packs";
import { buildExpedientePdf, downloadPdf } from "@/lib/buildPdf";
import { fullName } from "@/lib/format";

export function PdfPack() {
  const { state, addDocument } = useLia();
  const [params] = useSearchParams();
  const presetClient = params.get("cliente") ?? "";
  const [tplId, setTplId] = useState("smg-life-alta");
  const [clientId, setClientId] = useState(presetClient);
  const [files, setFiles] = useState<Record<string, File | undefined>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const tpl = PACK_TEMPLATES.find((t) => t.id === tplId) ?? PACK_TEMPLATES[0];
  const client = state.clients.find((c) => c.id === clientId);
  const missing = tpl.slots.filter((s) => s.required && !files[s.id]);

  const index = useMemo(
    () => tpl.slots.filter((s) => files[s.id]).map((s) => `${s.label} — ${files[s.id]!.name}`),
    [tpl, files],
  );

  async function generate() {
    setError("");
    setDone("");
    if (missing.length) {
      setError(`Falta: ${missing.map((s) => s.label).join(", ")}`);
      return;
    }
    setBusy(true);
    try {
      const packed = tpl.slots
        .filter((s) => files[s.id])
        .map((s) => ({ label: s.label, file: files[s.id]! }));
      const bytes = await buildExpedientePdf({
        title: tpl.name,
        subtitle: tpl.company,
        studio: state.producer.studioName,
        clientLine: client
          ? `${fullName(client)}  ·  DNI ${client.dni}  ·  ${client.phone}`
          : "Cliente sin ficha (expediente suelto)",
        index,
        files: packed,
        logoDataUrl: state.bot.studioLogo,
      });
      const stamp = new Date().toISOString().slice(0, 10);
      const filename = `${tpl.company.replace(/\s+/g, "-")}_${client?.lastName ?? "expediente"}_${stamp}.pdf`;
      downloadPdf(bytes, filename);
      if (client) {
        addDocument({
          id: crypto.randomUUID(),
          clientId: client.id,
          type: "certificado",
          name: filename,
          uploadedAt: new Date().toISOString(),
          sizeLabel: `${Math.max(1, Math.round(bytes.length / 1024))} KB`,
        });
      }
      setDone(`Listo: ${filename}. Un solo PDF para el portal.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pude armar el PDF.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="max-w-2xl">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold">El trámite que más odian</p>
        <h2 className="font-serif text-3xl">Armá el PDF que la compañía sí toma</h2>
        <p className="mt-2 text-sm text-ink-soft">
          Si el cliente las manda por WhatsApp, Lía las arma sola y las deja en la ficha. Esta
          pantalla es para cuando te las pasaron por otro lado (mail, Drive, el escritorio).
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {PACK_TEMPLATES.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTplId(t.id);
              setFiles({});
              setError("");
              setDone("");
            }}
            className="text-left"
          >
            <Card className={`h-full p-4 ${tplId === t.id ? "border-gold" : ""}`}>
              <Badge tone={t.company.includes("SMG") ? "gold" : "forest"}>{t.company}</Badge>
              <p className="mt-2 font-medium">{t.name}</p>
              <p className="mt-1 text-sm text-ink-soft">{t.why}</p>
            </Card>
          </button>
        ))}
      </div>

      <Card className="space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cliente (opcional, queda en la bóveda)">
            <select className={inputClass} value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Expediente suelto</option>
              {state.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {fullName(c)} · {c.dni}
                </option>
              ))}
            </select>
          </Field>
          <div className="rounded-md bg-paper-2 p-3 text-sm text-ink-soft">
            Acepta JPG, PNG, WEBP, HEIC (iPhone) o PDF. WhatsApp manda fotos: las arrastrás acá y sale un A4.
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {tpl.slots.map((slot) => (
            <label key={slot.id} className="block rounded-md border border-line bg-white p-3">
              <span className="text-sm font-medium">
                {slot.label} {slot.required ? <span className="text-gold">*</span> : null}
              </span>
              {slot.hint ? <p className="text-xs text-ink-soft">{slot.hint}</p> : null}
              <input
                type="file"
                accept="image/*,image/heic,image/heif,.heic,.heif,application/pdf"
                className="mt-2 block w-full text-xs"
                onChange={(e) => setFiles((prev) => ({ ...prev, [slot.id]: e.target.files?.[0] }))}
              />
              {files[slot.id] && <p className="mt-1 truncate text-xs text-forest">{files[slot.id]!.name}</p>}
            </label>
          ))}
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
        {done && <p className="text-sm text-forest">{done}</p>}

        <div className="flex flex-wrap gap-2">
          <Button onClick={generate} disabled={busy}>
            {busy ? "Armando…" : "Descargar PDF único"}
          </Button>
          {client && (
            <Link to={`/clientes/${client.id}`}>
              <Button variant="ghost">Ver ficha 360°</Button>
            </Link>
          )}
        </div>
      </Card>
    </div>
  );
}
