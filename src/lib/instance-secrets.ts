import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const PREFIX = 'instance:v1:';

function key(masterSecret: string): Buffer {
  if (masterSecret.length < 32) throw new Error('AUTH_SESSION_SECRET должен содержать минимум 32 символа');
  return createHash('sha256').update('smart-leads-instance-config-v1\0').update(masterSecret).digest();
}

/** Шифрует настройки клиента отдельным ключом, производным от постоянного секрета экземпляра. */
export function encryptInstanceValue(value: string, masterSecret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(masterSecret), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `${PREFIX}${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function decryptInstanceValue(value: string, masterSecret: string): string {
  if (!value.startsWith(PREFIX)) throw new Error('Повреждена настройка экземпляра');
  const parts = value.slice(PREFIX.length).split(':');
  if (parts.length !== 3 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]+$/.test(parts[1]) || !/^[A-Za-z0-9_-]*$/.test(parts[2])) {
    throw new Error('Повреждена настройка экземпляра');
  }
  const decipher = createDecipheriv('aes-256-gcm', key(masterSecret), Buffer.from(parts[0], 'base64url'));
  decipher.setAuthTag(Buffer.from(parts[1], 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(parts[2], 'base64url')), decipher.final()]).toString('utf8');
}
