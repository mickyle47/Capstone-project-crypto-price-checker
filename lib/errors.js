// Turning errors (mostly Axios errors) into friendly pages and messages.

/**
 * Work out what to tell the user about an error, and which HTTP status to use.
 * Logs the technical details to the console.
 * `symbol` is passed when the error came from looking up one market.
 */
export function describeError(error, symbol) {
  console.error("Error:", error.message);

  // The API answers 404 (or oddly, 500) for markets that do not exist
  const status = error.response && error.response.status;
  if (symbol && [404, 500].includes(status)) {
    return {
      status: 404,
      title: "Market not found",
      message: `We couldn't find a market called "${symbol}". Pick one from the list.`,
    };
  }

  if (error.code === "ECONNABORTED") {
    return {
      status: 504,
      title: "Taking too long",
      message: "The Blockchain.com API took too long to respond. Please try again.",
    };
  }

  return {
    status: 502,
    title: "Something went wrong",
    message: "Something went wrong talking to the Blockchain.com API. Please try again in a moment.",
  };
}

/** Just the user-facing message (for banners on pages that still render). */
export function friendlyError(error, symbol) {
  return describeError(error, symbol).message;
}

/** Show the shared error page with the given status. */
export function renderError(res, status, title, message) {
  return res.status(status).render("error.ejs", { status, title, message });
}
