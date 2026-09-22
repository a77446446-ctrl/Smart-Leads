import { NextResponse } from 'next/server';
import { adminGuard } from '@/lib/auth/admin-guard';
import { prisma } from '@/lib/prisma';
import { APPLICATION_THEME_SETTING_KEY, isApplicationThemeId, parseApplicationTheme } from '@/lib/application-theme';
import { readBoundedJson } from '@/lib/bounded-json';
import { isSameAppOrigin } from '@/lib/same-app-origin';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };

export async function GET() {
  const denied = await adminGuard();
  if (denied) return denied;
  try {
    const setting = await prisma.setting.findUnique({ where: { key: APPLICATION_THEME_SETTING_KEY } });
    if (setting && !isApplicationThemeId(setting.value)) {
      return NextResponse.json({ error: 'Сохранённая тема повреждена. Обратитесь к администратору сервера.' }, { status: 500, headers });
    }
    return NextResponse.json({ theme: setting?.value ?? null }, { headers });
  } catch {
    return NextResponse.json({ error: 'Не удалось загрузить тему. Повторите попытку.' }, { status: 503, headers });
  }
}

export async function POST(request: Request) {
  const denied = await adminGuard();
  if (denied) return denied;
  if (!isSameAppOrigin(request)) return NextResponse.json({ error: 'Запрос с другого сайта запрещён' }, { status: 403, headers });
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
    return NextResponse.json({ error: 'Ожидался JSON' }, { status: 415, headers });
  }
  let theme;
  try { theme = parseApplicationTheme(await readBoundedJson(request, 1024)); }
  catch (error) {
    return NextResponse.json({ error: error instanceof RangeError ? 'Слишком большой запрос' : 'Выберите одну тему из списка.' }, { status: error instanceof RangeError ? 413 : 400, headers });
  }
  try {
    await prisma.setting.upsert({
      where: { key: APPLICATION_THEME_SETTING_KEY },
      create: { key: APPLICATION_THEME_SETTING_KEY, value: theme },
      update: { value: theme },
    });
    return NextResponse.json({ theme }, { headers });
  } catch {
    return NextResponse.json({ error: 'Не удалось сохранить тему. Повторите попытку.' }, { status: 503, headers });
  }
}
