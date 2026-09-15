import { NextResponse } from 'next/server';
import { verifyBearerSecret } from '@/lib/security/api-secret';
import { dispatchBotDeliveries } from '@/services/bot-outbox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!verifyBearerSecret(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    return NextResponse.json(await dispatchBotDeliveries(10));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка диспетчера MAX';
    const configurationError = message.includes('MAX_BOT_TOKEN') || message.includes('MAX_BOT_USERNAME');
    if (!configurationError) console.error('[MAX BOT DISPATCH]', message);
    return NextResponse.json(
      { error: configurationError ? 'MAX Bot не настроен' : 'Ошибка диспетчера MAX' },
      { status: configurationError ? 503 : 500 },
    );
  }
}
