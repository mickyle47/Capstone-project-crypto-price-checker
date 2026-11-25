// Pure helper functions about markets (no network, no Express) so they are
// easy to test and reuse.

// A market symbol looks like BTC-USD (letters/numbers, one dash)
export const SYMBOL_PATTERN = /^[A-Z0-9]{1,10}-[A-Z0-9]{1,10}$/;

/** Tidy up user input, e.g. " btc-usd " -> "BTC-USD". */
export function normalizeSymbol(input) {
  return String(input ?? "").trim().toUpperCase();
}

/** True when the text looks like a real market symbol. */
export function isValidSymbol(symbol) {
  return SYMBOL_PATTERN.test(symbol);
}

/**
 * Work out the % change between the price 24h ago and the latest trade.
 * Returns null when there is no 24h price to compare against.
 */
export function percentChange(ticker) {
  if (!ticker.price_24h) return null;
  return ((ticker.last_trade_price - ticker.price_24h) / ticker.price_24h) * 100;
}

// Quote currencies shown first in the dropdown, in this order
const QUOTE_ORDER = ["USD", "USDT", "USDC", "EUR", "GBP", "BTC", "ETH"];

/**
 * Group symbols by their quote currency (the part after the dash),
 * e.g. [{ quote: "USD", symbols: ["BTC-USD", ...] }, ...] for the dropdown.
 */
export function groupByQuote(symbols) {
  const groups = {};
  symbols.forEach((symbol) => {
    const quote = symbol.split("-")[1];
    (groups[quote] = groups[quote] || []).push(symbol);
  });

  const rank = (quote) => {
    const i = QUOTE_ORDER.indexOf(quote);
    return i === -1 ? QUOTE_ORDER.length : i;
  };

  return Object.keys(groups)
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((quote) => ({ quote, symbols: groups[quote] }));
}

/**
 * Turn the raw order-book response into what the page needs:
 * the top few bids/asks, the biggest size (for the bars) and the spread.
 * Returns null when there is no order book.
 */
export function summarizeOrderBook(data, levels = 8) {
  if (!data) return null;
  const bids = (data.bids || []).slice(0, levels);
  const asks = (data.asks || []).slice(0, levels);
  if (!bids.length && !asks.length) return null;

  return {
    bids,
    asks,
    // Smallest value is tiny but non-zero so we never divide by zero
    maxQty: Math.max(1e-12, ...bids.map((b) => b.qty), ...asks.map((a) => a.qty)),
    // Spread = gap between the best buy and the best sell price
    spread: bids.length && asks.length ? asks[0].px - bids[0].px : null,
  };
}
