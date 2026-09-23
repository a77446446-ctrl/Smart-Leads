import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

createRequire(import.meta.url)('@next/env').loadEnvConfig(process.cwd());
const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(connectionString).hostname)) throw new Error('Тест разрешён только на локальной PostgreSQL');
const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
const schema = 'photo_test_' + randomUUID().replaceAll('-', '');
try {
  await client.connect();
  await client.query('BEGIN');
  // Имя формируется только из UUID. Отдельная схема исключает обращение к рабочим таблицам.
  await client.query(`CREATE SCHEMA "${schema}"`);
  await client.query(`SET LOCAL search_path TO "${schema}"`);
  await client.query(`CREATE TABLE "Category" (id TEXT PRIMARY KEY, "ttlMinutes" INT NOT NULL);
    CREATE TABLE "Lead" (id TEXT PRIMARY KEY, "categoryId" TEXT, "createdAt" TIMESTAMP(3), "accessMode" TEXT);
    CREATE TABLE "Purchase" (id TEXT PRIMARY KEY, "leadId" TEXT REFERENCES "Lead"(id));
    INSERT INTO "Category" VALUES ('category',180);
    INSERT INTO "Lead" VALUES ('news','category','2026-01-01 00:00:00','PUBLIC'), ('paid','category','2026-01-01 00:00:00','CONTACT');
    INSERT INTO "Purchase" VALUES ('purchase','paid');`);
  await client.query(await readFile(new URL('../prisma/migrations/20260923020000_lead_photos/migration.sql', import.meta.url), 'utf8'));
  const { rows } = await client.query('SELECT id, "expiresAt" FROM "Lead" ORDER BY id');
  assert.equal(rows[0].expiresAt.getHours(), 3);
  assert.equal(rows[1].expiresAt, null);
  assert.equal((await client.query('SELECT "capturePhotos" FROM "Category"')).rows[0].capturePhotos, false);
  await client.query(`INSERT INTO "LeadMedia" (id,"leadId",position,"mimeType",bytes,ready) VALUES ('photo','news',0,'image/jpeg',100,true), ('bought','paid',0,'image/jpeg',100,true)`);
  await client.query(`DELETE FROM "Lead" WHERE "accessMode"='PUBLIC' AND "expiresAt" < '2026-01-02' AND NOT EXISTS (SELECT 1 FROM "Purchase" p WHERE p."leadId"="Lead".id)`);
  assert.equal((await client.query(`SELECT "leadId" FROM "LeadMedia" WHERE id='photo'`)).rows[0].leadId, null);
  assert.equal((await client.query(`SELECT "leadId" FROM "LeadMedia" WHERE id='bought'`)).rows[0].leadId, 'paid');
  assert.equal((await client.query('SELECT COUNT(*)::int AS n FROM "Purchase"')).rows[0].n, 1);
  await client.query('SAVEPOINT invalid_size');
  await assert.rejects(client.query(`INSERT INTO "LeadMedia" (id,position,"mimeType",bytes) VALUES ('oversize',0,'image/jpeg',5242881)`), error => error.code === '23514');
  await client.query('ROLLBACK TO SAVEPOINT invalid_size');
  console.log('Миграция фото проверена в PostgreSQL: срок, отключённый сбор по умолчанию, запись для очистки, сохранение покупки и ограничение размера. Изменения откатываются.');
} finally {
  await client.query('ROLLBACK').catch(() => {});
  await client.end();
}
