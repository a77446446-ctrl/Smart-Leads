// Публичный адрес берём из конфигурации, а не из внутреннего URL контейнера или заголовков клиента.
export function getAppOrigin(developmentUrl?: string): string {
  // Косвенное чтение сохраняет runtime-настройку при сборке Next.js.
  const environment = process.env;
  const configuredUrl = (environment.NEXT_PUBLIC_APP_URL || '').trim();
  const production = environment.NODE_ENV === 'production';
  let url: URL;
  try {
    url = new URL(configuredUrl || (!production && developmentUrl ? new URL(developmentUrl).origin : ''));
  } catch {
    throw new Error('NEXT_PUBLIC_APP_URL не настроен');
  }

  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const allowedProtocol = url.protocol === 'https:' || (!production && local && url.protocol === 'http:');
  if (!allowedProtocol || (production && local) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('NEXT_PUBLIC_APP_URL должен быть публичным HTTPS-адресом без пути');
  }
  return url.origin;
}
