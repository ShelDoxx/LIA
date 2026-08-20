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

export type PolicyStatus = "activa" | "por_vencer" | "vencida" | "cancelada";
export type ClaimStatus = "denuncia" | "inspeccion" | "liquidacion" | "cerrado";
export type DocType = "poliza" | "dni" | "certificado" | "cupon" | "expediente" | "otro";
export type InvoiceStatus = "pendiente" | "emitida" | "cobrada";

import type { Subscription } from "@/lib/billing";

export type Producer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  studioName: string;
  matricula: string;
  plan: "estudio" | "demo";
  liaGreeting: string;
  liaSignOff: string;
  activeRamos: PolicyType[];
  subscription?: Subscription;
  firebaseUid?: string;
  /** ID de usuario en el bot (OTP / sesión Lía) */
  liaUserId?: string;
};

export type QuotePipeline = "general" | "vida";

export type QuoteStatus =
  | "borrador"
  | "enviada"
  | "seguimiento"
  | "ganada"
  | "perdida"
  | "anf"
  | "propuesta"
  | "examenes"
  | "emitida";

export type Quote = {
  id: string;
  clientId: string;
  ramo: PolicyType;
  status: QuoteStatus;
  companies: string[];
  createdAt: string;
  pipelineType?: "general" | "vida";
  sumaAsegurada?: number;
  estimatedPremium?: number;
  notes?: string;
};

export type FamilyMember = {
  id: string;
  relation: "conyuge" | "hijo" | "padre" | "otro";
  firstName: string;
  lastName: string;
  birthDate: string;
  dni?: string;
  hasLifePolicy: boolean;
};

export type Client = {
  id: string;
  firstName: string;
  lastName: string;
  dni: string;
  email: string;
  phone: string;
  birthDate: string;
  address: string;
  city: string;
  notes: string;
  family: FamilyMember[];
  createdAt: string;
  tags: string[];
  lastContactAt: string;
  referredBy?: string;
};

export type Policy = {
  id: string;
  clientId: string;
  company: string;
  type: PolicyType;
  number: string;
  status: PolicyStatus;
  startDate: string;
  endDate: string;
  premium: number;
  installment: number;
  nextDueDate: string;
  paymentMethod: string;
  commissionRate: number;
  coverage: string;
  plate?: string;
  updatedAt?: string;
};

export type Claim = {
  id: string;
  policyId: string;
  clientId: string;
  date: string;
  description: string;
  status: ClaimStatus;
  amount?: number;
  updatedAt: string;
};

export type EndorsementType = "vehiculo" | "suma_asegurada" | "cobertura" | "otro";
export type EndorsementStatus = "pendiente" | "procesando" | "completado";

export type Endorsement = {
  id: string;
  policyId: string;
  clientId: string;
  type: EndorsementType;
  status: EndorsementStatus;
  createdAt: string;
  description: string;
};

export type VaultDoc = {
  id: string;
  clientId: string;
  policyId?: string;
  type: DocType;
  name: string;
  uploadedAt: string;
  sizeLabel: string;
  dataUrl?: string;
  source?: "whatsapp" | "manual" | "expediente";
  archived?: boolean;
};

export type CommissionRow = {
  id: string;
  company: string;
  period: string;
  produced: number;
  received: number;
  pending: number;
  invoiceStatus: InvoiceStatus;
  invoiceRef?: string;
};

export type ChatMessage = {
  id: string;
  from: "client" | "lia" | "producer";
  text: string;
  at: string;
  kind?: "text" | "image" | "file" | "expediente";
  imageDataUrl?: string;
  docId?: string;
};

export type PendingPhoto = {
  label: string;
  dataUrl: string;
  name: string;
  kind: "image" | "file";
};

export type Conversation = {
  id: string;
  clientId: string;
  phone: string;
  lastAt: string;
  unread: number;
  messages: ChatMessage[];
  pendingPhotos?: PendingPhoto[];
  botPaused?: boolean;
};

export type BotSettings = {
  connected: boolean;
  paymentReminderDays: number;
  birthdayGreetings: boolean;
  selfService: boolean;
  cranePhones: Record<string, string>;
  studioLogo?: string;
  /** Envía WhatsApp real al teléfono del cliente (bot en :8787). */
  whatsappOutbound?: boolean;
  metaAccessToken?: string;
  metaPhoneNumberId?: string;
  metaVerifyToken?: string;
};

// v7 state shape
export type LiaState = {
  producer: Producer;
  clients: Client[];
  policies: Policy[];
  claims: Claim[];
  documents: VaultDoc[];
  commissions: CommissionRow[];
  conversations: Conversation[];
  quotes: Quote[];
  endorsements: Endorsement[];
  bot: BotSettings;
  doneAgenda: string[];
  lastDailyRun?: string;
  lastDailySent?: number;
  lastWaSent?: number;
  automationLog?: string[];
};

export const CLAIM_LABEL: Record<ClaimStatus, string> = {
  denuncia: "Denuncia",
  inspeccion: "Inspección",
  liquidacion: "Liquidación",
  cerrado: "Cerrado",
};

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

export const ENDORSEMENT_TYPE_LABEL: Record<EndorsementType, string> = {
  vehiculo: "Cambio de vehículo",
  suma_asegurada: "Suma asegurada",
  cobertura: "Cobertura",
  otro: "Otro",
};

export const ENDORSEMENT_STATUS_LABEL: Record<EndorsementStatus, string> = {
  pendiente: "Pendiente",
  procesando: "En proceso",
  completado: "Completado",
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
