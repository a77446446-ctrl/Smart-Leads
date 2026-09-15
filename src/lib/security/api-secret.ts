import { timingSafeEqual } from 'crypto';

/** Проверяет Bearer-токен без утечки длины/содержимого через обычное сравнение. */
export function verifyBearerSecret(header: string | null, expected: string | undefined): boolean {
  if (!expected) {
    return process.env.NODE_ENV !== 'production';
  }

  if (!header?.startsWith('Bearer ')) return false;

  const actual = Buffer.from(header.slice(7), 'utf8');
  const target = Buffer.from(expected, 'utf8');
  return actual.length === target.length && timingSafeEqual(actual, target);
}
