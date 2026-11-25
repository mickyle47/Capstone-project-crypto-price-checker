# Crypto Price Checker

A small Express/Node.js website that looks up live cryptocurrency prices using the free, unauthenticated
[Blockchain.com Exchange API](https://api.blockchain.com/v3/). Requests are made server-side with Axios and
rendered with EJS.

## Features

- Choose a market from a dropdown grouped by quote currency (USD, EUR, BTC...) and see its last trade price, price 24h ago, 24h volume and % change
- Order book view (best bids and asks, with size bars and the spread) for each market
- Watchlist: save markets and see their latest prices on one page (stored in a cookie, no database)
- Home page lists the busiest markets that traded in the last 24 hours (most pairs on this exchange are idle)
- The full market list is cached in memory for 30 seconds to keep pages fast and avoid over-calling the API
- Friendly error messages for bad input, unknown markets, timeouts and API outages (details are logged to the console)

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

Then open <http://localhost:3000>. Set the `PORT` environment variable to use a different port.

## API endpoints used

| Purpose | Request |
| --- | --- |
| List all markets | `GET https://api.blockchain.com/v3/exchange/tickers` |
| Order book | `GET https://api.blockchain.com/v3/exchange/l2/{symbol}` |
| One market | `GET https://api.blockchain.com/v3/exchange/tickers/{symbol}` |

## Project structure

```
index.js              Express server, routes and Axios calls
public/styles/        CSS
views/                EJS pages (index, price, watchlist)
views/partials/       Shared header and footer
```

## Routes

| Route | Description |
| --- | --- |
| `GET /` | Home page: market dropdown + active markets |
| `GET /price?symbol=BTC-USD` | Price details and order book for one market |
| `GET /watchlist` | Saved markets with latest prices |
| `POST /watchlist/add`, `POST /watchlist/remove` | Update the watchlist cookie |
