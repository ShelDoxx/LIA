import { describe, expect, it } from "vitest";

// Mirror bot helpers for pure unit tests (no node store)
function computePeriodEndsAt(opts: {
  periodDays: number;
  testGraceMinutes?: number;
  from?: Date;
}): string {
  const from = opts.from ?? new Date();
  const d = new Date(from.getTime());
  const testMin = Number(opts.testGraceMinutes ?? 0);
  if (testMin > 0) {
    d.setTime(d.getTime() + testMin * 60_000);
  } else {
    d.setDate(d.getDate() + Math.max(1, Math.round(opts.periodDays)));
  }
  return d.toISOString();
}

function graceLabelUntil(iso: string, now: number): string {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return "0 días";
  if (ms < 60_000) return "menos de 1 minuto";
  if (ms < 3_600_000) {
    const mins = Math.ceil(ms / 60_000);
    return `${mins} minuto${mins === 1 ? "" : "s"}`;
  }
  if (ms < 86_400_000) {
    const hours = Math.ceil(ms / 3_600_000);
    return `${hours} hora${hours === 1 ? "" : "s"}`;
  }
  const days = Math.ceil(ms / 86_400_000);
  return `${days} día${days === 1 ? "" : "s"}`;
}

describe("renewal grace period", () => {
  it("Setup sin sub mensual → 30 días", () => {
    const from = new Date("2026-08-21T12:00:00.000Z");
    const end = computePeriodEndsAt({ periodDays: 30, from });
    expect(end).toBe("2026-09-20T12:00:00.000Z");
  });

  it("modo prueba en minutos", () => {
    const from = new Date("2026-08-21T12:00:00.000Z");
    const end = computePeriodEndsAt({ periodDays: 30, testGraceMinutes: 3, from });
    expect(new Date(end).getTime() - from.getTime()).toBe(3 * 60_000);
  });

  it("label de minutos para aviso", () => {
    const from = new Date("2026-08-21T12:00:00.000Z");
    const end = computePeriodEndsAt({ periodDays: 30, testGraceMinutes: 3, from });
    expect(graceLabelUntil(end, from.getTime())).toBe("3 minutos");
  });

  it("aniversario: cancelá a mitad de mes → fin el día exacto del alta", () => {
    // Alta 21 ago; cancelación 5 sep → acceso hasta 21 sep
    const started = "2026-08-21T15:00:00.000Z";
    const from = new Date("2026-09-05T12:00:00.000Z");
    const end = nextBillingAnniversary(started, from);
    expect(end.startsWith("2026-09-21")).toBe(true);
  });
});

function nextBillingAnniversary(startedAt: string, from = new Date()): string {
  const start = new Date(startedAt);
  const end = new Date(start.getTime());
  let guard = 0;
  while (end.getTime() <= from.getTime() && guard < 120) {
    end.setMonth(end.getMonth() + 1);
    guard += 1;
  }
  return end.toISOString();
}
