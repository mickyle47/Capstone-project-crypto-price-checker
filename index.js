import express from "express";
import axios from "axios";

const app = express();
const port = process.env.PORT || 3000;

// Base URL of the public Blockchain.com Exchange API (no API key needed)
const API_URL = "https://api.blockchain.com/v3/exchange";

// Tell Express to render .ejs files from the "views" folder
app.set("view engine", "ejs");

// Serve CSS/images from the "public" folder, and read submitted form data
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));

// A market symbol looks like BTC-USD (letters/numbers, one dash)
const SYMBOL_PATTERN = /^[A-Z0-9]{1,10}-[A-Z0-9]{1,10}$/;

// ---------------------------------------------------------------------------
// Caching: the full ticker list is big and changes slowly, so keep it in
// memory for a short time instead of calling the API on every page view.
// ---------------------------------------------------------------------------
const CACHE_MS = 30 * 1000;
let tickerCache = { data: null, fetchedAt: 0 };

/**
 * Fetch every ticker from the API (cached for 30s) and keep only pairs that
 * actually trade (the API lists many dead pairs with a price of 0).
 * Returns an array like [{ symbol, price_24h, volume_24h, last_trade_price }]
 */
async function getActiveTickers() {
  const fresh = tickerCache.data && Date.now() - tickerCache.fetchedAt < CACHE_MS;
  if (fresh) return tickerCache.data;

  try {
    const response = await axios.get(`${API_URL}/tickers`, { timeout: 10000 });
    const data = response.data
      .filter((t) => t.last_trade_price > 0)
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
    tickerCache = { data, fetchedAt: Date.now() };
    return data;
  } catch (error) {
    // If the API is down but we have an old copy, serve that instead of failing
    if (tickerCache.data) {
      console.error("Using stale ticker cache:", error.message);
      return tickerCache.data;
    }
    throw error;
  }
}

/**
 * Work out the % change between the price 24h ago and the latest trade.
 * Returns null when there is no 24h price to compare against.
 */
function percentChange(ticker) {
  if (!ticker.price_24h) return null;
  return ((ticker.last_trade_price - ticker.price_24h) / ticker.price_24h) * 100;
}

/**
 * Turn an Axios error into a short, friendly message for the user,
 * and log the technical details to the console.
 */
function friendlyError(error, symbol) {
  console.error("API error:", error.message);
  // The API answers 404 (or oddly, 500) for markets that do not exist
  if (symbol && error.response && [404, 500].includes(error.response.status)) {
    return `We couldn't find a market called "${symbol}". Pick one from the list.`;
  }
  if (error.code === "ECONNABORTED") {
    return "The Blockchain.com API took too long to respond. Please try again.";
  }
  return "Something went wrong talking to the Blockchain.com API. Please try again in a moment.";
}

/**
 * Group symbols by their quote currency (the part after the dash),
 * e.g. { USD: ["BTC-USD", ...], EUR: [...] } for the dropdown.
 */
function groupByQuote(symbols) {
  const groups = {};
  symbols.forEach((s) => {
    const quote = s.split("-")[1];
    (groups[quote] = groups[quote] || []).push(s);
  });
  // Put the popular quote currencies first, the rest alphabetically
  const order = ["USD", "USDT", "USDC", "EUR", "GBP", "BTC", "ETH"];
  return Object.keys(groups)
    .sort((a, b) => {
      const ia = order.indexOf(a) === -1 ? 99 : order.indexOf(a);
      const ib = order.indexOf(b) === -1 ? 99 : order.indexOf(b);
      return ia - ib || a.localeCompare(b);
    })
    .map((quote) => ({ quote, symbols: groups[quote] }));
}

// ---------------------------------------------------------------------------
// Watchlist: stored in a plain cookie ("watchlist=BTC-USD,ETH-USD") so we
// don't need a database or any extra packages.
// ---------------------------------------------------------------------------
const MAX_WATCHLIST = 20;

function readWatchlist(req) {
  const match = (req.headers.cookie || "").match(/(?:^|;\s*)watchlist=([^;]*)/);
  if (!match) return [];
  return decodeURIComponent(match[1])
    .split(",")
    .filter((s) => SYMBOL_PATTERN.test(s));
}

function saveWatchlist(res, list) {
  res.cookie("watchlist", list.join(","), {
    maxAge: 1000 * 60 * 60 * 24 * 365, // one year
    httpOnly: true,
    sameSite: "lax",
  });
}

