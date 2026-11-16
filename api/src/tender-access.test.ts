import assert from "node:assert/strict";
import test from "node:test";
import { tenderAccessFilter } from "./tender-access.js";

test("non-sales roles retain the existing unscoped tender access", () => {
  assert.deepEqual(tenderAccessFilter({ id: "manager", role: "TENDER_MANAGER" }, []), {});
});

test("sales representatives always retain access to directly assigned tenders", () => {
  assert.deepEqual(tenderAccessFilter({ id: "rep-1", role: "SALES_REP" }, []), {
    OR: [{ responsibleRepId: "rep-1" }],
  });
});

test("sales representative area access matches province-wide and district assignments", () => {
  const filter = tenderAccessFilter(
    { id: "rep-1", role: "SALES_REP" },
    [
      { province: "Western", district: "" },
      { province: "Central", district: "Kandy" },
    ],
  );
  const clauses = filter.OR;
  assert.ok(Array.isArray(clauses));
  assert.equal(clauses.length, 7);
  assert.ok(clauses.some((clause) =>
    JSON.stringify(clause).includes('"province":"Western"') &&
    !JSON.stringify(clause).includes('"district":"Kandy"')));
  assert.ok(clauses.some((clause) =>
    JSON.stringify(clause).includes('"district":"Kandy"') &&
    JSON.stringify(clause).includes('"province":"Central"')));
});
