export type EmergencyLine = {
  company: string;
  crane: string;
  claims: string;
  notes: string;
};

export const EMERGENCIES: EmergencyLine[] = [
  { company: "Sancor Seguros", crane: "0800-777-8888", claims: "0800-777-2424", notes: "Auxilio 24 hs. Pedir póliza y patente." },
  { company: "Federación Patronal", crane: "0800-333-3030", claims: "0800-333-3030", notes: "Mismo 0800 para grúa y denuncia." },
  { company: "La Caja", crane: "0800-888-2252", claims: "0810-555-2252", notes: "App La Caja también denuncia siniestro." },
  { company: "Zurich", crane: "0800-222-9874", claims: "0800-222-0940", notes: "Flotas: pedir número de ítem." },
  { company: "Allianz", crane: "0800-888-0018", claims: "0800-888-0018", notes: "Granizo: fotos del techo el mismo día." },
  { company: "Provincia Seguros", crane: "0800-777-7788", claims: "0800-333-3200", notes: "Vida colectivo: certificado de cobertura." },
  { company: "Rivadavia", crane: "0800-333-7482", claims: "0810-333-7482", notes: "Muy usada en interior." },
  { company: "Mercantil Andina", crane: "0800-777-6262", claims: "0800-777-6262", notes: "Confirmar sucursal del asegurado." },
];
