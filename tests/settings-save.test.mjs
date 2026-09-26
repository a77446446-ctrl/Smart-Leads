import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './helpers/load-ts.mjs';
const { saveAdminSettings } = loadTs('src/lib/save-admin-settings.ts', {});
const { mergeChatResults } = loadTs('src/services/parser-chat-results.ts', { '@/lib/prisma': { prisma: {} } });

test('сохранение завершается при успехе, ошибке и зависании запроса или чтения ответа', async () => {
  const original = globalThis.fetch;
  try {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return Response.json({ saved: true }); };
    await saveAdminSettings([{ key: 'maks_parsing_chats', value: '[]' }]);
    assert.equal(calls, 1);
    globalThis.fetch = async () => Response.json({ error: 'База занята' }, { status: 503 });
    await assert.rejects(saveAdminSettings([]), /База занята/);
    let signal;
    globalThis.fetch = (_url, init) => { signal = init.signal; return new Promise(() => {}); };
    await assert.rejects(saveAdminSettings([], undefined, 15), /не подтвердил/);
    assert.equal(signal.aborted, true);
    globalThis.fetch = async () => ({ ok: true, json: () => new Promise(() => {}) });
    await assert.rejects(saveAdminSettings([], undefined, 15), /не подтвердил/);
    globalThis.fetch = async () => Response.json({ saved: true });
    await assert.rejects(saveAdminSettings([], () => new Promise(() => {}), 15), /чаты сохранены.*прокси/);
  } finally { globalThis.fetch = original; }
});

test('завершение парсинга не возвращает удалённый чат и не откатывает новый чат или режим отбора', () => {
  const current = [{ url: 'a', name: 'Новое имя', parseAll: false }, { url: 'new', parseAll: true }];
  const result = JSON.parse(mergeChatResults(JSON.stringify(current), [
    { url: 'a', lastRunLeadsCount: 2, lastParsedAt: '2026-09-26' },
    { url: 'deleted', lastRunLeadsCount: 5, lastParsedAt: '2026-09-26' },
  ]));
  assert.equal(result.length, 2); assert.equal(result[0].parseAll, false);
  assert.equal(result[0].name, 'Новое имя'); assert.equal(result[0].lastRunLeadsCount, 2);
  assert.deepEqual(result[1], current[1]);
});

test('пакетное сохранение проверяет ключи и выполняет одну ограниченную транзакцию', async () => {
  let writes = [], transactions = 0;
  const route = loadTs('src/app/api/admin/settings/batch/route.ts', {
    'next/server': { NextResponse: { json: Response.json } },
    '@/lib/auth/admin-guard': { adminGuard: async () => null },
    '@/lib/same-app-origin': { isSameAppOrigin: () => true },
    '@/lib/bounded-json': { readBoundedJson: request => request.json() },
    '@/lib/security/secret-mask': { isSecretSettingKey: key => key === 'maks_ai_api_key', SECRET_MASK: 'MASK' },
    '@/lib/prisma': { prisma: { $transaction: async (callback, options) => {
      transactions++; assert.equal(options.timeout, 10000);
      await callback({ $executeRaw: async () => {}, setting: { upsert: async value => writes.push(value) } });
    } } },
  });
  const call = settings => route.POST(new Request('https://app.example/api/admin/settings/batch', { method: 'POST', body: JSON.stringify({ settings }) }));
  assert.equal((await call([{ key: 'maks_parsing_chats', value: '[]' }, { key: 'maks_ai_api_key', value: 'MASK' }])).status, 200);
  assert.equal(transactions, 1); assert.equal(writes.length, 1);
  assert.equal((await call([{ key: 'application_theme', value: 'news' }])).status, 400);
  assert.equal((await call([{ key: 'maks_parser_auto', value: 'true' }, { key: 'maks_parser_auto', value: 'false' }])).status, 400);
  assert.equal(transactions, 1);
});
