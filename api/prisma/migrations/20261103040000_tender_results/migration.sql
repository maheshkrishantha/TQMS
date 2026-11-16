CREATE TYPE "TenderReadingMethod" AS ENUM ('CALL', 'VISIT');
CREATE TYPE "AwardType" AS ENUM ('WHOLE', 'ITEM_WISE');
CREATE TYPE "PerformanceBondStatus" AS ENUM ('NOT_REQUIRED', 'REQUESTED', 'ISSUED', 'SUBMITTED', 'RETURNED', 'EXPIRED');
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'PARTIAL', 'DELIVERED');

CREATE TABLE "TenderReading" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "readingDate" TIMESTAMP(3) NOT NULL,
    "method" "TenderReadingMethod" NOT NULL,
    "reportedById" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TenderReading_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReadingBid" (
    "id" TEXT NOT NULL,
    "readingId" TEXT NOT NULL,
    "competitorId" TEXT,
    "companyName" TEXT NOT NULL,
    "isOurCompany" BOOLEAN NOT NULL DEFAULT false,
    "totalPrice" DECIMAL(14,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReadingBid_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReadingBidLine" (
    "id" TEXT NOT NULL,
    "readingBidId" TEXT NOT NULL,
    "tenderItemId" TEXT NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    CONSTRAINT "ReadingBidLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReadingBidHistory" (
    "id" TEXT NOT NULL,
    "readingBidId" TEXT NOT NULL,
    "editedById" TEXT NOT NULL,
    "previousData" JSONB NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReadingBidHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TenderExpectedBidder" (
    "tenderId" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TenderExpectedBidder_pkey" PRIMARY KEY ("tenderId","competitorId")
);

CREATE TABLE "TenderAward" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "type" "AwardType" NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TenderAward_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TenderAwardLine" (
    "id" TEXT NOT NULL,
    "awardId" TEXT NOT NULL,
    "tenderItemId" TEXT NOT NULL,
    "winnerCompetitorId" TEXT,
    "winnerName" TEXT NOT NULL,
    "wonByUs" BOOLEAN NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "lossReason" TEXT,
    CONSTRAINT "TenderAwardLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "quotationId" TEXT,
    "poNumber" TEXT NOT NULL,
    "poDate" TIMESTAMP(3) NOT NULL,
    "deliveryDate" TIMESTAMP(3),
    "terms" TEXT,
    "paymentTerms" TEXT,
    "documentUrl" TEXT,
    "deliveryStatus" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "invoiceNumber" TEXT,
    "paymentReceived" BOOLEAN NOT NULL DEFAULT false,
    "performanceBondRequired" BOOLEAN NOT NULL DEFAULT false,
    "performanceBondAmount" DECIMAL(14,2),
    "performanceBondBank" TEXT,
    "performanceBondNumber" TEXT,
    "performanceBondIssueDate" TIMESTAMP(3),
    "performanceBondExpiryDate" TIMESTAMP(3),
    "performanceBondStatus" "PerformanceBondStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PurchaseOrderLine" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "tenderItemId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TenderReading_tenderId_readingDate_idx" ON "TenderReading"("tenderId","readingDate");
CREATE INDEX "ReadingBid_readingId_idx" ON "ReadingBid"("readingId");
CREATE INDEX "ReadingBid_competitorId_idx" ON "ReadingBid"("competitorId");
CREATE UNIQUE INDEX "ReadingBidLine_readingBidId_tenderItemId_key" ON "ReadingBidLine"("readingBidId","tenderItemId");
CREATE INDEX "ReadingBidLine_tenderItemId_idx" ON "ReadingBidLine"("tenderItemId");
CREATE INDEX "ReadingBidHistory_readingBidId_changedAt_idx" ON "ReadingBidHistory"("readingBidId","changedAt");
CREATE INDEX "TenderAward_tenderId_awardedAt_idx" ON "TenderAward"("tenderId","awardedAt");
CREATE UNIQUE INDEX "TenderAwardLine_awardId_tenderItemId_key" ON "TenderAwardLine"("awardId","tenderItemId");
CREATE UNIQUE INDEX "PurchaseOrder_tenderId_poNumber_key" ON "PurchaseOrder"("tenderId","poNumber");
CREATE INDEX "PurchaseOrder_tenderId_poDate_idx" ON "PurchaseOrder"("tenderId","poDate");
CREATE INDEX "PurchaseOrder_performanceBondExpiryDate_idx" ON "PurchaseOrder"("performanceBondExpiryDate");
CREATE UNIQUE INDEX "PurchaseOrderLine_purchaseOrderId_tenderItemId_key" ON "PurchaseOrderLine"("purchaseOrderId","tenderItemId");

ALTER TABLE "TenderReading" ADD CONSTRAINT "TenderReading_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenderReading" ADD CONSTRAINT "TenderReading_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReadingBid" ADD CONSTRAINT "ReadingBid_readingId_fkey" FOREIGN KEY ("readingId") REFERENCES "TenderReading"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReadingBid" ADD CONSTRAINT "ReadingBid_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReadingBidLine" ADD CONSTRAINT "ReadingBidLine_readingBidId_fkey" FOREIGN KEY ("readingBidId") REFERENCES "ReadingBid"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReadingBidLine" ADD CONSTRAINT "ReadingBidLine_tenderItemId_fkey" FOREIGN KEY ("tenderItemId") REFERENCES "TenderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReadingBidHistory" ADD CONSTRAINT "ReadingBidHistory_readingBidId_fkey" FOREIGN KEY ("readingBidId") REFERENCES "ReadingBid"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReadingBidHistory" ADD CONSTRAINT "ReadingBidHistory_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TenderExpectedBidder" ADD CONSTRAINT "TenderExpectedBidder_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenderExpectedBidder" ADD CONSTRAINT "TenderExpectedBidder_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TenderAward" ADD CONSTRAINT "TenderAward_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TenderAwardLine" ADD CONSTRAINT "TenderAwardLine_awardId_fkey" FOREIGN KEY ("awardId") REFERENCES "TenderAward"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenderAwardLine" ADD CONSTRAINT "TenderAwardLine_tenderItemId_fkey" FOREIGN KEY ("tenderItemId") REFERENCES "TenderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TenderAwardLine" ADD CONSTRAINT "TenderAwardLine_winnerCompetitorId_fkey" FOREIGN KEY ("winnerCompetitorId") REFERENCES "Competitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_tenderItemId_fkey" FOREIGN KEY ("tenderItemId") REFERENCES "TenderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
