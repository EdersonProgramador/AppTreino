import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isChunkLoadError } from "./lazy-retry.ts";

describe("isChunkLoadError", () => {
  it("detecta falha de import dinâmico do Vite", () => {
    assert.equal(
      isChunkLoadError(new Error("Failed to fetch dynamically imported module: https://example.com/assets/UserView.js")),
      true
    );
  });

  it("ignora erros comuns", () => {
    assert.equal(isChunkLoadError(new Error("Network request failed")), false);
    assert.equal(isChunkLoadError("not an error"), false);
  });
});
