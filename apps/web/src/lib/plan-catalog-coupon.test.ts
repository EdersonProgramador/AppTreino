import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getEffectivePriceCents,
  normalizeCatalogPlan,
  planHasPromoDiscount,
  plansForCouponDisplay,
  resolveCouponValidationState
} from "./plan-catalog.js";

describe("plansForCouponDisplay", () => {
  const startPlan = normalizeCatalogPlan({
    code: "start10",
    name: "Start",
    priceInCents: 4990,
    effectivePriceInCents: 4990,
    discountInCents: 0
  });
  const monthlyWithCoupon = normalizeCatalogPlan({
    code: "97",
    name: "Mensal",
    priceInCents: 9700,
    effectivePriceInCents: 500,
    discountInCents: 9200
  });

  it("não mostra desconto no Mensal quando Start está selecionado e cupom validando", () => {
    const displayed = plansForCouponDisplay([startPlan, monthlyWithCoupon], "start10", {
      appliedCoupon: "CINCO",
      couponValidForSelection: null
    });

    const mensal = displayed.find((plan) => plan.code === "97");
    assert.equal(getEffectivePriceCents(mensal!), 9700);
    assert.equal(planHasPromoDiscount(mensal), false);
  });

  it("não mostra desconto no Mensal quando Start está selecionado e cupom inválido", () => {
    const displayed = plansForCouponDisplay([startPlan, monthlyWithCoupon], "start10", {
      appliedCoupon: "CINCO",
      couponValidForSelection: false
    });

    const mensal = displayed.find((plan) => plan.code === "97");
    assert.equal(getEffectivePriceCents(mensal!), 9700);
  });

  it("mostra desconto só no Mensal quando Mensal está selecionado e cupom validado", () => {
    const displayed = plansForCouponDisplay([startPlan, monthlyWithCoupon], "97", {
      appliedCoupon: "CINCO",
      couponValidForSelection: true
    });

    const start = displayed.find((plan) => plan.code === "start10");
    const mensal = displayed.find((plan) => plan.code === "97");
    assert.equal(getEffectivePriceCents(start!), 4990);
    assert.equal(getEffectivePriceCents(mensal!), 500);
    assert.equal(planHasPromoDiscount(mensal), true);
    assert.equal(planHasPromoDiscount(start), false);
  });
});

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

  it("remove cupom quando vale para outro plano", () => {
    const startPlan = normalizeCatalogPlan({
      code: "start10",
      name: "Start",
      priceInCents: 4990,
      effectivePriceInCents: 4990,
      discountInCents: 0
    });
    const result = resolveCouponValidationState("CINCO", "start10", [monthlyWithCoupon, startPlan], {
      couponCatalogReady: true,
      loadedCouponCode: "CINCO"
    });

    assert.equal(result.appliedCoupon, null);
    assert.equal(result.clearedInvalidCoupon, true);
    assert.equal(result.rejectedCouponCode, "CINCO");
    assert.equal(result.couponFeedback, "Cupom inválido.");
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
