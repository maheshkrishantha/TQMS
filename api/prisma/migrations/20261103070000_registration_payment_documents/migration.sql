CREATE TYPE "RegistrationPaymentDocumentType" AS ENUM ('CHEQUE_IMAGE', 'RECEIPT_COPY');

CREATE TABLE "RegistrationPaymentDocument" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "type" "RegistrationPaymentDocumentType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationPaymentDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RegistrationPaymentDocument_paymentId_type_key"
    ON "RegistrationPaymentDocument"("paymentId", "type");

ALTER TABLE "RegistrationPaymentDocument"
    ADD CONSTRAINT "RegistrationPaymentDocument_paymentId_fkey"
    FOREIGN KEY ("paymentId") REFERENCES "RegistrationPayment"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
