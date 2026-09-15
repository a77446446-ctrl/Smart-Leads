import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadTs } from './helpers/load-ts.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const originalEnv = { ...process.env };

function loadTelegramAuth() {
  return loadTs('src/lib/auth/telegram-oidc.ts', { 'server-only': {} });
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
