// A tiny in-memory cache where every entry expires after `ttlMs`.
// The number of entries is capped so the cache can never grow without limit.

/**
 *  - ttlMs: how long an entry counts as fresh
 *  - max:   most entries to keep (the oldest is dropped first)
 *  - now:   clock function (tests pass a fake clock)
 */
export function createCache({ ttlMs, max = 100, now = Date.now }) {
  const entries = new Map(); // key -> { value, storedAt }

  return {
    /** The value if it is still fresh, otherwise undefined. */
    get(key) {
      const entry = entries.get(key);
      return entry && now() - entry.storedAt < ttlMs ? entry.value : undefined;
    },

    /** The value even if it has expired (used as a fallback when the API is down). */
    getStale(key) {
      return entries.get(key)?.value;
    },

    set(key, value) {
      entries.delete(key); // re-inserting moves the key to the "newest" end
      entries.set(key, { value, storedAt: now() });
      if (entries.size > max) entries.delete(entries.keys().next().value);
    },
  };
}
