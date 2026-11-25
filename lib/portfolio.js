// Portfolio: how much of each coin the visitor holds. Stored in a cookie like
// "portfolio=BTC-USD:0.5,ETH-USD:2" - it never leaves the visitor's browser
// (apart from being sent back to this server with each request).
import { readCookie } from "./cookies.js";
import { isValidSymbol, percentChange } from "./markets.js";
import { splitSymbol } from "./format.js";

export const MAX_HOLDINGS = 20;
const MAX_AMOUNT = 1e12;

/**
 * Turn what the user typed into a number of coins, or null if it isn't usable.
 * Accepts plain decimals like "0.5", "2", ".25" (no commas, no exponents),
 * greater than 0, rounded to 8 decimal places like the exchange does.
 */
export function parseAmount(input) {
  const text = String(input ?? "").trim();
  if (!/^(\d+\.?\d*|\.\d+)$/.test(text)) return null;

  const amount = Math.round(Number(text) * 1e8) / 1e8;
  return amount > 0 && amount <= MAX_AMOUNT ? amount : null;
}

/** "BTC-USD:0.5,ETH-USD:2" -> [{ symbol, amount }, ...] (bad or repeated entries dropped). */
export function parsePortfolio(raw) {
  if (!raw) return [];
  const seen = new Set();
  const holdings = [];

  for (const part of raw.split(",")) {
    const [symbol, text] = part.split(":");
    const amount = parseAmount(text);
    if (!isValidSymbol(symbol) || amount === null || seen.has(symbol)) continue;
    seen.add(symbol);
    holdings.push({ symbol, amount });
  }
  return holdings.slice(0, MAX_HOLDINGS);
}

/** [{ symbol, amount }, ...] -> "BTC-USD:0.5,ETH-USD:2" */
export function serializePortfolio(holdings) {
  return holdings
    // toFixed avoids exponent notation (1e-8) which parseAmount would reject
    .map((h) => `${h.symbol}:${h.amount.toFixed(8).replace(/\.?0+$/, "")}`)
    .join(",");
}

export function readPortfolio(req) {
  return parsePortfolio(readCookie(req, "portfolio"));
}

/** Save the holdings into a cookie that lasts a year. */
export function savePortfolio(res, holdings) {
  res.cookie("portfolio", serializePortfolio(holdings), {
    maxAge: 1000 * 60 * 60 * 24 * 365,
    httpOnly: true,
    sameSite: "lax",
  });
}

/**
 * Work out what the holdings are worth right now.
 *  - holdings:  [{ symbol, amount }]
 *  - bySymbol:  Map of symbol -> ticker (from the API)
 * Returns:
 *  - rows:     one per holding, with ticker, value (amount x last price) and
 *              `stale` when nothing traded in 24h; value is null if no price
 *  - totals:   one per quote currency (you can't add dollars to euros)
 *  - unpriced: how many holdings couldn't be valued
 */
export function valuePortfolio(holdings, bySymbol) {
  const totals = new Map();

  const rows = holdings.map(({ symbol, amount }) => {
    const { base, quote } = splitSymbol(symbol);
    const ticker = bySymbol.get(symbol) ?? null;
    const value = ticker ? amount * ticker.last_trade_price : null;
    const stale = Boolean(ticker) && !ticker.volume_24h;

    if (value !== null) {
      const total = totals.get(quote) ?? { quote, value: 0, count: 0, stale: false };
      total.value += value;
      total.count += 1;
      total.stale = total.stale || stale;
      totals.set(quote, total);
    }

    return {
      symbol,
      amount,
      base,
      quote,
      ticker: ticker ? { ...ticker, change: percentChange(ticker) } : null,
      value,
      stale,
    };
  });

  return {
    rows,
    totals: [...totals.values()].sort((a, b) => a.quote.localeCompare(b.quote)),
    unpriced: rows.filter((r) => r.value === null).length,
  };
}
