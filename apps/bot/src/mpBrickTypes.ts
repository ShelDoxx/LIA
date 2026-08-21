export type BillingPlan = "self" | "setup";

export type BrickAmounts = {
  usdSelf: number;
  usdSetup: number;
  fxArs: number;
  arsSelf: number;
  arsSetup: number;
  /** true si MP_ARS_SELF / MP_ARS_SETUP están override (prueba). */
  testMode?: boolean;
};

export function computeBrickAmounts(
  fxArs: number,
  overrides?: { arsSelf?: number; arsSetup?: number },
): BrickAmounts {
  const fx = Math.max(1, Math.round(fxArs));
  const usdSelf = 49;
  const usdSetup = 149;
  const overrideSelf =
    typeof overrides?.arsSelf === "number" &&
    Number.isFinite(overrides.arsSelf) &&
    overrides.arsSelf > 0
      ? Math.round(overrides.arsSelf)
      : undefined;
  const overrideSetup =
    typeof overrides?.arsSetup === "number" &&
    Number.isFinite(overrides.arsSetup) &&
    overrides.arsSetup > 0
      ? Math.round(overrides.arsSetup)
      : undefined;
  return {
    usdSelf,
    usdSetup,
    fxArs: fx,
    arsSelf: overrideSelf ?? usdSelf * fx,
    arsSetup: overrideSetup ?? usdSetup * fx,
    testMode: Boolean(overrideSelf || overrideSetup),
  };
}
