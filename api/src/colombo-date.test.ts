import assert from "node:assert/strict";
import test from "node:test";
import { colomboDayDifference, colomboDayStart } from "./colombo-date.js";

test("Colombo date boundaries use the local midnight offset", () => {
  assert.equal(
    colomboDayStart(new Date("2026-01-02T18:29:00.000Z")).toISOString(),
    "2026-01-01T18:30:00.000Z",
  );
  assert.equal(
    colomboDayStart(new Date("2026-01-02T18:30:00.000Z")).toISOString(),
    "2026-01-02T18:30:00.000Z",
  );
});

test("Colombo day differences ignore the time of day", () => {
  assert.equal(
    colomboDayDifference(new Date("2026-01-02T18:30:00.000Z"), new Date("2026-01-02T18:29:00.000Z")),
    1,
  );
});
