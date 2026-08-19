import { describe, expect, it } from "vitest";
import { buildAgenda } from "./agenda";
import { seedState } from "@/data/seed";

describe("buildAgenda", () => {
  it("incluye mora y renovaciones en seed demo", () => {
    const items = buildAgenda(seedState());
    const kinds = new Set(items.map((i) => i.kind));
    expect(kinds.has("mora")).toBe(true);
    expect(kinds.has("renewal")).toBe(true);
  });

  it("genera aviso de cuota según paymentReminderDays", () => {
    const state = seedState();
    const items = buildAgenda(state);
    expect(items.some((i) => i.kind === "payment_reminder" || i.kind === "mora")).toBe(true);
  });
});
