CREATE TABLE "PaymentOrder" (
    "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "categoryId" TEXT,
    "clientRequestId" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL,
    "providerPaymentId" TEXT, "kind" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'CREATED',
    "amountKopecks" BIGINT NOT NULL, "currency" TEXT NOT NULL DEFAULT 'RUB',
    "receiptEmail" TEXT NOT NULL, "description" TEXT NOT NULL, "subscriptionDays" INTEGER,
    "confirmationUrl" TEXT, "creditedAt" TIMESTAMP(3), "providerCreatedAt" TIMESTAMP(3),
    "lastError" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "PaymentOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymentOrder_idempotencyKey_key" ON "PaymentOrder"("idempotencyKey");
CREATE UNIQUE INDEX "PaymentOrder_providerPaymentId_key" ON "PaymentOrder"("providerPaymentId");
CREATE UNIQUE INDEX "PaymentOrder_userId_clientRequestId_key" ON "PaymentOrder"("userId", "clientRequestId");
CREATE INDEX "PaymentOrder_status_createdAt_idx" ON "PaymentOrder"("status", "createdAt");
CREATE INDEX "PaymentOrder_userId_createdAt_idx" ON "PaymentOrder"("userId", "createdAt");
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;