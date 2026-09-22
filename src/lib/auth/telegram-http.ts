import 'server-only';
import { fetch as proxyFetch, ProxyAgent } from 'undici';

const ALLOWED_URLS = new Set([
  'https://oauth.telegram.org/token',
  'https://oauth.telegram.org/.well-known/jwks.json',
]);

interface TelegramRequestOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: URLSearchParams;
  signal?: AbortSignal;
  cache?: 'no-store';
}

let cachedProxy: { value: string; agent: ProxyAgent } | undefined;

function getTelegramProxy(): ProxyAgent | undefined {
  const value = (process.env.TELEGRAM_PROXY_URL || '').trim();
  if (cachedProxy?.value === value) return cachedProxy.agent;

  let agent: ProxyAgent | undefined;
  if (value) {
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/' || url.search || url.hash) {
        throw new Error();
      }
      const username = decodeURIComponent(url.username);
      const password = decodeURIComponent(url.password);
      if (password && !username) throw new Error();
      agent = new ProxyAgent({
        uri: url.origin,
        ...(username ? { token: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` } : {}),
      });
    } catch {
      // Адрес прокси может содержать пароль; исходную ошибку не выводим.
      throw new Error('TELEGRAM_PROXY_URL должен содержать корректный адрес HTTP/HTTPS-прокси');
    }
  }

  const previous = cachedProxy;
  cachedProxy = agent ? { value, agent } : undefined;
  if (previous) void previous.agent.close().catch(() => {});
  return agent;
}

export async function fetchTelegram(
  url: string,
  options: TelegramRequestOptions = {},
): Promise<Pick<Response, 'ok' | 'status' | 'json'>> {
  if (!ALLOWED_URLS.has(url)) throw new Error('Недопустимый адрес запроса Telegram');
  const agent = getTelegramProxy();
  const request = {
    ...options,
    signal: options.signal ?? AbortSignal.timeout(20_000),
    redirect: 'error' as const,
  };
  try {
    // Агент задан только для этих запросов; глобальные сетевые настройки не меняются.
    return agent
      ? await proxyFetch(url, { ...request, dispatcher: agent })
      : await fetch(url, request);
  } catch {
    throw new Error(agent
      ? 'Не удалось соединиться с Telegram через прокси. Проверьте доступность и авторизацию прокси.'
      : 'Не удалось соединиться с Telegram напрямую. Проверьте сеть или настройте TELEGRAM_PROXY_URL.');
  }
}