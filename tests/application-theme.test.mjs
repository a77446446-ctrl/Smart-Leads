import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './helpers/load-ts.mjs';

const catalog = loadTs('src/lib/application-theme.ts', {});
const bounded = loadTs('src/lib/bounded-json.ts', {});
const origin = loadTs('src/lib/same-app-origin.ts', { '@/lib/app-origin': { getAppOrigin: () => 'https://app.example' } });
const request = (body, headers = {}) => new Request('https://app.example/api/admin/application-theme', {
  method: 'POST', headers: { origin: 'https://app.example', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
});

function harness() {
  const rows = new Map();
  let denied = false;
  let unavailable = false;
  const prisma = { setting: {
    findUnique: async ({ where }) => { if (unavailable) throw new Error('Ошибка базы'); return rows.has(where.key) ? { key: where.key, value: rows.get(where.key) } : null; },
    findMany: async () => [...rows].map(([key, value]) => ({ key, value })),
    upsert: async ({ where, create, update }) => { if (unavailable) throw new Error('Ошибка базы'); rows.set(where.key, rows.has(where.key) ? update.value : create.value); },
  }, targetChat: { findMany: async () => [] } };
  const dependencies = {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/auth/admin-guard': { adminGuard: async () => denied ? Response.json({ error: 'Нет доступа' }, { status: 403 }) : null },
    '@/lib/prisma': { prisma }, '@/lib/application-theme': catalog,
    '@/lib/bounded-json': bounded, '@/lib/same-app-origin': origin,
    '@/lib/instance-config': { isInstanceSettingKey: () => false },
    '@/lib/security/secret-mask': { isSecretSettingKey: () => false, SECRET_MASK: '***' },
  };
  return { rows, route: () => loadTs('src/app/api/admin/application-theme/route.ts', dependencies),
    settings: () => loadTs('src/app/api/admin/settings/route.ts', dependencies),
    deny: () => { denied = true; }, fail: () => { unavailable = true; } };
}

test('тема сохраняется в базе и читается новым экземпляром обработчика; смена оставляет одну тему', async () => {
  const h = harness();
  assert.deepEqual(await (await h.route().GET()).json(), { theme: null });
  for (const theme of catalog.APPLICATION_THEMES) {
    assert.equal((await h.route().POST(request({ theme: theme.id }))).status, 200);
    const response = await h.route().GET();
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { theme: theme.id });
    assert.equal(h.rows.size, 1);
  }
});

test('несколько тем, неизвестная тема и лишние поля не заменяют сохранённый выбор', async () => {
  const h = harness();
  await h.route().POST(request({ theme: 'orders' }));
  for (const body of [null, [], 'news', {}, { theme: '' }, { theme: 'unknown' }, { theme: ['news', 'jobs'] }, { theme: 'news', themes: ['jobs'] }]) {
    assert.equal((await h.route().POST(request(body))).status, 400);
  }
  assert.equal(h.rows.get(catalog.APPLICATION_THEME_SETTING_KEY), 'orders');
});

test('проверки прав, источника, формата и размера запроса выполняются до записи', async () => {
  const h = harness();
  assert.equal((await h.route().POST(request({ theme: 'news' }, { origin: 'https://foreign.example' }))).status, 403);
  assert.equal((await h.route().POST(request({ theme: 'news' }, { origin: '' }))).status, 403);
  assert.equal((await h.route().POST(request({ theme: 'news' }, { 'content-type': 'text/plain' }))).status, 415);
  assert.equal((await h.route().POST(request({ theme: 'x'.repeat(1100) }))).status, 413);
  const broken = new Request('https://app.example/api/admin/application-theme', { method: 'POST', headers: { origin: 'https://app.example', 'content-type': 'application/json' }, body: '{' });
  assert.equal((await h.route().POST(broken)).status, 400);
  h.deny();
  assert.equal((await h.route().GET()).status, 403);
  assert.equal((await h.route().POST(request({ theme: 'news' }))).status, 403);
  assert.equal(h.rows.size, 0);
});

test('ошибка базы и повреждённое значение не маскируются темой по умолчанию', async () => {
  const h = harness();
  h.rows.set(catalog.APPLICATION_THEME_SETTING_KEY, 'broken');
  assert.equal((await h.route().GET()).status, 500);
  h.fail();
  assert.equal((await h.route().GET()).status, 503);
  assert.equal((await h.route().POST(request({ theme: 'news' }))).status, 503);
  assert.equal(h.rows.get(catalog.APPLICATION_THEME_SETTING_KEY), 'broken');
});

test('общие настройки не позволяют обойти проверку темы и не перезаписывают её при сохранении', async () => {
  const h = harness();
  await h.route().POST(request({ theme: 'news' }));
  assert.equal((await h.settings().POST(request({ key: catalog.APPLICATION_THEME_SETTING_KEY, value: 'jobs' }))).status, 400);
  assert.deepEqual((await (await h.settings().GET()).json()).map(row => row.key), ['maks_active_target_chats']);
  assert.equal(h.rows.get(catalog.APPLICATION_THEME_SETTING_KEY), 'news');
});
