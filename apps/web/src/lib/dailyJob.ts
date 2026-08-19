import {
  generateDunningMessage,
  generatePaymentReminderMessage,
  generateRenewalMessage,
  type RenewalBucket,
} from "@/data/ramos";
import { isBirthdayToday, daysUntil } from "@/lib/format";
import type { OutboundMessage } from "@/lib/outbound";
import type { ChatMessage, Conversation, LiaState } from "@/lib/types";
import { POLICY_LABEL } from "@/lib/types";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function hasLogged(state: LiaState, key: string) {
  return (state.automationLog ?? []).includes(key);
}

function withLog(state: LiaState, key: string): LiaState {
  const log = state.automationLog ?? [];
  if (log.includes(key)) return state;
  return { ...state, automationLog: [...log.slice(-200), key] };
}

function injectLia(state: LiaState, clientId: string, text: string): LiaState {
  const who = state.clients.find((c) => c.id === clientId);
  if (!who) return state;
  const existing = state.conversations.find((c) => c.clientId === clientId);
  if (existing?.messages.some((m) => m.from === "lia" && m.text === text)) return state;

  const msg: ChatMessage = {
    id: crypto.randomUUID(),
    from: "lia",
    text,
    at: new Date().toISOString(),
  };

  if (!existing) {
    const conv: Conversation = {
      id: crypto.randomUUID(),
      clientId,
      phone: who.phone,
      lastAt: msg.at,
      unread: 0,
      messages: [msg],
    };
    return {
      ...state,
      conversations: [conv, ...state.conversations],
      clients: state.clients.map((c) =>
        c.id === clientId ? { ...c, lastContactAt: msg.at } : c,
      ),
    };
  }

  const last = msg;
  return {
    ...state,
    conversations: state.conversations.map((c) =>
      c.id === existing.id
        ? {
            ...c,
            lastAt: last.at,
            unread: 0,
            messages: [...c.messages, msg],
          }
        : c,
    ),
    clients: state.clients.map((c) =>
      c.id === clientId ? { ...c, lastContactAt: msg.at } : c,
    ),
  };
}

/** Día exacto de hito 90-60-30-7 o vencida (mora diaria). */
function renewalMilestone(daysUntilEnd: number): RenewalBucket | null {
  if (daysUntilEnd < 0) return "overdue";
  if (daysUntilEnd === 7) return "7";
  if (daysUntilEnd === 30) return "30";
  if (daysUntilEnd === 60) return "60";
  if (daysUntilEnd === 90) return "90";
  return null;
}

export type DailyAutomationResult = {
  state: LiaState;
  sent: number;
  outbound: OutboundMessage[];
};

export function runDailyAutomations(state: LiaState): DailyAutomationResult {
  const today = todayKey();
  if (state.lastDailyRun === today) {
    return { state, sent: state.lastDailySent ?? 0, outbound: [] };
  }

  let next: LiaState = { ...state, lastDailyRun: today, lastDailySent: 0 };
  let sent = 0;
  const outbound: OutboundMessage[] = [];
  const reminderDays = state.bot.paymentReminderDays ?? 3;

  function dispatch(clientId: string, text: string, key: string) {
    next = injectLia(next, clientId, text);
    next = withLog(next, key);
    sent += 1;
    const who = next.clients.find((c) => c.id === clientId);
    if (who?.phone) outbound.push({ phone: who.phone, text, key });
  }

  for (const p of next.policies.filter((x) => x.status !== "cancelada")) {
    const c = next.clients.find((x) => x.id === p.clientId);
    if (!c) continue;

    const dDue = daysUntil(p.nextDueDate);
    if (dDue < 0) {
      const key = `mora:${p.id}:${today}`;
      if (!hasLogged(next, key)) {
        dispatch(p.clientId, generateDunningMessage(c.firstName, p.nextDueDate), key);
      }
    } else if (dDue > 0 && dDue <= reminderDays) {
      const key = `aviso:${p.id}:${today}`;
      if (!hasLogged(next, key)) {
        dispatch(
          p.clientId,
          generatePaymentReminderMessage(c.firstName, POLICY_LABEL[p.type], p.nextDueDate),
          key,
        );
      }
    }

    const bucket = renewalMilestone(daysUntil(p.endDate));
    if (bucket) {
      const key = `ren:${p.id}:${bucket}:${today}`;
      if (!hasLogged(next, key)) {
        dispatch(
          p.clientId,
          generateRenewalMessage(c.firstName, POLICY_LABEL[p.type], p.endDate, bucket),
          key,
        );
      }
    }
  }

  if (next.bot.birthdayGreetings) {
    for (const c of next.clients) {
      if (!isBirthdayToday(c.birthDate)) continue;
      const key = `bd:${c.id}:${today}`;
      if (hasLogged(next, key)) continue;
      const text = `${c.firstName}, ¡feliz cumpleaños! Que este año tu tranquilidad viaje con vos. Cualquier consulta de tu póliza, acá estoy las 24 hs. — Lía`;
      dispatch(c.id, text, key);
    }
  }

  return { state: { ...next, lastDailySent: sent }, sent, outbound };
}
