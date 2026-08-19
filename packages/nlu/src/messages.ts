import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

export function generateRetentionMessage(clientName: string, yearsActive: number): string {
  return `¡Hola ${clientName}! 🌟 Hoy se cumplen ${yearsActive} años desde que tomaste una gran decisión para proteger tu futuro y el de tu familia. Tu póliza de vida sigue activa y tu capital se sigue consolidando. Tu productor me pidió que te salude y te pregunte: ¿Te gustaría que agendemos una llamada cortita de 10 minutos para revisar cómo vienen tus números y ganarle a la inflación?`;
}

export function generateDunningMessage(clientName: string, nextDueDate: string): string {
  const fecha = format(parseISO(nextDueDate), "d 'de' MMMM yyyy", { locale: es });
  return `¡Hola ${clientName}! Lía por acá, la asistente de tu productor. Te escribo cortito para avisarte que el ${fecha} venció la cuota de tu póliza. Para que no te quedes sin cobertura, avisame si tuviste algún inconveniente con el pago o pasame el comprobante por acá y yo lo anoto. ¡Gracias!`;
}

export function generateStuckClaimMessage(clientName: string): string {
  return `¡Hola ${clientName}! Te escribo de parte de tu productor. Estaba revisando tu siniestro y vi que sigue en análisis. ¿Te llegaron a contactar los inspectores de la compañía o seguimos a la espera? Avisame así lo empujamos.`;
}

export type RenewalBucket = "90" | "60" | "30" | "7" | "overdue";

export function generateRenewalMessage(
  clientName: string,
  ramoLabel: string,
  endDateIso: string,
  bucket: RenewalBucket,
): string {
  const fecha = format(parseISO(endDateIso), "d 'de' MMMM yyyy", { locale: es });
  if (bucket === "90") {
    return `¡Hola ${clientName}! Soy Lía del estudio. En unos 90 días vence tu ${ramoLabel} (${fecha}). ¿Revisamos coberturas y sumas antes de que la compañía arme la renovación? Un audio tuyo cierra.`;
  }
  if (bucket === "60") {
    return `¡Hola ${clientName}! Tu ${ramoLabel} entra en ventana de renovación — vence el ${fecha}. ¿Armamos propuesta para que no se te caiga la póliza?`;
  }
  if (bucket === "30") {
    return `¡Hola ${clientName}! Tu ${ramoLabel} vence el ${fecha}. Si renovamos ahora mantenemos condiciones. ¿Seguimos por acá?`;
  }
  if (bucket === "7") {
    return `¡Hola ${clientName}! Quedan pocos días para el vencimiento de tu ${ramoLabel} (${fecha}). No dejemos que se caiga la cobertura — avisame y lo cerramos hoy.`;
  }
  return `¡Hola ${clientName}! Tu ${ramoLabel} venció el ${fecha}. Todavía podemos reactivar o renovar sin quedarte descubierto. Escribime y lo vemos con tu productor.`;
}

export function generatePaymentReminderMessage(
  clientName: string,
  ramoLabel: string,
  nextDueDateIso: string,
): string {
  const fecha = format(parseISO(nextDueDateIso), "d 'de' MMMM yyyy", { locale: es });
  return `¡Hola ${clientName}! Te escribo de Lía, del estudio de tu productor. El ${fecha} vence la cuota de tu ${ramoLabel}. Si ya pagaste, mandame el comprobante por acá. Si necesitás el cupón, avisame.`;
}

export function paymentReminder(firstName: string, dueDate: string, ramo: string, cuponUrl: string) {
  const body = generatePaymentReminderMessage(firstName, ramo, dueDate);
  return cuponUrl ? `${body} Cupón: ${cuponUrl}` : body;
}
