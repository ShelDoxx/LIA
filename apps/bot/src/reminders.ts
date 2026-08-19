import { paymentReminder } from "./nlu.js";
import { sendText } from "./whatsapp.js";

export type DueRow = {
  phone: string;
  firstName: string;
  dueDate: string;
  ramo: string;
  cuponUrl: string;
  daysUntil: number;
};

/** Llamar desde un cron diario (Cloud Scheduler / node-cron). */
export async function runPaymentReminders(rows: DueRow[], daysBefore = 3) {
  const due = rows.filter((r) => r.daysUntil === daysBefore);
  const results = [];
  for (const r of due) {
    const body = paymentReminder(r.firstName, r.dueDate, r.ramo, r.cuponUrl);
    results.push(await sendText(r.phone, body));
  }
  return { sent: results.length };
}

export async function runBirthdayGreetings(
  people: Array<{ phone: string; firstName: string }>,
) {
  let sent = 0;
  for (const p of people) {
    await sendText(
      p.phone,
      `${p.firstName}, ¡feliz cumpleaños! Que este año tu tranquilidad viaje con vos. Cualquier consulta de tu póliza, acá estoy las 24 hs. — Lía`,
    );
    sent += 1;
  }
  return { sent };
}
