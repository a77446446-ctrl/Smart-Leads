import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

test('зависший диспетчер MAX освобождает цикл, не меняя цикл парсера', async () => {
  const source = await readFile(new URL('scripts/cron.js', root), 'utf8');

  assert.match(source, /function callInternal\(path, key, onSuccess, timeoutMs = 0\)/);
  assert.match(source, /req\.setTimeout\(timeoutMs/);
  assert.match(source, /req\.destroy\(new Error\("Request timed out after "/);
  assert.match(
    source,
    /callInternal\("\/api\/internal\/bot\/dispatch", "bot",[\s\S]*?\}, 180_000\);/,
  );
  assert.match(
    source,
    /callInternal\("\/api\/admin\/parser\/cron", "parser",[\s\S]*?\n  \}\);/,
  );
});
