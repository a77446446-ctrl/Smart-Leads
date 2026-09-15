import { NextResponse } from 'next/server';
import { adminGuard } from '@/lib/auth/admin-guard';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const denied = await adminGuard();
  if (denied) return denied;

  try {
    const [groups, failures, chats] = await Promise.all([
      prisma.botDelivery.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.botDelivery.findMany({
        where: { status: 'FAILED' },
        orderBy: { updatedAt: 'desc' },
        take: 20,
        select: { id: true, kind: true, recipientType: true, attempts: true, lastError: true, updatedAt: true },
      }),
      prisma.maxBotChat.findMany({
        orderBy: { updatedAt: 'desc' },
        select: { chatId: true, title: true, kind: true, active: true, updatedAt: true },
      }),
    ]);
    return NextResponse.json({
      configured: Boolean(process.env.MAX_BOT_TOKEN && process.env.MAX_BOT_USERNAME && process.env.MAX_WEBHOOK_SECRET),
      deliveries: Object.fromEntries(groups.map((group) => [group.status, group._count._all])),
      failures,
      chats,
    });
  } catch (error) {
    console.error('[MAX BOT STATUS]', error);
    return NextResponse.json({ error: 'Не удалось получить статус MAX Bot' }, { status: 500 });
  }
}
