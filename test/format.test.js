import { test } from "node:test";
import assert from "node:assert/strict";
import {
  changeClass,
  formatAmount,
  formatChange,
  formatPrice,
  splitSymbol,
} from "../lib/format.js";

test("splitSymbol separates base and quote", () => {
  assert.deepEqual(splitSymbol("BTC-USD"), { base: "BTC", quote: "USD" });
});

test("formatPrice uses currency symbols for fiat quotes", () => {
  assert.equal(formatPrice(58000, "USD"), "$58,000.00");
  assert.equal(formatPrice(0.85, "EUR"), "€0.85");
  assert.equal(formatPrice(151, "GBP"), "£151.00");
});

test("formatPrice appends the code for crypto and stablecoin quotes", () => {
  assert.equal(formatPrice(0.05, "BTC"), "0.05 BTC");
  assert.equal(formatPrice(58000, "USDT"), "58,000 USDT");
});

test("formatPrice keeps up to 8 decimals", () => {
  assert.equal(formatPrice(0.12345678, "BTC"), "0.12345678 BTC");
});

test("formatAmount shows the base asset", () => {
  assert.equal(formatAmount(0.65463676, "BTC"), "0.65463676 BTC");
});

test("formatChange adds a plus sign and handles missing values", () => {
  assert.equal(formatChange(1.234), "+1.23%");
  assert.equal(formatChange(-2.52), "-2.52%");
  assert.equal(formatChange(0), "0.00%");
  assert.equal(formatChange(null), "—");
});

test("changeClass is red only for drops", () => {
  assert.equal(changeClass(-0.1), "down");
  assert.equal(changeClass(0), "up");
  assert.equal(changeClass(3), "up");
  assert.equal(changeClass(null), "up");
});
