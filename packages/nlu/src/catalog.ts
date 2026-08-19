export type PolicyType =
  | "vida"
  | "auto"
  | "moto"
  | "hogar"
  | "comercio"
  | "art"
  | "salud"
  | "ap"
  | "viajes"
  | "caucion";

export const POLICY_LABEL: Record<PolicyType, string> = {
  vida: "Vida",
  auto: "Automotor",
  moto: "Moto",
  hogar: "Hogar",
  comercio: "Comercio",
  art: "ART",
  salud: "Salud",
  ap: "Acc. personales",
  viajes: "Viajero",
  caucion: "Caución",
};

export const ALL_RAMOS: PolicyType[] = [
  "vida",
  "auto",
  "moto",
  "hogar",
  "comercio",
  "art",
  "salud",
  "ap",
  "viajes",
  "caucion",
];

export type RamoPlaybook = {
  id: PolicyType;
  label: string;
  whatClientSays: string;
  keywords: RegExp;
  assistanceLabel: string;
  botAsk: string;
  firstStep: string;
};

export const RAMO_PLAYBOOK: RamoPlaybook[] = [
  {
    id: "auto",
    label: "Automotor",
    whatClientSays: "grúa, choque, auxilio, patente",
    keywords: /grua|auxilio|remolque|choque|patente|auto|automotor|siniestro auto/,
    assistanceLabel: "Auxilio mecánico / grúa",
    botAsk: "grúa",
    firstStep: "Patente, póliza y lugar. No admitas culpabilidad. Denuncia dentro de 72 hs.",
  },
  {
    id: "moto",
    label: "Moto",
    whatClientSays: "moto, casco, caída",
    keywords: /\bmoto\b|motovehiculo|casco/,
    assistanceLabel: "Auxilio moto",
    botAsk: "auxilio moto",
    firstStep: "Patente y registro. Si hay lesionados, prioridad médica y después la denuncia.",
  },
  {
    id: "hogar",
    label: "Hogar",
    whatClientSays: "plomero, cerrajero, granizo, incendio",
    keywords: /hogar|plomer|cerrajer|electricidad|granizo|inund|incendio|gasista|techo|caneria/,
    assistanceLabel: "Asistencia al hogar",
    botAsk: "plomero / cerrajero",
    firstStep: "Fotos del daño el mismo día. No contrates por tu cuenta si querés reintegro: primero el 0800.",
  },
  {
    id: "comercio",
    label: "Comercio",
    whatClientSays: "vidriera, incendio del local, RC",
    keywords: /comercio|local|vidriera|consorcio|responsable civil|\brc\b/,
    assistanceLabel: "Urgencias comercio",
    botAsk: "siniestro comercio",
    firstStep: "Cerrar el local si hay riesgo. Fotos, denuncia y aviso a la compañía antes de reparar.",
  },
  {
    id: "vida",
    label: "Vida",
    whatClientSays: "beneficiarios, fallecimiento, certificado",
    keywords: /vida|fallec|beneficiar|sepelio|invalidez|internacion vida/,
    assistanceLabel: "Atención vida",
    botAsk: "vida / beneficiarios",
    firstStep:
      "No se informan beneficiarios por chat. Pedí DNI frente y dorso + medio de pago. El productor arma un PDF único para el portal (SMG LIFE y el resto).",
  },
  {
    id: "art",
    label: "ART",
    whatClientSays: "accidente laboral, denuncia ART",
    keywords: /\bart\b|laboral|trabajo|obra|emplead/,
    assistanceLabel: "Emergencia ART",
    botAsk: "ART",
    firstStep:
      "Denuncia inmediata. CUIL, lugar del hecho y testigos. Superintendencia de Riesgos del Trabajo: 0800-666-6778 si la ART no atiende.",
  },
  {
    id: "salud",
    label: "Salud",
    whatClientSays: "urgencia médica, cartilla, internación",
    keywords: /salud|medico|cartilla|clinica|prepaga|urgencia medica/,
    assistanceLabel: "Urgencias salud",
    botAsk: "salud / cartilla",
    firstStep: "Cartilla y número de afiliado. Internación: avisar antes si no es emergencia vital.",
  },
  {
    id: "ap",
    label: "Accidentes personales",
    whatClientSays: "accidente, fractura, deportes",
    keywords: /accidente personal|\bap\b|fractura|deport/,
    assistanceLabel: "AP — denuncia",
    botAsk: "accidente personal",
    firstStep: "Certificado médico, DNI y póliza. Plazo típico 72 hs para denunciar.",
  },
  {
    id: "viajes",
    label: "Viajero",
    whatClientSays: "asistencia en el exterior, vuelo, enfermedad",
    keywords: /viaje|viajero|exterior|aeropuerto|vuelo|asistencia en viaje/,
    assistanceLabel: "Asistencia al viajero",
    botAsk: "viajero",
    firstStep: "Llamar al 0800 o al reverse charge ANTES de pagar un médico. Número de póliza y pasaporte.",
  },
  {
    id: "caucion",
    label: "Caución",
    whatClientSays: "garantía, contrato, licitación",
    keywords: /caucion|garantia|licitacion/,
    assistanceLabel: "Mesa de caución",
    botAsk: "caución",
    firstStep: "No hay grúa: es un contrato. Pedí el número de póliza y derivá al productor.",
  },
];

