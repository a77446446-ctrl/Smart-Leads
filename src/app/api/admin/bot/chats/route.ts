import { NextResponse } from 'next/server';
import { adminGuard } from '@/lib/auth/admin-guard';
import { configureMaxWebhookSubscription, MaxBotApiError } from '@/lib/max-bot';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const denied = await adminGuard();
  if (denied) return denied;

  try {
    return NextResponse.json(await prisma.maxBotChat.findMany({
      where: { active: true },
      orderBy: [{ kind: 'asc' }, { title: 'asc' }, { updatedAt: 'desc' }],
      select: { chatId: true, title: true, kind: true, active: true },
      take: 500,
    }));
  } catch (error) {
    console.error('[MAX BOT CHATS GET]', error);
    return NextResponse.json({ error: 'Не удалось загрузить MAX-чаты' }, { status: 500 });
  }
}

export async function POST() {
  const denied = await adminGuard();
  if (denied) return denied;

  try {
    const webhookUrl = await configureMaxWebhookSubscription();
    return NextResponse.json({ ok: true, webhookUrl });
  } catch (error) {
    if (error instanceof MaxBotApiError) {
      const status = error.status >= 400 && error.status <= 599 ? error.status : 502;
      return NextResponse.json({ error: error.message }, { status });
    }
    console.error('[MAX BOT CHATS POST]', error);
    return NextResponse.json({ error: 'Не удалось включить обнаружение MAX-каналов' }, { status: 500 });
  }
}
