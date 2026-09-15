-- Этап 2: MAX Bot, каналы-витрины, подписки на категории и надежная очередь доставки.
ALTER TABLE "User" ADD COLUMN "botStartedAt" TIMESTAMP(3);

ALTER TABLE "Category"
ADD COLUMN "showcaseChatId" TEXT,
ADD COLUMN "showcaseEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "showcaseKind" TEXT NOT NULL DEFAULT 'PUBLIC';

CREATE TABLE "UserCategoryPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserCategoryPreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BotDelivery" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "deduplicationKey" TEXT NOT NULL,
    "recipientType" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "userId" TEXT,
    "leadId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "maxMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BotDelivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MaxBotChat" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "title" TEXT,
    "kind" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MaxBotChat_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserCategoryPreference_userId_categoryId_key"
ON "UserCategoryPreference"("userId", "categoryId");
CREATE INDEX "UserCategoryPreference_categoryId_enabled_idx"
ON "UserCategoryPreference"("categoryId", "enabled");

CREATE UNIQUE INDEX "BotDelivery_deduplicationKey_key" ON "BotDelivery"("deduplicationKey");
CREATE INDEX "BotDelivery_status_availableAt_idx" ON "BotDelivery"("status", "availableAt");
CREATE INDEX "BotDelivery_userId_idx" ON "BotDelivery"("userId");
CREATE INDEX "BotDelivery_leadId_idx" ON "BotDelivery"("leadId");
CREATE UNIQUE INDEX "MaxBotChat_chatId_key" ON "MaxBotChat"("chatId");
CREATE INDEX "MaxBotChat_active_kind_idx" ON "MaxBotChat"("active", "kind");

ALTER TABLE "UserCategoryPreference"
ADD CONSTRAINT "UserCategoryPreference_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserCategoryPreference"
ADD CONSTRAINT "UserCategoryPreference_categoryId_fkey"
FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BotDelivery"
ADD CONSTRAINT "BotDelivery_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BotDelivery"
ADD CONSTRAINT "BotDelivery_leadId_fkey"
FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
