import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addCycleDate, asaasStatusToPaymentStatus, shouldActivateMembership } from "./asaas.routes.js";

describe("asaasStatusToPaymentStatus", () => {
  it("mapeia status pagos para CONFIRMED", () => {
    for (const status of ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]) {
      assert.equal(asaasStatusToPaymentStatus(status), "CONFIRMED");
    }
  });

  it("mapeia estornos para REFUNDED", () => {
    for (const status of ["REFUNDED", "REFUND_REQUESTED", "CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE"]) {
      assert.equal(asaasStatusToPaymentStatus(status), "REFUNDED");
    }
  });

  it("mapeia DELETED para CANCELED", () => {
    assert.equal(asaasStatusToPaymentStatus("DELETED"), "CANCELED");
  });

  it("mantém PENDING para status desconhecido/vazio", () => {
    assert.equal(asaasStatusToPaymentStatus(undefined), "PENDING");
    assert.equal(asaasStatusToPaymentStatus("WEIRD_STATUS"), "PENDING");
  });
});

describe("shouldActivateMembership", () => {
  it("ativa apenas com CONFIRMED", () => {
    assert.equal(shouldActivateMembership("CONFIRMED"), true);
    assert.equal(shouldActivateMembership("PENDING"), false);
    assert.equal(shouldActivateMembership("OVERDUE"), false);
  });
});

describe("addCycleDate", () => {
  it("adiciona um mês ou um ano", () => {
    const monthly = addCycleDate(new Date("2025-01-15T10:00:00Z"), "MONTHLY");
    assert.equal(monthly.toISOString(), "2025-02-15T10:00:00.000Z");

    const yearly = addCycleDate(new Date("2025-01-15T10:00:00Z"), "YEARLY");
    assert.equal(yearly.toISOString(), "2026-01-15T10:00:00.000Z");
  });
});