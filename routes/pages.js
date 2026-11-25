// Home page and price page.
import express from "express";
import {
  groupByQuote,
  isValidSymbol,
  normalizeSymbol,
  assessFreshness,
  percentChange,
  summarizeOrderBook,
} from "../lib/markets.js";
import { describeError, friendlyError, renderError } from "../lib/errors.js";
import { readWatchlist } from "../lib/watchlist.js";

export default function pageRoutes(blockchain) {
  const router = express.Router();

  // Home page: dropdown of markets plus a table of recently traded markets
  router.get("/", async (req, res) => {
    try {
      const tickers = await blockchain.getActiveTickers();

      // Markets that actually traded in the last 24h, busiest first (top 5).
      // (Most listed pairs on this exchange are idle, so "top gainers"
      // would just be a list of 0% changes.)
      const active = tickers
        .filter((t) => t.volume_24h > 0)
        .map((t) => ({ ...t, change: percentChange(t) }))
        .sort((a, b) => b.volume_24h - a.volume_24h)
        .slice(0, 5);

      res.render("index.ejs", {
        groups: groupByQuote(tickers.map((t) => t.symbol)),
        active,
        error: null,
      });
    } catch (error) {
      // Still render the page so the user sees a message instead of a crash
      res.status(502).render("index.ejs", {
        groups: [],
        active: [],
        error: friendlyError(error),
      });
    }
  });

  // Price page: one market's ticker and order book
  router.get("/price", async (req, res) => {
    const symbol = normalizeSymbol(req.query.symbol);

    if (!isValidSymbol(symbol)) {
      return renderError(res, 400, "Invalid market", "Please choose a valid market, like BTC-USD.");
    }

    try {
      // Ask for the ticker and the order book at the same time
      const [raw, bookData] = await Promise.all([
        blockchain.getTicker(symbol),
        blockchain.getOrderBook(symbol),
      ]);

      const book = summarizeOrderBook(bookData);

      res.render("price.ejs", {
        title: symbol,
        refreshSeconds: 30, // the page reloads itself to stay current
        updatedAt: new Date(),
        ticker: { ...raw, change: percentChange(raw) },
        book,
        stale: assessFreshness(raw, book), // warns when the last price may be old
        watching: readWatchlist(req).includes(symbol),
      });
    } catch (error) {
      const { status, title, message } = describeError(error, symbol);
      renderError(res, status, title, message);
    }
  });

  return router;
}
