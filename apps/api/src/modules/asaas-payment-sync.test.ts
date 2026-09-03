import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { asaasStatusToPaymentStatus, shouldActivateMembership } from "./asaas.routes.js";

describe("asaas payment sync helpers", () => {
  it("maps Pix received status to confirmed", () => {
    assert.equal(asaasStatusToPaymentStatus("RECEIVED"), "CONFIRMED");
    assert.equal(shouldActivateMembership("CONFIRMED"), true);
  });

  it("keeps pending until provider confirms", () => {
    assert.equal(asaasStatusToPaymentStatus("PENDING"), "PENDING");
    assert.equal(shouldActivateMembership("PENDING"), false);
  });
});
