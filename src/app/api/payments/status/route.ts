import { NextResponse } from 'next/server';
import { AuthenticationError, requireCurrentUser } from '@/lib/auth/current-user';
import { kopecksToRubles } from '@/lib/money';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Не указан платёж' }, { status: 400 });
    const order = await prisma.paymentOrder.findFirst({ where: { id, userId: user.id }, select: { id: true, kind: true, status: true, amount: true, creditedAt: true, createdAt: true } });
    if (!order) return NextResponse.json({ error: 'Платёж не найден' }, { status: 404 });
    return NextResponse.json({ ...order,  amount: undefined });
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    return NextResponse.json({ error: 'Не удалось проверить платёж' }, { status: 500 });
  }
}
