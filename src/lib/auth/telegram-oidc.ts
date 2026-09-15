import 'server-only';

import {
  createHash,
  createHmac,
  createPublicKey,
  randomBytes,
  timingSafeEqual,
  verify as verifySignature,
} from 'node:crypto';

const TELEGRAM_ISSUER = 'https://oauth.telegram.org';
const TELEGRAM_AUTH_ENDPOINT = `${TELEGRAM_ISSUER}/auth`;
const TELEGRAM_TOKEN_ENDPOINT = `${TELEGRAM_ISSUER}/token`;
const TELEGRAM_JWKS_ENDPOINT = `${TELEGRAM_ISSUER}/.well-known/jwks.json`;
const LOGIN_TTL_SECONDS = 10 * 60;

interface TelegramLoginState {
  state: string;
  nonce: string;
  verifier: string;
  exp: number;
}

interface TelegramIdTokenClaims {
  iss?: unknown;
  aud?: unknown;
  sub?: unknown;
  iat?: unknown;
  exp?: unknown;
  nonce?: unknown;
  id?: unknown;
  name?: unknown;
  preferred_username?: unknown;
  picture?: unknown;
}

interface TelegramJwk {
  [key: string]: string | undefined;
  kid?: string;
  alg?: string;
  use?: string;
  kty?: string;
}

interface TelegramJwks {
  keys: TelegramJwk[];
}

export interface TelegramProfile {
  telegramId: string;
  name: string;
  username: string | null;
  photoUrl: string | null;
}

export interface TelegramOidcConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
}

let cachedJwks: { value: TelegramJwks; expiresAt: number } | null = null;

function encodeBase64Url(value: Buffer | string): string {
  return Buffer.from(value).toString('base64url');
}

function decodeBase64Url(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Некорректный Telegram-токен');
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.toString('base64url') !== value) throw new Error('Некорректный Telegram-токен');
  return decoded;
}

function readSessionSecret(): string {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('AUTH_SESSION_SECRET должен содержать минимум 32 символа');
  return secret;
}

function parseJsonObject<T>(encoded: string): T {
  const parsed = JSON.parse(decodeBase64Url(encoded).toString('utf8')) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Некорректный Telegram-токен');
  return parsed as T;
}

function normalizeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function normalizePhotoUrl(value: unknown): string | null {
  const raw = normalizeText(value, 2_048);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function getTelegramOidcConfig(): TelegramOidcConfig {
  const clientId = (process.env.TELEGRAM_CLIENT_ID || '').trim();
  const clientSecret = (process.env.TELEGRAM_CLIENT_SECRET || '').trim();
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');

  if (!/^\d+$/.test(clientId)) throw new Error('TELEGRAM_CLIENT_ID не настроен');
  if (clientSecret.length < 16 || clientSecret.length > 512) throw new Error('TELEGRAM_CLIENT_SECRET не настроен');

  let baseUrl: URL;
  try {
    baseUrl = new URL(appUrl);
  } catch {
    throw new Error('NEXT_PUBLIC_APP_URL не настроен');
  }
  const isLocalDevelopment = process.env.NODE_ENV !== 'production'
    && ['localhost', '127.0.0.1'].includes(baseUrl.hostname);
  if ((baseUrl.protocol !== 'https:' && !isLocalDevelopment) || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
    throw new Error('NEXT_PUBLIC_APP_URL должен быть публичным HTTPS-адресом');
  }

  return {
    clientId,
    clientSecret,
    callbackUrl: `${baseUrl.origin}/api/auth/telegram/callback`,
  };
}

export function createTelegramLoginRequest(config = getTelegramOidcConfig()): {
  authorizationUrl: string;
  stateCookie: string;
} {
  const state: TelegramLoginState = {
    state: encodeBase64Url(randomBytes(32)),
    nonce: encodeBase64Url(randomBytes(32)),
    verifier: encodeBase64Url(randomBytes(48)),
    exp: Math.floor(Date.now() / 1000) + LOGIN_TTL_SECONDS,
  };
  const payload = encodeBase64Url(JSON.stringify(state));
  const signature = encodeBase64Url(createHmac('sha256', readSessionSecret()).update(payload).digest());
  const codeChallenge = encodeBase64Url(createHash('sha256').update(state.verifier).digest());
  const authorizationUrl = new URL(TELEGRAM_AUTH_ENDPOINT);
  authorizationUrl.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.callbackUrl,
    response_type: 'code',
    scope: 'openid profile',
    state: state.state,
    nonce: state.nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  }).toString();

  return { authorizationUrl: authorizationUrl.toString(), stateCookie: `${payload}.${signature}` };
}

