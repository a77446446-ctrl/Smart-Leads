import { NextResponse } from 'next/server';
import { AuthenticationError, requireCurrentUser } from '@/lib/auth/current-user';
import { createPaymentOrder } from '@/services/yookassa';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    if (Number(request.headers.get('content-length') || 0) > 16_384) return NextResponse.json({ error: 'Запрос слишком большой' }, { status: 413 });
    const user = await requireCurrentUser();
    const body = await request.json() as Record<string, unknown>;
    const result = await createPaymentOrder(user.id, body);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    const message = error instanceof Error ? error.message : 'Не удалось создать платёж';
    const status = message === 'LEGAL_ACCEPTANCE_REQUIRED' ? 428 : message.includes('не настроена') || message.includes('реквизиты') ? 503 : 400;
    return NextResponse.json({ error: message === 'LEGAL_ACCEPTANCE_REQUIRED' ? 'Примите юридические документы перед продолжением работы' : message }, { status });
  }
}
