import { test } from "node:test";
import assert from "node:assert/strict";
import { createBlockchainClient } from "../services/blockchain.js";

test.beforeEach((t) => t.mock.method(console, "error", () => {}));

const TICKERS = [
  { symbol: "ETH-USD", price_24h: 0, volume_24h: 0, last_trade_price: 0 }, // dead pair
  { symbol: "XRP-EUR", price_24h: 1, volume_24h: 5, last_trade_price: 1 },
  { symbol: "BTC-USD", price_24h: 2, volume_24h: 1, last_trade_price: 2 },
];

// A fake HTTP client that counts calls and can be told to fail
function fakeHttp() {
  const http = {
    calls: 0,
    fail: false,
    async get() {
      http.calls++;
      if (http.fail) throw new Error("network down");
      return { data: TICKERS };
    },
  };
  return http;
}

test("getActiveTickers drops dead pairs and sorts by symbol", async () => {
  const client = createBlockchainClient({ http: fakeHttp() });
  const tickers = await client.getActiveTickers();
  assert.deepEqual(tickers.map((t) => t.symbol), ["BTC-USD", "XRP-EUR"]);
});

test("the ticker list is cached until the TTL runs out", async () => {
  const http = fakeHttp();
  let time = 0;
  const client = createBlockchainClient({ http, ttlMs: 1000, now: () => time });

  await client.getActiveTickers();
  time = 999;
  await client.getActiveTickers();
  assert.equal(http.calls, 1, "second call within the TTL should use the cache");

  time = 1001;
  await client.getActiveTickers();
  assert.equal(http.calls, 2, "a call after the TTL should refetch");
});

test("an old cached list is served when the API fails", async () => {
  const http = fakeHttp();
  let time = 0;
  const client = createBlockchainClient({ http, ttlMs: 1000, now: () => time });

  const first = await client.getActiveTickers();
  http.fail = true;
  time = 5000;
  assert.deepEqual(await client.getActiveTickers(), first);
});

test("with no cache, an API failure is thrown", async () => {
  const http = fakeHttp();
  http.fail = true;
  const client = createBlockchainClient({ http });
  await assert.rejects(client.getActiveTickers(), /network down/);
});

test("getOrderBook returns null instead of throwing", async () => {
  const http = fakeHttp();
  http.fail = true;
  const client = createBlockchainClient({ http });
  assert.equal(await client.getOrderBook("BTC-USD"), null);
});

// Per-market caching (ticker and order book)
function countingHttp() {
  const http = {
    calls: [],
    failBook: false,
    async get(url) {
      http.calls.push(url);
      if (url.includes("/l2/")) {
        if (http.failBook) throw new Error("book down");
        return { data: { bids: [], asks: [] } };
      }
      return { data: { symbol: "BTC-USD", last_trade_price: 1 } };
    },
  };
  return http;
}

test("getTicker is cached per market until the market TTL runs out", async () => {
  const http = countingHttp();
  let time = 0;
  const client = createBlockchainClient({ http, marketTtlMs: 1000, now: () => time });

  await client.getTicker("BTC-USD");
  await client.getTicker("BTC-USD");
  assert.equal(http.calls.length, 1, "same market within the TTL is served from cache");

  await client.getTicker("ETH-USD");
  assert.equal(http.calls.length, 2, "a different market is a separate cache entry");

  time = 1001;
  await client.getTicker("BTC-USD");
  assert.equal(http.calls.length, 3, "after the TTL it is fetched again");
});

test("the order book is cached, but a failed order book is not", async () => {
  const http = countingHttp();
  const client = createBlockchainClient({ http });

  await client.getOrderBook("BTC-USD");
  await client.getOrderBook("BTC-USD");
  assert.equal(http.calls.length, 1);

  http.failBook = true;
  assert.equal(await client.getOrderBook("ETH-USD"), null);
  http.failBook = false;
  assert.notEqual(await client.getOrderBook("ETH-USD"), null, "the failure must not be remembered");
});

test("ticker errors are not cached", async () => {
  const http = countingHttp();
  const original = http.get;
  http.get = async (url) => {
    if (http.failTicker) throw new Error("down");
    return original(url);
  };
  const client = createBlockchainClient({ http });

  http.failTicker = true;
  await assert.rejects(client.getTicker("BTC-USD"), /down/);
  http.failTicker = false;
  assert.equal((await client.getTicker("BTC-USD")).symbol, "BTC-USD");
});
