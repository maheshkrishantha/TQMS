import assert from "node:assert/strict";
import test from "node:test";
import { isSriLankaBankCode, sriLankaBanks } from "./banks.js";

test("Sri Lankan bank choices have unique four-digit codes", () => {
  const codes = sriLankaBanks.map(({ code }) => code);
  assert.equal(new Set(codes).size, codes.length);
  assert.equal(codes.every((code) => /^\d{4}$/.test(code)), true);
});

test("bond bank validation accepts bank codes and rejects free-form names", () => {
  assert.equal(isSriLankaBankCode("7010"), true);
  assert.equal(isSriLankaBankCode("Bank of Ceylon"), false);
  assert.equal(isSriLankaBankCode("9999"), false);
});
