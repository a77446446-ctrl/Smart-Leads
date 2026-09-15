import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { normalizeProxyUrl } from '@/lib/proxy';
import { prisma } from '@/lib/prisma';

const ENCRYPTED_PREFIX = 'enc:v1:';
const SESSION_ENCRYPTED_PREFIX = 'session:v1:';
const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;
const MAX_SESSION_BYTES = 10 * 1024 * 1024;

export type ParserAccountStatus =
  | 'AUTHORIZING'
  | 'ACTIVE'
  | 'COOLDOWN'
  | 'AUTH_REQUIRED'
  | 'PROXY_ERROR'
  | 'DISABLED';

function encryptionKey(): Buffer {
  const secret = process.env.PARSER_PROXY_ENCRYPTION_KEY || process.env.AUTH_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('PARSER_PROXY_ENCRYPTION_KEY или AUTH_SESSION_SECRET должен содержать не менее 32 символов');
  }
  return createHash('sha256').update(secret, 'utf8').digest();
}

function sessionEncryptionKey(): Buffer {
  const secret = process.env.PARSER_SESSION_ENCRYPTION_KEY
    || process.env.PARSER_PROXY_ENCRYPTION_KEY
    || process.env.AUTH_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('PARSER_SESSION_ENCRYPTION_KEY или PARSER_PROXY_ENCRYPTION_KEY должен содержать не менее 32 символов');
  }
  return createHash('sha256').update('maks-session-backup-v1', 'utf8').update(secret, 'utf8').digest();
}

export function encryptProxyUrl(value: string | null): string | null {
  if (!value || value === 'direct') return value;
  const normalized = normalizeProxyUrl(value);
  if (!normalized) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENCRYPTED_PREFIX}${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function decryptProxyUrl(value: string | null | undefined): string | null {
  if (!value || value === 'direct') return value || null;
  if (!value.startsWith(ENCRYPTED_PREFIX)) return normalizeProxyUrl(value);
  const parts = value.slice(ENCRYPTED_PREFIX.length).split(':');
  if (parts.length !== 3 || parts.some((part) => !part)) throw new Error('Повреждён зашифрованный прокси');
  try {
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(parts[0], 'base64url'));
    decipher.setAuthTag(Buffer.from(parts[1], 'base64url'));
    const clear = Buffer.concat([decipher.update(Buffer.from(parts[2], 'base64url')), decipher.final()]).toString('utf8');
    return normalizeProxyUrl(clear);
  } catch {
    throw new Error('Не удалось расшифровать прокси: проверьте ключ шифрования');
  }
}

export function isEncryptedProxyUrl(value: string | null | undefined): boolean {
  return Boolean(value?.startsWith(ENCRYPTED_PREFIX));
}

