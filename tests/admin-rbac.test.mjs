import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

async function findRoutes(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findRoutes(fullPath);
    return entry.name === 'route.ts' ? [fullPath] : [];
  }));
  return nested.flat();
}

test('каждый административный API проверяет актуальную роль из БД', async () => {
  const root = path.join(process.cwd(), 'src', 'app', 'api', 'admin');
  const routes = await findRoutes(root);
  let handlers = 0;
  let guards = 0;

  for (const route of routes) {
    const source = await readFile(route, 'utf8');
    if (route.endsWith(path.join('parser', 'cron', 'route.ts'))) {
      assert.match(source, /process\.env\.CRON_SECRET/);
      continue;
    }
    const routeHandlers = source.match(/export async function (GET|POST|PUT|PATCH|DELETE)/g) ?? [];
    if (routeHandlers.length === 0) continue;
    assert.match(source, /@\/lib\/auth\/admin-guard/, route);
    const routeGuards = source.match(/const denied = await adminGuard\(\)/g) ?? [];
    assert.equal(routeGuards.length, routeHandlers.length, route);
    handlers += routeHandlers.length;
    guards += routeGuards.length;
  }

  assert.ok(handlers >= 20, `Ожидалось не меньше 20 admin-обработчиков, найдено ${handlers}`);
  assert.equal(guards, handlers);
});
