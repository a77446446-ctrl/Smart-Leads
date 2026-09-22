import { NextResponse } from 'next/server';
import { adminGuard } from '@/lib/auth/admin-guard';
import { INSTANCE_FIELDS, publicInstanceConfig, saveInstanceConfig, type InstanceField } from '@/lib/instance-config';
import { readBoundedJson } from '@/lib/bounded-json';
import { isSameAppOrigin } from '@/lib/same-app-origin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const denied = await adminGuard();
  if (denied) return denied;
  return NextResponse.json(publicInstanceConfig(), { headers: { 'Cache-Control': 'no-store' } });
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
  try {
    const body = await readBoundedJson(request) as { field?: unknown; value?: unknown };
    if (!body || typeof body !== 'object' || !INSTANCE_FIELDS.includes(body.field as InstanceField) || typeof body.value !== 'string') {
      return NextResponse.json({ error: 'Некорректная настройка' }, { status: 400 });
    }
    await saveInstanceConfig(body.field as InstanceField, body.value);
    return NextResponse.json(publicInstanceConfig(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof RangeError) return NextResponse.json({ error: 'Слишком большой запрос' }, { status: 413 });
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 });
    if (error instanceof Error && /^Неизвестный|^Некорректн|^Укажите|^ИНН |^ОГРН|^Код НДС|^Никнейм|^Секрет webhook|^Client Secret/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('[НАСТРОЙКИ ЭКЗЕМПЛЯРА]', error instanceof Error ? error.message : 'неизвестная ошибка');
    return NextResponse.json({ error: 'Не удалось сохранить настройку' }, { status: 503 });
  }
}
