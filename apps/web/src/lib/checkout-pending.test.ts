import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { paymentMatchesPlanPricing, resolvePendingPaymentForSelectedPlan } from "./checkout-pending.js";
import { normalizeCatalogPlan } from "./plan-catalog.js";

describe("resolvePendingPaymentForSelectedPlan", () => {
  const membership = {
    id: "mem-1",
    userId: "user-1",
    planId: "plan-monthly",
    status: "PENDING" as const,
    startsAt: "2026-01-01",
    plan: { code: "monthly", name: "Mensal", priceInCents: 9700, billingCycle: "MONTHLY" as const }
  };

  const payments = [
    {
      id: "pay-start",
      membershipId: "mem-start",
      amountInCents: 500,
      status: "PENDING" as const,
      dueDate: "2026-03-01"
    },
    {
      id: "pay-monthly",
      membershipId: "mem-1",
      amountInCents: 9700,
      status: "PENDING" as const,
      dueDate: "2026-03-02"
    }
  ];

  it("ignora pagamento pendente de outro plano", () => {
    assert.equal(resolvePendingPaymentForSelectedPlan("start10", membership, payments, null), null);
  });

  it("retorna pagamento da matrícula do plano selecionado", () => {
    assert.equal(
      resolvePendingPaymentForSelectedPlan("monthly", membership, payments, null)?.id,
      "pay-monthly"
    );
  });
});

describe("paymentMatchesPlanPricing", () => {
  const plan = normalizeCatalogPlan({
    code: "monthly",
    name: "Mensal",
    priceInCents: 9700,
    effectivePriceInCents: 500,
    discountInCents: 9200
  });

  it("aceita pagamento pendente com o mesmo valor do plano", () => {
    assert.equal(
      paymentMatchesPlanPricing(
        {
          id: "pay-1",
          membershipId: "mem-1",
          amountInCents: 500,
          status: "PENDING",
          dueDate: "2026-03-01"
        },
        plan
      ),
      true
    );
  });

  it("rejeita pagamento pendente com valor desatualizado após remover cupom", () => {
    const fullPricePlan = normalizeCatalogPlan({
      code: "monthly",
      name: "Mensal",
      priceInCents: 9700,
      effectivePriceInCents: 9700,
      discountInCents: 0
    });

    assert.equal(
      paymentMatchesPlanPricing(
        {
          id: "pay-1",
          membershipId: "mem-1",
          amountInCents: 500,
          status: "PENDING",
          dueDate: "2026-03-01"
        },
        fullPricePlan
      ),
      false
    );
  });
});