// Home page: dropdown of markets plus a table of recently traded markets
app.get("/", async (req, res) => {
  try {
    const tickers = await getActiveTickers();

    // Markets that actually traded in the last 24h, busiest first (top 5).
    // (Most listed pairs on this exchange are idle, so "top gainers" would be all 0%.)
    const movers = tickers
      .filter((t) => t.volume_24h > 0)
      .map((t) => ({ ...t, change: percentChange(t) }))
      .sort((a, b) => b.volume_24h - a.volume_24h)
      .slice(0, 5);

    res.render("index.ejs", {
      groups: groupByQuote(tickers.map((t) => t.symbol)),
      movers,
      error: null,
    });
  } catch (error) {
    // Still render the page so the user sees a message instead of a crash
    res.status(502).render("index.ejs", {
      groups: [],
      movers: [],
      error: friendlyError(error),
    });
  }
});

// Price page: shows one market's ticker and its order book
app.get("/price", async (req, res) => {
  // Normalise input, e.g. " btc-usd " -> "BTC-USD"
  const symbol = (req.query.symbol || "").trim().toUpperCase();

  if (!SYMBOL_PATTERN.test(symbol)) {
    return res.status(400).render("price.ejs", {
      ticker: null,
      book: null,
      watching: false,
      error: "Please choose a valid market, like BTC-USD.",
    });
  }

  try {
    // Ask for the ticker and the order book at the same time
    const [tickerRes, bookRes] = await Promise.all([
      axios.get(`${API_URL}/tickers/${symbol}`, { timeout: 10000 }),
      // The order book is a bonus: if it fails we still show the price
      axios
        .get(`${API_URL}/l2/${symbol}`, { timeout: 10000 })
        .catch((e) => {
          console.error("Order book error:", e.message);
          return null;
        }),
    ]);

    const ticker = { ...tickerRes.data, change: percentChange(tickerRes.data) };

    // Build a small order-book summary (top 8 levels per side)
    let book = null;
    if (bookRes) {
      const bids = bookRes.data.bids.slice(0, 8);
      const asks = bookRes.data.asks.slice(0, 8);
      const maxQty = Math.max(1e-12, ...bids.map((b) => b.qty), ...asks.map((a) => a.qty));
      book = {
        bids,
        asks,
        maxQty,
        // Spread = gap between the best buy and best sell price
        spread: bids.length && asks.length ? asks[0].px - bids[0].px : null,
      };
    }

    res.render("price.ejs", {
      ticker,
      book,
      watching: readWatchlist(req).includes(symbol),
      error: null,
    });
  } catch (error) {
    const notFound = error.response && [404, 500].includes(error.response.status);
    res.status(notFound ? 404 : 502).render("price.ejs", {
      ticker: null,
      book: null,
      watching: false,
      error: friendlyError(error, symbol),
    });
  }
});

// Watchlist page: show the saved markets with their latest prices
app.get("/watchlist", async (req, res) => {
  const saved = readWatchlist(req);
  if (!saved.length) return res.render("watchlist.ejs", { items: [], error: null });

  try {
    const tickers = await getActiveTickers();
    const bySymbol = new Map(tickers.map((t) => [t.symbol, t]));
    const items = saved.map((symbol) => {
      const t = bySymbol.get(symbol);
      return { symbol, ticker: t ? { ...t, change: percentChange(t) } : null };
    });
    res.render("watchlist.ejs", { items, error: null });
  } catch (error) {
    res.status(502).render("watchlist.ejs", { items: [], error: friendlyError(error) });
  }
});

// Add a market to the watchlist, then go back to its price page
app.post("/watchlist/add", (req, res) => {
  const symbol = (req.body.symbol || "").trim().toUpperCase();
  if (SYMBOL_PATTERN.test(symbol)) {
    const list = readWatchlist(req);
    if (!list.includes(symbol) && list.length < MAX_WATCHLIST) list.push(symbol);
    saveWatchlist(res, list);
  }
  res.redirect(`/price?symbol=${encodeURIComponent(symbol)}`);
});

// Remove a market from the watchlist (the form says where to return to)
app.post("/watchlist/remove", (req, res) => {
  const symbol = (req.body.symbol || "").trim().toUpperCase();
  saveWatchlist(res, readWatchlist(req).filter((s) => s !== symbol));
  res.redirect(req.body.from === "price" ? `/price?symbol=${encodeURIComponent(symbol)}` : "/watchlist");
});

// Catch-all for unknown URLs
app.use((req, res) => {
  res.status(404).render("price.ejs", {
    ticker: null,
    book: null,
    watching: false,
    error: "That page doesn't exist.",
  });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
