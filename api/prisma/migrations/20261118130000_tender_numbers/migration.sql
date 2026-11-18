CREATE SEQUENCE "Tender_tenderNumber_seq" AS INTEGER;

ALTER TABLE "Tender"
ADD COLUMN "tenderNumber" INTEGER;

WITH numbered_tenders AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, "id" ASC)::INTEGER AS "tenderNumber"
  FROM "Tender"
)
UPDATE "Tender" AS tender
SET "tenderNumber" = numbered_tenders."tenderNumber"
FROM numbered_tenders
WHERE tender."id" = numbered_tenders."id";

SELECT setval(
  '"Tender_tenderNumber_seq"',
  COALESCE(MAX("tenderNumber"), 0) + 1,
  false
)
FROM "Tender";

ALTER TABLE "Tender"
ALTER COLUMN "tenderNumber" SET DEFAULT nextval('"Tender_tenderNumber_seq"'::regclass),
ALTER COLUMN "tenderNumber" SET NOT NULL;

ALTER SEQUENCE "Tender_tenderNumber_seq"
OWNED BY "Tender"."tenderNumber";

CREATE UNIQUE INDEX "Tender_tenderNumber_key" ON "Tender"("tenderNumber");
