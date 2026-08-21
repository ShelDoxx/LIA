/**
 * Montos Brick + reexport del checkout (suscripción / Setup).
 * La lógica de vault + preapproval vive en mpSubscription.ts.
 */
export type { BillingPlan, BrickAmounts } from "./mpBrickTypes.js";
export { computeBrickAmounts } from "./mpBrickTypes.js";
export { processBrickCheckout, attachMonthlyWithCard } from "./mpSubscription.js";
