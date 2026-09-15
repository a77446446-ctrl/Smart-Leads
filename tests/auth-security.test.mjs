import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildMaxDisplayName, verifyMaxInitData } from '../src/lib/auth/max-init-data.ts';
import { createSessionToken, verifySessionToken } from '../src/lib/auth/session.ts';
import { rublesToKopecks, kopecksToRubles } from '../src/lib/money.ts';
import { redactContactInfo } from '../src/lib/redact-contact.ts';
import { authHandler, authRequest, memoryBonusStore } from './helpers/max-auth.mjs';

process.env.AUTH_SESSION_SECRET = 'test-session-secret-at-least-32-characters-long';

function createSignedInitData({ authDate, user, token = 'test-max-bot-token' }) {
  const params = new URLSearchParams({ auth_date: String(authDate), query_id: 'query-123', user: JSON.stringify(user) });
  const dataCheckString = Array.from(params.entries()).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, value]) => `${key}=${value}`).join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(token).digest();
  params.set('hash', createHmac('sha256', secretKey).update(dataCheckString).digest('hex'));
  return params.toString();
}

test('MAX initData принимает действительную подпись и цифровой ID', () => {
  const nowSeconds = 2_000_000_000;
  const initData = createSignedInitData({ authDate: nowSeconds, user: { id: '9876543210123', first_name: 'Иван', last_name: 'Мастер' } });
  const user = verifyMaxInitData(initData, 'test-max-bot-token', { nowMs: nowSeconds * 1000 });
  assert.equal(user.maxId, 9_876_543_210_123n);
  assert.equal(buildMaxDisplayName(user), 'Иван Мастер');
});

test('MAX initData отклоняет подмену, просрочку и повтор ключа', () => {
  const nowSeconds = 2_000_000_000;
  const valid = createSignedInitData({ authDate: nowSeconds, user: { id: '42' } });
  assert.throws(() => verifyMaxInitData(valid.replace('query-123', 'query-999'), 'test-max-bot-token', { nowMs: nowSeconds * 1000 }), /Подпись MAX/);
  const expired = createSignedInitData({ authDate: nowSeconds - 601, user: { id: '42' } });
  assert.throws(() => verifyMaxInitData(expired, 'test-max-bot-token', { nowMs: nowSeconds * 1000 }), /истёк/);
  assert.throws(() => verifyMaxInitData(`${valid}&auth_date=${nowSeconds}`, 'test-max-bot-token', { nowMs: nowSeconds * 1000 }), /Повторяющийся/);
});

test('сессия проверяет подпись и срок действия', async () => {
  const token = await createSessionToken('user-id', 'USER', 60);
  const payload = await verifySessionToken(token);
  assert.equal(payload?.userId, 'user-id');
  assert.equal(payload?.role, 'USER');
  assert.equal(await verifySessionToken(`${token.slice(0, -1)}x`), null);
  assert.equal(await verifySessionToken(await createSessionToken('user-id', 'USER', -1)), null);
});

test('контакты скрываются, а деньги хранятся целыми рублями', () => {
  const redacted = redactContactInfo('Звонить +7 999 123-45-67 или https://max.ru/user @master');
  assert.doesNotMatch(redacted, /999 123|https:\/\/max\.ru|@master/);
  assert.equal((redacted.match(/\[контакт скрыт\]/g) ?? []).length, 3);
  assert.equal(rublesToKopecks(123.45), 123);
  assert.equal(kopecksToRubles(12_345), 12_345);
});

test('покупка использует серверные условия и скрывает контакты', async () => {
  const [buyRoute, leadsRoute] = await Promise.all([
    readFile(new URL('../src/app/api/buy-lead/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/leads/route.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(buyRoute, /TransactionIsolationLevel\.Serializable/);
  assert.match(buyRoute, /balance:\s*\{\s*gte:/);
  assert.doesNotMatch(buyRoute, /const\s*\{\s*userId/);
  assert.doesNotMatch(leadsRoute, /purchasedBy/);
  assert.match(leadsRoute, /redactContactInfo/);
});

test('настоящий обработчик MAX начисляет бонус один раз при повторных входах', async () => {
  const store = memoryBonusStore({ maks_welcome_bonus_amount: '450' });
  const login = authHandler(store.prisma);
  for (let i = 0; i < 3; i++) {
    const response = await login(authRequest());
    assert.equal(response.status, 200);
    assert.equal((await response.json()).user.balance, 450);
  }
  assert.equal(store.entries.length, 1);
  assert.equal(store.entries[0].type, 'ONBOARDING_BONUS');
  assert.equal(store.entries[0].amount, 450);
  assert.ok(store.user().onboardingBonusGrantedAt instanceof Date);
});

test('отключённый бонус, монетизация и нулевая сумма не пополняют баланс', async () => {
  for (const settings of [{ maks_welcome_bonus_enabled: 'false' }, { maks_monetization_enabled: 'false' }, { maks_welcome_bonus_amount: '0' }]) {
    const store = memoryBonusStore(settings);
    assert.equal((await authHandler(store.prisma)(authRequest())).status, 200);
    assert.equal(store.user().balance, 0);
    assert.equal(store.user().onboardingBonusGrantedAt, null);
    assert.equal(store.entries.length, 0);
  }
});

test('production cookie поддерживает авторизацию внутри MAX iframe', async () => {
  const source = await readFile(new URL('../src/lib/auth/session.ts', import.meta.url), 'utf8');
  assert.match(source, /secure:\s*process\.env\.NODE_ENV === 'production'/);
  assert.match(source, /sameSite:\s*process\.env\.NODE_ENV === 'production'\s*\?\s*'none' as const\s*:\s*'lax' as const/);
});
