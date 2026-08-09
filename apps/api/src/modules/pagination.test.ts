import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPaginationMeta, parsePagination } from "./pagination.js";

describe("parsePagination", () => {
  it("usa padrões quando não há query", () => {
    const pagination = parsePagination({});
    assert.equal(pagination.page, 1);
    assert.equal(pagination.perPage, 1000);
    assert.equal(pagination.skip, 0);
    assert.equal(pagination.take, 1000);
  });

  it("calcula skip/take corretamente", () => {
    const pagination = parsePagination({ page: "3", perPage: "20" });
    assert.equal(pagination.page, 3);
    assert.equal(pagination.perPage, 20);
    assert.equal(pagination.skip, 40);
    assert.equal(pagination.take, 20);
  });

  it("ignora valores inválidos", () => {
    const pagination = parsePagination({ page: "abc", perPage: "-5" });
    assert.equal(pagination.page, 1);
    assert.equal(pagination.perPage, 1000);
  });

  it("limita perPage ao máximo de 1000", () => {
    const pagination = parsePagination({ page: "1", perPage: "9999" });
    assert.equal(pagination.perPage, 1000);
  });
});

describe("buildPaginationMeta", () => {
  it("calcula totalPages corretamente", () => {
    assert.deepEqual(buildPaginationMeta(25, 2, 10), {
      page: 2,
      perPage: 10,
      total: 25,
      totalPages: 3
    });
  });

  it("nunca retorna totalPages menor que 1", () => {
    assert.equal(buildPaginationMeta(0, 1, 10).totalPages, 1);
  });
});