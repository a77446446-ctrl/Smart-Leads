import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { connectionStatus, createSession, digest, FRESHNESS_MS, httpsOrigin, issueKey, keyIdentity, publicInstance, SESSION_SECONDS, validSession, validateInstance, validateReport } from '../operator/core.mjs';
import { createOperatorServer } from '../operator/server.mjs';
import { reportOnce, sendReport, telemetryConfig } from '../scripts/instance-telemetry.mjs';

export const instanceInput = { name: 'Новости города', customer: 'Клиент', domain: 'https://client.example.ru', contact: '', plan: 'Базовый', monthlyFeeRub: '1200.50', serviceStatus: 'active', paidUntil: '2027-01-01', notes: '' };
export const reportInput = { version: '1.0.0', materials: 123, users: 45, queuePending: 3, queueFailed: 1, databaseBytes: 100000, lastParserSuccessAt: null };

test('ключ включает ID, имеет случайный секрет и хранится как хеш', () => {
  const first = issueKey(); const second = issueKey(first.id);
  assert.equal(keyIdentity(first.key), first.id); assert.notEqual(first.key, second.key);
  assert.equal(first.keyHash, digest(first.key)); assert.equal(keyIdentity(first.id), null);
  assert.equal(keyIdentity(first.key + 'x'), null);
  const safe = publicInstance({ id: first.id, keyHash: first.keyHash, lastSeenAt: null });
  assert.equal(safe.connectionStatus, 'waiting'); assert.equal('keyHash' in safe, false);
});

test('операторская сессия не допускает подделку, другой ключ и истёкший срок', () => {
  const now = Date.now(); const token = createSession('секрет', now);
  assert.equal(validSession(token, 'секрет', now), true);
  assert.equal(validSession(token + 'x', 'секрет', now), false);
  assert.equal(validSession(token, 'другой', now), false);
  assert.equal(validSession(token, 'секрет', now + SESSION_SECONDS * 1000), false);
  assert.equal(validSession(token, 'секрет', now - 10000), false);
});

test('отсутствие отчёта, отзыв и устаревание не выдаются за рабочее соединение', () => {
  const now = Date.now();
  assert.equal(connectionStatus({ keyHash: null, lastSeenAt: new Date(now) }, now), 'revoked');
  assert.equal(connectionStatus({ keyHash: 'hash', lastSeenAt: null }, now), 'waiting');
  assert.equal(connectionStatus({ keyHash: 'hash', lastSeenAt: new Date(now - FRESHNESS_MS) }, now), 'connected');
  assert.equal(connectionStatus({ keyHash: 'hash', lastSeenAt: new Date(now - FRESHNESS_MS - 1) }, now), 'unknown');
});

test('карточка проверяет деньги, даты, домен и статус', () => {
  assert.equal(validateInstance(instanceInput).monthlyFeeKopecks, 120050);
  assert.equal(validateInstance({ ...instanceInput, monthlyFeeRub: '0' }).monthlyFeeKopecks, 0);
  for (const change of [{ monthlyFeeRub: '-1' }, { monthlyFeeRub: '1.001' }, { monthlyFeeRub: '1e3' }, { paidUntil: '2026-02-30' }, { domain: 'javascript:alert(1)' }, { domain: 'https://example.ru/path' }, { serviceStatus: 'deleted' }, { name: ' ' }, { notes: 'x'.repeat(4001) }, { backupAt: '2099-01-01' }]) {
    assert.throws(() => validateInstance({ ...instanceInput, ...change }));
  }
});

test('в отчёт проходят только согласованные метрики; произвольные данные отбрасываются', () => {
  assert.deepEqual(validateReport({ ...reportInput, token: 'секрет', messages: ['текст'], contacts: ['номер'] }), reportInput);
  for (const change of [{ users: -1 }, { users: '10' }, { databaseBytes: Number.MAX_SAFE_INTEGER + 1 }, { lastParserSuccessAt: 'invalid' }, { lastParserSuccessAt: '2999-01-01' }]) assert.throws(() => validateReport({ ...reportInput, ...change }));
});

test('мониторинг выключен без настроек; ключ и HTTPS обязательны при подключении', () => {
  assert.equal(telemetryConfig({}), null);
  const { key } = issueKey();
  assert.throws(() => telemetryConfig({ SMART_LEADS_INSTANCE_KEY: key }));
  assert.throws(() => telemetryConfig({ SMART_LEADS_INSTANCE_KEY: key, SMART_LEADS_CONTROL_URL: 'http://example.ru' }));
  assert.throws(() => httpsOrigin('https://user:pass@example.ru'));
  assert.equal(telemetryConfig({ SMART_LEADS_INSTANCE_KEY: key, SMART_LEADS_CONTROL_URL: 'https://control.example.ru/' }).endpoint, 'https://control.example.ru/api/instance-report');
});

