import { NextResponse } from 'next/server';
import { adminGuard } from '@/lib/auth/admin-guard';
import { prisma } from '@/lib/prisma';
import { BRANDING_SETTING_KEY, parseBranding } from '@/lib/branding';
import { getBranding } from '@/lib/branding-server';
import { readBoundedJson } from '@/lib/bounded-json';
import { isSameAppOrigin } from '@/lib/same-app-origin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const denied = await adminGuard();
  if (denied) return denied;
  return NextResponse.json(await getBranding(), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const denied = await adminGuard();
  if (denied) return denied;
  if (!isSameAppOrigin(request)) {
    return NextResponse.json({ error: 'Запрос с другого сайта запрещён' }, { status: 403 });
  }
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
    return NextResponse.json({ error: 'Ожидался JSON' }, { status: 415 });
  }
  let branding;
  try { branding = parseBranding(await readBoundedJson(request)); }
  catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Некорректные настройки' }, { status: error instanceof RangeError ? 413 : 400 });
  }
  try {
    const value = JSON.stringify(branding);
    await prisma.setting.upsert({ where: { key: BRANDING_SETTING_KEY }, create: { key: BRANDING_SETTING_KEY, value }, update: { value } });
    return NextResponse.json(branding, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Не удалось сохранить бренд. Попробуйте ещё раз.' }, { status: 503 });
  }
}
