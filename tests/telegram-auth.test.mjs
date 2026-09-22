import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadTs } from './helpers/load-ts.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const originalEnv = { ...process.env };

function loadTelegramAuth() {
  return loadTs('src/lib/auth/telegram-oidc.ts', { 'server-only': {}, '@/lib/app-origin': loadTs('src/lib/app-origin.ts', {}), '@/lib/auth/telegram-http': loadTs('src/lib/auth/telegram-http.ts', { 'server-only': {} }) });
}

function encode(value) {
  return Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
}

test.afterEach(() => {
  process.env = { ...originalEnv };
});

test('Telegram OIDC создаёт подписанное состояние и PKCE S256', () => {
  process.env.AUTH_SESSION_SECRET = 'test-session-secret-with-at-least-32-characters';
  const auth = loadTelegramAuth();
  const config = {
    clientId: '123456789',
    clientSecret: 'telegram-client-secret-value',
    callbackUrl: 'https://smart-leads.example/api/auth/telegram/callback',
  };
  const request = auth.createTelegramLoginRequest(config);
  const url = new URL(request.authorizationUrl);
  const state = auth.verifyTelegramLoginState(request.stateCookie, url.searchParams.get('state'));

  assert.equal(url.origin, 'https://oauth.telegram.org');
  assert.equal(url.pathname, '/auth');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('scope'), 'openid profile');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(
    url.searchParams.get('code_challenge'),
    createHash('sha256').update(state.verifier).digest('base64url'),
  );
  assert.throws(() => auth.verifyTelegramLoginState(`${request.stateCookie}x`, state.state));
  assert.throws(() => auth.verifyTelegramLoginState(request.stateCookie, `${state.state}x`));
});

test('Telegram ID token принимается только с корректной подписью, audience и nonce', async () => {
  const auth = loadTelegramAuth();
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicJwk = publicKey.export({ format: 'jwk' });
  const now = 1_800_000_000;
  const header = { alg: 'RS256', kid: 'test-key' };
  const claims = {
    iss: 'https://oauth.telegram.org',
    aud: '123456789',
    sub: 'telegram-subject',
    iat: now - 10,
    exp: now + 300,
    nonce: 'expected-nonce',
    id: 987654321,
    name: 'Иван Иванов',
    preferred_username: 'ivan',
    picture: 'https://example.test/avatar.jpg',
  };
  const unsigned = `${encode(header)}.${encode(claims)}`;
  const token = `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), privateKey).toString('base64url')}`;
  const config = {
    clientId: '123456789',
    clientSecret: 'telegram-client-secret-value',
    callbackUrl: 'https://smart-leads.example/api/auth/telegram/callback',
  };
  const jwks = { keys: [{ ...publicJwk, kid: 'test-key', alg: 'RS256', use: 'sig' }] };

  assert.deepEqual(
    await auth.verifyTelegramIdToken(token, 'expected-nonce', config, jwks, now),
    { telegramId: '987654321', name: 'Иван Иванов', username: 'ivan', photoUrl: 'https://example.test/avatar.jpg' },
  );
  await assert.rejects(() => auth.verifyTelegramIdToken(token, 'wrong-nonce', config, jwks, now));
  await assert.rejects(() => auth.verifyTelegramIdToken(token, 'expected-nonce', { ...config, clientId: '1' }, jwks, now));
  const corrupted = `${unsigned}.${encode('bad-signature')}`;
  await assert.rejects(() => auth.verifyTelegramIdToken(corrupted, 'expected-nonce', config, jwks, now));
});

test('маршруты Telegram используют серверный code flow и блокировки', () => {
  const login = read('src/app/(auth)/login/page.tsx');
  const start = read('src/app/api/auth/telegram/start/route.ts');
  const callback = read('src/app/api/auth/telegram/callback/route.ts');
  const schema = read('prisma/schema.prisma');

  assert.match(login, /Войти через Telegram/);
  assert.match(login, /\/api\/auth\/telegram\/start/);
  assert.match(start, /createTelegramLoginRequest/);
  assert.match(callback, /exchangeTelegramAuthorizationCode/);
  assert.match(callback, /verifyTelegramIdToken/);
  assert.match(callback, /blockedExternalIdentity\.findUnique/);
  assert.match(schema, /model ExternalIdentity/);
  assert.match(schema, /model BlockedExternalIdentity/);
  assert.match(schema, /maxId\s+BigInt\?/);
});

