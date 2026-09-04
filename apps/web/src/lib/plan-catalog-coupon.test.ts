import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeCatalogPlan, resolveCouponValidationState } from "./plan-catalog.js";

describe("resolveCouponValidationState", () => {
  const monthlyWithCoupon = normalizeCatalogPlan({
    code: "97",
    name: "Mensal",
    priceInCents: 9700,
    effectivePriceInCents: 500,
    discountInCents: 9200
  });
  const yearlyFullPrice = normalizeCatalogPlan({
    code: "yearly",
    name: "Anual",
    priceInCents: 97000,
    effectivePriceInCents: 97000,
    discountInCents: 0
  });

  it("mantém cupom quando vale para outro plano", () => {
    const result = resolveCouponValidationState("CINCO", "yearly", [monthlyWithCoupon, yearlyFullPrice], {
      couponCatalogReady: true,
      loadedCouponCode: "CINCO"
    });

    assert.equal(result.appliedCoupon, "CINCO");
    assert.equal(result.couponValidForSelection, false);
    assert.equal(result.clearedInvalidCoupon, false);
    assert.match(result.couponFeedback ?? "", /não vale para o plano selecionado/i);
  });

  it("valida cupom no plano correto", () => {
    const result = resolveCouponValidationState("CINCO", "97", [monthlyWithCoupon, yearlyFullPrice], {
      couponCatalogReady: true,
      loadedCouponCode: "CINCO"
    });

    assert.equal(result.appliedCoupon, "CINCO");
    assert.equal(result.couponValidForSelection, true);
    assert.equal(result.couponFeedback, null);
  });

  it("remove cupom inexistente", () => {
    const monthlyFullPrice = normalizeCatalogPlan({
      code: "97",
      name: "Mensal",
      priceInCents: 9700,
      effectivePriceInCents: 9700,
      discountInCents: 0
    });
    const result = resolveCouponValidationState("XYZ", "97", [monthlyFullPrice, yearlyFullPrice], {
      couponCatalogReady: true,
      loadedCouponCode: "XYZ"
    });

    assert.equal(result.appliedCoupon, null);
    assert.equal(result.clearedInvalidCoupon, true);
  });
});
