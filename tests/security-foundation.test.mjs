import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('admin child processes do not invoke a shell', async () => {
  const files = await Promise.all([
    read('src/app/api/admin/auth/proxy-check/route.ts'),
    read('src/app/api/admin/auth/qr-start/route.ts'),
  ]);

  for (const source of files) {
    assert.doesNotMatch(source, /\bexec\s*\(/);
    assert.doesNotMatch(source, /shell:\s*true/);
    assert.match(source, /shell:\s*false/);
  }
});

test('proxy test scripts do not contain credentials', async () => {
  const files = await Promise.all([
    read('scripts/test_proxy.py'),
    read('scripts/test_proxy_new.py'),
    read('scripts/test_proxy_socks5.py'),
  ]);

  for (const source of files) {
    assert.match(source, /TEST_PROXY_URL/);
    assert.doesNotMatch(source, /https?:\/\/[^\s:@]+:[^\s@]+@/);
    assert.doesNotMatch(source, /socks5h?:\/\/[^\s:@]+:[^\s@]+@/);
  }
});

test('production start does not mutate the database schema', async () => {
  const packageJson = JSON.parse(await read('package.json'));
  assert.doesNotMatch(packageJson.scripts.start, /prisma\s+db\s+push/);
  assert.equal(packageJson.scripts['db:deploy'], 'prisma migrate deploy');
});

test('cron endpoint requires a shared secret and respects runtime port', async () => {
  const route = await read('src/app/api/admin/parser/cron/route.ts');
  const client = await read('scripts/cron.js');
  assert.match(route, /process\.env\.CRON_SECRET/);
  assert.match(route, /status:\s*401/);
  assert.match(client, /process\.env\.PORT/);
  assert.match(client, /Authorization/);
  assert.doesNotMatch(client, /port:\s*3000/);
});
test('production включает базовые HTTP-заголовки безопасности', async () => {
  const config = await read('next.config.js');
  assert.match(config, /poweredByHeader:\s*false/);
  assert.match(config, /X-Content-Type-Options/);
  assert.match(config, /Strict-Transport-Security/);
  assert.match(config, /process\.env\.NODE_ENV === 'production'/);
});
test('Next.js закреплён на исправленной Maintenance LTS версии', async () => {
  const packageJson = JSON.parse(await read('package.json'));
  assert.equal(packageJson.dependencies.next, '15.5.24');
  assert.equal(packageJson.devDependencies['eslint-config-next'], '15.5.24');
});