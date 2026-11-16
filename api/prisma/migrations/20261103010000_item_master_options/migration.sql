-- Create database-backed item categories, brands, and units while preserving
-- any values already present in the existing Item table.
CREATE TABLE "ItemCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ItemCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ItemCategory_name_key" ON "ItemCategory"("name");
CREATE UNIQUE INDEX "Brand_name_key" ON "Brand"("name");
CREATE UNIQUE INDEX "Unit_name_key" ON "Unit"("name");

INSERT INTO "ItemCategory" ("id", "name", "createdAt", "updatedAt")
SELECT 'category-' || md5(value), value, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT BTRIM("category") AS value
    FROM "Item"
    WHERE "category" IS NOT NULL AND BTRIM("category") <> ''
) AS existing_categories
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "Brand" ("id", "name", "createdAt", "updatedAt")
SELECT 'brand-' || md5(value), value, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT BTRIM("brand") AS value
    FROM "Item"
    WHERE "brand" IS NOT NULL AND BTRIM("brand") <> ''
) AS existing_brands
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "Unit" ("id", "name", "abbreviation", "createdAt", "updatedAt")
SELECT
    'unit-' || md5(value),
    value,
    COALESCE(NULLIF(UPPER(LEFT(REGEXP_REPLACE(value, '[^A-Za-z0-9]', '', 'g'), 5)), ''), 'EA'),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT COALESCE(NULLIF(BTRIM("unit"), ''), 'Each') AS value
    FROM "Item"
) AS existing_units
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "Unit" ("id", "name", "abbreviation", "createdAt", "updatedAt")
VALUES ('unit-' || md5('Each'), 'Each', 'EA', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

ALTER TABLE "Item"
    ADD COLUMN "categoryId" TEXT,
    ADD COLUMN "brandId" TEXT,
    ADD COLUMN "unitId" TEXT;

UPDATE "Item" AS item
SET "categoryId" = category."id"
FROM "ItemCategory" AS category
WHERE item."category" IS NOT NULL
  AND category."name" = BTRIM(item."category");

UPDATE "Item" AS item
SET "brandId" = brand."id"
FROM "Brand" AS brand
WHERE item."brand" IS NOT NULL
  AND brand."name" = BTRIM(item."brand");

UPDATE "Item" AS item
SET "unitId" = unit."id"
FROM "Unit" AS unit
WHERE unit."name" = COALESCE(NULLIF(BTRIM(item."unit"), ''), 'Each');

ALTER TABLE "Item"
    ALTER COLUMN "unitId" SET NOT NULL,
    DROP COLUMN "category",
    DROP COLUMN "brand",
    DROP COLUMN "unit";

CREATE INDEX "Item_categoryId_idx" ON "Item"("categoryId");
CREATE INDEX "Item_brandId_idx" ON "Item"("brandId");
CREATE INDEX "Item_unitId_idx" ON "Item"("unitId");

ALTER TABLE "Item"
    ADD CONSTRAINT "Item_categoryId_fkey"
        FOREIGN KEY ("categoryId") REFERENCES "ItemCategory"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "Item_brandId_fkey"
        FOREIGN KEY ("brandId") REFERENCES "Brand"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "Item_unitId_fkey"
        FOREIGN KEY ("unitId") REFERENCES "Unit"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
