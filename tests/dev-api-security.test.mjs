import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const protectedRoutes = [
  ['dev', 'route.ts'],
  ['dev', 'bot-status', 'route.ts'],
  ['dev', 'fix-db', 'route.ts'],
  ['test', 'route.ts'],
];

test('служебные API недоступны в production и защищены ролью администратора', async () => {
  for (const segments of protectedRoutes) {
    const route = path.join(process.cwd(), 'src', 'app', 'api', ...segments);
    const source = await readFile(route, 'utf8');
    const productionGuard = source.indexOf("process.env.NODE_ENV === 'production'");
    const adminGuard = source.indexOf('const denied = await adminGuard()');
    const firstDatabaseAccess = source.indexOf('prisma.');

    assert.notEqual(productionGuard, -1, route);
    assert.match(source, /status:\s*404/, route);
    assert.match(source, /@\/lib\/auth\/admin-guard/, route);
    assert.notEqual(adminGuard, -1, route);
    assert.ok(productionGuard < adminGuard, route);
    assert.ok(firstDatabaseAccess === -1 || adminGuard < firstDatabaseAccess, route);
  }
});
test('dev-login требует явного включения и недоступен в production', async () => {
  const route = path.join(process.cwd(), 'src', 'app', 'api', 'dev', 'login', 'route.ts');
  const source = await readFile(route, 'utf8');
  assert.match(source, /NODE_ENV === 'production'/);
  assert.match(source, /DEV_LOGIN_ENABLED !== 'true'/);
  assert.match(source, /status: 404/);
  assert.match(source, /await cookies\(\)/);
  const env = await readFile(path.join(process.cwd(), '.env.example'), 'utf8');
  assert.match(env, /DEV_LOGIN_ENABLED="false"/);
});