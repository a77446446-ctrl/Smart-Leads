-- Сессии MAX хранятся в PostgreSQL только в зашифрованном виде.
ALTER TABLE "MaksAccount"
ADD COLUMN "sessionData" TEXT,
ADD COLUMN "sessionChecksum" TEXT,
ADD COLUMN "sessionUpdatedAt" TIMESTAMP(3);
