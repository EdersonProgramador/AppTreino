import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  loginAccountNotFoundMessage,
  loginInvalidPasswordMessage,
  normalizeEmail,
  normalizePhone,
  resolveLoginIdentifierKind
} from "./auth.utils.ts";

describe("normalizePhone", () => {
  it("keeps digits only", () => {
    assert.equal(normalizePhone("(11) 99999-0000"), "11999990000");
    assert.equal(normalizePhone("+55 11 98888-7777"), "5511988887777");
    assert.equal(normalizePhone("11999990000"), "11999990000");
  });

  it("rejects short values", () => {
    assert.equal(normalizePhone("123"), null);
    assert.equal(normalizePhone("   "), null);
    assert.equal(normalizePhone(null), null);
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    assert.equal(normalizeEmail("  Teste@Gmail.com "), "teste@gmail.com");
  });
});

describe("login messages", () => {
  it("uses identifier-specific copy", () => {
    assert.equal(resolveLoginIdentifierKind("a@b.com", null), "email");
    assert.equal(resolveLoginIdentifierKind(null, "11999990000"), "phone");
    assert.match(loginAccountNotFoundMessage("email"), /e-mail/i);
    assert.match(loginAccountNotFoundMessage("phone"), /telefone/i);
    assert.match(loginInvalidPasswordMessage("email"), /Senha incorreta.*e-mail/i);
    assert.match(loginInvalidPasswordMessage("phone"), /Senha incorreta.*telefone/i);
  });
});
