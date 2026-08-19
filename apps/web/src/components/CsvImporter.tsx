import { useCallback, useState, type DragEvent } from "react";
import Papa from "papaparse";
import { Upload } from "lucide-react";
import { useLia } from "@/context/LiaContext";
import { Button, Card, cn, Modal } from "@/components/ui";
import { normalizePhoneAR } from "@/lib/format";
import {
  buildCarteraImport,
  CARTERA_TEMPLATE_CSV,
  exportCarteraCsv,
  normalizeRows,
  type CarteraRow,
} from "@/lib/importCartera";

type Props = {
  onClose?: () => void;
  compact?: boolean;
};

export function CsvImporter({ onClose, compact }: Props) {
  const { state, importCartera } = useLia();
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<CarteraRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [done, setDone] = useState<{ clients: number; policies: number } | null>(null);

  const ingest = useCallback((file: File) => {
    setError("");
    setDone(null);
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
      setError("Excel en crudo no entra. En el portal: Guardar como CSV (separado por comas).");
      return;
    }
    setBusy(true);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const csvString = String(reader.result ?? "");
      Papa.parse<Record<string, unknown>>(csvString, {
        header: true,
        skipEmptyLines: "greedy",
        complete: (res) => {
          setBusy(false);
          const fields = res.meta.fields?.filter(Boolean) ?? [];
          if (!fields.length) {
            setError("No leí encabezados. ¿El CSV tiene la primera fila con Nombre Completo, DNI, etc.?");
            return;
          }
          const rows = normalizeRows(res.data, fields).filter(
            (r) => r.nombre || r.dni || r.telefono || r.poliza,
          );
          if (!rows.length) {
            setError("El archivo no tiene filas con datos. Bajá la plantilla y copiá el formato del portal.");
            return;
          }
          setPreview(rows);
        },
        error: () => {
          setBusy(false);
          setError("No pude leer el CSV. Probá exportarlo de nuevo desde el portal.");
        },
      });
    };
    reader.onerror = () => {
      setBusy(false);
      setError("No pude abrir el archivo. Probá de nuevo.");
    };
    reader.readAsText(file, "ISO-8859-1");
  }, []);

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDrag(false);
    const file = e.dataTransfer.files[0];
    if (file) ingest(file);
  }

  async function confirm() {
    if (!preview?.length) return;
    setBusy(true);
    try {
      const result = buildCarteraImport(
        state,
        preview.map((r) => ({ ...r, telefono: r.telefono ? normalizePhoneAR(r.telefono) : r.telefono })),
      );
      if (!result.clients.length && !result.policies.length) {
        setError(
          result.skippedPolicies
            ? "Nada nuevo: esas pólizas ya estaban en la cartera."
            : "No pude armar clientes ni pólizas con esas filas.",
        );
        return;
      }
      await importCartera(result.clients, result.policies);
      setDone({ clients: result.clients.length, policies: result.policies.length });
      setPreview(null);
    } catch {
      setError("Falló el volcado a la cartera. Probá de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  function downloadCsv(content: string, name: string) {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadTemplate() {
    downloadCsv(CARTERA_TEMPLATE_CSV, "plantilla-cartera-lia.csv");
  }

  function downloadExport() {
    downloadCsv(exportCarteraCsv(state), "cartera-lia.csv");
  }

  if (done) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-gold/40 bg-gold/10 p-5">
          <p className="font-serif text-2xl">¡Éxito! Se importaron {done.clients} clientes y {done.policies} pólizas nuevas.</p>
          <p className="mt-2 text-sm text-ink-soft">
            Ya están en Clientes y en IndexedDB. Lía los usa en Hoy, cobranzas y WhatsApp.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setDone(null);
              setFileName("");
            }}
          >
            Importar otro
          </Button>
          {onClose ? <Button onClick={onClose}>Listo</Button> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!compact && (
        <div>
          <h3 className="font-serif text-xl">Importar cartera</h3>
          <p className="mt-1 text-sm text-ink-soft">
            CSV del portal: Nombre Completo, Teléfono, DNI, Ramo, Compañía, Número de Póliza,
            Vencimiento.
          </p>
        </div>
      )}

      <div
        onDragEnter={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className={cn(
          "grid place-items-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition",
          drag ? "border-gold bg-gold/15" : "border-line bg-paper-2",
        )}
      >
        <Upload className={cn("mb-3", drag ? "text-gold" : "text-ink-soft")} size={28} />
        <p className="font-medium">Soltá el CSV acá</p>
        <p className="mt-1 text-sm text-ink-soft">o elegilo desde el escritorio</p>
        <label className="mt-4 inline-flex cursor-pointer rounded-md bg-forest px-4 py-2 text-sm text-paper">
          Elegir archivo
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) ingest(file);
              e.target.value = "";
            }}
          />
        </label>
        {fileName ? <p className="mt-3 text-xs text-ink-soft">{fileName}</p> : null}
      </div>

      {busy && <p className="text-sm text-ink-soft">Leyendo…</p>}
      {error ? <p className="text-sm text-gold">{error}</p> : null}

      {preview && (
        <Card className="space-y-3 p-4">
          <p className="text-sm">
            {preview.length} fila{preview.length === 1 ? "" : "s"} listas. Los DNI o teléfonos que ya
            existen se reusan; no duplicamos al cliente.
          </p>
          <div className="max-h-40 overflow-auto text-xs text-ink-soft">
            {preview.slice(0, 8).map((r, i) => (
              <p key={`${r.dni}-${i}`}>
                {r.nombre || "Sin nombre"} · {r.ramo || "ramo"} · {r.compania || "cía"} · {r.poliza || "s/n"}
              </p>
            ))}
            {preview.length > 8 ? <p>… y {preview.length - 8} más</p> : null}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPreview(null)}>
              Cancelar
            </Button>
            <Button variant="gold" disabled={busy} onClick={() => void confirm()}>
              Volcar a la cartera
            </Button>
          </div>
        </Card>
      )}

      <div className="flex flex-wrap gap-3">
        <button type="button" className="text-xs text-gold" onClick={downloadTemplate}>
          Descargar plantilla CSV
        </button>
        {state.policies.length > 0 && (
          <button type="button" className="text-xs text-gold" onClick={downloadExport}>
            Exportar cartera actual
          </button>
        )}
      </div>
    </div>
  );
}

export function ImportCarteraModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal onBackdrop={onClose}>
      <CsvImporter onClose={onClose} />
      <div className="flex justify-end">
        <Button variant="ghost" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </Modal>
  );
}
