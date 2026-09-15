-- Пользователь Telegram может не иметь MAX ID.
ALTER TABLE "User" ALTER COLUMN "maxId" DROP NOT NULL;

CREATE TABLE "ExternalIdentity" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "username" TEXT,
    "displayName" TEXT,
    "photoUrl" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalIdentity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BlockedExternalIdentity" (
    "provider" TEXT NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlockedExternalIdentity_pkey" PRIMARY KEY ("provider", "providerUserId")
);

CREATE UNIQUE INDEX "ExternalIdentity_provider_providerUserId_key"
ON "ExternalIdentity"("provider", "providerUserId");

CREATE INDEX "ExternalIdentity_userId_idx" ON "ExternalIdentity"("userId");
CREATE INDEX "BlockedExternalIdentity_createdAt_idx" ON "BlockedExternalIdentity"("createdAt");

ALTER TABLE "ExternalIdentity"
ADD CONSTRAINT "ExternalIdentity_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
