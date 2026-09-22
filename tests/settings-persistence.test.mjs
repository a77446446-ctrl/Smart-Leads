import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './helpers/load-ts.mjs';

const json = (body, init) => Response.json(body, init);

test('сохранённые настройки и чат загружаются из базы после нового запроса', async () => {
  const rows = new Map();
  const prisma = {
    setting: {
      findMany: async () => [...rows].map(([key, value]) => ({ id: key, key, value })),
      findUnique: async ({ where }) => rows.has(where.key) ? { key: where.key, value: rows.get(where.key) } : null,
      upsert: async ({ where, create, update }) => {
        const value = rows.has(where.key) ? update.value : create.value;
        rows.set(where.key, value);
        return { id: where.key, key: where.key, value };
      },
    },
    targetChat: { findMany: async () => [] },
  };
  const route = loadTs('src/app/api/admin/settings/route.ts', {
    'next/server': { NextResponse: { json } },
    '@/lib/auth/admin-guard': { adminGuard: async () => null },
    '@/lib/prisma': { prisma },
    '@/lib/security/secret-mask': { isSecretSettingKey: () => false, SECRET_MASK: '••••' },
    '@/lib/instance-config': { isInstanceSettingKey: () => false },
    '@/lib/application-theme': loadTs('src/lib/application-theme.ts', {}),
  });
  const chat = [{ name: 'Рабочий чат', url: 'https://web.max.ru/a/#@example', parseAll: true }];
  for (const [key, value] of Object.entries({ maks_parsing_chats: JSON.stringify(chat), maks_parser_auto: 'true', maks_parser_interval: '300' })) {
    const response = await route.POST(new Request('https://app.example/api/admin/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, value }),
    }));
    assert.equal(response.status, 200);
  }
  const response = await route.GET();
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const loaded = Object.fromEntries((await response.json()).map(row => [row.key, row.value]));
  assert.deepEqual(JSON.parse(loaded.maks_parsing_chats), chat);
  assert.equal(loaded.maks_parser_auto, 'true');
  assert.equal(loaded.maks_parser_interval, '300');
});

test('список аккаунтов восстанавливает файл сессии из базы перед выдачей статуса', async () => {
  let restored = false;
  const route = loadTs('src/app/api/admin/auth/sessions/route.ts', {
    'next/server': { NextResponse: { json } },
    '@/lib/auth/admin-guard': { adminGuard: async () => null },
    '@/lib/prisma': { prisma: { maksAccount: { findMany: async () => [{
      id: 'account-1', name: 'MAX', sessionFile: 'session-1.json', active: true,
      status: 'ACTIVE', cooldownUntil: null, proxyString: 'direct',
      lastUsed: null, lastSuccessAt: null, consecutiveFailures: 0,
      totalRuns: 0, totalErrors: 0, lastError: null,
    }] } } },
    '@/lib/parser-accounts': {
      sessionFileExists: async () => false,
      ensureParserSessionFile: async account => { assert.equal(account.id, 'account-1'); restored = true; return true; },
      maskProxyUrl: () => 'Прямое подключение', decryptProxyUrl: () => 'direct',
      safeParserError: error => String(error),
    },
  });
  const response = await route.GET({ nextUrl: new URL('https://app.example/api/admin/auth/sessions?sync=false') });
  assert.equal(response.status, 200);
  assert.equal(restored, true);
  const { sessions } = await response.json();
  assert.equal(sessions[0].active, true);
  assert.equal(sessions[0].status, 'ACTIVE');
});
