CREATE TYPE "TenderDocumentType" AS ENUM ('TENDER_DOCUMENT', 'ADDENDUM', 'OTHER');

CREATE TABLE "TenderDocument" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "type" "TenderDocumentType" NOT NULL DEFAULT 'TENDER_DOCUMENT',
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenderDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PurchaseOrderDocument" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrderDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TenderDocument_tenderId_createdAt_idx"
    ON "TenderDocument"("tenderId", "createdAt");

CREATE INDEX "PurchaseOrderDocument_purchaseOrderId_createdAt_idx"
    ON "PurchaseOrderDocument"("purchaseOrderId", "createdAt");

ALTER TABLE "TenderDocument"
    ADD CONSTRAINT "TenderDocument_tenderId_fkey"
    FOREIGN KEY ("tenderId") REFERENCES "Tender"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PurchaseOrderDocument"
    ADD CONSTRAINT "PurchaseOrderDocument_purchaseOrderId_fkey"
    FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
