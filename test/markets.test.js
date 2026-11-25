import { test } from "node:test";
import assert from "node:assert/strict";
import {
  groupByQuote,
  isValidSymbol,
  normalizeSymbol,
  percentChange,
  summarizeOrderBook,
} from "../lib/markets.js";

test("normalizeSymbol trims and upper-cases", () => {
  assert.equal(normalizeSymbol("  btc-usd "), "BTC-USD");
  assert.equal(normalizeSymbol(undefined), "");
});

test("isValidSymbol accepts real symbols and rejects junk", () => {
  assert.ok(isValidSymbol("BTC-USD"));
  assert.ok(isValidSymbol("1INCH-USDT"));
  for (const bad of ["", "btc-usd", "BTCUSD", "BTC-", "-USD", "BTC-USD-EUR", "BTC USD", "../etc"]) {
    assert.equal(isValidSymbol(bad), false, `"${bad}" should be invalid`);
  }
});

test("percentChange compares the last trade with the 24h price", () => {
  assert.equal(percentChange({ price_24h: 100, last_trade_price: 110 }), 10);
  assert.equal(percentChange({ price_24h: 200, last_trade_price: 150 }), -25);
  assert.equal(percentChange({ price_24h: 100, last_trade_price: 100 }), 0);
});

test("percentChange is null when there is no 24h price", () => {
  assert.equal(percentChange({ price_24h: 0, last_trade_price: 5 }), null);
  assert.equal(percentChange({ last_trade_price: 5 }), null);
});

test("groupByQuote puts popular quotes first, the rest alphabetically", () => {
  const groups = groupByQuote(["ABC-ZZZ", "ETH-EUR", "BTC-USD", "XRP-AAA", "ETH-USD"]);
  assert.deepEqual(
    groups.map((g) => g.quote),
    ["USD", "EUR", "AAA", "ZZZ"]
  );
  assert.deepEqual(groups[0].symbols, ["BTC-USD", "ETH-USD"]);
});

test("summarizeOrderBook keeps the top levels, the max size and the spread", () => {
  const data = {
    bids: [{ px: 99, qty: 2 }, { px: 98, qty: 5 }, { px: 97, qty: 1 }],
    asks: [{ px: 101, qty: 3 }],
  };
  const book = summarizeOrderBook(data, 2);
  assert.equal(book.bids.length, 2);
  assert.equal(book.asks.length, 1);
  assert.equal(book.maxQty, 5);
  assert.equal(book.spread, 2);
});

test("summarizeOrderBook returns null for a missing or empty book", () => {
  assert.equal(summarizeOrderBook(null), null);
  assert.equal(summarizeOrderBook({ bids: [], asks: [] }), null);
});

test("summarizeOrderBook has no spread when one side is empty", () => {
  const book = summarizeOrderBook({ bids: [{ px: 1, qty: 1 }], asks: [] });
  assert.equal(book.spread, null);
});
