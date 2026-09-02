import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  asaasCheckoutItemDescription,
  asaasCheckoutItemName,
  canReusePendingCheckoutPayment,
  evaluateSandboxConfirmGate,
  getAsaasCheckoutAmountError,
  ASAAS_MIN_CHECKOUT_CENTS,
  paymentMatchesSubscriptionPricing
} from "./checkout.utils.js";
import {
  formatAsaasDate,
  resolveAsaasDueDate,
  todayAsaasDueDateString
} from "./asaas.client.js";
import { shouldActivateMembership, asaasStatusToPaymentStatus, addCycleDate } from "./asaas.routes.js";

describe("evaluateSandboxConfirmGate", () => {
  it("bloqueia em production mesmo com flag ligada", () => {
    const result = evaluateSandboxConfirmGate({
      nodeEnv: "production",
      enableSandboxConfirm: true,
      hasAsaasApiKey: false,
      allowManualPaymentConfirmation: false
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.statusCode, 404);
  });

  it("bloqueia quando ENABLE_SANDBOX_CONFIRM está off", () => {
    const result = evaluateSandboxConfirmGate({
      nodeEnv: "development",
      enableSandboxConfirm: false,
      hasAsaasApiKey: false,
      allowManualPaymentConfirmation: false
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.statusCode, 404);
  });

  it("bloqueia confirmação manual se Asaas está configurado sem allow", () => {
    const result = evaluateSandboxConfirmGate({
      nodeEnv: "development",
      enableSandboxConfirm: true,
      hasAsaasApiKey: true,
      allowManualPaymentConfirmation: false
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.statusCode, 403);
  });

  it("permite sandbox local sem Asaas", () => {
    const result = evaluateSandboxConfirmGate({
      nodeEnv: "development",
      enableSandboxConfirm: true,
      hasAsaasApiKey: false,
      allowManualPaymentConfirmation: false
    });
    assert.equal(result.ok, true);
  });

  it("permite sandbox com Asaas se ALLOW_MANUAL_PAYMENT_CONFIRMATION=true", () => {
    const result = evaluateSandboxConfirmGate({
      nodeEnv: "development",
      enableSandboxConfirm: true,
      hasAsaasApiKey: true,
      allowManualPaymentConfirmation: true
    });
    assert.equal(result.ok, true);
  });
});

describe("assinatura: ativação e ciclo", () => {
  it("só libera matrícula com pagamento CONFIRMED", () => {
    assert.equal(shouldActivateMembership("CONFIRMED"), true);
    assert.equal(shouldActivateMembership(asaasStatusToPaymentStatus("RECEIVED")), true);
    assert.equal(shouldActivateMembership("PENDING"), false);
    assert.equal(shouldActivateMembership("OVERDUE"), false);
    assert.equal(shouldActivateMembership("REFUNDED"), false);
  });

  it("calcula endsAt mensal e anual a partir do pagamento", () => {
    const paidAt = new Date("2026-03-10T15:00:00Z");
    assert.equal(addCycleDate(paidAt, "MONTHLY").toISOString(), "2026-04-10T15:00:00.000Z");
    assert.equal(addCycleDate(paidAt, "YEARLY").toISOString(), "2027-03-10T15:00:00.000Z");
  });
});

describe("valor mínimo Asaas", () => {
  it("bloqueia valores abaixo de R$ 5,00", () => {
    assert.equal(ASAAS_MIN_CHECKOUT_CENTS, 500);
    assert.match(getAsaasCheckoutAmountError(10) ?? "", /R\$\s*5,00/);
    assert.equal(getAsaasCheckoutAmountError(500), null);
  });
});

describe("pagamento pendente vs preço atual", () => {
  it("detecta quando o valor salvo ficou desatualizado", () => {
    const pricing = {
      originalAmountInCents: 500,
      discountInCents: 0,
      amountInCents: 500,
      couponId: null,
      couponCode: null
    };

    assert.equal(
      paymentMatchesSubscriptionPricing(
        {
          amountInCents: 10,
          originalAmountInCents: 10,
          discountInCents: 0,
          couponId: null,
          couponCode: null
        },
        pricing
      ),
      false
    );

    assert.equal(
      paymentMatchesSubscriptionPricing(
        {
          amountInCents: 500,
          originalAmountInCents: 500,
          discountInCents: 0,
          couponId: null,
          couponCode: null
        },
        pricing
      ),
      true
    );
  });

  it("não reutiliza checkout antigo de outro plano", () => {
    const pricing = {
      originalAmountInCents: 500,
      discountInCents: 0,
      amountInCents: 500,
      couponId: null,
      couponCode: null
    };

    assert.equal(
      canReusePendingCheckoutPayment({
        payment: {
          paymentUrl: "https://www.asaas.com/checkoutSession/show/old",
          amountInCents: 9700,
          originalAmountInCents: 9700,
          discountInCents: 0,
          couponId: null,
          couponCode: null
        },
        membershipPlanId: "plan-monthly",
        membershipPlanCode: "monthly",
        selectedPlanId: "plan-start",
        selectedPlanCode: "start10",
        requestedCouponCode: null,
        pricing
      }),
      false
    );
  });

  it("não reutiliza checkout quando o cupom muda", () => {
    const pricingWithCoupon = {
      originalAmountInCents: 500,
      discountInCents: 100,
      amountInCents: 400,
      couponId: "coupon-1",
      couponCode: "ATLLY10"
    };

    assert.equal(
      canReusePendingCheckoutPayment({
        payment: {
          paymentUrl: "https://www.asaas.com/checkoutSession/show/old",
          amountInCents: 500,
          originalAmountInCents: 500,
          discountInCents: 0,
          couponId: null,
          couponCode: null
        },
        membershipPlanId: "plan-start",
        membershipPlanCode: "start10",
        selectedPlanId: "plan-start",
        selectedPlanCode: "start10",
        requestedCouponCode: "ATLLY10",
        pricing: pricingWithCoupon
      }),
      false
    );
  });

  it("não reutiliza URL Asaas expirada pelo tempo", () => {
    const pricing = {
      originalAmountInCents: 500,
      discountInCents: 0,
      amountInCents: 500,
      couponId: null,
      couponCode: null
    };
    const staleUpdatedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    assert.equal(
      canReusePendingCheckoutPayment({
        payment: {
          paymentUrl: "https://www.asaas.com/checkoutSession/show/old",
          amountInCents: 500,
          originalAmountInCents: 500,
          discountInCents: 0,
          couponId: null,
          couponCode: null,
          updatedAt: staleUpdatedAt
        },
        membershipPlanId: "plan-start",
        membershipPlanCode: "start10",
        selectedPlanId: "plan-start",
        selectedPlanCode: "start10",
        requestedCouponCode: null,
        pricing
      }),
      false
    );
  });

  it("reutiliza URL Asaas recém-gerada com o mesmo preço", () => {
    const pricing = {
      originalAmountInCents: 500,
      discountInCents: 0,
      amountInCents: 500,
      couponId: null,
      couponCode: null
    };

    assert.equal(
      canReusePendingCheckoutPayment({
        payment: {
          paymentUrl: "https://www.asaas.com/checkoutSession/show/fresh",
          amountInCents: 500,
          originalAmountInCents: 500,
          discountInCents: 0,
          couponId: null,
          couponCode: null,
          updatedAt: new Date().toISOString()
        },
        membershipPlanId: "plan-start",
        membershipPlanCode: "start10",
        selectedPlanId: "plan-start",
        selectedPlanCode: "start10",
        requestedCouponCode: null,
        pricing
      }),
      true
    );
  });
});

describe("marca nos itens Asaas", () => {
  it("usa ATLLY nos textos de checkout", () => {
    assert.equal(asaasCheckoutItemName("Mensal"), "ATLLY · Mensal");
    assert.equal(asaasCheckoutItemDescription("Start"), "Assinatura ATLLY · Start");
  });
});

describe("vencimento Asaas", () => {
  it("empurra dueDate para hoje quando está no passado", () => {
    const yesterday = new Date(`${todayAsaasDueDateString()}T00:00:00.000Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    assert.equal(resolveAsaasDueDate(yesterday), todayAsaasDueDateString());
    assert.equal(formatAsaasDate(yesterday) < todayAsaasDueDateString(), true);
  });
});
