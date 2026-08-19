import { foldText } from "./fold";

export type IdentityCue =
  | { kind: "dni"; value: string }
  | { kind: "plate"; value: string }
  | { kind: "policy"; value: string }
  | { kind: "name"; firstName: string; lastName: string }
  | { kind: "yes" }
  | { kind: "no" }
  | { kind: "handoff" }
  | { kind: "none" };

export type IdentityRecord = {
  clientId: string;
  firstName: string;
  lastName: string;
  dni: string;
  plates: string[];
  policyNumbers: string[];
};

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function alnum(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export function parseIdentityCue(text: string): IdentityCue {
  const raw = text.trim();
  const t = foldText(raw);

  if (/\b(humano|productor|asesor)\b/.test(t)) return { kind: "handoff" };
  if (/^(si|sí|ok|okay|dale|listo|soy yo|correcto)\b/.test(t) && t.length < 40) return { kind: "yes" };
  if (/^(no|nop|no soy|incorrecto)\b/.test(t) && t.length < 40) return { kind: "no" };

  const plate = raw.toUpperCase().match(/\b([A-Z]{3}\s*\d{3}|[A-Z]{2}\s*\d{3}\s*[A-Z]{2})\b/);
  if (plate) return { kind: "plate", value: alnum(plate[1]) };

  const dniLabeled = raw.match(/\b(?:dni|documento)\s*[:nº°#]*\s*([\d.\s]{7,12})/i);
  if (dniLabeled) {
    const d = digits(dniLabeled[1]);
    if (d.length >= 7 && d.length <= 8) return { kind: "dni", value: d };
  }

  const onlyDigits = digits(raw);
  if (/^\d[\d.\s]+$/.test(raw) && (onlyDigits.length === 7 || onlyDigits.length === 8)) {
    return { kind: "dni", value: onlyDigits };
  }

  const polLabeled = raw.match(/\b(?:poliza|póliza|nro|n°)\s*[:#]?\s*([A-Z0-9-]{4,})/i);
  if (polLabeled) return { kind: "policy", value: alnum(polLabeled[1]) };

  const polLoose = raw.toUpperCase().match(/\b([A-Z]{1,4}[-/]?\d{2,}[-/A-Z0-9]*)\b/);
  if (polLoose && alnum(polLoose[1]).length >= 5) return { kind: "policy", value: alnum(polLoose[1]) };

  const words = raw.split(/\s+/).filter((w) => /[a-zA-ZáéíóúñÁÉÍÓÚÑ]/.test(w) && !/\d/.test(w));
  if (words.length >= 2 && words.length <= 4 && onlyDigits.length < 6) {
    return {
      kind: "name",
      firstName: words[0].replace(/,$/, ""),
      lastName: words.slice(1).join(" ").replace(/,$/, ""),
    };
  }

  return { kind: "none" };
}

export function matchIdentity(cue: IdentityCue, records: IdentityRecord[]): IdentityRecord[] {
  if (cue.kind === "dni") {
    return records.filter((r) => digits(r.dni) === cue.value);
  }
  if (cue.kind === "plate") {
    return records.filter((r) => r.plates.some((p) => alnum(p) === cue.value));
  }
  if (cue.kind === "policy") {
    return records.filter((r) => r.policyNumbers.some((n) => alnum(n) === cue.value || alnum(n).includes(cue.value)));
  }
  if (cue.kind === "name") {
    const q = foldText(`${cue.firstName} ${cue.lastName}`);
    return records.filter((r) => {
      const full = foldText(`${r.firstName} ${r.lastName}`);
      return full === q || full.includes(q) || q.includes(full);
    });
  }
  return [];
}
