# Crypto Price Checker

A small Express/Node.js website that looks up live cryptocurrency prices using the free, unauthenticated
[Blockchain.com Exchange API](https://api.blockchain.com/v3/). Requests are made server-side with Axios and
rendered with EJS.

## Features

- Choose a market from a dropdown grouped by quote currency (USD, EUR, BTC...) and see its last trade price, price 24h ago, 24h volume and % change
- Order book view (best bids and asks, with size bars and the spread) for each market
- Watchlist: save markets and see their latest prices on one page (stored in a cookie, no database)
- Portfolio: enter how much of each coin you hold and see its value at the last price, with a total per quote currency (dollars and euros are never added together). Saved in a cookie, so nothing is stored on a server
- Home page lists the busiest markets that traded in the last 24 hours (most pairs on this exchange are idle)
- Warns when a price may be out of date (nothing traded in 24h, or the last trade is outside the live bid/ask range) - this exchange is thinly traded
- API results are cached in memory (market list 30s, each market and order book 15s) so page views don't hammer the API; failures are never cached
- Security basics: `helmet` headers, no `x-powered-by`, and a rate limit of 120 requests per minute per visitor
- Prices shown with currency symbols ($, €, £), a "last updated" time, and auto-refresh every 30 seconds on the price and watchlist pages
- Friendly error pages for bad input, unknown markets, timeouts and API outages (details are logged to the console)

## How to run

Requires [Node.js](https://nodejs.org) (LTS).

```bash
npm i
npm start
```

For auto-restart while developing (needs `npm install -g nodemon` once):

```bash
npm run dev
```

Then open <http://localhost:3000>.

Optional environment variables:

| Variable | Purpose |
| --- | --- |
| `PORT` | Use a different port (default 3000) |
| `TRUST_PROXY` | Set to `1` when hosting behind a proxy (Render, Railway...) so the rate limiter sees each visitor's real IP |

## Tests

```bash
npm test
```

Uses Node's built-in test runner (no extra packages) with a fake API client, so no internet is needed.

## API endpoints used

| Purpose | Request |
| --- | --- |
| List all markets | `GET https://api.blockchain.com/v3/exchange/tickers` |
| Order book | `GET https://api.blockchain.com/v3/exchange/l2/{symbol}` |
| One market | `GET https://api.blockchain.com/v3/exchange/tickers/{symbol}` |

## Project structure

```
index.js              Starts the server
app.js                Builds the Express app (views, routes, error handlers)
routes/               pages.js (home, price), watchlist.js and portfolio.js
services/blockchain.js  All Blockchain.com API calls (Axios) + the 30s cache
lib/                  Pure helpers: markets, formatting, errors, cache, cookies, watchlist, portfolio
views/                EJS pages (index, price, watchlist, portfolio, error)
views/partials/       Shared header and footer
public/               CSS and a little browser JavaScript
test/                 Automated tests
```

## Routes

| Route | Description |
| --- | --- |
| `GET /` | Home page: market dropdown + active markets |
| `GET /price?symbol=BTC-USD` | Price details and order book for one market |
| `GET /watchlist` | Saved markets with latest prices |
| `GET /portfolio` | Your holdings with values and totals (`?symbol=BTC-USD&amount=0.5` pre-fills the form) |
| `POST /portfolio/set`, `POST /portfolio/remove` | Add, update or remove a holding (stored in a cookie) |
| `POST /watchlist/add`, `POST /watchlist/remove` | Update the watchlist cookie |
