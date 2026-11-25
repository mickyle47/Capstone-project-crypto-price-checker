// Builds the Express app. Kept separate from index.js (which starts the
// server) so the tests can create an app with a fake API client.
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import * as fmt from "./lib/format.js";
import { renderError } from "./lib/errors.js";
import { createBlockchainClient } from "./services/blockchain.js";
import pageRoutes from "./routes/pages.js";
import watchlistRoutes from "./routes/watchlist.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp({ blockchain = createBlockchainClient() } = {}) {
  const app = express();

  // Tell Express where the .ejs files are and make the formatting helpers
  // available in every template as `fmt`
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));
  app.locals.fmt = fmt;

  // Serve CSS/JS/images from "public", and read submitted form data
  app.use(express.static(path.join(__dirname, "public")));
  app.use(express.urlencoded({ extended: true }));

  app.use("/", pageRoutes(blockchain));
  app.use("/watchlist", watchlistRoutes(blockchain));

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
