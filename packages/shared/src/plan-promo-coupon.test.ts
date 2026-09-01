import assert from "node:assert/strict";
import { buildPlanPromoCouponCode, resolvePlanPromoDiscount } from "./plan-promo-coupon.js";

assert.equal(buildPlanPromoCouponCode("cinco"), "CINCO-PROMO");
assert.equal(buildPlanPromoCouponCode("Start"), "START-PROMO");

const percent = resolvePlanPromoDiscount({
  planPriceInCents: 1000,
  mode: "PERCENT",
  percentOff: 10
});
assert.equal(percent.finalPriceInCents, 900);
assert.equal(percent.discountInCents, 100);

const amountOff = resolvePlanPromoDiscount({
  planPriceInCents: 9700,
  mode: "AMOUNT_OFF",
  amountOffCents: 9200
});
assert.equal(amountOff.finalPriceInCents, 500);

const target = resolvePlanPromoDiscount({
  planPriceInCents: 9700,
  mode: "TARGET_PRICE",
  targetPriceInCents: 500
});
assert.equal(target.finalPriceInCents, 500);
assert.equal(target.amountOffCents, 9200);

console.log("plan-promo-coupon.test.ts ok");
