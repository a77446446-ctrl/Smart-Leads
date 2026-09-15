import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (file) => readFile(new URL(file, root), 'utf8');

test('контейнер устанавливает Python и все worker запускаются через единый runtime', async () => {
  const [nixpacks, runtime, qr, proxy, parser] = await Promise.all([
    read('nixpacks.toml'),
    read('src/lib/python-runtime.ts'),
    read('src/app/api/admin/auth/qr-start/route.ts'),
    read('src/app/api/admin/auth/proxy-check/route.ts'),
    read('src/services/max-parser.ts'),
  ]);
  assert.match(nixpacks, /providers = \["node"\]/);
  assert.doesNotMatch(nixpacks, /providers = \["\.\.\.", "python"\]/);
  assert.match(nixpacks, /python3-venv/);
  assert.match(nixpacks, /requirements-parser\.txt/);
  assert.match(nixpacks, /playwright install --with-deps chromium/);
  assert.match(runtime, /PARSER_PYTHON_EXECUTABLE/);
  assert.match(runtime, /code === 'ENOENT'/);
  for (const source of [qr, proxy, parser]) {
    assert.match(source, /spawn\(parserPythonExecutable\(\)/);
    assert.doesNotMatch(source, /spawn\(['"]python['"]/);
  }
});

test('прокси сохраняется зашифрованно, а мобильная строка чата не выходит за карточку', async () => {
  const [draft, api, settings, mask, login, link] = await Promise.all([
    read('src/lib/proxy-draft.ts'),
    read('src/app/api/admin/auth/proxy/route.ts'),
    read('src/app/(admin)/admin/settings/page.tsx'),
    read('src/lib/security/secret-mask.ts'),
    read('src/app/(auth)/login/page.tsx'),
    read('src/app/api/auth/max-link/route.ts'),
  ]);
  assert.match(draft, /encryptProxyUrl/);
  assert.match(draft, /hasPassword/);
  assert.match(api, /adminGuard\(\)/);
  assert.doesNotMatch(api, /password:/);
  assert.match(mask, /maks_proxy_draft_encrypted/);
  assert.doesNotMatch(settings, /localStorage\.setItem\('maks_proxy/);
  assert.match(settings, /grid-cols-\[minmax\(0,1fr\)_auto\]/);
  assert.match(settings, /flex-1 truncate/);
  assert.match(login, /\/api\/auth\/max-link/);
  assert.match(link, /buildMaxMiniAppLink\('home'\)/);
});
