CREATE TYPE "TenderType" AS ENUM ('OPEN', 'LETTERS', 'WALK_IN');
CREATE TYPE "TenderStatus" AS ENUM ('NEW', 'PRICE_REQUESTED', 'QUOTED', 'SUBMITTED', 'TENDER_READING_DONE', 'AWARDED', 'LOST', 'CANCELLED', 'PO_RECEIVED', 'COMPLETED');
CREATE TYPE "BidBondStatus" AS ENUM ('REQUESTED', 'ISSUED', 'SUBMITTED', 'RETURNED', 'EXPIRED');
CREATE TYPE "PricingMethod" AS ENUM ('PERCENTAGE', 'DIRECT');
CREATE TYPE "CostBaseMethod" AS ENUM ('LOWEST', 'AVERAGE', 'SELECTED');
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'PENDING_TENDER_MANAGER', 'PENDING_DIRECTOR', 'APPROVED', 'REJECTED');

CREATE TABLE "Tender" (
    "id" TEXT NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "type" "TenderType" NOT NULL,
    "status" "TenderStatus" NOT NULL DEFAULT 'NEW',
    "institutionId" TEXT NOT NULL,
    "source" TEXT,
    "letterReceivedAt" TIMESTAMP(3),
    "visitAt" TIMESTAMP(3),
    "contactOfficer" TEXT,
    "closingAt" TIMESTAMP(3) NOT NULL,
    "province" TEXT,
    "district" TEXT,
    "responsibleRepId" TEXT NOT NULL,
    "bidBondRequired" BOOLEAN NOT NULL DEFAULT false,
    "bidBondAmount" DECIMAL(14,2),
    "bidBondBank" TEXT,
    "bidBondNumber" TEXT,
    "bidBondIssueDate" TIMESTAMP(3),
    "bidBondExpiryDate" TIMESTAMP(3),
    "bidBondStatus" "BidBondStatus",
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Tender_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TenderItem" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "itemId" TEXT,
    "description" TEXT NOT NULL,
    "specification" TEXT,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "estimatedUnitPrice" DECIMAL(14,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TenderItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierPrice" (
    "id" TEXT NOT NULL,
    "tenderItemId" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "requestedById" TEXT NOT NULL,
    "givenBy" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierPrice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Quotation" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "validityDays" INTEGER NOT NULL,
    "vatRate" DECIMAL(5,2) NOT NULL,
    "discountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "vatAmount" DECIMAL(14,2) NOT NULL,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "grossProfit" DECIMAL(14,2) NOT NULL,
    "terms" TEXT,
    "createdById" TEXT NOT NULL,
    "managerApprovedById" TEXT,
    "managerApprovedAt" TIMESTAMP(3),
    "directorApprovedById" TEXT,
    "directorApprovedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "submittedForApprovalAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuotationLine" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "tenderItemId" TEXT NOT NULL,
    "pricingMethod" "PricingMethod" NOT NULL,
    "costBaseMethod" "CostBaseMethod",
    "supplierPriceId" TEXT,
    "baseUnitCost" DECIMAL(14,2) NOT NULL,
    "transportCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "installationCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "bondCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "commissionCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "marginPercent" DECIMAL(8,2),
    "quantity" DECIMAL(14,3) NOT NULL,
    "sellingUnitPrice" DECIMAL(14,2) NOT NULL,
    "lineSubtotal" DECIMAL(14,2) NOT NULL,
    "grossProfit" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuotationLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Tender_institutionId_referenceNumber_key" ON "Tender"("institutionId", "referenceNumber");
CREATE INDEX "Tender_closingAt_status_idx" ON "Tender"("closingAt", "status");
CREATE INDEX "Tender_responsibleRepId_closingAt_idx" ON "Tender"("responsibleRepId", "closingAt");
CREATE INDEX "Tender_type_status_idx" ON "Tender"("type", "status");
CREATE INDEX "TenderItem_tenderId_idx" ON "TenderItem"("tenderId");
CREATE INDEX "SupplierPrice_tenderItemId_unitPrice_idx" ON "SupplierPrice"("tenderItemId", "unitPrice");
CREATE INDEX "SupplierPrice_validUntil_idx" ON "SupplierPrice"("validUntil");
CREATE UNIQUE INDEX "Quotation_tenderId_version_key" ON "Quotation"("tenderId", "version");
CREATE INDEX "Quotation_status_createdAt_idx" ON "Quotation"("status", "createdAt");
CREATE UNIQUE INDEX "QuotationLine_quotationId_tenderItemId_key" ON "QuotationLine"("quotationId", "tenderItemId");
CREATE INDEX "QuotationLine_tenderItemId_idx" ON "QuotationLine"("tenderItemId");

ALTER TABLE "Tender" ADD CONSTRAINT "Tender_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Tender" ADD CONSTRAINT "Tender_responsibleRepId_fkey" FOREIGN KEY ("responsibleRepId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TenderItem" ADD CONSTRAINT "TenderItem_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenderItem" ADD CONSTRAINT "TenderItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierPrice" ADD CONSTRAINT "SupplierPrice_tenderItemId_fkey" FOREIGN KEY ("tenderItemId") REFERENCES "TenderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierPrice" ADD CONSTRAINT "SupplierPrice_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_managerApprovedById_fkey" FOREIGN KEY ("managerApprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_directorApprovedById_fkey" FOREIGN KEY ("directorApprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QuotationLine" ADD CONSTRAINT "QuotationLine_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuotationLine" ADD CONSTRAINT "QuotationLine_tenderItemId_fkey" FOREIGN KEY ("tenderItemId") REFERENCES "TenderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuotationLine" ADD CONSTRAINT "QuotationLine_supplierPriceId_fkey" FOREIGN KEY ("supplierPriceId") REFERENCES "SupplierPrice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
