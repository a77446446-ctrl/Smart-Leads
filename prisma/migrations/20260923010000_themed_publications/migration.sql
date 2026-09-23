-- Старые лиды сохраняют модель приобретения контакта, независимо от текущей темы.
ALTER TABLE "Lead" ADD COLUMN "accessMode" TEXT NOT NULL DEFAULT 'CONTACT';
ALTER TABLE "Lead" ADD COLUMN "publicationTheme" TEXT;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_accessMode_check" CHECK ("accessMode" IN ('CONTACT', 'PUBLIC'));
