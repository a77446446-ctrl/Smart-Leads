import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const read = (file) => readFile(new URL(file, root), 'utf8');

async function loadParserAccountsModule() {
  const source = await read('src/lib/parser-accounts.ts');
  const purePart = source.split('type SessionMetadata')[0]
    .replace("import { normalizeProxyUrl } from '@/lib/proxy';", `
      function normalizeProxyUrl(value) {
        if (value == null || value === '') return null;
        if (typeof value !== 'string' || value.length > 2048) throw new Error('Некорректная строка прокси');
        const url = new URL(value.trim());
        if (!['http:', 'https:', 'socks5:', 'socks5h:'].includes(url.protocol)) throw new Error('Неподдерживаемый протокол прокси');
        if (!url.hostname || !url.port) throw new Error('Для прокси обязательны хост и порт');
        return url.toString();
      }
    `)
    .replace("import { prisma } from '@/lib/prisma';", '');
  const output = ts.transpileModule(purePart, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  process.env.PARSER_SESSION_ENCRYPTION_KEY = 'stage-3-session-key-with-at-least-32-characters';
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

test('proxyString шифруется AES-GCM и маскируется до выдачи администратору', async () => {
  process.env.PARSER_PROXY_ENCRYPTION_KEY = 'stage-3-test-key-with-at-least-32-characters';
  const accounts = await loadParserAccountsModule();
  const clear = 'http://resident-user:secret-pass@127.0.0.1:3128';
  const encrypted = accounts.encryptProxyUrl(clear);
  assert.match(encrypted, /^enc:v1:/);
  const session = JSON.stringify({ storage: { cookies: [], origins: [] }, meta: { name: 'Тест' } });
  const sessionBackup = accounts.encryptParserSession(session);
  assert.match(sessionBackup, /^session:v1:/);
  assert.doesNotMatch(sessionBackup, /cookies|Тест/);
  assert.equal(accounts.decryptParserSession(sessionBackup), session);
  assert.doesNotMatch(encrypted, /resident-user|secret-pass|127\.0\.0\.1/);
  const tamperedSession = `${sessionBackup.slice(0, -1)}${sessionBackup.endsWith('A') ? 'B' : 'A'}`;
  assert.throws(() => accounts.decryptParserSession(tamperedSession));
  assert.equal(accounts.decryptProxyUrl(encrypted), `${clear}/`);
  assert.equal(accounts.maskProxyUrl(clear), 'http://re***:***@127.0.0.1:3128');
  const proxyTamperIndex = Math.floor(encrypted.length / 2);
  const tamperedProxy = encrypted.slice(0, proxyTamperIndex)
    + (encrypted[proxyTamperIndex] === 'A' ? 'B' : 'A')
    + encrypted.slice(proxyTamperIndex + 1);
  assert.throws(() => accounts.decryptProxyUrl(tamperedProxy));
});

test('парсер использует lease, ограниченный worker и статусы здоровья аккаунтов', async () => {
  const [parser, lease, schema, migration] = await Promise.all([
    read('src/services/max-parser.ts'),
    read('src/lib/parser-lease.ts'),
    read('prisma/schema.prisma'),
    read('prisma/migrations/20260823030000_stage_3_parser_hardening/migration.sql'),
  ]);
  assert.match(parser, /acquireParserLease/);
  assert.match(parser, /refreshParserLease/);
  assert.match(parser, /outputLimit = 2 \* 1024 \* 1024/);
  assert.match(parser, /PARSER_PROXY_URL: account\.proxyUrl/);
  const sessionMigration = await read('prisma/migrations/20260830010000_persist_parser_sessions/migration.sql');
  assert.match(parser, /windowsHide: true/);
  assert.match(parser, /AUTH_REQUIRED/);
  assert.match(parser, /RATE_LIMITED/);
  assert.match(parser, /normalizeMaxChatUrl/);
  assert.match(parser, /accounts\.splice\(accountIndex, 1\)/);
  assert.match(parser, /worker\.status === 'OK' && worker\.messages\.length > 0/);
  assert.match(parser, /const title = parsedTitle \|\| item\.chat\.name/);
  assert.match(lease, /lockedUntil: \{ lt: now \}/);
  assert.match(schema, /model ParserLease/);
  assert.match(schema, /consecutiveFailures Int/);
  assert.match(migration, /CREATE TABLE "ParserLease"/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|TRUNCATE/i);
  assert.match(schema, /sessionData\s+String\?/);
  assert.match(sessionMigration, /ADD COLUMN "sessionData" TEXT/);
  assert.doesNotMatch(sessionMigration, /DROP TABLE|DROP COLUMN|TRUNCATE/i);
});

test('URL worker ограничен HTTPS-доменами MAX', async () => {
  const source = await read('src/lib/max-chat-url.ts');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const urls = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
  assert.equal(urls.normalizeMaxChatUrl('max.ru/join/abc'), 'https://web.max.ru/join/abc');
  assert.equal(urls.normalizeMaxChatUrl('https://web.max.ru/chat?id=1#ChatId'), 'https://web.max.ru/chat?id=1#ChatId');
  assert.equal(urls.normalizeMaxChatUrl('HTTPS://WEB.MAX.RU/A/#ChatId'), 'https://web.max.ru/A/#ChatId');
  assert.throws(() => urls.normalizeMaxChatUrl('http://web.max.ru/chat'));
  assert.throws(() => urls.normalizeMaxChatUrl('https://max.ru.evil.example/chat'));
  assert.throws(() => urls.normalizeMaxChatUrl('https://127.0.0.1/admin'));
});
test('Playwright worker не подменяет fingerprint и сохраняет обновлённую сессию', async () => {
  const [worker, auth, proxyRuntime, proxyCheck] = await Promise.all([
    read('scripts/parser_worker.py'),
    read('scripts/auth_manager.py'),
    read('scripts/proxy_runtime.py'),
    read('scripts/proxy_check.py'),
  ]);
  assert.match(worker, /PARSER_PROXY_URL/);
  assert.match(worker, /human_scroll/);
  assert.match(worker, /context\.storage_state\(\)/);
  assert.match(worker, /PARSER_DEBUG_ARTIFACTS/);
  assert.match(worker, /page\.goto\(chat_url, timeout=60_000, wait_until="domcontentloaded"\)/);
  assert.doesNotMatch(worker, /page\.goto\(base_url/);
  assert.match(worker, /if DEBUG_ARTIFACTS and not messages:/);
  assert.match(worker, /DOM-кандидаты=/);
  assert.doesNotMatch(worker, /page\.evaluate\(f["']window\.location\.href/);
  assert.doesNotMatch(worker, /navigator.*webdriver|user_agent\s*=/i);
  assert.match(auth, /if not authorized:/);
  assert.doesNotMatch(auth, /force save|input\(/i);
  assert.match(proxyRuntime, /urlsplit\(proxy_url\)/);
  assert.match(proxyCheck, /TEST_PROXY_URL/);
  assert.doesNotMatch(proxyCheck, /sys\.argv\[1\]/);
});

test('API аккаунтов не раскрывает пароль прокси и не использует shell-команды', async () => {
  const [sessions, qr, proxyCheck] = await Promise.all([
    read('src/app/api/admin/auth/sessions/route.ts'),
    read('src/app/api/admin/auth/qr-start/route.ts'),
    read('src/app/api/admin/auth/proxy-check/route.ts'),
  ]);
  assert.match(sessions, /maskProxyUrl/);
  assert.match(sessions, /synchronizeParserSessionFiles/);
  assert.doesNotMatch(sessions, /exec\(|execAsync|proxyString:/);
  assert.match(qr, /encryptProxyUrl\(proxy\)/);
  assert.match(qr, /PARSER_PROXY_URL: proxy/);
  assert.doesNotMatch(qr, /\[scriptPath, ['"]None['"], proxy/);
  assert.match(proxyCheck, /env: \{[^}]*TEST_PROXY_URL: proxy/s);
  assert.match(proxyCheck, /shell: false/);
});

test('пароль прокси не сохраняется в localStorage', async () => {
  const settings = await read('src/app/(admin)/admin/settings/page.tsx');
  assert.doesNotMatch(settings, /localStorage\.setItem\('maks_proxy/);
  assert.doesNotMatch(settings, /setItem\('maks_proxyPass'/);
  assert.match(settings, /\/api\/admin\/auth\/proxy/);


});