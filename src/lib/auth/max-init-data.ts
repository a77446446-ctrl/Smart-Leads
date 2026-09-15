import { createHmac, timingSafeEqual } from 'crypto';

const MAX_INIT_DATA_LENGTH = 8_192;
const DEFAULT_MAX_AGE_SECONDS = 10 * 60;
const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;

export interface VerifiedMaxUser {
  maxId: bigint;
  firstName?: string;
  lastName?: string;
  username?: string;
}

function safeHexEqual(actual: string, expected: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(actual) || !/^[a-f0-9]{64}$/i.test(expected)) return false;
  const actualBuffer = Buffer.from(actual, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function optionalString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().replace(/[\u0000-\u001f\u007f]/g, '');
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

/** Проверяет подпись launch-параметров MAX Mini App и возвращает доверенный цифровой ID. */
export function verifyMaxInitData(
  initData: string,
  botToken: string,
  options: { nowMs?: number; maxAgeSeconds?: number } = {},
): VerifiedMaxUser {
  if (!initData || initData.length > MAX_INIT_DATA_LENGTH) throw new Error('Некорректные данные запуска MAX');
  if (!botToken) throw new Error('MAX_BOT_TOKEN не настроен');

  const params = new URLSearchParams(initData);
  const seen = new Set<string>();
  for (const [key] of params.entries()) {
    if (seen.has(key)) throw new Error('Повторяющийся параметр MAX');
    seen.add(key);
  }

  const receivedHash = params.get('hash') ?? '';
  params.delete('hash');
  const dataCheckString = Array.from(params.entries())
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (!safeHexEqual(receivedHash, expectedHash)) throw new Error('Подпись MAX не прошла проверку');

  const authDateRaw = params.get('auth_date') ?? '';
  if (!/^\d{1,12}$/.test(authDateRaw)) throw new Error('Некорректное время авторизации MAX');
  const authDate = Number(authDateRaw);
  const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);
  const maxAge = options.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS;
  if (authDate > nowSeconds + 60 || nowSeconds - authDate > maxAge) {
    throw new Error('Срок действия авторизации MAX истёк');
  }

  const userRaw = params.get('user');
  if (!userRaw) throw new Error('MAX не передал профиль пользователя');

  let parsedUser: unknown;
  try {
    parsedUser = JSON.parse(userRaw);
  } catch {
    throw new Error('Профиль MAX имеет некорректный формат');
  }
  if (typeof parsedUser !== 'object' || parsedUser === null || Array.isArray(parsedUser)) {
    throw new Error('Профиль MAX имеет некорректный формат');
  }
  const user = parsedUser as Record<string, unknown>;

  let id: string;
  if (typeof user.id === 'number') {
    if (!Number.isSafeInteger(user.id) || user.id <= 0) throw new Error('MAX передал некорректный ID');
    id = String(user.id);
  } else if (typeof user.id === 'string' && /^\d{1,20}$/.test(user.id)) {
    id = user.id;
  } else {
    throw new Error('MAX передал некорректный ID');
  }

  const maxId = BigInt(id);
  if (maxId <= 0n || maxId > MAX_POSTGRES_BIGINT) throw new Error('MAX вернул некорректный ID');

  return {
    maxId,
    firstName: optionalString(user.first_name, 80),
    lastName: optionalString(user.last_name, 80),
    username: optionalString(user.username, 80),
  };
}

export function buildMaxDisplayName(user: VerifiedMaxUser): string {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return fullName || (user.username ? `@${user.username}` : 'Пользователь MAX');
}
