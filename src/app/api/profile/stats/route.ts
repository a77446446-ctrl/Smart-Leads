import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AuthenticationError, requireCurrentUser } from '@/lib/auth/current-user';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const userId = user.id;

    const [purchasedLeads, purchases] = await Promise.all([
      prisma.purchase.count({ where: { userId } }),
      prisma.purchase.findMany({ where: { userId }, select: { price: true } })
    ]);

    const totalSpent = purchases.reduce((sum, p) => sum + (p.price || 0), 0);

    return NextResponse.json({
      purchasedLeads,
      totalSpent
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
