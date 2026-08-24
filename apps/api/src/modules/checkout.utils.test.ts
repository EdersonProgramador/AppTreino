import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  asaasCheckoutItemDescription,
  asaasCheckoutItemName,
  evaluateSandboxConfirmGate
} from "./checkout.utils.js";
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

describe("marca nos itens Asaas", () => {
  it("usa App Treino Social nos textos de checkout", () => {
    assert.equal(asaasCheckoutItemName("Mensal"), "App Treino Social - Mensal");
    assert.equal(asaasCheckoutItemDescription("Ana"), "Assinatura App Treino Social - Ana");
  });
});
