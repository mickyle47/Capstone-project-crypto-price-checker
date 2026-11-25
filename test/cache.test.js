import { test } from "node:test";
import assert from "node:assert/strict";
import { createCache } from "../lib/cache.js";

test("a value is fresh until the TTL runs out", () => {
  let time = 0;
  const cache = createCache({ ttlMs: 1000, now: () => time });
  cache.set("a", 1);
  time = 999;
  assert.equal(cache.get("a"), 1);
  time = 1000;
  assert.equal(cache.get("a"), undefined);
});

test("getStale still returns an expired value", () => {
  let time = 0;
  const cache = createCache({ ttlMs: 1000, now: () => time });
  cache.set("a", 1);
  time = 5000;
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.getStale("a"), 1);
  assert.equal(cache.getStale("missing"), undefined);
});

test("set refreshes the timestamp of an existing key", () => {
  let time = 0;
  const cache = createCache({ ttlMs: 1000, now: () => time });
  cache.set("a", 1);
  time = 900;
  cache.set("a", 2);
  time = 1500;
  assert.equal(cache.get("a"), 2);
});

test("the oldest entry is dropped when the cache is full", () => {
  const cache = createCache({ ttlMs: 1000, max: 2 });
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);
  assert.equal(cache.getStale("a"), undefined);
  assert.equal(cache.get("b"), 2);
  assert.equal(cache.get("c"), 3);
});
