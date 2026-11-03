import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { estimateBottomSafeInset } from "./mobile-viewport";

describe("estimateBottomSafeInset", () => {
  it("prefers measured layout gap when present", () => {
    assert.equal(estimateBottomSafeInset(12), 12);
    assert.equal(estimateBottomSafeInset(4), 4);
  });

  it("returns zero when no gap and no standalone context", () => {
    assert.equal(estimateBottomSafeInset(0), 0);
    assert.equal(estimateBottomSafeInset(2), 2);
  });
});
