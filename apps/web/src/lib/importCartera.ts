import type { Client, LiaState, Policy, PolicyStatus, PolicyType } from "@/lib/types";
import { ALL_RAMOS, POLICY_LABEL } from "@/lib/types";
import { normalizePhoneAR } from "@/lib/format";

export type CarteraRow = Record<string, string>;

export type ImportResult = {
  clients: Client[];
  policies: Policy[];
  skippedPolicies: number;
  skippedRows: number;
};

const HEADER_ALIASES: Record<string, string> = {
  nombrecompleto: "nombre",
  nombreyapellido: "nombre",
  cliente: "nombre",
  asegurado: "nombre",
  nombre: "nombre",
  telefono: "telefono",
  celular: "telefono",
  whatsapp: "telefono",
  tel: "telefono",
  dni: "dni",
  documento: "dni",
  nrodocumento: "dni",
  ramo: "ramo",
  riesgo: "ramo",
  producto: "ramo",
  cobertur: "ramo",
  compania: "compania",
  cia: "compania",
  aseguradora: "compania",
  companía: "compania",
  numerodepoliza: "poliza",
  nropoliza: "poliza",
  npoliza: "poliza",
  poliza: "poliza",
  numeropoliza: "poliza",
  vencimiento: "vencimiento",
  vigenciahasta: "vencimiento",
  findevigencia: "vencimiento",
  vto: "vencimiento",
  fechavencimiento: "vencimiento",
};

const RAMO_ALIASES: Record<string, PolicyType> = {
  auto: "auto",
  automotor: "auto",
  vehiculo: "auto",
  moto: "moto",
  motovehiculo: "moto",
  hogar: "hogar",
  combinado: "hogar",
  incendio: "hogar",
  vida: "vida",
  comercio: "comercio",
  integral: "comercio",
  art: "art",
  salud: "salud",
  ap: "ap",
  accidentespersonales: "ap",
  accidente: "ap",
  viajes: "viajes",
  viajero: "viajes",
  caucion: "caucion",
  garantia: "caucion",
};

export const CARTERA_TEMPLATE_CSV = `Nombre Completo,Teléfono,DNI,Ramo,Compañía,Número de Póliza,Vencimiento
Ana Pérez,+54 9 11 5555-2211,30.111.222,auto,Sancor Seguros,AU-IMP-1001,15/03/2027
Diego Gómez,+54 9 11 4444-8830,27.903.118,hogar,La Caja,HO-IMP-4402,02/11/2026
María López,+54 9 11 6230-1008,35.201.774,vida,SMG LIFE,VI-IMP-3309,20/08/2027
`;

export function keyHeader(raw: string) {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function mapHeaders(fields: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const field of fields) {
    const k = keyHeader(field);
    const alias =
      HEADER_ALIASES[k] ??
      Object.entries(HEADER_ALIASES).find(([aliasKey]) => k.includes(aliasKey) || aliasKey.includes(k))?.[1];
    if (alias) map[field] = alias;
  }
  return map;
}

export function dniKey(value: string) {
  return value.replace(/\D/g, "");
}

export function phoneKey(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.slice(-10);
}

export function parseVencimiento(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const isoTry = Date.parse(s);
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmy) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]);
    let y = Number(dmy[3]);
    if (y < 100) y += 2000;
    const dt = new Date(y, m - 1, d);
    if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  }
  if (!Number.isNaN(isoTry)) return new Date(isoTry).toISOString();
  return null;
}

export function parseRamo(raw: string): PolicyType {
  const k = keyHeader(raw);
  if ((ALL_RAMOS as string[]).includes(k)) return k as PolicyType;
  const hit = RAMO_ALIASES[k] ?? Object.entries(RAMO_ALIASES).find(([alias]) => k.includes(alias))?.[1];
  return hit ?? "auto";
}

