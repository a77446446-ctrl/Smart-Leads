import { NextResponse } from 'next/server';
import { adminGuard } from '@/lib/auth/admin-guard';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const denied = await adminGuard();
  if (denied) return denied;

  const url = new URL(request.url);
  
  if (url.searchParams.get('register') === '1') {
    try {
      const token = (process.env.MAX_BOT_TOKEN || "").trim();
      const secret = (process.env.MAX_WEBHOOK_SECRET || "").trim();
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");
      const webhookUrl = new URL("/api/webhooks/max", appUrl);
      
      const response = await fetch("https://platform-api2.max.ru/subscriptions", {
        method: "POST",
        headers: { Authorization: token, "Content-Type": "application/json" },
        body: JSON.stringify({
          url: webhookUrl.toString(),
          update_types: ["bot_started", "bot_stopped", "bot_added", "bot_removed", "chat_title_changed", "dialog_removed", "dialog_muted", "dialog_unmuted", "message_created"],
          secret,
        }),
      });
      return NextResponse.json({ success: response.ok, result: await response.json().catch(() => null) });
    } catch (e) {
      return NextResponse.json({ error: String(e) });
    }
  }

  try {
    const [groups, failures, chats, deliveriesAll] = await Promise.all([
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
      prisma.botDelivery.findMany({
        orderBy: { updatedAt: 'desc' },
        take: 10,
      })
    ]);
    return NextResponse.json({
      env: {
        MAX_BOT_TOKEN: Boolean(process.env.MAX_BOT_TOKEN),
        MAX_BOT_USERNAME: Boolean(process.env.MAX_BOT_USERNAME),
        MAX_WEBHOOK_SECRET: Boolean(process.env.MAX_WEBHOOK_SECRET),
        CRON_SECRET: Boolean(process.env.CRON_SECRET),
      },
      deliveries: Object.fromEntries(groups.map((group) => [group.status, group._count._all])),
      failures,
      chats,
      recent: deliveriesAll,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
