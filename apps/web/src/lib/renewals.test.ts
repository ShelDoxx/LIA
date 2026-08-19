import { describe, expect, it } from "vitest";
import { renewalBucket } from "./renewals";

describe("renewalBucket", () => {
  it("clasifica 90 días", () => {
    expect(renewalBucket(90)).toBe("90");
    expect(renewalBucket(75)).toBe("90");
  });

  it("clasifica vencida", () => {
    expect(renewalBucket(-3)).toBe("overdue");
  });

  it("devuelve null fuera de ventana", () => {
    expect(renewalBucket(120)).toBeNull();
  });
});
