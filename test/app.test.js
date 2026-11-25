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

// ---- Portfolio ----

const form = (body, cookie) => ({
  method: "POST",
  headers: {
    "content-type": "application/x-www-form-urlencoded",
    ...(cookie ? { cookie } : {}),
  },
  body,
  redirect: "manual",
});

test("portfolio: saving a holding sets a cookie and the page shows its value", () =>
  withServer(fakeBlockchain, async (base) => {
    const save = await fetch(`${base}/portfolio/set`, form("symbol=btc-usd&amount=0.5"));
    assert.equal(save.status, 302);
    assert.equal(save.headers.get("location"), "/portfolio");
    const cookie = save.headers.get("set-cookie").split(";")[0];
    assert.equal(decodeURIComponent(cookie), "portfolio=BTC-USD:0.5");

    const page = await fetch(`${base}/portfolio`, { headers: { cookie } });
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.match(html, /\$29,000\.00/); // 0.5 x 58,000, in the row and the total
    assert.match(html, /Total value in USD/);
  }));

test("portfolio: saving the same market again replaces the amount", () =>
  withServer(fakeBlockchain, async (base) => {
    const cookie = "portfolio=" + encodeURIComponent("BTC-USD:0.5,XRP-EUR:10");
    const save = await fetch(`${base}/portfolio/set`, form("symbol=BTC-USD&amount=2", cookie));
    const updated = decodeURIComponent(save.headers.get("set-cookie").split(";")[0]);
    assert.equal(updated, "portfolio=BTC-USD:2,XRP-EUR:10");
  }));

test("portfolio: totals are per currency and stale prices are flagged", () =>
  withServer(fakeBlockchain, async (base) => {
    const cookie = "portfolio=" + encodeURIComponent("BTC-USD:1,ETH-USD:1,XRP-EUR:100");
    const html = await (await fetch(`${base}/portfolio`, { headers: { cookie } })).text();
    assert.match(html, /Total value in USD/);
    assert.match(html, /\$60,000\.00/); // 58,000 + 2,000
    assert.match(html, /Total value in EUR/);
    assert.match(html, /€85\.00/);
    assert.match(html, /Includes prices that may be out of date/); // ETH-USD has no volume
  }));

test("portfolio: bad amounts are rejected with a message and nothing is saved", () =>
  withServer(fakeBlockchain, async (base) => {
    for (const amount of ["", "0", "-1", "abc", "1e3", "1,5"]) {
      const res = await fetch(`${base}/portfolio/set`, form(`symbol=BTC-USD&amount=${encodeURIComponent(amount)}`));
      assert.equal(res.status, 400, `amount "${amount}"`);
      assert.match(await res.text(), /Enter an amount greater than 0/);
      assert.equal(res.headers.get("set-cookie"), null);
    }
  }));

test("portfolio: markets that are not in the list are rejected", () =>
  withServer(fakeBlockchain, async (base) => {
    for (const symbol of ["FAKE-ZZZ", "bad", "%3Cscript%3E", ""]) {
      const res = await fetch(`${base}/portfolio/set`, form(`symbol=${symbol}&amount=1`));
      assert.equal(res.status, 400, `symbol "${symbol}"`);
      assert.match(await res.text(), /Choose a market from the list/);
    }
  }));

test("portfolio: the form keeps what the user typed when it is rejected", () =>
  withServer(fakeBlockchain, async (base) => {
    const html = await (await fetch(`${base}/portfolio/set`, form("symbol=BTC-USD&amount=abc"))).text();
    assert.match(html, /value="abc"/);
    assert.match(html, /<option value="BTC-USD" selected>/);
  }));

test("portfolio: you can't track more than the maximum number of markets", () => {
  const many = Array.from({ length: 21 }, (_, i) => ({
    symbol: `C${i + 1}-USD`,
    price_24h: 1,
    volume_24h: 1,
    last_trade_price: 1,
  }));
  return withServer({ ...fakeBlockchain, getActiveTickers: async () => many }, async (base) => {
    const cookie = "portfolio=" + encodeURIComponent(many.slice(0, 20).map((t) => `${t.symbol}:1`).join(","));
    const res = await fetch(`${base}/portfolio/set`, form("symbol=C21-USD&amount=1", cookie));
    assert.equal(res.status, 400);
    assert.match(await res.text(), /up to 20 holdings/);

    // ...but updating one that is already tracked still works
    const update = await fetch(`${base}/portfolio/set`, form("symbol=C1-USD&amount=5", cookie));
    assert.equal(update.status, 302);
  });
});

test("portfolio: remove deletes just that holding", () =>
  withServer(fakeBlockchain, async (base) => {
    const cookie = "portfolio=" + encodeURIComponent("BTC-USD:1,XRP-EUR:10");
    const res = await fetch(`${base}/portfolio/remove`, form("symbol=BTC-USD", cookie));
    assert.equal(res.headers.get("location"), "/portfolio");
    assert.equal(decodeURIComponent(res.headers.get("set-cookie").split(";")[0]), "portfolio=XRP-EUR:10");
  }));

test("portfolio: junk cookies and empty POSTs don't crash", () =>
  withServer(fakeBlockchain, async (base) => {
    const page = await fetch(`${base}/portfolio`, { headers: { cookie: "portfolio=%E0%A4%A,<script>" } });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /No holdings yet/);

    const empty = await fetch(`${base}/portfolio/set`, { method: "POST", redirect: "manual" });
    assert.equal(empty.status, 400);
    const remove = await fetch(`${base}/portfolio/remove`, { method: "POST", redirect: "manual" });
    assert.equal(remove.status, 302);
  }));

test("portfolio: still lists holdings (without prices) when the API is down", () =>
  withServer(
    { ...fakeBlockchain, getActiveTickers: async () => { throw new Error("down"); } },
    async (base) => {
      const cookie = "portfolio=" + encodeURIComponent("BTC-USD:1");
      const res = await fetch(`${base}/portfolio`, { headers: { cookie } });
      const html = await res.text();
      assert.equal(res.status, 502);
      assert.match(html, /BTC-USD/);
      assert.match(html, /Price unavailable/);
    }
  ));

test("portfolio: the form can be pre-filled from the URL", () =>
  withServer(fakeBlockchain, async (base) => {
    const html = await (await fetch(`${base}/portfolio?symbol=btc-usd&amount=0.5`)).text();
    assert.match(html, /<option value="BTC-USD" selected>/);
    assert.match(html, /value="0\.5"/);
  }));

test("price page links to the portfolio form for that coin", () =>
  withServer(fakeBlockchain, async (base) => {
    const html = await (await fetch(`${base}/price?symbol=BTC-USD`)).text();
    assert.match(html, /href="\/portfolio\?symbol=BTC-USD"[^>]*>Track how much BTC you hold/);
  }));
