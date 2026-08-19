import { addYears, parseISO } from "date-fns";
import type { Policy } from "@/lib/types";

/** Extiende vigencia 12 meses. Si ya venció, arranca desde hoy. */
export function renewPolicyDates(p: Policy, now = new Date()): Policy {
  const end = parseISO(p.endDate);
  const base = end.getTime() < now.getTime() ? now : end;
  return {
    ...p,
    status: "activa",
    startDate: base.toISOString(),
    endDate: addYears(base, 1).toISOString(),
    updatedAt: now.toISOString(),
  };
}
