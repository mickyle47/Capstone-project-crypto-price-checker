import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_HOLDINGS,
  parseAmount,
  parsePortfolio,
  serializePortfolio,
  valuePortfolio,
} from "../lib/portfolio.js";
import { formatValue } from "../lib/format.js";

test("parseAmount accepts plain positive decimals", () => {
  assert.equal(parseAmount("0.5"), 0.5);
  assert.equal(parseAmount(" 2 "), 2);
  assert.equal(parseAmount(".25"), 0.25);
  assert.equal(parseAmount("3."), 3);
  assert.equal(parseAmount("0.123456789"), 0.12345679); // rounded to 8 decimals
});

test("parseAmount rejects everything else", () => {
  for (const bad of ["", " ", "0", "0.000000001", "-1", "1,5", "1e3", "0x10", "abc", "1.2.3", "Infinity", "1000000000001", null, undefined]) {
    assert.equal(parseAmount(bad), null, `"${bad}" should be rejected`);
  }
});

test("parsePortfolio reads the cookie format", () => {
  assert.deepEqual(parsePortfolio("BTC-USD:0.5,ETH-EUR:2"), [
    { symbol: "BTC-USD", amount: 0.5 },
    { symbol: "ETH-EUR", amount: 2 },
  ]);
});

test("parsePortfolio drops junk, duplicates and missing values", () => {
  const raw = "BTC-USD:0.5,bad:1,ETH-USD:abc,XRP-EUR,BTC-USD:9,<script>:1,LTC-USD:-3";
  assert.deepEqual(parsePortfolio(raw), [{ symbol: "BTC-USD", amount: 0.5 }]);
  assert.deepEqual(parsePortfolio(null), []);
  assert.deepEqual(parsePortfolio(""), []);
});

test("parsePortfolio keeps at most MAX_HOLDINGS entries", () => {
  const raw = Array.from({ length: MAX_HOLDINGS + 5 }, (_, i) => `C${i}-USD:1`).join(",");
  assert.equal(parsePortfolio(raw).length, MAX_HOLDINGS);
});

test("serializePortfolio and parsePortfolio round-trip, even for tiny amounts", () => {
  const holdings = [
    { symbol: "BTC-USD", amount: 0.5 },
    { symbol: "XRP-EUR", amount: 100 },
    { symbol: "ETH-USD", amount: 0.00000001 }, // would print as 1e-8 without toFixed
  ];
  const text = serializePortfolio(holdings);
  assert.equal(text, "BTC-USD:0.5,XRP-EUR:100,ETH-USD:0.00000001");
  assert.deepEqual(parsePortfolio(text), holdings);
});

const TICKERS = new Map([
  ["BTC-USD", { symbol: "BTC-USD", price_24h: 50000, volume_24h: 2, last_trade_price: 60000 }],
  ["ETH-USD", { symbol: "ETH-USD", price_24h: 0, volume_24h: 0, last_trade_price: 2000 }],
  ["XRP-EUR", { symbol: "XRP-EUR", price_24h: 1, volume_24h: 5, last_trade_price: 0.5 }],
]);

test("valuePortfolio values each holding at the last price", () => {
  const { rows } = valuePortfolio([{ symbol: "BTC-USD", amount: 0.5 }], TICKERS);
  assert.equal(rows[0].value, 30000);
  assert.equal(rows[0].base, "BTC");
  assert.equal(rows[0].quote, "USD");
  assert.equal(rows[0].ticker.change, 20);
  assert.equal(rows[0].stale, false);
});

test("valuePortfolio totals each quote currency separately", () => {
  const { totals } = valuePortfolio(
    [
      { symbol: "BTC-USD", amount: 1 },
      { symbol: "ETH-USD", amount: 10 },
      { symbol: "XRP-EUR", amount: 100 },
    ],
    TICKERS
  );
  assert.deepEqual(
    totals.map((t) => [t.quote, t.value, t.count]),
    [["EUR", 50, 1], ["USD", 80000, 2]]
  );
});

test("valuePortfolio flags stale prices and unpriced holdings", () => {
  const result = valuePortfolio(
    [
      { symbol: "ETH-USD", amount: 1 },
      { symbol: "DEAD-USD", amount: 1 },
    ],
    TICKERS
  );
  assert.equal(result.rows[0].stale, true);
  assert.equal(result.totals[0].stale, true);
  assert.equal(result.rows[1].value, null);
  assert.equal(result.rows[1].ticker, null);
  assert.equal(result.unpriced, 1);
  assert.equal(result.totals[0].count, 1); // the unpriced one is not counted
});

test("formatValue rounds fiat to cents and keeps crypto precision", () => {
  assert.equal(formatValue(29000.0000001, "USD"), "$29,000.00");
  assert.equal(formatValue(37780.2425, "EUR"), "€37,780.24");
  assert.equal(formatValue(0.12345678, "BTC"), "0.12345678 BTC");
});
