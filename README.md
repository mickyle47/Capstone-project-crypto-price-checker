# Crypto Price Checker

A small Express/Node.js website that looks up live cryptocurrency prices using the free, unauthenticated
[Blockchain.com Exchange API](https://api.blockchain.com/v3/). Requests are made server-side with Axios and
rendered with EJS.

## Features

- Pick (or type) a market such as `BTC-USD` and see its last trade price, price 24h ago, 24h volume and % change
- Home page shows the top 5 gainers over the last 24 hours
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
| One market | `GET https://api.blockchain.com/v3/exchange/tickers/{symbol}` |

## Project structure

```
index.js              Express server, routes and Axios calls
public/styles/        CSS
views/                EJS pages (index, price)
views/partials/       Shared header and footer
```

## Routes

| Route | Description |
| --- | --- |
| `GET /` | Home page: market search + top gainers |
| `GET /price?symbol=BTC-USD` | Price details for one market |
