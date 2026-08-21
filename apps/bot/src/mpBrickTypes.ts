export type BillingPlan = "self" | "setup";

export type BrickAmounts = {
  usdSelf: number;
  usdSetup: number;
  fxArs: number;
  arsSelf: number;
  arsSetup: number;
};

export function computeBrickAmounts(fxArs: number): BrickAmounts {
  const fx = Math.max(1, Math.round(fxArs));
  const usdSelf = 49;
  const usdSetup = 149;
  return {
    usdSelf,
    usdSetup,
    fxArs: fx,
    arsSelf: usdSelf * fx,
    arsSetup: usdSetup * fx,
  };
}
