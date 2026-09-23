import { NextResponse } from 'next/server';
import { adminGuard } from '@/lib/auth/admin-guard';
import { prisma } from '@/lib/prisma';
import { readBoundedJson } from '@/lib/bounded-json';
import { isSameAppOrigin } from '@/lib/same-app-origin';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
export async function POST(request: Request) {
  const denied = await adminGuard();
  if (denied) return denied;
  if (!isSameAppOrigin(request)) return NextResponse.json({ error: 'Запрос с другого сайта запрещён' }, { status: 403, headers });
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return NextResponse.json({ error: 'Ожидался JSON' }, { status: 415, headers });
  let input;
  try {
    input = await readBoundedJson(request, 1024) as { categoryId?: unknown; capturePhotos?: unknown };
    if (!input || typeof input.categoryId !== 'string' || input.categoryId.length > 100 || typeof input.capturePhotos !== 'boolean') throw new Error();
  } catch { return NextResponse.json({ error: 'Некорректные настройки фотографий' }, { status: 400, headers }); }
  try {
    const result = await prisma.category.updateMany({ where: { id: input.categoryId as string }, data: { capturePhotos: input.capturePhotos as boolean } });
    if (!result.count) return NextResponse.json({ error: 'Категория не найдена' }, { status: 404, headers });
    return NextResponse.json({ capturePhotos: input.capturePhotos }, { headers });
  } catch { return NextResponse.json({ error: 'Не удалось сохранить настройку фотографий' }, { status: 503, headers }); }
}
