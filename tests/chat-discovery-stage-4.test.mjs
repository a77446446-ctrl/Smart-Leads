import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('миграция этапа 4 аддитивна и хранит источники с аудитом', () => {
  const schema = read('prisma/schema.prisma');
  const migration = read('prisma/migrations/20260823040000_stage_4_detective/migration.sql');
  assert.match(schema, /model TargetChat/);
  assert.match(schema, /model DiscoveryRun/);
  assert.match(migration, /CREATE UNIQUE INDEX "TargetChat_url_key"/);
  assert.doesNotMatch(migration, /\b(?:DROP|TRUNCATE|DELETE)\b/i);
});

test('детектив использует официальные API, лимиты и не скрейпит Google HTML', () => {
  const source = read('src/services/chat-discovery.ts');
  assert.match(source, /customsearch\.googleapis\.com\/customsearch\/v1/);
  assert.match(source, /api\.vk\.com\/method\/newsfeed\.search/);
  assert.match(source, /AbortController/);
  assert.match(source, /2 \* 1024 \* 1024/);
  assert.doesNotMatch(source, /google\.[a-z.]+\/search/i);
  assert.doesNotMatch(source, /console\.(?:log|error).*TOKEN/i);
});

test('MAX-ссылки проходят allowlist, дедупликацию и ручной запрет повторной активации', () => {
  const discovery = read('src/services/chat-discovery.ts');
  const maxUrl = read('src/lib/max-chat-url.ts');
  assert.match(discovery, /extractMaxChatUrls/);
  assert.match(discovery, /new Map<string, Candidate>/);
  assert.match(discovery, /existing\.status !== 'REJECTED'/);
  assert.match(maxUrl, /ALLOWED_MAX_HOSTS/);
  assert.match(maxUrl, /url\.protocol !== 'https:'/);
});

test('запуски защищены RBAC, CRON_SECRET и DB lease', () => {
  const adminRun = read('src/app/api/admin/discovery/run/route.ts');
  const internalRun = read('src/app/api/internal/discovery/run/route.ts');
  const service = read('src/services/chat-discovery.ts');
  assert.match(adminRun, /adminGuard/);
  assert.match(internalRun, /verifyBearerSecret/);
  assert.match(internalRun, /DISCOVERY_ENABLED/);
  assert.match(service, /max-chat-discovery/);
  assert.match(service, /lockedUntil/);
});

test('активные TargetChat подключены к парсеру без загрязнения legacy JSON', () => {
  const parser = read('src/services/max-parser.ts');
  assert.match(parser, /prisma\.targetChat\.findMany/);
  assert.match(parser, /active: true, status: 'ACTIVE'/);
  assert.match(parser, /chats\.filter\(\(chat\) => !chat\.targetId\)/);
  assert.match(parser, /lastCheckedAt/);
});

test('админка предоставляет контроль источников и историю запусков', () => {
  const page = read('src/app/(admin)/admin/discovery/page.tsx');
  const route = read('src/app/api/admin/discovery/chats/route.ts');
  assert.match(page, /ЗАПУСТИТЬ ПОИСК/i);
  assert.match(page, /'ACTIVE' \| 'PENDING' \| 'REJECTED'/);
  assert.match(route, /STATUSES/);
  assert.match(route, /addManualTargetChat/);
});
