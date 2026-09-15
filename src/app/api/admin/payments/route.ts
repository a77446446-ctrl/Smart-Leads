import { NextResponse } from 'next/server';
import { adminGuard } from '@/lib/auth/admin-guard';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const denied = await adminGuard();
  if (denied) return denied;

  try {
    const transactions = await prisma.transaction.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        type: true,
        amount: true,
        createdAt: true,
        user: {
          select: {
            name: true,
            maxId: true,
          },
        },
      },
    });

    return NextResponse.json(transactions.map((transaction) => ({
      id: transaction.id,
      type: transaction.type,
      amount: transaction.amount.toFixed(2),
      createdAt: transaction.createdAt,
      user: {
        name: transaction.user.name,
        maxId: transaction.user.maxId.toString(),
      },
    })));
  } catch (error) {
    console.error('Не удалось загрузить платежи:', error);
    return NextResponse.json({ error: 'Не удалось загрузить платежи' }, { status: 500 });
  }
}
