import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('платёжные заказы хранят идемпотентность и факт зачисления', () => {
  const schema = read('prisma/schema.prisma');
  const migration = read('prisma/migrations/20260823060000_stage_6_yookassa/migration.sql');
  assert.match(schema, /model PaymentOrder/);
  assert.match(schema, /idempotencyKey\s+String\s+@unique/);
  assert.match(schema, /providerPaymentId\s+String\?\s+@unique/);
  assert.match(schema, /creditedAt\s+DateTime\?/);
  assert.doesNotMatch(migration, /^\s*(?:DROP\b|TRUNCATE\b|DELETE\s+FROM\b)/im);
});

test('создание платежа использует официальный API и Idempotence-Key', () => {
  const source = read('src/services/yookassa.ts');
  assert.match(source, /https:\/\/api\.yookassa\.ru\/v3/);
  assert.match(source, /'Idempotence-Key'/);
  assert.match(source, /randomUUID\(\)/);
  assert.match(source, /capture: true/);
  assert.match(source, /confirmation: \{ type: 'redirect'/);
});

test('цена подписки берётся с сервера, пополнение ограничено, чек содержит email и услугу', () => {
  const source = read('src/services/yookassa.ts');
  assert.match(source, /category\.subscriptionPrice/);
  assert.match(source, /!Number\.isSafeInteger\(input\.amount\)/);
  assert.match(source, /amount < 100 \|\| amount > 100_000/);
  assert.match(source, /receipt: \{ customer: \{ email:/);
  assert.match(source, /payment_subject: 'service'/);
  assert.match(source, /YOOKASSA_VAT_CODE/);
});

test('webhook перепроверяет платёж через ЮKassa и сверяет metadata, сумму и валюту', () => {
  const source = read('src/services/yookassa.ts');
  assert.match(source, /requestYoo\(`\/payments\/\$\{encodeURIComponent\(paymentId\)\}`\)/);
  assert.match(source, /payment\.metadata\?\.order_id !== order\.id/);
  assert.match(source, /payment\.amount\?\.currency !== 'RUB'/);
  assert.match(source, /payment\.status !== 'succeeded'/);
  assert.match(source, /payment\.paid !== true/);
});

test('повторный webhook не зачисляет деньги или PRO дважды', () => {
  const source = read('src/services/yookassa.ts');
  assert.match(source, /updateMany\(\{ where: \{ id: order\.id, creditedAt: null \}/);
  assert.match(source, /if \(claimed\.count !== 1\) return 'duplicate'/);
  assert.match(source, /TransactionIsolationLevel\.Serializable/);
});

test('клиент получает планы из БД и не подтверждает оплату самостоятельно', () => {
  const ui = read('src/components/payments/PaymentCenter.tsx');
  assert.match(ui, /\/api\/payments\/plans/);
  assert.match(ui, /\/api\/payments\/create/);
  assert.match(ui, /window\.location\.assign\(data\.confirmationUrl\)/);
  assert.doesNotMatch(ui, /Электрик PRO|MAX HUB Pass/);
});

test('платежи заблокированы без согласий, реквизитов и серверной авторизации', () => {
  const service = read('src/services/yookassa.ts');
  const route = read('src/app/api/payments/create/route.ts');
  assert.match(service, /hasCurrentLegalAcceptance/);
  assert.match(service, /legal\.missing\.length > 0/);
  assert.match(route, /requireCurrentUser/);
  assert.match(route, /content-length/);
});
