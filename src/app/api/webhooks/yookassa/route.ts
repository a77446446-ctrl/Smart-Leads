import { NextResponse } from 'next/server';
import { processYooWebhook } from '@/services/yookassa';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    if (Number(request.headers.get('content-length') || 0) > 65_536) return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    const body = await request.json() as { event?: unknown; object?: { id?: unknown } };
    if (typeof body.event !== 'string' || typeof body.object?.id !== 'string') return NextResponse.json({ error: 'Invalid notification' }, { status: 400 });
    await processYooWebhook(body.object.id, body.event);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[YOOKASSA WEBHOOK]', error instanceof Error ? error.message : 'Ошибка webhook');
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 502 });
  }
}
