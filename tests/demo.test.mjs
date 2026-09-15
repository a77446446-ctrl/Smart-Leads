import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const loginPage = await readFile(new URL('../src/app/(auth)/login/page.tsx', import.meta.url), 'utf8');
const demoPage = await readFile(new URL('../src/app/demo/page.tsx', import.meta.url), 'utf8');

test('локальный демо-вход доступен только вне production', () => {
  assert.match(loginPage, /process\.env\.NODE_ENV !== 'production'/);
  assert.match(loginPage, /href="\/api\/dev\/login"/);
  assert.match(loginPage, /router\.push\('\/demo'\)/);
});

test('демо-страница не использует реальные данные и закрыта в production', () => {
  assert.match(demoPage, /process\.env\.NODE_ENV === 'production'/);
  assert.match(demoPage, /учебные данные/);
  assert.match(demoPage, /MAX, Telegram/);
  assert.doesNotMatch(demoPage, /prisma\.|fetch\(['"]\/api/);
});
