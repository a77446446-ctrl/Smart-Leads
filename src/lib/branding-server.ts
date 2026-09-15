import 'server-only';
import { cache } from 'react';
import { prisma } from '@/lib/prisma';
import { BRANDING_SETTING_KEY, brandingFromStorage, DEFAULT_BRANDING } from '@/lib/branding';

/** Один запрос на серверный рендер; изменение бренда видно со следующего запроса. */
export const getBranding = cache(async () => {
  if (!process.env.DATABASE_URL) return { ...DEFAULT_BRANDING };
  try {
    const row = await prisma.setting.findUnique({ where: { key: BRANDING_SETTING_KEY }, select: { value: true } });
    return brandingFromStorage(row?.value);
  } catch {
    console.error('[БРЕНД] Настройки временно недоступны');
    return { ...DEFAULT_BRANDING };
  }
});
