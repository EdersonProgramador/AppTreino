import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { humanizeAsaasCheckoutError, isStaleAsaasPixQrError, parseAsaasApiErrors } from "./asaas.client.js";

describe("parseAsaasApiErrors", () => {
  it("extrai descrição do JSON Asaas", () => {
    const parsed = parseAsaasApiErrors(
      'Falha: {"errors":[{"code":"invalid_action","description":"É necessário cadastrar uma chave Pix."}]}'
    );
    assert.equal(parsed.descriptions[0], "É necessário cadastrar uma chave Pix.");
  });
});

describe("isStaleAsaasPixQrError", () => {
  it("detecta 404 de QR Pix antigo", () => {
    assert.equal(isStaleAsaasPixQrError('{"errors":[{"description":"Not found"}]} 404 pixQrCode'), true);
  });

  it("não confunde token inválido", () => {
    assert.equal(isStaleAsaasPixQrError("invalid_access_token"), false);
  });
});

describe("humanizeAsaasCheckoutError", () => {
  it("prioriza descrição oficial do Asaas", () => {
    const message = humanizeAsaasCheckoutError(
      '{"errors":[{"description":"Pix desabilitado para esta conta."}]}'
    );
    assert.equal(message, "Asaas: Pix desabilitado para esta conta.");
  });

  it("orienta cobrança criada antes da chave Pix", () => {
    const message = humanizeAsaasCheckoutError("404 Not Found /payments/pay_123/pixQrCode");
    assert.match(message, /antes da chave Pix/i);
  });
});
