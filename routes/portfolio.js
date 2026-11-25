// Portfolio page: record how much of each coin you hold and see what it is worth.
import express from "express";
import { groupByQuote, isValidSymbol, normalizeSymbol } from "../lib/markets.js";
import { friendlyError } from "../lib/errors.js";
import {
  MAX_HOLDINGS,
  parseAmount,
  readPortfolio,
  savePortfolio,
  valuePortfolio,
} from "../lib/portfolio.js";

export default function portfolioRoutes(blockchain) {
  const router = express.Router();

  /**
   * Render the portfolio page.
   *  - status: HTTP status (400 when a form submission was rejected)
   *  - error:  message to show above the form
   *  - form:   what to pre-fill the form with
   */
  async function renderPage(req, res, { status = 200, error = null, form = {} } = {}) {
    const holdings = readPortfolio(req);
    let tickers = [];

    try {
      tickers = await blockchain.getActiveTickers();
    } catch (apiError) {
      // Still show the saved holdings, just without prices
      status = 502;
      error = error ?? friendlyError(apiError);
    }

    const bySymbol = new Map(tickers.map((t) => [t.symbol, t]));
    res.status(status).render("portfolio.ejs", {
      title: "Portfolio",
      refreshSeconds: 30,
      updatedAt: new Date(),
      groups: groupByQuote(tickers.map((t) => t.symbol)),
      ...valuePortfolio(holdings, bySymbol),
      maxHoldings: MAX_HOLDINGS,
      error,
      form: { symbol: form.symbol ?? "", amount: form.amount ?? "" },
    });
  }

  router.get("/", (req, res) => {
    // Links like /portfolio?symbol=BTC-USD&amount=0.5 pre-fill the form
    const symbol = normalizeSymbol(req.query.symbol);
    const amount = parseAmount(req.query.amount);
    return renderPage(req, res, {
      form: { symbol: isValidSymbol(symbol) ? symbol : "", amount: amount ?? "" },
    });
  });

  // Add a holding, or replace the amount if the market is already there
  router.post("/set", async (req, res) => {
    const symbol = normalizeSymbol(req.body?.symbol);
    const amount = parseAmount(req.body?.amount);
    const form = { symbol, amount: req.body?.amount ?? "" };
    const reject = (error) => renderPage(req, res, { status: 400, error, form });

    if (amount === null) {
      return reject("Enter an amount greater than 0, like 0.5 (numbers only, up to 8 decimals).");
    }

    // Only markets with a price can be valued, so they must be in the list
    let tickers;
    try {
      tickers = await blockchain.getActiveTickers();
    } catch (apiError) {
      return renderPage(req, res, { status: 502, error: friendlyError(apiError), form });
    }
    if (!isValidSymbol(symbol) || !tickers.some((t) => t.symbol === symbol)) {
      return reject("Choose a market from the list.");
    }

    const holdings = readPortfolio(req);
    const existing = holdings.find((h) => h.symbol === symbol);
    if (existing) {
      existing.amount = amount;
    } else if (holdings.length >= MAX_HOLDINGS) {
      return reject(`You can track up to ${MAX_HOLDINGS} holdings. Remove one first.`);
    } else {
      holdings.push({ symbol, amount });
    }

    savePortfolio(res, holdings);
    res.redirect("/portfolio");
  });

  router.post("/remove", (req, res) => {
    const symbol = normalizeSymbol(req.body?.symbol);
    savePortfolio(res, readPortfolio(req).filter((h) => h.symbol !== symbol));
    res.redirect("/portfolio");
  });

  return router;
}
