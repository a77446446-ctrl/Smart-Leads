import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import pg from 'pg';

// Проверка настоящего PostgreSQL в откатываемой транзакции и временной таблице.
const require = createRequire(import.meta.url);
require('@next/env').loadEnvConfig(process.cwd());
const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
const url = new URL(connectionString || 'postgresql://localhost');
if (!connectionString || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
  throw new Error('Проверка разрешена только на настроенной локальной PostgreSQL.');
}
const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
try {
  await client.connect();
  await client.query('BEGIN');
  await client.query('CREATE TEMP TABLE "Lead" (id TEXT PRIMARY KEY, price INT, status TEXT) ON COMMIT DROP');
  await client.query('INSERT INTO "Lead" (id, price, status) VALUES ($1, $2, $3)', ['old', 50, 'SOLD']);
  await client.query(await readFile(new URL('../prisma/migrations/20260923010000_themed_publications/migration.sql', import.meta.url), 'utf8'));
  const { rows } = await client.query('SELECT * FROM "Lead" WHERE id = $1', ['old']);
  assert.equal(rows[0].accessMode, 'CONTACT');
  assert.equal(rows[0].publicationTheme, null);
  assert.equal(rows[0].status, 'SOLD');
  assert.equal(rows[0].price, 50);
  await client.query('INSERT INTO "Lead" (id, "accessMode", "publicationTheme") VALUES ($1, $2, $3)', ['new', 'PUBLIC', 'news']);
  await client.query('SAVEPOINT invalid_mode');
  await assert.rejects(client.query('INSERT INTO "Lead" (id, "accessMode") VALUES ($1, $2)', ['invalid', 'UNKNOWN']), error => error.code === '23514');
  await client.query('ROLLBACK TO SAVEPOINT invalid_mode');
  console.log('Миграция проверена: старые записи сохранены, бесплатный доступ явный, неизвестный режим запрещён. Все изменения откатываются.');
} finally {
  await client.query('ROLLBACK').catch(() => {});
  await client.end();
}
