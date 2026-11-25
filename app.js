// Builds the Express app. Kept separate from index.js (which starts the
// server) so the tests can create an app with a fake API client.
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import * as fmt from "./lib/format.js";
import { renderError } from "./lib/errors.js";
import { createBlockchainClient } from "./services/blockchain.js";
import pageRoutes from "./routes/pages.js";
import watchlistRoutes from "./routes/watchlist.js";
import portfolioRoutes from "./routes/portfolio.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp({
  blockchain = createBlockchainClient(),
  // Per visitor (IP address): 120 page views per minute is plenty for a person
  rateLimitOptions = { windowMs: 60 * 1000, limit: 120 },
} = {}) {
  const app = express();

  // Behind a hosting proxy (Render, Railway...) set TRUST_PROXY=1 so the rate
  // limiter sees each visitor's real IP instead of the proxy's
  if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);

  // Safer default HTTP headers (and stop advertising that we use Express)
  app.disable("x-powered-by");
  // (Helmet's "upgrade-insecure-requests" is switched off: it would make a
  // plain-HTTP setup such as http://192.168.x.x:3000 fail to load its CSS.
  // HTTPS is the hosting platform's job.)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: { "upgrade-insecure-requests": null },
      },
    })
  );

  // Tell Express where the .ejs files are and make the formatting helpers
  // available in every template as `fmt`
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));
  app.locals.fmt = fmt;

  // Serve CSS/JS/images from "public", and read submitted form data
  app.use(express.static(path.join(__dirname, "public")));
  app.use(express.urlencoded({ extended: true }));

  // Every page view can trigger calls to the Blockchain.com API, so limit how
  // often one visitor can ask. Static files above are not counted.
  app.use(
    rateLimit({
      ...rateLimitOptions,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) =>
        renderError(res, 429, "Slow down", "Too many requests. Please wait a minute and try again."),
    })
  );

  app.use("/", pageRoutes(blockchain));
  app.use("/watchlist", watchlistRoutes(blockchain));
  app.use("/portfolio", portfolioRoutes(blockchain));

  // Unknown URL
  app.use((req, res) => {
    renderError(res, 404, "Page not found", "That page doesn't exist.");
  });

  // Anything unexpected that was thrown inside a route lands here
  // (four arguments is how Express recognises an error handler)
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error("Unhandled error:", err);
    // Client mistakes (e.g. a request body that is too large) keep their 4xx status
    if (err.status >= 400 && err.status < 500) {
      return renderError(res, err.status, "Bad request", "That request couldn't be processed.");
    }
    renderError(res, 500, "Something went wrong", "Sorry, something broke on our side. Please try again.");
  });

  return app;
}