test('мониторинг запрещает перенаправления ключа и переживает сбои центра и базы', async () => {
  const messages = []; const config = { key: issueKey().key, endpoint: 'https://control.example.ru/api/instance-report' };
  await sendReport(config, reportInput, async (url, options) => {
    assert.equal(url, config.endpoint); assert.equal(options.redirect, 'error'); assert.ok(options.signal);
    assert.deepEqual(JSON.parse(options.body), reportInput); return new Response('{}');
  });
  const pool = { query: async () => ({ rows: [{ ...reportInput }] }) };
  assert.equal(await reportOnce({ config, pool, version: '1', fetcher: async () => { throw new Error(config.key); }, log: message => messages.push(message) }), false);
  assert.equal(messages.some(message => message.includes(config.key)), false);
  assert.equal(await reportOnce({ config, pool: { query: async () => { throw new Error('пароль базы'); } }, version: '1', log: message => messages.push(message) }), false);
  assert.equal(messages.some(message => message.includes('пароль базы')), false);
});

test('HTTP: независимый вход, CSRF, cookie, выпуск, подмена ключа, конфликт и отзыв', async t => {
  let row = null;
  const store = {
    health: async () => {},
    list: async () => ({ instances: row ? [publicInstance(row)] : [], total: row ? 1 : 0, summary: {} }),
    create: async (data, key) => { row = { ...data, id: key.id, keyHash: key.keyHash, revision: 1, lastSeenAt: null }; return publicInstance(row); },
    changeKey: async (id, revision, keyHash) => { if (id !== row.id || revision !== row.revision) return null; row = { ...row, keyHash, revision: revision + 1, lastSeenAt: null, report: null }; return publicInstance(row); },
    report: async (id, keyHash, report) => { if (id !== row.id || keyHash !== row.keyHash) return false; row.report = report; row.lastSeenAt = new Date(); return true; },
  };
  const origin = 'https://control.example.ru'; const adminKey = 'a'.repeat(43);
  const server = await createOperatorServer({ store, adminKey, origin });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie;
  const call = (path, method = 'GET', body, headers = {}) => fetch(base + path, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json', Origin: origin } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  assert.equal((await call('/api/instances')).status, 401);
  assert.equal((await call('/api/instances', 'POST', instanceInput, { Cookie: 'maks_session=client-admin' })).status, 401);
  assert.equal((await call('/api/login', 'POST', { key: adminKey }, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await call('/api/login', 'POST', { key: 'wrong' })).status, 401);
  const login = await call('/api/login', 'POST', { key: adminKey });
  assert.equal(login.status, 200); assert.match(login.headers.get('set-cookie'), /HttpOnly; SameSite=Strict; Max-Age=28800; Secure/);
  cookie = login.headers.get('set-cookie').split(';')[0];
  const created = await call('/api/instances', 'POST', instanceInput); assert.equal(created.status, 201);
  const data = await created.json(); assert.ok(data.key); assert.equal('keyHash' in data.instance, false);
  assert.equal((await call('/api/instances')).status, 200);
  const report = key => call('/api/instance-report', 'POST', { ...reportInput, contact: 'не сохраняется' }, { Authorization: `Bearer ${key}`, Origin: '' });
  assert.equal((await report(issueKey(data.instance.id).key)).status, 401);
  assert.equal((await report(data.key)).status, 200); assert.deepEqual(row.report, reportInput);
  assert.equal((await call(`/api/instances/${row.id}/rotate-key`, 'POST', { revision: 9 })).status, 409);
  const rotated = await (await call(`/api/instances/${row.id}/rotate-key`, 'POST', { revision: 1 })).json();
  assert.equal((await report(data.key)).status, 401); assert.equal((await report(rotated.key)).status, 200);
  assert.equal((await call(`/api/instances/${row.id}/revoke-key`, 'POST', { revision: 2 })).status, 200);
  assert.equal((await report(rotated.key)).status, 401);
  const logout = await call('/api/logout', 'POST', {}); assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  const staticPage = await call('/'); assert.match(staticPage.headers.get('content-security-policy'), /frame-ancestors 'none'/); assert.equal(staticPage.headers.get('cache-control'), 'no-store');
});

test('HTTP: вход ограничен по частоте и не запускается со слабым ключом', async t => {
  await assert.rejects(createOperatorServer({ store: {}, adminKey: 'short', origin: 'https://example.ru' }));
  const server = await createOperatorServer({ store: {}, adminKey: 'z'.repeat(40), origin: 'https://example.ru' });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  let response;
  for (let index = 0; index < 21; index++) response = await fetch(`http://127.0.0.1:${server.address().port}/api/login`, { method: 'POST', headers: { Origin: 'https://example.ru', 'Content-Type': 'application/json' }, body: '{"key":"wrong"}' });
  assert.equal(response.status, 429); assert.equal(response.headers.get('retry-after'), '60');
});
