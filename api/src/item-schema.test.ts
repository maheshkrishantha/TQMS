import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMasterNameLookup,
  itemImportSchema,
  MAX_ITEM_IMPORT_ROWS,
  normalizeMasterName,
} from "./item-schema.js";

test("item import accepts 2,000 rows and rejects row 2,001", () => {
  const rows = Array.from({ length: MAX_ITEM_IMPORT_ROWS + 1 }, (_, index) => ({
    code: `ITEM-${index + 1}`,
    name: `Item ${index + 1}`,
    unitId: "unit-id",
    categoryName: null,
    brandName: null,
  }));
  assert.equal(itemImportSchema.parse(rows.slice(0, MAX_ITEM_IMPORT_ROWS)).length, 2000);
  assert.throws(() => itemImportSchema.parse(rows));
});

test("item import accepts category and brand names instead of master IDs", () => {
  const [item] = itemImportSchema.parse([{
    code: "ITEM-1",
    name: "Item",
    unitId: "unit-id",
    categoryName: "Office Supplies",
    brandName: "Acme",
  }]);
  assert.equal(item.categoryName, "Office Supplies");
  assert.equal(item.brandName, "Acme");
});

test("item import still accepts master IDs from an older client", () => {
  const [item] = itemImportSchema.parse([{
    code: "ITEM-1",
    name: "Item",
    unitId: "unit-id",
    categoryId: "category-id",
    brandId: "brand-id",
  }]);
  assert.equal(item.categoryId, "category-id");
  assert.equal(item.brandId, "brand-id");
  assert.equal(item.categoryName, undefined);
  assert.equal(item.brandName, undefined);
});

test("normalized master lookup prefers active records", () => {
  const lookup = buildMasterNameLookup([
    { id: "inactive", name: "Office-Supplies", active: false },
    { id: "active", name: "Office Supplies", active: true },
  ]);
  assert.equal(normalizeMasterName(" Office.Supplies "), "officesupplies");
  assert.equal(lookup.get(normalizeMasterName("OFFICE SUPPLIES"))?.id, "active");
});