export function verifyTelegramLoginState(cookieValue: string | undefined, returnedState: string | null): TelegramLoginState {
  if (!cookieValue || cookieValue.length > 2_048 || !returnedState) throw new Error('Сессия входа Telegram истекла');
  const [payload, signature, extra] = cookieValue.split('.');
  if (!payload || !signature || extra) throw new Error('Сессия входа Telegram повреждена');

  const expected = createHmac('sha256', readSessionSecret()).update(payload).digest();
  const actual = decodeBase64Url(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Сессия входа Telegram повреждена');

  const state = parseJsonObject<TelegramLoginState>(payload);
  if (
    typeof state.state !== 'string'
    || typeof state.nonce !== 'string'
    || typeof state.verifier !== 'string'
    || !Number.isInteger(state.exp)
    || state.exp <= Math.floor(Date.now() / 1000)
    || state.state.length < 32
    || state.nonce.length < 32
    || state.verifier.length < 43
  ) throw new Error('Сессия входа Telegram истекла');

  const left = Buffer.from(state.state);
  const right = Buffer.from(returnedState);
  if (left.length !== right.length || !timingSafeEqual(left, right)) throw new Error('Состояние входа Telegram не совпадает');
  return state;
}

export async function exchangeTelegramAuthorizationCode(
  code: string,
  verifier: string,
  config = getTelegramOidcConfig(),
): Promise<string> {
  if (!code || code.length > 2_048) throw new Error('Telegram не передал код авторизации');
  const response = await fetch(TELEGRAM_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.callbackUrl,
      client_id: config.clientId,
      code_verifier: verifier,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  const data = await response.json().catch(() => null) as { id_token?: unknown } | null;
  if (!response.ok || typeof data?.id_token !== 'string') throw new Error('Telegram отклонил авторизацию');
  return data.id_token;
}

async function loadTelegramJwks(): Promise<TelegramJwks> {
  if (cachedJwks && cachedJwks.expiresAt > Date.now()) return cachedJwks.value;
  const response = await fetch(TELEGRAM_JWKS_ENDPOINT, {
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  const data = await response.json().catch(() => null) as TelegramJwks | null;
  if (!response.ok || !data || !Array.isArray(data.keys) || data.keys.length === 0) {
    throw new Error('Не удалось получить ключи Telegram');
  }
  cachedJwks = { value: data, expiresAt: Date.now() + 10 * 60 * 1_000 };
  return data;
}

export async function verifyTelegramIdToken(
  token: string,
  expectedNonce: string,
  config = getTelegramOidcConfig(),
  jwks?: TelegramJwks,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<TelegramProfile> {
  if (!token || token.length > 16_384) throw new Error('Некорректный Telegram-токен');
  const [encodedHeader, encodedPayload, encodedSignature, extra] = token.split('.');
  if (!encodedHeader || !encodedPayload || !encodedSignature || extra) throw new Error('Некорректный Telegram-токен');

  const header = parseJsonObject<{ alg?: unknown; kid?: unknown }>(encodedHeader);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) {
    throw new Error('Неподдерживаемая подпись Telegram-токена');
  }
  const keys = jwks || await loadTelegramJwks();
  const jwk = keys.keys.find((key) => key.kid === header.kid && key.kty === 'RSA' && (!key.alg || key.alg === 'RS256'));
  if (!jwk) throw new Error('Ключ подписи Telegram не найден');

  const validSignature = verifySignature(
    'RSA-SHA256',
    Buffer.from(`${encodedHeader}.${encodedPayload}`),
    createPublicKey({ key: jwk, format: 'jwk' }),
    decodeBase64Url(encodedSignature),
  );
  if (!validSignature) throw new Error('Подпись Telegram-токена недействительна');

  const claims = parseJsonObject<TelegramIdTokenClaims>(encodedPayload);
  const audience = typeof claims.aud === 'string'
    ? [claims.aud]
    : Array.isArray(claims.aud) ? claims.aud.filter((value): value is string => typeof value === 'string') : [];
  if (claims.iss !== TELEGRAM_ISSUER || !audience.includes(config.clientId)) throw new Error('Telegram-токен предназначен другому приложению');
  if (!Number.isInteger(claims.exp) || (claims.exp as number) <= nowSeconds) throw new Error('Telegram-токен истёк');
  if (!Number.isInteger(claims.iat) || (claims.iat as number) > nowSeconds + 60 || (claims.iat as number) < nowSeconds - 3_600) {
    throw new Error('Некорректное время Telegram-токена');
  }
  if (claims.nonce !== expectedNonce) throw new Error('Telegram-токен уже использован или относится к другой сессии');
  if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128) throw new Error('Telegram не передал идентификатор пользователя');

  const telegramId = typeof claims.id === 'number' && Number.isSafeInteger(claims.id)
    ? String(claims.id)
    : typeof claims.id === 'string' && /^\d{1,20}$/.test(claims.id) ? claims.id : null;
  if (!telegramId || !/^\d{1,20}$/.test(telegramId) || telegramId === '0') throw new Error('Telegram передал некорректный ID');

  const username = normalizeText(claims.preferred_username, 64);
  const name = normalizeText(claims.name, 120) || (username ? `@${username}` : `Пользователь Telegram ${telegramId}`);
  return { telegramId, name, username, photoUrl: normalizePhotoUrl(claims.picture) };
}

export const telegramLoginStateCookie = {
  name: 'telegram_login_state',
  maxAge: LOGIN_TTL_SECONDS,
  options: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/api/auth/telegram',
  },
};
