import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (file) => readFile(new URL(file, root), 'utf8');

test('серверная QR-авторизация имеет защищённый статус и конечные состояния', async () => {
  const [worker, start, status, qr, settings, proxyCheck, environment] = await Promise.all([
    read('scripts/auth_manager.py'),
    read('src/app/api/admin/auth/qr-start/route.ts'),
    read('src/app/api/admin/auth/status/route.ts'),
    read('src/app/api/admin/auth/qr/route.ts'),
    read('src/app/(admin)/admin/settings/page.tsx'),
    read('src/app/api/admin/auth/proxy-check/route.ts'),
    read('.env.example'),
  ]);

  assert.match(worker, /requested_headless/);
  assert.match(worker, /capture_qr/);
  assert.match(worker, /write_status\(status_target, "error"/);
  assert.match(worker, /ignore_https_errors.*True/s);
  assert.match(start, /stdio: \['ignore', 'pipe', 'pipe'\]/);
  assert.match(start, /AUTH_TIMEOUT_MS = 6 \* 60_000/);
  assert.match(status, /state: 'qr'/);
  assert.match(status, /state: 'error'/);
  assert.match(qr, /adminGuard\(\)/);
  assert.match(start, /persistParserSessionFile\(account\.id, sessionId\)/);
  assert.match(qr, /Cache-Control': 'private, no-store/);
  assert.match(settings, /authStep === 'qr'/);
  assert.match(status, /ensureParserSessionFile\(account\)/);
  assert.match(status, /persistParserSessionFile\(account\.id, sessionId\)/);
  assert.match(settings, /encodeURIComponent\(data\.accountId\)/);
  assert.doesNotMatch(settings, /sData\.sessions\?\.length > sessions\.length/);
  assert.match(proxyCheck, /CHECK_TIMEOUT_MS = 15_000/);
  assert.match(environment, /PARSER_AUTH_HEADLESS="true"/);
  assert.match(environment, /PARSER_SESSION_ENCRYPTION_KEY=/);
});
