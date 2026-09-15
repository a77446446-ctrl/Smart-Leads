import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { DEFAULT_BRANDING, parseBranding, brandingFromStorage } from '../src/lib/branding.ts';
import { readBoundedJson } from '../src/lib/bounded-json.ts';
import { BRANDING_SETTING_KEY } from '../src/lib/branding.ts';

async function routeHarness(denied = null) {
  const source = await readFile(new URL('../src/app/api/admin/branding/route.ts', import.meta.url), 'utf8');
  const executable = stripTypeScriptTypes(source).replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  let stored = null;
  let writes = 0;
  const handlers = new Function('NextResponse', 'adminGuard', 'prisma', 'BRANDING_SETTING_KEY', 'parseBranding', 'getBranding', 'readBoundedJson', executable + '\nreturn { GET, POST };')(
    { json: (body, init) => Response.json(body, init) },
    async () => denied,
    { setting: { upsert: async args => { assert.equal(args.where.key, BRANDING_SETTING_KEY); stored = args.update.value; writes++; } } },
    BRANDING_SETTING_KEY, parseBranding, async () => brandingFromStorage(stored), readBoundedJson,
  );
  return { ...handlers, writes: () => writes };
}

function request(body, origin = 'https://example.org') {
  return new Request('https://example.org/api/admin/branding', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body),
  });
}

test('настоящие обработчики бренда сохраняют настройки и возвращают их без кэширования', async () => {
  const api = await routeHarness();
  const response = await api.POST(request({ name: 'Новости дня' }));
  assert.equal(response.status, 200);
  assert.equal(api.writes(), 1);
  const read = await api.GET();
  assert.equal(read.headers.get('cache-control'), 'no-store');
  assert.equal((await read.json()).name, 'Новости дня');
});

test('отказ авторизации, чужой Origin и опасные настройки не вызывают запись', async () => {
  for (const status of [401, 403]) {
    const api = await routeHarness(Response.json({ error: 'Нет доступа' }, { status }));
    assert.equal((await api.GET()).status, status);
    assert.equal((await api.POST(request({ name: 'Подмена' }))).status, status);
    assert.equal(api.writes(), 0);
  }
  const api = await routeHarness();
  assert.equal((await api.POST(request({ name: 'Подмена' }, 'https://evil.example'))).status, 403);
  assert.equal((await api.POST(request({ logoUrl: '//evil.example' }))).status, 400);
  assert.equal((await api.POST(request({ name: 'я'.repeat(9000) }))).status, 413);
  assert.equal((await api.POST(new Request('https://example.org', { method: 'POST', body: '{}' }))).status, 415);
  assert.equal(api.writes(), 0);
});

test('пустой экземпляр получает нейтральный бренд; настройки сохраняют произвольное название клиента', () => {
  assert.deepEqual(brandingFromStorage(null), DEFAULT_BRANDING);
  const brand = parseBranding({ name: ' СтройЛид ', accent: '#aaffdd', logoUrl: '/api/uploads/img_example', supportEmail: 'support@example.org' });
  assert.equal(brand.name, 'СтройЛид');
  assert.equal(brand.accent, '#AAFFDD');
  assert.deepEqual(brandingFromStorage(JSON.stringify(brand)), brand);
});

test('повреждённая настройка восстанавливается безопасно; секреты и неизвестные поля не принимаются', () => {
  for (const value of ['null', '[]', '{', '{"accent":"invalid"}']) assert.deepEqual(brandingFromStorage(value), DEFAULT_BRANDING);
  for (const input of [null, [], { name: '' }, { name: 'x'.repeat(61) }, { MAX_BOT_TOKEN: 'secret' }, { accent: '#000000' }, { accent: 'red;display:none' }, { name: 'Имя\u0000' }, { supportEmail: 'x\r\n@example.org' }]) {
    assert.throws(() => parseBranding(input));
  }
});

test('логотип не допускает внешние ресурсы, исполняемые URL и обход путей', () => {
  for (const logoUrl of ['javascript:alert(1)', '//evil.example/logo', 'https://evil.example/x', '/api/uploads/../../.env', '/api/uploads/img_a?x=1', 'data:image/svg+xml,evil']) {
    assert.throws(() => parseBranding({ logoUrl }));
  }
});

test('JSON ограничен реальными байтами, включая поток без Content-Length', async () => {
  const request = new Request('https://example.org', { method: 'POST', body: JSON.stringify({ name: 'Новости' }) });
  assert.deepEqual(await readBoundedJson(request), { name: 'Новости' });
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(4096)); controller.enqueue(new Uint8Array(4097)); controller.close(); },
  });
  await assert.rejects(readBoundedJson(new Request('https://example.org', { method: 'POST', body: stream, duplex: 'half' })), RangeError);
  await assert.rejects(readBoundedJson(new Request('https://example.org', { method: 'POST', body: '{' })));
});
