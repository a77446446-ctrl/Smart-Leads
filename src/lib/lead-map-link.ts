/** Проверяем домен URL, а не вхождение google/yandex в произвольную ссылку. */
export function leadMapLabel(value: string): string | null {
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    const path = url.pathname;
    if (host === 'maps.app.goo.gl'
      || (host === 'goo.gl' && /^\/maps(?:\/|$)/i.test(path))
      || /^maps\.google\.(?:com|ru)$/i.test(host)
      || (/^(?:www\.)?google\.(?:com|ru)$/i.test(host) && /^\/maps(?:\/|$)/i.test(path))) {
      return 'Google Карты';
    }
    if ((/^(?:www\.)?yandex\.(?:ru|com)$/i.test(host) && /^\/maps(?:\/|$)/i.test(path))
      || /^maps\.yandex\.(?:ru|com)$/i.test(host)) return 'Яндекс.Карты';
    if (/^(?:www\.)?2gis\.(?:ru|com)$/i.test(host) || host === 'go.2gis.com') return '2GIS';
    return null;
  } catch {
    return null;
  }
}
