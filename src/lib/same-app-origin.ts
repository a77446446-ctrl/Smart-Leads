import { getAppOrigin } from '@/lib/app-origin';

/** Сравниваем Origin браузера с публичным адресом, а не с внутренним URL контейнера. */
export function isSameAppOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return origin === getAppOrigin(request.url);
  } catch {
    return false;
  }
}
