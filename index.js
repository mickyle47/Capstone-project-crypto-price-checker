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

/**
 * Fetch every ticker from the API and keep only pairs that actually trade
 * (the API lists many dead pairs with a price of 0).
 * Returns an array like [{ symbol, price_24h, volume_24h, last_trade_price }]
 */
async function getActiveTickers() {
  const response = await axios.get(`${API_URL}/tickers`, { timeout: 10000 });
  return response.data
    .filter((t) => t.last_trade_price > 0)
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
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

// Home page: show a dropdown of markets plus a "top movers" table
app.get("/", async (req, res) => {
  try {
    const tickers = await getActiveTickers();

    // Top 5 biggest gainers over the last 24h (ignore pairs with no 24h price)
    const movers = tickers
      .map((t) => ({ ...t, change: percentChange(t) }))
      .filter((t) => t.change !== null)
      .sort((a, b) => b.change - a.change)
      .slice(0, 5);

    res.render("index.ejs", {
      symbols: tickers.map((t) => t.symbol),
      movers,
      error: null,
    });
  } catch (error) {
    // Still render the page so the user sees a message instead of a crash
    res.status(502).render("index.ejs", {
      symbols: [],
      movers: [],
      error: friendlyError(error),
    });
  }
});

// Price page: the form submits ?symbol=BTC-USD, we look up that one market
app.get("/price", async (req, res) => {
  // Normalise input, e.g. " btc-usd " -> "BTC-USD"
  const symbol = (req.query.symbol || "").trim().toUpperCase();

  // Only allow letters/numbers with one dash (guards against odd input in the URL)
  if (!/^[A-Z0-9]{1,10}-[A-Z0-9]{1,10}$/.test(symbol)) {
    return res.status(400).render("price.ejs", {
      ticker: null,
      error: "Please choose a valid market, like BTC-USD.",
    });
  }

  try {
    const response = await axios.get(`${API_URL}/tickers/${symbol}`, {
      timeout: 10000,
    });
    const ticker = { ...response.data, change: percentChange(response.data) };
    res.render("price.ejs", { ticker, error: null });
  } catch (error) {
    const status = error.response && [404, 500].includes(error.response.status) ? 404 : 502;
    res.status(status).render("price.ejs", {
      ticker: null,
      error: friendlyError(error, symbol),
    });
  }
});

// Catch-all for unknown URLs
app.use((req, res) => {
  res.status(404).render("price.ejs", {
    ticker: null,
    error: "That page doesn't exist.",
  });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