export type AssistanceLine = {
  company: string;
  ramo: PolicyType;
  assistance: string;
  claims: string;
  notes: string;
};

export const ASSISTANCE_LINES: AssistanceLine[] = [
  { company: "Sancor Seguros", ramo: "auto", assistance: "0800-333-2766", claims: "0800-777-4643", notes: "Patente y póliza." },
  { company: "Sancor Seguros", ramo: "hogar", assistance: "0800-777-8888", claims: "0800-777-2424", notes: "Plomería, cerrajería, electricidad." },
  { company: "Sancor Seguros", ramo: "vida", assistance: "0800-777-2424", claims: "0800-777-2424", notes: "Beneficiarios solo con el productor." },
  { company: "Sancor Seguros", ramo: "art", assistance: "0800-444-4278", claims: "0800-444-4278", notes: "Prevención ART. CUIL del trabajador." },
  { company: "Federación Patronal", ramo: "auto", assistance: "0800-222-0022", claims: "0800-333-3030", notes: "Auxilio 4129-8100 CABA." },
  { company: "Federación Patronal", ramo: "comercio", assistance: "0800-333-3030", claims: "0800-333-3030", notes: "Fotos y cierre preventivo del local." },
  { company: "Federación Patronal", ramo: "art", assistance: "0800-222-1400", claims: "0800-222-1400", notes: "Denuncia inmediata." },
  { company: "Federación Patronal", ramo: "vida", assistance: "0800-333-3030", claims: "0800-333-3030", notes: "Certificado de cobertura al productor." },
  { company: "La Caja", ramo: "auto", assistance: "0800-888-2252", claims: "0810-555-2252", notes: "También por la app." },
  { company: "La Caja", ramo: "hogar", assistance: "0800-888-2252", claims: "0810-555-2252", notes: "Granizo: fotos el mismo día." },
  { company: "La Caja", ramo: "vida", assistance: "0810-555-2252", claims: "0810-555-2252", notes: "No informar beneficiarios por WhatsApp." },
  { company: "Zurich", ramo: "auto", assistance: "0800-222-9874", claims: "0800-222-0940", notes: "Flotas: número de ítem." },
  { company: "Zurich", ramo: "hogar", assistance: "0800-222-1600", claims: "0800-333-9874", notes: "Zurihelp: plomería, gas, cerrajería." },
  { company: "Zurich", ramo: "vida", assistance: "0800-333-9874", claims: "0800-333-9874", notes: "Opción 4 siniestros, lun-vie." },
  { company: "Allianz", ramo: "auto", assistance: "0800-888-0018", claims: "0800-888-0018", notes: "Mismo 0800 auxilio y denuncia." },
  { company: "Allianz", ramo: "hogar", assistance: "0800-888-0018", claims: "0800-888-0018", notes: "Granizo: techo y canaletas." },
  { company: "Allianz", ramo: "vida", assistance: "0800-888-0018", claims: "0800-888-0018", notes: "Enfermedad grave: certificado médico." },
  { company: "Provincia Seguros", ramo: "auto", assistance: "0800-777-7788", claims: "0800-333-3200", notes: "Interior: sucursal del asegurado." },
  { company: "Provincia Seguros", ramo: "vida", assistance: "0800-333-3200", claims: "0800-333-3200", notes: "Vida colectivo: certificado." },
  { company: "Provincia Seguros", ramo: "hogar", assistance: "0800-777-7788", claims: "0800-333-3200", notes: "Combinado familiar." },
  { company: "Rivadavia", ramo: "auto", assistance: "0800-666-6789", claims: "0810-333-7482", notes: "Muy usada en interior." },
  { company: "Rivadavia", ramo: "hogar", assistance: "0800-333-7482", claims: "0810-333-7482", notes: "Asistencia domiciliaria." },
  { company: "Mercantil Andina", ramo: "auto", assistance: "0800-777-2634", claims: "0800-777-6262", notes: "Confirmar sucursal." },
  { company: "Mercantil Andina", ramo: "art", assistance: "0800-222-0202", claims: "0800-555-2552", notes: "Andina ART." },
  { company: "Mercantil Andina", ramo: "vida", assistance: "0800-777-6262", claims: "0800-777-6262", notes: "Mesa de vida." },
  { company: "SMG LIFE", ramo: "vida", assistance: "0810-222-7645", claims: "0810-222-7645", notes: "CAP productores 0810-666-7645. Portal: un solo PDF con DNI y tarjeta frente/dorso." },
  { company: "SMG Seguros", ramo: "auto", assistance: "0800-222-7854", claims: "0800-222-7854", notes: "Generales. App Swiss Medical Seguros." },
  { company: "SMG Seguros", ramo: "hogar", assistance: "0800-222-7854", claims: "0800-222-7854", notes: "Combinado familiar SMG." },
  { company: "Swiss Medical ART", ramo: "art", assistance: "0800-222-7854", claims: "0800-222-7854", notes: "Denuncia inmediata. App ART Trabajadores." },
];

