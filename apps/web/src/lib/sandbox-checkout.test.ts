import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSandboxCheckoutEnabled } from "./sandbox-checkout.ts";

describe("isSandboxCheckoutEnabled", () => {
  it("retorna boolean (dev local pode permitir; prod build bloqueia)", () => {
    assert.equal(typeof isSandboxCheckoutEnabled(), "boolean");
  });
});
