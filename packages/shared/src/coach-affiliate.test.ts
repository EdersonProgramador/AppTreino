import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COACH_COMMISSION_RATE,
  COACH_REFERRAL_CODE_LENGTH,
  calculateCoachCommission,
  formatCoachCommissionRate,
  formatReferralCodeForDisplay,
  isCoachReferralCode,
  normalizeReferralCode
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

  it("validates short referral codes", () => {
    assert.equal(COACH_REFERRAL_CODE_LENGTH, 8);
    assert.equal(normalizeReferralCode("k7m2p9xq"), "k7m2p9xq");
    assert.equal(normalizeReferralCode("K7M2-P9XQ"), "k7m2p9xq");
    assert.equal(normalizeReferralCode("joao-cross"), null);
    assert.equal(normalizeReferralCode("admin"), null);
    assert.equal(isCoachReferralCode("k7m2p9xq"), true);
    assert.equal(formatReferralCodeForDisplay("k7m2p9xq"), "K7M2P9XQ");
  });
});