function splitName(full: string) {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: "Cliente", lastName: "Importado" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function policyStatus(endDate: string): PolicyStatus {
  const end = new Date(endDate).getTime();
  const now = Date.now();
  const days = (end - now) / 86400000;
  if (days < 0) return "vencida";
  if (days <= 90) return "por_vencer";
  return "activa";
}

export function normalizeRows(raw: Record<string, unknown>[], fields: string[]): CarteraRow[] {
  const headerMap = mapHeaders(fields);
  return raw.map((row) => {
    const out: CarteraRow = {
      nombre: "",
      telefono: "",
      dni: "",
      ramo: "",
      compania: "",
      poliza: "",
      vencimiento: "",
    };
    for (const [field, value] of Object.entries(row)) {
      const key = headerMap[field];
      if (!key) continue;
      out[key] = String(value ?? "").trim();
    }
    return out;
  });
}

export function buildCarteraImport(state: LiaState, rows: CarteraRow[]): ImportResult {
  const clients = [...state.clients];
  const policies = [...state.policies];
  const newClients: Client[] = [];
  const newPolicies: Policy[] = [];
  let skippedPolicies = 0;
  let skippedRows = 0;
  const now = new Date().toISOString();

  const findClient = (dni: string, phone: string) => {
    const d = dniKey(dni);
    const p = phoneKey(phone);
    return clients.find((c) => (d && dniKey(c.dni) === d) || (p && phoneKey(c.phone) === p));
  };

  for (const row of rows) {
    if (!row.nombre && !row.dni && !row.telefono) {
      skippedRows += 1;
      continue;
    }
    if (!row.poliza && !row.compania && !row.ramo) {
      skippedRows += 1;
      continue;
    }

    let client = findClient(row.dni, row.telefono);
    if (!client) {
      const { firstName, lastName } = splitName(row.nombre || "Cliente Importado");
      client = {
        id: crypto.randomUUID(),
        firstName,
        lastName,
        dni: row.dni || "s/d",
        email: "",
        phone: normalizePhoneAR(row.telefono || ""),
        birthDate: now,
        address: "",
        city: "",
        notes: "Importado desde CSV de aseguradora.",
        family: [],
        tags: ["Importado"],
        createdAt: now,
        lastContactAt: now,
      };
      clients.unshift(client);
      newClients.push(client);
    }

    const number = row.poliza || `IMP-${client.id.slice(0, 8)}`;
    if (policies.some((p) => p.number.toLowerCase() === number.toLowerCase() && p.company === (row.compania || p.company))) {
      skippedPolicies += 1;
      continue;
    }

    const endDate = parseVencimiento(row.vencimiento) ?? new Date(Date.now() + 365 * 86400000).toISOString();
    const start = new Date(endDate);
    start.setFullYear(start.getFullYear() - 1);
    const type = parseRamo(row.ramo);
    const policy: Policy = {
      id: crypto.randomUUID(),
      clientId: client.id,
      company: row.compania || "A definir",
      type,
      number,
      status: policyStatus(endDate),
      startDate: start.toISOString(),
      endDate,
      premium: 0,
      installment: 0,
      nextDueDate: endDate,
      paymentMethod: "A definir",
      commissionRate: 0.18,
      coverage: `Importada · ${POLICY_LABEL[type]}`,
    };
    policies.unshift(policy);
    newPolicies.push(policy);
  }

  return { clients: newClients, policies: newPolicies, skippedPolicies, skippedRows };
}

function csvDate(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${d.getFullYear()}`;
  } catch {
    return "";
  }
}

function csvCell(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** CSV compatible con la plantilla de importación. */
export function exportCarteraCsv(state: LiaState): string {
  const header = "Nombre Completo,Teléfono,DNI,Ramo,Compañía,Número de Póliza,Vencimiento";
  const lines = state.policies
    .filter((p) => p.status !== "cancelada")
    .map((p) => {
      const c = state.clients.find((x) => x.id === p.clientId);
      const nombre = c ? `${c.firstName} ${c.lastName}`.trim() : "Cliente";
      return [
        csvCell(nombre),
        csvCell(c?.phone ?? ""),
        csvCell(c?.dni ?? ""),
        csvCell(p.type),
        csvCell(p.company),
        csvCell(p.number),
        csvCell(csvDate(p.endDate)),
      ].join(",");
    });
  return [header, ...lines].join("\n") + "\n";
}
