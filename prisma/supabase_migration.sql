-- MAKS LEAD HUB - Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ENUMS
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');
CREATE TYPE "PaymentMode" AS ENUM ('LEAD', 'SUBSCRIPTION', 'HYBRID');
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'SOLD', 'ARCHIVED');
CREATE TYPE "TransactionType" AS ENUM ('TOPUP', 'BUY', 'REFUND');

-- USERS
CREATE TABLE IF NOT EXISTS "User" (
  "id"         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "telegramId" BIGINT UNIQUE NOT NULL,
  "name"       VARCHAR NOT NULL,
  "role"       "UserRole" NOT NULL DEFAULT 'USER',
  "balance"    DECIMAL NOT NULL DEFAULT 0,
  "rating"     FLOAT NOT NULL DEFAULT 5.0,
  "createdAt"  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- CATEGORIES
CREATE TABLE IF NOT EXISTS "Category" (
  "id"                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "name"              VARCHAR NOT NULL,
  "slug"              VARCHAR UNIQUE NOT NULL,
  "paymentMode"       "PaymentMode" NOT NULL DEFAULT 'LEAD',
  "leadPrice"         DECIMAL NOT NULL DEFAULT 0,
  "subscriptionPrice" DECIMAL NOT NULL DEFAULT 0,
  "days"              INT NOT NULL DEFAULT 30,
  "active"            BOOLEAN NOT NULL DEFAULT TRUE
);

-- LEADS
CREATE TABLE IF NOT EXISTS "Lead" (
  "id"         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "title"      VARCHAR NOT NULL,
  "rawText"    TEXT NOT NULL,
  "phone"      VARCHAR,
  "city"       VARCHAR NOT NULL,
  "categoryId" UUID NOT NULL REFERENCES "Category"("id"),
  "score"      INT NOT NULL DEFAULT 0,
  "price"      DECIMAL NOT NULL DEFAULT 0,
  "status"     "LeadStatus" NOT NULL DEFAULT 'NEW',
  "createdAt"  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- SUBSCRIPTIONS
CREATE TABLE IF NOT EXISTS "Subscription" (
  "id"         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "userId"     UUID NOT NULL REFERENCES "User"("id"),
  "categoryId" UUID NOT NULL REFERENCES "Category"("id"),
  "expiresAt"  TIMESTAMP NOT NULL
);

-- PURCHASES
CREATE TABLE IF NOT EXISTS "Purchase" (
  "id"        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "userId"    UUID NOT NULL REFERENCES "User"("id"),
  "leadId"    UUID NOT NULL REFERENCES "Lead"("id"),
  "price"     DECIMAL NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- TRANSACTIONS
CREATE TABLE IF NOT EXISTS "Transaction" (
  "id"        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "userId"    UUID NOT NULL REFERENCES "User"("id"),
  "type"      "TransactionType" NOT NULL,
  "amount"    DECIMAL NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- SETTINGS
CREATE TABLE IF NOT EXISTS "Setting" (
  "id"    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "key"   VARCHAR UNIQUE NOT NULL,
  "value" TEXT NOT NULL
);

-- SEED: Admin user
INSERT INTO "User" ("telegramId", "name", "role", "balance", "rating")
VALUES (12345678, 'Admin Master', 'ADMIN', 10000, 5.0)
ON CONFLICT ("telegramId") DO NOTHING;

-- SEED: Categories
INSERT INTO "Category" ("name", "slug", "paymentMode", "leadPrice", "subscriptionPrice")
VALUES 
  ('Электрик', 'electric', 'HYBRID', 100, 300),
  ('Сантехник', 'plumber', 'LEAD', 150, 0),
  ('Ремонт техники', 'repair', 'SUBSCRIPTION', 0, 500),
  ('Грузчики', 'mover', 'LEAD', 80, 0)
ON CONFLICT ("slug") DO NOTHING;

-- SEED: Test leads
INSERT INTO "Lead" ("title", "rawText", "city", "categoryId", "score", "price", "status")
SELECT 
  '🔥 Срочно нужен электрик',
  'Замена проводки в 2ккв',
  'Москва',
  "id",
  95,
  100,
  'NEW'
FROM "Category" WHERE "slug" = 'electric'
ON CONFLICT DO NOTHING;

INSERT INTO "Lead" ("title", "rawText", "city", "categoryId", "score", "price", "status")
SELECT 
  'Установка смесителя на кухне',
  'Нужно поставить кран в квартире срочно',
  'Санкт-Петербург',
  "id",
  82,
  150,
  'NEW'
FROM "Category" WHERE "slug" = 'plumber'
ON CONFLICT DO NOTHING;

-- Done!
SELECT 'Tables created and seeded successfully!' as result;