test('кнопки MAX и Telegram показывают ошибки своего провайдера', () => {
  const login = read('src/app/(auth)/login/page.tsx');
  const maxLink = read('src/app/api/auth/max-link/route.ts');
  const maxLogo = readFileSync(new URL('../public/max-logo.png', import.meta.url));

  assert.match(login, /max_not_configured: 'Не удалось войти через MAX:/);
  assert.match(login, /telegram_not_configured: 'Не удалось войти через Telegram:/);
  assert.match(login, /<span>Войти через MAX<\/span>/);
  assert.match(login, /src="\/max-logo\.png"/);
  assert.match(maxLink, /login\.searchParams\.set\('error', 'max_not_configured'\)/);
  assert.equal(maxLogo.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
});

const appOrigin = loadTs('src/lib/app-origin.ts', {});

test('публичный адрес читается при выполнении и запрещает localhost в production', () => {
  process.env.NODE_ENV = 'production';
  process.env.NEXT_PUBLIC_APP_URL = 'https://client.example/';
  assert.equal(appOrigin.getAppOrigin('http://localhost:3000/api/auth/telegram/callback'), 'https://client.example');
  process.env.NEXT_PUBLIC_APP_URL = 'https://another.example';
  assert.equal(appOrigin.getAppOrigin(), 'https://another.example');
  for (const value of ['', 'http://client.example', 'https://localhost:3000', 'https://127.0.0.1', 'https://[::1]', 'https://client.example/path', 'https://user:pass@client.example', 'https://client.example/?x=1']) {
    process.env.NEXT_PUBLIC_APP_URL = value;
    assert.throws(() => appOrigin.getAppOrigin('http://localhost:3000'), /NEXT_PUBLIC_APP_URL/);
  }
  process.env.NODE_ENV = 'development';
  delete process.env.NEXT_PUBLIC_APP_URL;
  assert.equal(appOrigin.getAppOrigin('http://localhost:3100/login?next=/admin'), 'http://localhost:3100');
});

function configurePublicLogin() {
  process.env.NODE_ENV = 'production';
  process.env.NEXT_PUBLIC_APP_URL = 'https://client.example';
  process.env.TELEGRAM_CLIENT_ID = '123456789';
  process.env.TELEGRAM_CLIENT_SECRET = 'telegram-client-secret-value';
  process.env.AUTH_SESSION_SECRET = 'test-session-secret-with-at-least-32-characters';
}

test('начало входа и ошибка настройки возвращают публичный адрес за прокси', async (context) => {
  context.mock.method(console, 'error', () => {});
  configurePublicLogin();
  const auth = loadTelegramAuth();
  const route = loadTs('src/app/api/auth/telegram/start/route.ts', {
    '@/lib/app-origin': appOrigin,
    '@/lib/auth/telegram-oidc': auth,
  });
  const request = new Request('http://localhost:3000/api/auth/telegram/start');
  const response = await route.GET(request);
  const location = new URL(response.headers.get('location'));
  assert.equal(location.searchParams.get('redirect_uri'), 'https://client.example/api/auth/telegram/callback');
  assert.ok(response.cookies.get('telegram_login_state')?.value);
  delete process.env.TELEGRAM_CLIENT_ID;
  assert.equal((await route.GET(request)).headers.get('location'), 'https://client.example/login?error=telegram_not_configured');
});

test('callback Telegram сохраняет сессию и возвращает администратора и пользователя на публичный сайт', async (context) => {
  context.mock.method(console, 'error', () => {});
  configurePublicLogin();
  const { NextRequest } = await import('next/server.js');
  for (const [role, existing] of [['ADMIN', false], ['ADMIN', true], ['USER', false], ['USER', true]]) {
    let blocked = false;
    let failExchange = false;
    const user = { id: 'test-user', role };
    const store = {
      setting: { findUnique: async () => ({ value: 'false' }) },
      blockedExternalIdentity: { findUnique: async () => blocked ? { providerUserId: '42' } : null },
      externalIdentity: { findUnique: async () => existing ? { userId: user.id } : null, update: async () => ({}) },
      user: { create: async () => user, update: async () => user, findUniqueOrThrow: async () => user },
    };
    const auth = loadTelegramAuth();
    const route = loadTs('src/app/api/auth/telegram/callback/route.ts', {
      '@/lib/app-origin': appOrigin,
      '@/lib/auth/admin-config': { isConfiguredAdminTelegramId: () => role === 'ADMIN' },
      '@/lib/auth/session': {
        createSessionToken: async (id, sessionRole) => {
          assert.equal(id, user.id);
          assert.equal(sessionRole, role);
          return 'test-session-token';
        },
        sessionCookie: { name: 'session', maxAge: 3600, options: { httpOnly: true, secure: true, sameSite: 'lax', path: '/' } },
      },
      '@/lib/auth/telegram-oidc': {
        ...auth,
        verifyTelegramLoginState: () => ({ verifier: 'test', nonce: 'test' }),
        exchangeTelegramAuthorizationCode: async () => {
          if (failExchange) throw new Error('Ошибка обмена кода');
          return 'test-id-token';
        },
        verifyTelegramIdToken: async () => ({ telegramId: '42', name: 'Тест', username: null, photoUrl: null }),
      },
      '@/lib/prisma': { prisma: { ...store, $transaction: async (handler) => handler(store) } },
    });
    const request = new NextRequest('http://localhost:3000/api/auth/telegram/callback?code=test&state=test', {
      headers: { host: 'attacker.example', 'x-forwarded-host': 'attacker.example' },
    });
    const success = await route.GET(request);
    assert.equal(success.headers.get('location'), 'https://client.example/' + (role === 'ADMIN' ? 'admin' : 'dashboard'));
    assert.equal(success.cookies.get('session')?.value, 'test-session-token');
    assert.equal(success.cookies.get('telegram_login_state')?.value, '');
    const cancelled = await route.GET(new NextRequest('http://localhost:3000/api/auth/telegram/callback?error=access_denied'));
    assert.equal(cancelled.headers.get('location'), 'https://client.example/login?error=telegram_cancelled');
    blocked = true;
    const denied = await route.GET(request);
    assert.equal(denied.headers.get('location'), 'https://client.example/login?error=telegram_blocked');
    assert.equal(denied.cookies.get('session'), undefined);
    failExchange = true;
    const failed = await route.GET(request);
    assert.equal(failed.headers.get('location'), 'https://client.example/login?error=telegram_failed');
    assert.equal(failed.cookies.get('session'), undefined);
  }
});

test('middleware и ошибка MAX сохраняют публичный домен за прокси', async () => {
  configurePublicLogin();
  const { NextRequest } = await import('next/server.js');
  let session = null;
  const middleware = loadTs('src/middleware.ts', {
    '@/lib/app-origin': appOrigin,
    '@/lib/auth/session': { sessionCookie: { name: 'session' }, verifySessionToken: async () => session },
  }).middleware;
  const request = new NextRequest('http://localhost:3000/admin');
  assert.equal((await middleware(request)).headers.get('location'), 'https://client.example/login?next=%2Fadmin');
  session = { role: 'USER' };
  assert.equal((await middleware(request)).headers.get('location'), 'https://client.example/dashboard');
  session = { role: 'ADMIN' };
  assert.equal((await middleware(request)).headers.get('location'), null);
  const max = loadTs('src/app/api/auth/max-link/route.ts', {
    '@/lib/app-origin': appOrigin,
    '@/lib/max-bot': { buildMaxMiniAppLink: () => { throw new Error('Бот не настроен'); } },
  });
  assert.equal((await max.GET(request)).headers.get('location'), 'https://client.example/login?error=max_not_configured');
});