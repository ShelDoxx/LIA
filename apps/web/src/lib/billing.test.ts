import { describe, expect, it } from "vitest";
import { addDays } from "date-fns";
import {
  activateSubscription,
  checkSubscription,
  initTrial,
  trialDaysLeft,
} from "./billing";

describe("billing", () => {
  it("inicia trial de 14 días", () => {
    const sub = initTrial();
    expect(sub.status).toBe("trial");
    expect(trialDaysLeft(sub)).toBeGreaterThanOrEqual(13);
    expect(checkSubscription(sub)).toBe("trial");
  });

  it("marca trial por vencer si quedan 3 días o menos", () => {
    const sub = {
      status: "trial" as const,
      startedAt: new Date().toISOString(),
      trialEndsAt: addDays(new Date(), 2).toISOString(),
    };
    expect(checkSubscription(sub)).toBe("trial_ending");
  });

  it("activa plan y deja de estar en trial", () => {
    const sub = activateSubscription(initTrial());
    expect(checkSubscription(sub)).toBe("ok");
  });
});
