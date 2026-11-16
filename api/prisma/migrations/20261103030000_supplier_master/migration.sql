CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactPerson" TEXT,
    "contactNumber" TEXT,
    "email" TEXT,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Supplier_name_key" ON "Supplier"("name");

INSERT INTO "Supplier" ("id", "name", "createdAt", "updatedAt")
SELECT
    'supplier-' || md5(value),
    value,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT BTRIM("supplierName") AS value
    FROM "SupplierPrice"
    WHERE BTRIM("supplierName") <> ''
) AS existing_suppliers;

ALTER TABLE "SupplierPrice" ADD COLUMN "supplierId" TEXT;

UPDATE "SupplierPrice" AS price
SET "supplierId" = supplier."id"
FROM "Supplier" AS supplier
WHERE supplier."name" = BTRIM(price."supplierName");

ALTER TABLE "SupplierPrice"
    ALTER COLUMN "supplierId" SET NOT NULL,
    ADD CONSTRAINT "SupplierPrice_supplierId_fkey"
        FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "SupplierPrice_supplierId_idx" ON "SupplierPrice"("supplierId");
