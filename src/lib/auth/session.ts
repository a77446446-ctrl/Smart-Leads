const SESSION_COOKIE_NAME = 'maks_session';
const SESSION_VERSION = 1;
const DEFAULT_SESSION_TTL_SECONDS = 24 * 60 * 60;
const encoder = new TextEncoder();

export type SessionRole = 'USER' | 'ADMIN';

export interface SessionPayload {
  v: number;
  userId: string;
  role: SessionRole;
  exp: number;
}

function encodeBase64Url(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Некорректная сессия');
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function getSessionSecret(): string {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('AUTH_SESSION_SECRET должен содержать минимум 32 символа');
  return secret;
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function createSessionToken(userId: string, role: SessionRole, ttlSeconds = DEFAULT_SESSION_TTL_SECONDS): Promise<string> {
  const payload: SessionPayload = { v: SESSION_VERSION, userId, role, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const encodedPayload = encodeBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign('HMAC', await importKey(getSessionSecret()), encoder.encode(encodedPayload));
  return `${encodedPayload}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function verifySessionToken(token: string | undefined): Promise<SessionPayload | null> {
  if (!token || token.length > 2_048) return null;
  const [encodedPayload, encodedSignature, extra] = token.split('.');
  if (!encodedPayload || !encodedSignature || extra) return null;
  try {
    const payloadBytes = decodeBase64Url(encodedPayload);
    const signatureBytes = decodeBase64Url(encodedSignature);
    if (encodeBase64Url(payloadBytes) !== encodedPayload || encodeBase64Url(signatureBytes) !== encodedSignature) {
      return null;
    }

    const valid = await crypto.subtle.verify(
      'HMAC',
      await importKey(getSessionSecret()),
      signatureBytes,
      encoder.encode(encodedPayload),
    );
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as SessionPayload;
    if (payload.v !== SESSION_VERSION || typeof payload.userId !== 'string' || !['USER', 'ADMIN'].includes(payload.role) || !Number.isInteger(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export const sessionCookie = {
  name: SESSION_COOKIE_NAME,
  maxAge: DEFAULT_SESSION_TTL_SECONDS,
  options: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' as const : 'lax' as const, path: '/' },
};
