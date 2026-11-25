// End-to-end tests of the pages, using a fake API client (no internet needed).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../app.js";

test.beforeEach((t) => t.mock.method(console, "error", () => {}));

const TICKERS = [
  { symbol: "BTC-USD", price_24h: 60000, volume_24h: 1.5, last_trade_price: 58000 },
  { symbol: "XRP-EUR", price_24h: 0.85, volume_24h: 300, last_trade_price: 0.85 },
  { symbol: "ETH-USD", price_24h: 0, volume_24h: 0, last_trade_price: 2000 },
];

const notFound = () => Object.assign(new Error("not found"), { response: { status: 404 } });

// A fake blockchain client with the same three methods as the real one
const fakeBlockchain = {
  getActiveTickers: async () => TICKERS,
  getTicker: async (symbol) => {
    const ticker = TICKERS.find((t) => t.symbol === symbol);
    if (!ticker) throw notFound();
    return ticker;
  },
  getOrderBook: async () => ({
    bids: [{ px: 57900, qty: 0.5, num: 1 }],
    asks: [{ px: 58100, qty: 0.25, num: 1 }],
  }),
};

// Start the app on a random free port, run the test, then shut it down
async function withServer(blockchain, run) {
  const server = createApp({ blockchain }).listen(0);
  try {
    await run(`http://localhost:${server.address().port}`);
  } finally {
    server.close();
  }
}

test("home page lists markets and active markets", () =>
  withServer(fakeBlockchain, async (base) => {
    const res = await fetch(base);
    const html = await res.text();
    assert.equal(res.status, 200);
    assert.match(html, /<optgroup label="Priced in USD">/);
    assert.match(html, /\$58,000\.00/); // currency symbol in the active table
    assert.doesNotMatch(html, /href="\/price\?symbol=ETH-USD"/); // no volume => not "active"
  }));

test("home page shows a friendly message when the API is down", () =>
  withServer(
    { ...fakeBlockchain, getActiveTickers: async () => { throw new Error("down"); } },
    async (base) => {
      const res = await fetch(base);
      assert.equal(res.status, 502);
      assert.match(await res.text(), /Something went wrong talking to the Blockchain\.com API/);
    }
  ));

test("price page shows the price, order book and auto-refresh", () =>
  withServer(fakeBlockchain, async (base) => {
    const res = await fetch(`${base}/price?symbol=btc-usd`);
    const html = await res.text();
    assert.equal(res.status, 200);
    assert.match(html, /\$58,000\.00/);
    assert.match(html, /Order book/);
    assert.match(html, /\$200\.00/); // spread
    assert.match(html, /http-equiv="refresh" content="30"/);
    assert.match(html, /Add to watchlist/);
  }));

test("price page still works when the order book is unavailable", () =>
  withServer({ ...fakeBlockchain, getOrderBook: async () => null }, async (base) => {
    const res = await fetch(`${base}/price?symbol=BTC-USD`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /order book isn't available/);
  }));

test("invalid symbol gives a 400 error page", () =>
  withServer(fakeBlockchain, async (base) => {
    const res = await fetch(`${base}/price?symbol=bad`);
    assert.equal(res.status, 400);
    assert.match(await res.text(), /valid market/);
  }));

test("unknown market gives a 404 error page", () =>
  withServer(fakeBlockchain, async (base) => {
    const res = await fetch(`${base}/price?symbol=FAKE-ZZZ`);
    assert.equal(res.status, 404);
    assert.match(await res.text(), /find a market called/);
  }));

test("unknown URL gives a 404 error page", () =>
  withServer(fakeBlockchain, async (base) => {
    const res = await fetch(`${base}/nope`);
    assert.equal(res.status, 404);
    assert.match(await res.text(), /Page not found/);
  }));

test("a synchronous throw from the API client is handled", () =>
  withServer(
    { ...fakeBlockchain, getTicker: () => { throw new Error("sync crash"); } },
    async (base) => {
      const res = await fetch(`${base}/price?symbol=BTC-USD`);
      assert.equal(res.status, 502);
    }
  ));

test("a POST with no body doesn't crash the watchlist", () =>
  withServer(fakeBlockchain, async (base) => {
    const res = await fetch(`${base}/watchlist/add`, { method: "POST", redirect: "manual" });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "/");
  }));

test("an oversized request body gets the error page with a 413, not a crash", () =>
  withServer(fakeBlockchain, async (base) => {
    const res = await fetch(`${base}/watchlist/add`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "symbol=" + "A".repeat(200 * 1024),
    });
    assert.equal(res.status, 413);
    assert.match(await res.text(), /Bad request/);
  }));

