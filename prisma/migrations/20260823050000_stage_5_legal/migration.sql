CREATE TABLE "LegalAcceptance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "documentHash" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MINI_APP',
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LegalAcceptance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LegalAcceptance_userId_documentType_version_key"
    ON "LegalAcceptance"("userId", "documentType", "version");
CREATE INDEX "LegalAcceptance_userId_acceptedAt_idx"
    ON "LegalAcceptance"("userId", "acceptedAt");
ALTER TABLE "LegalAcceptance"
    ADD CONSTRAINT "LegalAcceptance_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;