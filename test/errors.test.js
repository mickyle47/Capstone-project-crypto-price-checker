import { test } from "node:test";
import assert from "node:assert/strict";
import { describeError } from "../lib/errors.js";

// Keep the test output clean: describeError logs the error to the console
test.beforeEach((t) => t.mock.method(console, "error", () => {}));

const apiError = (status) => Object.assign(new Error(`status ${status}`), { response: { status } });

test("an unknown market (API 404) becomes a 404 page", () => {
  const result = describeError(apiError(404), "FAKE-ZZZ");
  assert.equal(result.status, 404);
  assert.match(result.message, /FAKE-ZZZ/);
});

test("the API's odd 500 for unknown markets is also treated as not found", () => {
  assert.equal(describeError(apiError(500), "FAKE-ZZZ").status, 404);
});

test("a 500 with no symbol is a gateway error, not 'not found'", () => {
  assert.equal(describeError(apiError(500)).status, 502);
});

test("a timeout becomes a 504", () => {
  const error = Object.assign(new Error("timeout"), { code: "ECONNABORTED" });
  assert.equal(describeError(error, "BTC-USD").status, 504);
});

test("anything else becomes a generic 502", () => {
  assert.equal(describeError(new Error("boom"), "BTC-USD").status, 502);
});