test("watchlist: add sets a cookie, the list shows it, remove clears it", () =>
  withServer(fakeBlockchain, async (base) => {
    // Add
    const add = await fetch(`${base}/watchlist/add`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "symbol=btc-usd",
      redirect: "manual",
    });
    assert.equal(add.status, 302);
    assert.equal(add.headers.get("location"), "/price?symbol=BTC-USD");
    const cookie = add.headers.get("set-cookie").split(";")[0];
    assert.equal(cookie, "watchlist=BTC-USD");

    // The list shows it with a currency symbol
    const list = await fetch(`${base}/watchlist`, { headers: { cookie } });
    assert.match(await list.text(), /BTC-USD[\s\S]*\$58,000\.00/);

    // The price page offers to remove it
    const price = await fetch(`${base}/price?symbol=BTC-USD`, { headers: { cookie } });
    assert.match(await price.text(), /Remove from watchlist/);

    // Remove
    const remove = await fetch(`${base}/watchlist/remove`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", cookie },
      body: "symbol=BTC-USD",
      redirect: "manual",
    });
    assert.equal(remove.headers.get("location"), "/watchlist");
    assert.match(remove.headers.get("set-cookie"), /^watchlist=;/);
  }));

test("watchlist ignores junk in the cookie and invalid symbols", () =>
  withServer(fakeBlockchain, async (base) => {
    const list = await fetch(`${base}/watchlist`, { headers: { cookie: "watchlist=%E0%A4%A,<script>" } });
    assert.equal(list.status, 200);
    assert.match(await list.text(), /Nothing here yet/);

    const add = await fetch(`${base}/watchlist/add`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "symbol=%3Cscript%3E",
      redirect: "manual",
    });
    assert.equal(add.headers.get("location"), "/");
    assert.equal(add.headers.get("set-cookie"), null);
  }));

// ---- Stale-price warnings ----

test("price page warns when nothing traded in the last 24 hours", () =>
  withServer(fakeBlockchain, async (base) => {
    const res = await fetch(`${base}/price?symbol=ETH-USD`); // volume_24h is 0
    assert.match(await res.text(), /Nothing has traded in the last 24 hours/);
  }));

test("price page warns when the last trade is outside the order book range", () =>
  withServer(
    {
      ...fakeBlockchain,
      getOrderBook: async () => ({
        bids: [{ px: 59000, qty: 1, num: 1 }],
        asks: [{ px: 60000, qty: 1, num: 1 }],
      }),
    },
    async (base) => {
      const html = await (await fetch(`${base}/price?symbol=BTC-USD`)).text();
      assert.match(html, /outside the current\s+order book range/);
      assert.match(html, /\$59,000\.00/);
    }
  ));

test("price page has no warning when the price looks current", () =>
  withServer(fakeBlockchain, async (base) => {
    // fake book is 57,900 / 58,100 and the last trade is 58,000
    const html = await (await fetch(`${base}/price?symbol=BTC-USD`)).text();
    assert.doesNotMatch(html, /class="warning"/);
  }));

test("watchlist marks markets with no recent volume", () =>
  withServer(fakeBlockchain, async (base) => {
    const html = await (await fetch(`${base}/watchlist`, { headers: { cookie: "watchlist=ETH-USD,BTC-USD" } })).text();
    assert.equal((html.match(/class="warn"/g) || []).length, 1); // only ETH-USD
  }));

// ---- Security: headers and rate limiting ----

test("responses carry security headers and hide x-powered-by", () =>
  withServer(fakeBlockchain, async (base) => {
    const res = await fetch(base);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.ok(res.headers.get("content-security-policy"));
    assert.equal(res.headers.get("x-powered-by"), null);
  }));

test("too many requests from one visitor get a 429 page", async () => {
  const server = createApp({
    blockchain: fakeBlockchain,
    rateLimitOptions: { windowMs: 60 * 1000, limit: 2 },
  }).listen(0);
  try {
    const base = `http://localhost:${server.address().port}`;
    assert.equal((await fetch(base)).status, 200);
    assert.equal((await fetch(base)).status, 200);
    const blocked = await fetch(base);
    assert.equal(blocked.status, 429);
    assert.match(await blocked.text(), /Too many requests/);
  } finally {
    server.close();
  }
});

test("static files are not counted by the rate limit", async () => {
  const server = createApp({
    blockchain: fakeBlockchain,
    rateLimitOptions: { windowMs: 60 * 1000, limit: 1 },
  }).listen(0);
  try {
    const base = `http://localhost:${server.address().port}`;
    for (let i = 0; i < 3; i++) assert.equal((await fetch(`${base}/styles/style.css`)).status, 200);
    assert.equal((await fetch(base)).status, 200); // first counted request still allowed
  } finally {
    server.close();
  }
});
