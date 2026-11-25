// Formatting helpers used by the EJS views (exposed there as `fmt`).

// Currency symbols for the fiat quote currencies we know about
const CURRENCY_SYMBOLS = { USD: "$", EUR: "€", GBP: "£" };

/** "BTC-USD" -> { base: "BTC", quote: "USD" } */
export function splitSymbol(symbol) {
  const [base, quote] = String(symbol).split("-");
  return { base, quote };
}

/** Plain number with thousands separators, up to 8 decimals. */
export function formatNumber(value, minimumFractionDigits = 0) {
  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits,
    maximumFractionDigits: 8,
  });
}

/**
 * A price in its quote currency: "$58,000.00", "€0.85", or "0.05 BTC"
 * for crypto/stablecoin quotes that have no symbol.
 */
export function formatPrice(value, quote) {
  const symbol = CURRENCY_SYMBOLS[quote];
  if (symbol) return `${symbol}${formatNumber(value, 2)}`;
  return `${formatNumber(value)} ${quote}`;
}

/** An amount of the base asset: "0.6546 BTC". */
export function formatAmount(value, base) {
  return `${formatNumber(value)} ${base}`;
}

/** "+1.23%", "-2.52%", or an em dash when there is no figure. */
export function formatChange(change) {
  if (change === null || change === undefined) return "—";
  return `${change > 0 ? "+" : ""}${change.toFixed(2)}%`;
}

/** CSS class for a change: green for up/flat, red for down. */
export function changeClass(change) {
  return change !== null && change < 0 ? "down" : "up";
}

/** Clock time like "14:32:05" for the "last updated" label. */
export function formatTime(date) {
  return date.toLocaleTimeString("en-GB");
}
