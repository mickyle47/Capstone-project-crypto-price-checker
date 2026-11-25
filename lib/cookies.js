// Reading cookies without an extra package.

/**
 * The decoded value of the named cookie, or null if it is missing or mangled.
 * `name` must be a plain word like "watchlist" (it is put into a pattern).
 */
export function readCookie(req, name) {
  const match = (req.headers.cookie || "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null; // a mangled cookie should never crash the page
  }
}
