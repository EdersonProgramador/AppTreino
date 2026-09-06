import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COACH_COMMISSION_RATE,
  calculateCoachCommission,
  formatCoachCommissionRate
} from "./coach-affiliate.js";

describe("coach-affiliate", () => {
  it("uses 8% commission rate", () => {
    assert.equal(COACH_COMMISSION_RATE, 0.08);
    assert.equal(formatCoachCommissionRate(), "8%");
  });

  it("calculates commission in cents", () => {
    assert.equal(calculateCoachCommission(9700), 776);
    assert.equal(calculateCoachCommission(0), 0);
    assert.equal(calculateCoachCommission(-100), 0);
  });
});
