const ALLOWED_PROXY_PROTOCOLS = new Set(['http:', 'https:', 'socks5:', 'socks5h:']);

/** Проверяет прокси до передачи внешнему процессу. */
export function normalizeProxyUrl(value: unknown): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value !== 'string' || value.length > 2048) {
    throw new Error('Некорректная строка прокси');
  }

  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Некорректный URL прокси');
  }

  if (!ALLOWED_PROXY_PROTOCOLS.has(url.protocol)) {
    throw new Error('Неподдерживаемый протокол прокси');
  }

  if (!url.hostname || !url.port) {
    throw new Error('Для прокси обязательны хост и порт');
  }

  const port = Number(url.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Некорректный порт прокси');
  }

  return url.toString();
}
