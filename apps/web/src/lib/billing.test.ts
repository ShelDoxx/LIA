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

  it("activa setup y marca meet pendiente", () => {
    const sub = activateSubscription(initTrial(), { plan: "setup" });
    expect(checkSubscription(sub)).toBe("ok");
    expect(sub.plan).toBe("setup");
    expect(sub.setupMeetPending).toBe(true);
  });
});
