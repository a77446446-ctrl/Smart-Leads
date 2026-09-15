import { adminGuard } from '@/lib/auth/admin-guard';
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const denied = await adminGuard();
  if (denied) return denied;

  try {
    // 1. Overview (Last 7 Days)
    const days = 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (days - 1));
    startDate.setHours(0, 0, 0, 0);

    const transactions = await prisma.transaction.findMany({
      where: { type: 'BUY', createdAt: { gte: startDate } },
      select: { amount: true, createdAt: true },
    });
    const users = await prisma.user.findMany({
      where: { createdAt: { gte: startDate }, deletedAt: null },
      select: { createdAt: true },
    });
    const leads = await prisma.lead.findMany({
      where: { createdAt: { gte: startDate } },
      select: { createdAt: true },
    });
    const subs = await prisma.subscription.findMany({
      where: { expiresAt: { gt: new Date() } }, // Note: we might want createdAt for new subs, but we'll approximate based on table logic or just skip subs in chart if it's too complex. 
      // Actually, let's just use user purchases or just omit subs if we don't have createdAt on Subscription (wait, schema has no createdAt on Subscription, so let's omit subs from chart).
    });

    const overviewMap = new Map<string, { revenue: number; users: number; leads: number }>();
    
    // Initialize map with last 7 days
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const key = d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' }).replace('.', '');
      overviewMap.set(key, { revenue: 0, users: 0, leads: 0 });
    }

    const getKey = (date: Date) => date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' }).replace('.', '');

    transactions.forEach(t => {
      const key = getKey(t.createdAt);
      if (overviewMap.has(key)) overviewMap.get(key)!.revenue += t.amount;
    });

    users.forEach(u => {
      const key = getKey(u.createdAt);
      if (overviewMap.has(key)) overviewMap.get(key)!.users += 1;
    });

    leads.forEach(l => {
      const key = getKey(l.createdAt);
      if (overviewMap.has(key)) overviewMap.get(key)!.leads += 1;
    });

    const overview = Array.from(overviewMap.entries()).map(([name, data]) => ({
      name,
      ...data,
    }));

    // 2. Categories Stats
    // Using raw SQL for efficient join and aggregation
    const categoriesRaw = await prisma.$queryRaw<any[]>`
      SELECT 
        c.name, 
        COUNT(DISTINCT l.id)::int as leads, 
        COALESCE(SUM(p.price), 0)::int as revenue
      FROM "Category" c
      LEFT JOIN "Lead" l ON l."categoryId" = c.id
      LEFT JOIN "Purchase" p ON p."leadId" = l.id
      GROUP BY c.id, c.name
      ORDER BY revenue DESC, leads DESC
      LIMIT 10
    `;
    const categories = categoriesRaw.map(c => ({
      name: c.name,
      leads: Number(c.leads || 0),
      revenue: Number(c.revenue || 0),
    }));

    // 3. Cities Stats
    const citiesRaw = await prisma.$queryRaw<any[]>`
      SELECT city as name, COUNT(id)::int as value
      FROM "Lead"
      WHERE city IS NOT NULL AND city != ''
      GROUP BY city
      ORDER BY value DESC
      LIMIT 10
    `;
    const cities = citiesRaw.map(c => ({
      name: c.name,
      value: Number(c.value || 0),
    }));

    return NextResponse.json({
      overview,
      categories,
      cities,
    });
  } catch (error) {
    console.error('Failed to fetch chart stats:', error);
    return NextResponse.json({ error: 'Failed to fetch chart stats' }, { status: 500 });
  }
}
