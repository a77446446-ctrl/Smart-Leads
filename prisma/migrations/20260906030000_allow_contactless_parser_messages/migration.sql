ALTER TABLE "Lead"
ADD COLUMN "allowContactless" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ParserSeenMessage" (
    "fingerprint" TEXT NOT NULL,
    "sourceChat" TEXT NOT NULL,
    "messageId" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParserSeenMessage_pkey" PRIMARY KEY ("fingerprint")
);

CREATE INDEX "ParserSeenMessage_sourceChat_firstSeenAt_idx"
ON "ParserSeenMessage"("sourceChat", "firstSeenAt");
