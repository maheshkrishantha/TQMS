import assert from "node:assert/strict";
import test from "node:test";
import {
  areWonAwardQuantitiesOrdered,
  canRecordAward,
  hasCompleteAwardCoverage,
  isPreSubmissionStatus,
} from "./tender-workflow.js";

test("quotation preparation and submission are limited to pre-submission tenders", () => {
  for (const status of ["NEW", "PRICE_REQUESTED", "QUOTED"] as const) {
    assert.equal(isPreSubmissionStatus(status), true);
  }
  for (const status of ["SUBMITTED", "TENDER_READING_DONE", "AWARDED", "LOST", "PO_RECEIVED", "CANCELLED", "COMPLETED"] as const) {
    assert.equal(isPreSubmissionStatus(status), false);
  }
});

test("awards can continue after a partial purchase order is recorded", () => {
  for (const status of ["SUBMITTED", "TENDER_READING_DONE", "AWARDED", "LOST", "PO_RECEIVED"] as const) {
    assert.equal(canRecordAward(status), true);
  }
  for (const status of ["NEW", "PRICE_REQUESTED", "QUOTED", "CANCELLED", "COMPLETED"] as const) {
    assert.equal(canRecordAward(status), false);
  }
});

test("tender completion requires award outcomes for every requested quantity", () => {
  const items = [{ id: "item-1", quantity: 10 }, { id: "item-2", quantity: 5 }];
  const completeAwards = [
    { tenderItemId: "item-1", quantity: 6 },
    { tenderItemId: "item-1", quantity: 4 },
    { tenderItemId: "item-2", quantity: 5 },
  ];
  assert.equal(hasCompleteAwardCoverage(items, completeAwards), true);
  assert.equal(hasCompleteAwardCoverage(items, completeAwards.slice(0, 2)), false);
});

test("tender completion requires purchase orders for all quantities awarded to us", () => {
  const awards = [
    { tenderItemId: "item-1", quantity: 6, wonByUs: true },
    { tenderItemId: "item-1", quantity: 4, wonByUs: false },
  ];
  assert.equal(areWonAwardQuantitiesOrdered(awards, [{ tenderItemId: "item-1", quantity: 6 }]), true);
  assert.equal(areWonAwardQuantitiesOrdered(awards, [{ tenderItemId: "item-1", quantity: 5 }]), false);
});
