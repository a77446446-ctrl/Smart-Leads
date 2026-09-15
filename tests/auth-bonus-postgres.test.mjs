import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { authHandler, authRequest } from './helpers/max-auth.mjs';

test('PostgreSQL: параллельные MAX-входы начисляют единственный бонус и откатывают неудачную операцию', async () => {
  const url = new URL(process.env.DATABASE_URL || 'http://unconfigured');
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname === '/smart_leads_local', 'Тест разрешён только на локальной smart_leads_local');
  const schema = 'test_bonus_' + randomUUID().replaceAll('-', '');
  assert.match(schema, /^test_bonus_[a-f0-9]{32}$/);
  const pool = new Pool({ connectionString: url.toString() });
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), max: 12 }, { schema }) });
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    // Копируется только структура четырёх таблиц; рабочие записи не читаются и не меняются.
    for (const table of ['User', 'Transaction', 'Setting', 'BlockedMaxUser']) {
      await pool.query(`CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
    }
    await db.setting.createMany({ data: [
      { key: 'maks_welcome_bonus_amount', value: '450' },
      { key: 'maks_welcome_bonus_enabled', value: 'true' },
      { key: 'maks_monetization_enabled', value: 'true' },
    ] });
    const login = authHandler(db);
    const responses = await Promise.all(Array.from({ length: 8 }, () => login(authRequest())));
    for (const response of responses) assert.equal(response.status, 200, JSON.stringify(await response.json()));
    assert.equal((await login(authRequest())).status, 200);
    const user = await db.user.findUniqueOrThrow({ where: { maxId: 123456789n } });
    assert.equal(user.balance, 450);
    assert.ok(user.onboardingBonusGrantedAt);
    const entries = await db.transaction.findMany();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].amount, 450);
    assert.equal(entries[0].type, 'ONBOARDING_BONUS');

    // Реальная ошибка записи журнала должна откатить пользователя и начисление целиком.
    await pool.query(`ALTER TABLE "${schema}"."Transaction" ADD CONSTRAINT reject_test_bonus CHECK (amount <> 451)`);
    await db.setting.update({ where: { key: 'maks_welcome_bonus_amount' }, data: { value: '451' } });
    assert.equal((await login(authRequest('987654321'))).status, 500);
    assert.equal(await db.user.count({ where: { maxId: 987654321n } }), 0);
    assert.equal(await db.transaction.count(), 1);
  } finally {
    await db.$disconnect();
    // Удаляется только уникальная схема, созданная данным тестом.
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.end();
  }
});
