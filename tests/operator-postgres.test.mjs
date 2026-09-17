import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { createStore } from '../operator/store.mjs';
import { issueKey, validateInstance } from '../operator/core.mjs';
import { collectReport } from '../scripts/instance-telemetry.mjs';

test('PostgreSQL: миграции, сохранение, поиск, аудит, конкуренция ключей и сбор отчёта', { skip: !process.env.DATABASE_URL }, async () => {
  const connection = new URL(process.env.DATABASE_URL);
  assert.ok(['127.0.0.1', 'localhost'].includes(connection.hostname), 'Тест запускается только на локальной PostgreSQL');
  const admin = new pg.Pool({ connectionString: connection.href, connectionTimeoutMillis: 5000 });
  // Создаём и удаляем только собственную новую тестовую базу, без изменения базы приложения.
  const database = 'operator_test_' + randomBytes(8).toString('hex');
  await admin.query(`CREATE DATABASE "${database}"`);
  connection.pathname = '/' + database; connection.search = '';
  const store = createStore(connection.href);
  const pool = new pg.Pool({ connectionString: connection.href, connectionTimeoutMillis: 5000 });
  try {
    await store.migrate(); await store.migrate();
    const issued = issueKey();
    const input = validateInstance({ name: 'Тест_%', customer: 'Клиент', domain: 'https://example.ru', monthlyFeeRub: '1999.99', serviceStatus: 'active', paidUntil: '2027-01-01' });
    const first = await store.create(input, issued);
    assert.equal(first.monthlyFeeKopecks, 199999); assert.equal(first.paidUntil, '2027-01-01'); assert.equal(first.connectionStatus, 'waiting');
    await assert.rejects(store.create(input, issueKey()), error => error.code === '23505');
    assert.equal((await store.list('_%', 1)).total, 1); assert.equal((await store.list("' OR 1=1 --", 1)).total, 0);
    const updated = await store.update(first.id, 1, { ...input, paidUntil: '2028-02-29' });
    assert.equal(updated.paidUntil, '2028-02-29'); assert.equal(await store.update(first.id, 1, input), null);
    const keys = [issueKey(first.id), issueKey(first.id)];
    const rotations = await Promise.all(keys.map(key => store.changeKey(first.id, 2, key.keyHash)));
    assert.equal(rotations.filter(Boolean).length, 1);
    const winner = keys[rotations.findIndex(Boolean)];
    const report = { version: 'test', materials: 1, users: 2, queuePending: 0, queueFailed: 0, databaseBytes: 123, lastParserSuccessAt: null };
    assert.equal(await store.report(first.id, issued.keyHash, report), false);
    assert.equal(await store.report(first.id, winner.keyHash, report), true);
    assert.equal((await store.list('', 1)).instances[0].connectionStatus, 'connected');
    await store.changeKey(first.id, 3, null);
    assert.equal(await store.report(first.id, winner.keyHash, report), false);
    const listing = await store.list('', 1);
    assert.equal(listing.instances[0].connectionStatus, 'revoked'); assert.equal(listing.instances[0].report, null);
    assert.equal(JSON.stringify(listing).includes(winner.keyHash), false);
    const audit = await store.audit(first.id);
    assert.equal(audit.length, 4); assert.equal(audit[0].action, 'key_revoked');
    assert.equal(audit.find(event => event.action === 'updated').details.current.paid_until, '2028-02-29');
    assert.equal(JSON.stringify(audit).includes(winner.keyHash), false);
    await pool.query(`CREATE TABLE "Lead" ("deletedAt" timestamptz); CREATE TABLE "User" ("deletedAt" timestamptz);
      CREATE TABLE "BotDelivery" (status text); CREATE TABLE "MaksAccount" ("lastSuccessAt" timestamptz);
      INSERT INTO "Lead" VALUES (NULL), (now()); INSERT INTO "User" VALUES (NULL), (NULL), (now());
      INSERT INTO "BotDelivery" VALUES ('PENDING'),('RETRY'),('PROCESSING'),('FAILED'),('SENT');
      INSERT INTO "MaksAccount" VALUES ('2026-01-01T00:00:00Z');`);
    const collected = await collectReport(pool, 'test');
    assert.equal(collected.materials, 1); assert.equal(collected.users, 2); assert.equal(collected.queuePending, 3);
    assert.equal(collected.queueFailed, 1); assert.ok(collected.databaseBytes > 0); assert.equal(collected.lastParserSuccessAt, '2026-01-01T00:00:00.000Z');
  } finally {
    await store.close(); await pool.end();
    await admin.query(`DROP DATABASE "${database}"`); await admin.end();
  }
});
