import assert from "node:assert/strict";
import {
  formatCpf,
  getCpfFieldValidation,
  isValidCpf,
  normalizeCpfDigits,
  resolveCpfValidationState
} from "./cpf.js";

assert.equal(normalizeCpfDigits("123.456.789-09"), "12345678909");
assert.equal(formatCpf("12345678909"), "123.456.789-09");
assert.equal(isValidCpf("12345678909"), true);
assert.equal(isValidCpf("11111111111"), false);
assert.equal(isValidCpf("123"), false);
assert.equal(resolveCpfValidationState(""), "empty");
assert.equal(resolveCpfValidationState("123"), "incomplete");
assert.equal(resolveCpfValidationState("11111111111"), "invalid");
assert.equal(resolveCpfValidationState("12345678909"), "valid");
assert.equal(getCpfFieldValidation("12345678909").isValid, true);
assert.match(getCpfFieldValidation("123").message ?? "", /faltam 8 dígitos/);

console.log("cpf.test.ts ok");
