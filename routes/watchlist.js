// Watchlist page plus the add/remove actions.
import express from "express";
import { isValidSymbol, normalizeSymbol, percentChange } from "../lib/markets.js";
import { friendlyError } from "../lib/errors.js";
import { MAX_WATCHLIST, readWatchlist, saveWatchlist } from "../lib/watchlist.js";

export default function watchlistRoutes(blockchain) {
  const router = express.Router();

  // Show the saved markets with their latest prices
  router.get("/", async (req, res) => {
    const saved = readWatchlist(req);
    const page = { title: "Watchlist", refreshSeconds: 30, updatedAt: new Date() };

    if (!saved.length) return res.render("watchlist.ejs", { ...page, items: [], error: null });

    try {
      const tickers = await blockchain.getActiveTickers();
      const bySymbol = new Map(tickers.map((t) => [t.symbol, t]));
      const items = saved.map((symbol) => {
        const t = bySymbol.get(symbol);
        return { symbol, ticker: t ? { ...t, change: percentChange(t) } : null };
      });
      res.render("watchlist.ejs", { ...page, items, error: null });
    } catch (error) {
      res.status(502).render("watchlist.ejs", { ...page, items: [], error: friendlyError(error) });
    }
  });

  // Add a market, then go back to its price page
  router.post("/add", (req, res) => {
    const symbol = normalizeSymbol(req.body?.symbol);
    if (!isValidSymbol(symbol)) return res.redirect("/");

    const list = readWatchlist(req);
    if (!list.includes(symbol) && list.length < MAX_WATCHLIST) list.push(symbol);
    saveWatchlist(res, list);
    res.redirect(`/price?symbol=${encodeURIComponent(symbol)}`);
  });

  // Remove a market (the form says whether to return to the price page)
  router.post("/remove", (req, res) => {
    const symbol = normalizeSymbol(req.body?.symbol);
    saveWatchlist(res, readWatchlist(req).filter((s) => s !== symbol));

    const back = req.body?.from === "price" && isValidSymbol(symbol)
      ? `/price?symbol=${encodeURIComponent(symbol)}`
      : "/watchlist";
    res.redirect(back);
  });

  return router;
}