export function playbook(ramo: PolicyType) {
  return RAMO_PLAYBOOK.find((r) => r.id === ramo);
}

export function lineFor(company: string, ramo: PolicyType) {
  return ASSISTANCE_LINES.find((l) => l.company === company && l.ramo === ramo);
}

export function detectRamo(text: string, active: PolicyType[]): PolicyType | undefined {
  const hits = RAMO_PLAYBOOK.filter((r) => active.includes(r.id) && r.keywords.test(text));
  if (hits.length === 1) return hits[0].id;
  if (hits.length > 1) {
    const auto = hits.find((h) => h.id === "auto");
    return auto?.id ?? hits[0].id;
  }
  return undefined;
}

export function ramoMenu(active: PolicyType[]) {
  return RAMO_PLAYBOOK.filter((r) => active.includes(r.id))
    .map((r) => r.botAsk)
    .slice(0, 6)
    .join(", ");
}

export function craneNumber(company: string, extra?: Record<string, string>): string | undefined {
  const exact = lineFor(company, "auto")?.assistance ?? extra?.[company];
  if (exact) return exact;
  const needle = company.toLowerCase();
  const fromCatalog = ASSISTANCE_LINES.find(
    (l) =>
      l.ramo === "auto" &&
      (l.company.toLowerCase().includes(needle) || needle.includes(l.company.toLowerCase())),
  );
  if (fromCatalog) return fromCatalog.assistance;
  const fromExtra = Object.entries(extra ?? {}).find(
    ([k]) => k.toLowerCase().includes(needle) || needle.includes(k.toLowerCase()),
  );
  return fromExtra?.[1];
}
