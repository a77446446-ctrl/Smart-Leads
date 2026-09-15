const ALLOWED_MAX_HOSTS = new Set(['max.ru', 'web.max.ru']);

/** Нормализует только публичные HTTPS-ссылки MAX и блокирует browser SSRF. */
export function normalizeMaxChatUrl(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 2048) {
    throw new Error('Некорректная ссылка на чат MAX');
  }
  const candidate = /^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('Некорректная ссылка на чат MAX');
  }
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || !ALLOWED_MAX_HOSTS.has(hostname) || url.port || url.username || url.password) {
    throw new Error('Разрешены только HTTPS-ссылки max.ru');
  }
  const savedHash = url.hash;
  url.hostname = 'web.max.ru';
  url.hash = savedHash;
  return url.toString();
}

