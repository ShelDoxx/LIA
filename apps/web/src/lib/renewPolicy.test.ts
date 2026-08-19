import { describe, expect, it } from "vitest";
import { renewPolicyDates } from "./renewPolicy";
import type { Policy } from "./types";

const base: Policy = {
  id: "p1",
  clientId: "c1",
  company: "Sancor Seguros",
  type: "auto",
  number: "AU-1",
  status: "por_vencer",
  startDate: "2025-08-18T00:00:00.000Z",
  endDate: "2026-08-18T00:00:00.000Z",
  premium: 100000,
  installment: 12000,
  nextDueDate: "2026-09-01T00:00:00.000Z",
  paymentMethod: "CBU",
  commissionRate: 0.15,
  coverage: "Terceros",
};

describe("renewPolicyDates", () => {
  it("extiende un año desde el vencimiento si todavía no cayó", () => {
    const now = new Date("2026-07-01T12:00:00.000Z");
    const next = renewPolicyDates(base, now);
    expect(next.status).toBe("activa");
    expect(next.endDate.slice(0, 10)).toBe("2027-08-18");
  });

  it("si ya venció, arranca desde hoy", () => {
    const now = new Date("2026-10-01T12:00:00.000Z");
    const next = renewPolicyDates({ ...base, status: "vencida", endDate: "2026-08-18T00:00:00.000Z" }, now);
    expect(next.startDate.slice(0, 10)).toBe("2026-10-01");
    expect(next.endDate.slice(0, 10)).toBe("2027-10-01");
  });
});
