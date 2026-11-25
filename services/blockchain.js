// All communication with the Blockchain.com Exchange API lives here.
// The routes never call Axios directly, which keeps them simple and lets the
// tests swap in a fake HTTP client.
import axios from "axios";
import { createCache } from "../lib/cache.js";

// Base URL of the public Blockchain.com Exchange API (no API key needed)
export const API_URL = "https://api.blockchain.com/v3/exchange";

/**
 * Create an API client.
 *  - http:        the HTTP client (Axios by default; tests pass a fake)
 *  - ttlMs:       how long to keep the full market list in memory
 *  - marketTtlMs: how long to keep one market's ticker / order book
 *  - now:         clock function (tests pass a fake clock)
 *  - timeoutMs:   give up on a request after this long
 */
export function createBlockchainClient({
  http = axios,
  ttlMs = 30 * 1000,
  marketTtlMs = 15 * 1000,
  now = Date.now,
  timeoutMs = 10000,
} = {}) {
  // Every page view would otherwise hit the API, so keep results briefly.
  // Only successful responses are cached (errors are never stored).
  const listCache = createCache({ ttlMs, max: 1, now });
  const tickerCache = createCache({ ttlMs: marketTtlMs, max: 100, now });
  const bookCache = createCache({ ttlMs: marketTtlMs, max: 100, now });

  /**
   * Every market that actually trades (the API lists many dead pairs with a
   * price of 0), sorted by symbol. Cached for `ttlMs`.
   */
  async function getActiveTickers() {
    const cached = listCache.get("all");
    if (cached) return cached;

    try {
      const response = await http.get(`${API_URL}/tickers`, { timeout: timeoutMs });
      const data = response.data
        .filter((t) => t.last_trade_price > 0)
        .sort((a, b) => a.symbol.localeCompare(b.symbol));
      listCache.set("all", data);
      return data;
    } catch (error) {
      // If the API is down but we have an old copy, serve that instead of failing
      const stale = listCache.getStale("all");
      if (stale) {
        console.error("Using stale ticker cache:", error.message);
        return stale;
      }
      throw error;
    }
  }

  /** One market: { symbol, price_24h, volume_24h, last_trade_price }. */
  async function getTicker(symbol) {
    const cached = tickerCache.get(symbol);
    if (cached) return cached;

    const response = await http.get(`${API_URL}/tickers/${symbol}`, { timeout: timeoutMs });
    tickerCache.set(symbol, response.data);
    return response.data;
  }

  /**
   * The order book for a market, or null if it can't be loaded.
   * It's a bonus feature: a failure here shouldn't break the price page.
   */
  async function getOrderBook(symbol) {
    const cached = bookCache.get(symbol);
    if (cached) return cached;

    try {
      const response = await http.get(`${API_URL}/l2/${symbol}`, { timeout: timeoutMs });
      bookCache.set(symbol, response.data);
      return response.data;
    } catch (error) {
      console.error("Order book error:", error.message);
      return null;
    }
  }

  return { getActiveTickers, getTicker, getOrderBook };
}
