import { NextResponse } from 'next/server';
import { AuthenticationError, requireCurrentUser } from '@/lib/auth/current-user';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    await requireCurrentUser();

    // Ensure GLOBAL_PRO exists
    const globalCategory = await prisma.category.upsert({
      where: { slug: 'global_pro' },
      update: {},
      create: {
        id: 'GLOBAL_PRO',
        slug: 'global_pro',
        name: 'ВСЕ ЛИДЫ',
        subscriptionPrice: 100000,
        days: 30,
        paymentMode: 'PRO',
        active: true,
        leadPrice: 0
      }
    });

    const categories = await prisma.category.findMany({
      where: { active: true, subscriptionPrice: { gt: 0 } },
      select: { id: true, name: true, subscriptionPrice: true, days: true }, orderBy: { name: 'asc' },
    });
    return NextResponse.json({ categories, topupPresets: [50, 100, 200, 500] });
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    return NextResponse.json({ error: 'Не удалось загрузить тарифы' }, { status: 500 });
  }
}
