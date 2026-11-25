// All communication with the Blockchain.com Exchange API lives here.
// The routes never call Axios directly, which keeps them simple and lets the
// tests swap in a fake HTTP client.
import axios from "axios";

// Base URL of the public Blockchain.com Exchange API (no API key needed)
export const API_URL = "https://api.blockchain.com/v3/exchange";

/**
 * Create an API client.
 *  - http:      the HTTP client (Axios by default; tests pass a fake)
 *  - ttlMs:     how long to keep the market list in memory
 *  - now:       clock function (tests pass a fake clock)
 *  - timeoutMs: give up on a request after this long
 */
export function createBlockchainClient({
  http = axios,
  ttlMs = 30 * 1000,
  now = Date.now,
  timeoutMs = 10000,
} = {}) {
  // The full ticker list is big and changes slowly, so cache it briefly
  let cache = { data: null, fetchedAt: 0 };

  /**
   * Every market that actually trades (the API lists many dead pairs with a
   * price of 0), sorted by symbol. Cached for `ttlMs`.
   */
  async function getActiveTickers() {
    if (cache.data && now() - cache.fetchedAt < ttlMs) return cache.data;

    try {
      const response = await http.get(`${API_URL}/tickers`, { timeout: timeoutMs });
      const data = response.data
        .filter((t) => t.last_trade_price > 0)
        .sort((a, b) => a.symbol.localeCompare(b.symbol));
      cache = { data, fetchedAt: now() };
      return data;
    } catch (error) {
      // If the API is down but we have an old copy, serve that instead of failing
      if (cache.data) {
        console.error("Using stale ticker cache:", error.message);
        return cache.data;
      }
      throw error;
    }
  }

  /** One market: { symbol, price_24h, volume_24h, last_trade_price }. */
  async function getTicker(symbol) {
    const response = await http.get(`${API_URL}/tickers/${symbol}`, { timeout: timeoutMs });
    return response.data;
  }

  /**
   * The order book for a market, or null if it can't be loaded.
   * It's a bonus feature: a failure here shouldn't break the price page.
   */
  async function getOrderBook(symbol) {
    try {
      const response = await http.get(`${API_URL}/l2/${symbol}`, { timeout: timeoutMs });
      return response.data;
    } catch (error) {
      console.error("Order book error:", error.message);
      return null;
    }
  }

  return { getActiveTickers, getTicker, getOrderBook };
}
