import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inferBiotype } from "./biotype.js";

describe("inferBiotype", () => {
  it("marca ectomorfo com IMC baixo", () => {
    const result = inferBiotype({ weightKg: 58, heightCm: 180 });
    assert.equal(result.biotype, "ectomorfo");
    assert.ok(result.bmi != null && result.bmi < 18.8);
  });

  it("marca endomorfo com IMC alto", () => {
    const result = inferBiotype({ weightKg: 95, heightCm: 170 });
    assert.equal(result.biotype, "endomorfo");
  });

  it("assume mesomorfo sem medidas", () => {
    const result = inferBiotype({});
    assert.equal(result.biotype, "mesomorfo");
  });
});
