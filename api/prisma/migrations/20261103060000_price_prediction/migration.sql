CREATE TYPE "PredictionStatus" AS ENUM ('READY', 'INSUFFICIENT_DATA');

CREATE TABLE "PricePredictionRun" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "tenderItemId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "status" "PredictionStatus" NOT NULL,
    "modelVersion" TEXT NOT NULL DEFAULT 'rule-v1',
    "totalReadingCount" INTEGER NOT NULL,
    "winningSampleCount" INTEGER NOT NULL,
    "competitorSampleCount" INTEGER NOT NULL,
    "targetWinProbability" DECIMAL(5,4),
    "chosenBidPrice" DECIMAL(14,2),
    "chosenWinProbability" DECIMAL(5,4),
    "predictedLow" DECIMAL(14,2),
    "predictedMostLikely" DECIMAL(14,2),
    "predictedHigh" DECIMAL(14,2),
    "recommendedBidPrice" DECIMAL(14,2),
    "currentUnitCost" DECIMAL(14,2),
    "expectedGrossProfit" DECIMAL(14,2),
    "supportTenderIds" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PricePredictionRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PricePredictionRun_tenderId_tenderItemId_createdAt_idx"
    ON "PricePredictionRun"("tenderId", "tenderItemId", "createdAt");
CREATE INDEX "PricePredictionRun_status_createdAt_idx"
    ON "PricePredictionRun"("status", "createdAt");

ALTER TABLE "PricePredictionRun"
    ADD CONSTRAINT "PricePredictionRun_tenderId_fkey"
    FOREIGN KEY ("tenderId") REFERENCES "Tender"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PricePredictionRun"
    ADD CONSTRAINT "PricePredictionRun_tenderItemId_fkey"
    FOREIGN KEY ("tenderItemId") REFERENCES "TenderItem"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PricePredictionRun"
    ADD CONSTRAINT "PricePredictionRun_requestedById_fkey"
    FOREIGN KEY ("requestedById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
