import assert from "node:assert/strict";
import { formatCpf, isValidCpf, normalizeCpfDigits } from "./cpf.js";

assert.equal(normalizeCpfDigits("123.456.789-09"), "12345678909");
assert.equal(formatCpf("12345678909"), "123.456.789-09");
assert.equal(isValidCpf("12345678909"), true);
assert.equal(isValidCpf("11111111111"), false);
assert.equal(isValidCpf("123"), false);

console.log("cpf.test.ts ok");
