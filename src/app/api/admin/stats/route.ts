import { adminGuard } from '@/lib/auth/admin-guard';
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const denied = await adminGuard();
  if (denied) return denied;
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    let today: Date;
    if (dateParam) {
      const [y, m, d] = dateParam.split('-');
      // Start of day in MSK (UTC+3) corresponds to 21:00 UTC of previous day
      today = new Date(Date.UTC(parseInt(y), parseInt(m) - 1, parseInt(d) - 1, 21, 0, 0, 0));
    } else {
      today = new Date();
      // Adjust current time to MSK, then find start of MSK day, then convert back to UTC
      const mskTime = new Date(today.getTime() + 3 * 3600 * 1000);
      today = new Date(Date.UTC(mskTime.getUTCFullYear(), mskTime.getUTCMonth(), mskTime.getUTCDate() - 1, 21, 0, 0, 0));
    }

    const nextDay = new Date(today.getTime() + 24 * 3600 * 1000);

    const [revenueToday, newLeads, activeMasters, activeSubs] = await Promise.all([
      prisma.transaction.aggregate({
        where: {
          type: 'BUY',
          createdAt: { gte: today, lt: nextDay },
        },
        _sum: { amount: true },
      }),
      prisma.lead.count({
        where: { createdAt: { gte: today, lt: nextDay } },
      }),
      prisma.user.count({
        where: { role: 'USER', deletedAt: null },
      }),
      prisma.subscription.count({
        where: { expiresAt: { gt: new Date() } },
      }),
    ]);

    return NextResponse.json({
      revenueToday: Number(revenueToday._sum.amount || 0),
      newLeads,
      activeMasters,
      activeSubscriptions: activeSubs,
    });
  } catch (error) {
    console.error('Failed to fetch admin stats:', error);
    return NextResponse.json({ error: 'Failed to fetch admin stats' }, { status: 500 });
  }
}
