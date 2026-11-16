CREATE TABLE "UserAreaAssignment" (
    "userId" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "district" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "UserAreaAssignment_pkey" PRIMARY KEY ("userId", "province", "district")
);

ALTER TABLE "UserAreaAssignment"
    ADD CONSTRAINT "UserAreaAssignment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
