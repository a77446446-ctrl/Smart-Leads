export const BRANDING_SETTING_KEY = 'smart_leads_branding';

export type Branding = {
  name: string;
  tagline: string;
  description: string;
  logoUrl: string;
  heroImageUrl: string;
  accent: string;
  supportEmail: string;
  welcomeText: string;
};

export const DEFAULT_BRANDING: Readonly<Branding> = Object.freeze({
  name: 'Smart Leads',
  tagline: 'Важное — в одной ленте',
  description: 'Собирайте заявки и новости по интересующим темам. Читайте материалы и получайте уведомления в MAX.',
  logoUrl: '',
  heroImageUrl: '',
  accent: '#E4FF00',
  supportEmail: '',
  welcomeText: 'Выберите интересующие категории и следите за новыми материалами.',
});

const limits: Record<keyof Branding, number> = {
  name: 60, tagline: 120, description: 500, logoUrl: 200, heroImageUrl: 200,
  accent: 7, supportEmail: 254, welcomeText: 500,
};

/** Принимает только публичные поля бренда; токены и настройки интеграций сюда не попадают. */
export function parseBranding(input: unknown): Branding {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Ожидались настройки бренда');
  const source = input as Record<string, unknown>;
  if (Object.keys(source).some(key => !Object.hasOwn(limits, key))) throw new Error('Неизвестное поле бренда');
  const result = { ...DEFAULT_BRANDING };
  for (const key of Object.keys(limits) as Array<keyof Branding>) {
    if (!Object.hasOwn(source, key)) continue;
    const value = source[key];
    if (typeof value !== 'string' || value.length > limits[key] || /[\u0000-\u001f\u007f]/.test(value)) {
      throw new Error('Некорректное значение поля ' + key);
    }
    result[key] = value.trim();
  }
  if (!result.name || !result.tagline || !result.description) throw new Error('Заполните название, заголовок и описание');
  if (!/^#[0-9a-f]{6}$/i.test(result.accent)) throw new Error('Цвет должен иметь формат #RRGGBB');
  const channels = [1, 3, 5].map(offset => {
    const value = Number.parseInt(result.accent.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  if ((luminance + 0.05) / 0.05 < 4.5) throw new Error('Выберите более светлый акцент: текст кнопок должен оставаться читаемым');
  // Оба изображения загружаются через API с проверкой сигнатуры файла.
  for (const key of ['logoUrl', 'heroImageUrl'] as const) {
    if (result[key] && !/^\/api\/uploads\/img_[A-Za-z0-9_-]{1,100}$/.test(result[key])) {
      throw new Error('Загрузите изображение через форму: внешние адреса не поддерживаются');
    }
  }
  if (result.supportEmail && !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(result.supportEmail)) throw new Error('Некорректный email поддержки');
  result.accent = result.accent.toUpperCase();
  return result;
}

export function brandingFromStorage(value: string | null | undefined): Branding {
  try { return parseBranding(JSON.parse(value || '{}')); }
  catch { return { ...DEFAULT_BRANDING }; }
}