export function encryptParserSession(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', sessionEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${SESSION_ENCRYPTED_PREFIX}${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function decryptParserSession(value: string): string {
  if (!value.startsWith(SESSION_ENCRYPTED_PREFIX)) throw new Error('Сессия MAX в БД не зашифрована');
  const parts = value.slice(SESSION_ENCRYPTED_PREFIX.length).split(':');
  if (parts.length !== 3 || parts.some((part) => !part)) throw new Error('Повреждён зашифрованный backup сессии MAX');
  try {
    const decipher = createDecipheriv('aes-256-gcm', sessionEncryptionKey(), Buffer.from(parts[0], 'base64url'));
    decipher.setAuthTag(Buffer.from(parts[1], 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(parts[2], 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Не удалось расшифровать сессию MAX: проверьте постоянный ключ шифрования');
  }
}

function compactError(source: string, maxLength = 1000): string {
  const normalized = source.replace(/\b(?:https?|socks5h?):\/\/[^\s]+/gi, '[proxy скрыт]').replace(/[\r\n\t]+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  const tailLength = Math.floor(maxLength * 0.65);
  return `${normalized.slice(0, maxLength - tailLength - 15)} … [конец] ${normalized.slice(-tailLength)}`;
}

export function maskProxyUrl(value: string | null | undefined): string {
  if (!value || value === 'direct') return 'Прямое подключение (Без прокси)';
  try {
    const url = new URL(value);
    const auth = url.username ? `${decodeURIComponent(url.username).slice(0, 2)}***:***@` : '';
    return `${url.protocol}//${auth}${url.hostname}:${url.port}`;
  } catch {
    return 'Прокси настроен';
  }
}

export function parserSessionDirectory(): string {
  const configured = process.env.PARSER_SESSIONS_DIR?.trim();
  return path.resolve(configured || path.join(process.cwd(), 'sessions'));
}

export function assertSessionId(value: unknown): string {
  if (typeof value !== 'string' || !SESSION_ID_PATTERN.test(value)) throw new Error('Некорректный идентификатор аккаунта');
  return value.toLowerCase();
}

export function sessionFileName(sessionId: string): string {
  return `${assertSessionId(sessionId)}.json`;
}

export function sessionFilePath(sessionId: string): string {
  return path.join(parserSessionDirectory(), sessionFileName(sessionId));
}

export function authArtifactDirectory(): string {
  return path.join(parserSessionDirectory(), '.auth');
}

export function authStatusFilePath(sessionId: string): string {
  return path.join(authArtifactDirectory(), `${assertSessionId(sessionId)}.status.json`);
}

export function authQrFilePath(sessionId: string): string {
  return path.join(authArtifactDirectory(), `${assertSessionId(sessionId)}.qr.png`);
}

export async function sessionFileExists(sessionId: string): Promise<boolean> {
  try {
    const stat = await fs.stat(sessionFilePath(sessionId));
    return stat.isFile() && stat.size > 0 && stat.size <= MAX_SESSION_BYTES;
  } catch {
    return false;
  }
}

export async function secureSessionFile(sessionId: string): Promise<void> {
  if (process.platform !== 'win32') await fs.chmod(sessionFilePath(sessionId), 0o600);
}

export function safeParserError(error: unknown): string {
  const source = error instanceof Error ? error.message : String(error || 'Неизвестная ошибка');
  return compactError(source);
}

export function parserCooldown(failures: number, kind: string): Date | null {
  if (kind === 'AUTH_REQUIRED') return null;
  const baseMinutes = kind === 'RATE_LIMITED' ? 60 : kind === 'PROXY_ERROR' ? 15 : 5;
  const multiplier = Math.min(16, 2 ** Math.max(0, failures - 1));
  return new Date(Date.now() + Math.min(6 * 60, baseMinutes * multiplier) * 60_000);
}
type SessionMetadata = { name: string; proxy: string | null };

type SessionDocument = { content: string; checksum: string; meta: SessionMetadata };
type RestorableAccount = {
  id: string;
  sessionFile: string;
  sessionData: string | null;
  sessionChecksum: string | null;
  status: string;
  lastError: string | null;
};

function parseSessionDocument(content: string): SessionDocument {
  if (!content || Buffer.byteLength(content, 'utf8') > MAX_SESSION_BYTES) throw new Error('Некорректный размер файла сессии');
  const parsed = JSON.parse(content) as { storage?: unknown; meta?: { name?: unknown; proxy?: unknown } };
  const metadata = parsed && typeof parsed === 'object' ? parsed.meta : undefined;
  const storage = parsed && typeof parsed === 'object' && 'storage' in parsed ? parsed.storage : parsed;
  if (!storage || typeof storage !== 'object') throw new Error('Файл сессии не содержит Playwright storage_state');
  const candidate = storage as { cookies?: unknown; origins?: unknown };
  if (!Array.isArray(candidate.cookies) || !Array.isArray(candidate.origins)) {
    throw new Error('Файл сессии содержит некорректный Playwright storage_state');
  }
  const rawName = typeof metadata?.name === 'string' ? metadata.name.trim().slice(0, 100) : '';
  return {
    content,
    checksum: createHash('sha256').update(content, 'utf8').digest('hex'),
    meta: {
      name: rawName || 'Пользователь MAX',
      proxy: typeof metadata?.proxy === 'string' ? metadata.proxy : null,
    },
  };
}

async function readSessionDocument(sessionId: string): Promise<SessionDocument> {
  const file = sessionFilePath(sessionId);
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_SESSION_BYTES) throw new Error('Некорректный размер файла сессии');
  return parseSessionDocument(await fs.readFile(file, 'utf8'));
}

export async function persistParserSessionFile(accountId: string, sessionId: string): Promise<void> {
  const normalizedId = assertSessionId(sessionId);
  const document = await readSessionDocument(normalizedId);
  const existing = await prisma.maksAccount.findUnique({
    where: { id: accountId },
    select: { sessionFile: true, sessionData: true, sessionChecksum: true },
  });
  if (!existing || existing.sessionFile !== sessionFileName(normalizedId)) throw new Error('Аккаунт MAX для сессии не найден');
  if (existing.sessionData && existing.sessionChecksum === document.checksum) return;
  await prisma.maksAccount.update({
    where: { id: accountId },
    data: {
      sessionData: encryptParserSession(document.content),
      sessionChecksum: document.checksum,
      sessionUpdatedAt: new Date(),
    },
  });
}

export async function ensureParserSessionFile(account: RestorableAccount): Promise<boolean> {
  const sessionId = assertSessionId(account.sessionFile.replace(/\.json$/i, ''));
  if (account.sessionFile !== sessionFileName(sessionId)) throw new Error('Некорректное имя файла сессии аккаунта');
  if (await sessionFileExists(sessionId)) return true;
  if (!account.sessionData) return false;

  const document = parseSessionDocument(decryptParserSession(account.sessionData));
  if (account.sessionChecksum && account.sessionChecksum !== document.checksum) {
    throw new Error('Контрольная сумма backup сессии MAX не совпадает');
  }
  const directory = parserSessionDirectory();
  await fs.mkdir(directory, { recursive: true });
  const target = sessionFilePath(sessionId);
  const temporary = path.join(directory, `.${sessionFileName(sessionId)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`);
  try {
    await fs.writeFile(temporary, document.content, { encoding: 'utf8', mode: 0o600 });
    await fs.rename(temporary, target);
    await secureSessionFile(sessionId);
  } finally {
    await fs.unlink(temporary).catch(() => undefined);
  }

  if (account.status === 'AUTH_REQUIRED' && account.lastError?.includes('Файл сессии отсутствует')) {
    await prisma.maksAccount.update({
      where: { id: account.id },
      data: { active: true, status: 'ACTIVE', lastError: null, lastErrorAt: null, consecutiveFailures: 0 },
    });
  }
  return true;
}

/** Импортирует legacy-файлы в PostgreSQL и шифрует старые proxyString. */
export async function synchronizeParserSessionFiles(): Promise<void> {
  const directory = parserSessionDirectory();
  await fs.mkdir(directory, { recursive: true });
  const restorable = await prisma.maksAccount.findMany({
    where: { sessionData: { not: null } },
    select: { id: true, sessionFile: true, sessionData: true, sessionChecksum: true, status: true, lastError: true },
    take: 1000,
  });
  for (const account of restorable) {
    try {
      await ensureParserSessionFile(account);
    } catch (error) {
      console.error(`[PARSER-ACCOUNT] Сессия ${account.id} не восстановлена:`, safeParserError(error));
    }
  }

  const files = (await fs.readdir(directory)).filter((file) => file.endsWith('.json')).slice(0, 1000);
  for (const file of files) {
    const sessionId = file.slice(0, -5);
    try {
      assertSessionId(sessionId);
      const document = await readSessionDocument(sessionId);
      const meta = document.meta;
      const existing = await prisma.maksAccount.findUnique({ where: { sessionFile: file } });
      let storedProxy = existing?.proxyString || null;
      if (storedProxy && storedProxy !== 'direct' && !isEncryptedProxyUrl(storedProxy)) {
        storedProxy = encryptProxyUrl(decryptProxyUrl(storedProxy));
      } else if (!storedProxy && meta.proxy) {
        storedProxy = encryptProxyUrl(meta.proxy === 'direct' ? 'direct' : meta.proxy);
      }
      const backupChanged = !existing?.sessionData || existing.sessionChecksum !== document.checksum;
      const sessionData = backupChanged ? encryptParserSession(document.content) : existing.sessionData;
      const sessionUpdatedAt = backupChanged ? new Date() : existing?.sessionUpdatedAt;
      await prisma.maksAccount.upsert({
        where: { sessionFile: file },
        create: {
          name: meta.name, sessionFile: file, proxyString: storedProxy, active: true, status: 'ACTIVE',
          sessionData, sessionChecksum: document.checksum, sessionUpdatedAt,
        },
        update: {
          proxyString: storedProxy,
          sessionData, sessionChecksum: document.checksum, sessionUpdatedAt,
        }, // статус здоровья аккаунта не перезаписываем
      });
      await secureSessionFile(sessionId);
    } catch (error) {
      console.error(`[PARSER-ACCOUNT] Файл ${file} пропущен:`, safeParserError(error));
    }
  }
}