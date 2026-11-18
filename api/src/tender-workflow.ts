import type { TenderStatus } from "@prisma/client";

const preSubmissionStatuses: TenderStatus[] = ["NEW", "PRICE_REQUESTED", "QUOTED"];

export function isPreSubmissionStatus(status: TenderStatus): boolean {
  return preSubmissionStatuses.includes(status);
}

export function canRecordAward(status: TenderStatus): boolean {
  return ["SUBMITTED", "TENDER_READING_DONE", "AWARDED", "LOST", "PO_RECEIVED"].includes(status);
}

export function hasCompleteAwardCoverage(
  items: { id: string; quantity: number }[],
  awardLines: { tenderItemId: string; quantity: number }[],
): boolean {
  return items.every((item) => {
    const awarded = awardLines
      .filter((line) => line.tenderItemId === item.id)
      .reduce((sum, line) => sum + line.quantity, 0);
    return Math.abs(awarded - item.quantity) <= 1e-8;
  });
}

export function areWonAwardQuantitiesOrdered(
  awardLines: { tenderItemId: string; quantity: number; wonByUs: boolean }[],
  purchaseOrderLines: { tenderItemId: string; quantity: number }[],
): boolean {
  const wonByItem = new Map<string, number>();
  const orderedByItem = new Map<string, number>();
  for (const line of awardLines) {
    if (line.wonByUs) wonByItem.set(line.tenderItemId, (wonByItem.get(line.tenderItemId) ?? 0) + line.quantity);
  }
  for (const line of purchaseOrderLines) {
    orderedByItem.set(line.tenderItemId, (orderedByItem.get(line.tenderItemId) ?? 0) + line.quantity);
  }
  return [...wonByItem].every(([itemId, quantity]) =>
    (orderedByItem.get(itemId) ?? 0) + 1e-8 >= quantity);
}
