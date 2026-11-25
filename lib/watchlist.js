// Watchlist storage: a plain cookie ("watchlist=BTC-USD,ETH-USD") so we don't
// need a database or any extra packages.
import { readCookie } from "./cookies.js";
import { isValidSymbol } from "./markets.js";

export const MAX_WATCHLIST = 20;

/** Read the saved symbols from the request's cookie (invalid entries dropped). */
export function readWatchlist(req) {
  const raw = readCookie(req, "watchlist");
  return raw ? raw.split(",").filter(isValidSymbol) : [];
}

/** Save the list back into a cookie that lasts a year. */
export function saveWatchlist(res, list) {
  res.cookie("watchlist", list.join(","), {
    maxAge: 1000 * 60 * 60 * 24 * 365,
    httpOnly: true,
    sameSite: "lax",
  });
}
