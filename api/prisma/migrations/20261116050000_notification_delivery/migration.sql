ALTER TABLE "Notification"
    ADD COLUMN "recipientId" TEXT,
    ADD COLUMN "acknowledgedAt" TIMESTAMP(3),
    ADD COLUMN "snoozedUntil" TIMESTAMP(3),
    ADD COLUMN "emailSentAt" TIMESTAMP(3);

DROP INDEX "Notification_type_referenceId_leadDays_key";

CREATE UNIQUE INDEX "Notification_type_referenceId_leadDays_recipientId_key"
    ON "Notification"("type", "referenceId", "leadDays", "recipientId");

CREATE INDEX "Notification_recipientId_createdAt_idx"
    ON "Notification"("recipientId", "createdAt");

CREATE INDEX "Notification_emailSentAt_createdAt_idx"
    ON "Notification"("emailSentAt", "createdAt");

ALTER TABLE "Notification"
    ADD CONSTRAINT "Notification_recipientId_fkey"
    FOREIGN KEY ("recipientId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
