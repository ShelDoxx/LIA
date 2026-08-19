import type { PolicyType } from "@/lib/types";

export type PackSlot = {
  id: string;
  label: string;
  required: boolean;
  hint: string;
};

export type PackTemplate = {
  id: string;
  name: string;
  company: string;
  ramo: PolicyType | "mixto";
  why: string;
  slots: PackSlot[];
};

export const PACK_TEMPLATES: PackTemplate[] = [
  {
    id: "smg-life-alta",
    name: "Alta / emisión SMG LIFE",
    company: "SMG LIFE",
    ramo: "vida",
    why: "El portal de Swiss Medical toma un solo PDF. DNI y tarjeta van frente y dorso; si mandás JPG sueltos, te lo rechazan.",
    slots: [
      { id: "dni-f", label: "DNI frente", required: true, hint: "Foto o scan. JPG, PNG o PDF." },
      { id: "dni-d", label: "DNI dorso", required: true, hint: "El dorso con domicilio." },
      { id: "tarj-f", label: "Tarjeta frente", required: true, hint: "Medio de pago. SMG pide copia frente y dorso." },
      { id: "tarj-d", label: "Tarjeta dorso", required: true, hint: "Tapá el CVV si querés; el dorso igual se exige." },
      { id: "cbu", label: "CBU / extracto (si débito)", required: false, hint: "Encabezado del banco o constancia CBU." },
      { id: "solicitud", label: "Solicitud / declaración de salud", required: false, hint: "Formulario firmado, aunque sea foto." },
      { id: "uif", label: "Formulario UIF / PLA", required: false, hint: "Requerimiento legal persona humana — VIDA." },
      { id: "extra", label: "Otros (examen médico, extra)", required: false, hint: "Lo que SMG haya pedido de más." },
    ],
  },
  {
    id: "smg-life-cambio",
    name: "Cambio de tomador / medio de pago SMG",
    company: "SMG LIFE",
    ramo: "vida",
    why: "El propio formulario SMG dice: tarjeta frente y dorso, o constancia CBU. Un PDF único evita la ida y vuelta.",
    slots: [
      { id: "form", label: "Formulario firmado", required: true, hint: "Cambio de tomador o débito." },
      { id: "dni-f", label: "DNI frente (nuevo tomador)", required: true, hint: "" },
      { id: "dni-d", label: "DNI dorso", required: true, hint: "" },
      { id: "tarj-f", label: "Tarjeta frente", required: false, hint: "Si paga con tarjeta." },
      { id: "tarj-d", label: "Tarjeta dorso", required: false, hint: "" },
      { id: "cbu", label: "Constancia CBU", required: false, hint: "Si paga por cuenta." },
    ],
  },
  {
    id: "vida-generico",
    name: "Expediente de vida (cualquier compañía)",
    company: "Todas",
    ramo: "vida",
    why: "Zurich, Allianz, Sancor vida: mismo ritual de DNI + medio de pago + solicitud.",
    slots: [
      { id: "dni-f", label: "DNI frente", required: true, hint: "" },
      { id: "dni-d", label: "DNI dorso", required: true, hint: "" },
      { id: "pago", label: "Tarjeta o CBU", required: true, hint: "Frente/dorso o constancia." },
      { id: "solicitud", label: "Solicitud firmada", required: false, hint: "" },
      { id: "extra", label: "Otros", required: false, hint: "" },
    ],
  },
  {
    id: "auto",
    name: "Alta automotor",
    company: "Todas",
    ramo: "auto",
    why: "Cédula, DNI y fotos del vehículo en un solo archivo para la compañía.",
    slots: [
      { id: "dni-f", label: "DNI frente", required: true, hint: "" },
      { id: "dni-d", label: "DNI dorso", required: true, hint: "" },
      { id: "cedula", label: "Cédula verde / título", required: true, hint: "" },
      { id: "fotos", label: "Fotos del auto", required: false, hint: "Podés subir varias, una por archivo." },
      { id: "extra", label: "Otros", required: false, hint: "" },
    ],
  },
  {
    id: "libre",
    name: "PDF libre",
    company: "Todas",
    ramo: "mixto",
    why: "Tirás fotos, WhatsApp y PDFs sueltos; Lía te devuelve un solo archivo A4.",
    slots: [
      { id: "p1", label: "Documento 1", required: true, hint: "JPG, PNG, WEBP o PDF." },
      { id: "p2", label: "Documento 2", required: false, hint: "" },
      { id: "p3", label: "Documento 3", required: false, hint: "" },
      { id: "p4", label: "Documento 4", required: false, hint: "" },
      { id: "p5", label: "Documento 5", required: false, hint: "" },
      { id: "p6", label: "Documento 6", required: false, hint: "" },
    ],
  },
];
