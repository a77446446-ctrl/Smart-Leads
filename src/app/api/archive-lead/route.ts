import { NextResponse } from 'next/server';
import { AuthenticationError, requireCurrentUser } from '@/lib/auth/current-user';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = (await request.json()) as { leadId?: unknown };
    if (typeof body.leadId !== 'string' || body.leadId.length > 100) {
      return NextResponse.json({ error: 'Некорректный идентификатор лида' }, { status: 400 });
    }

    const updated = await prisma.lead.updateMany({
      where: {
        id: body.leadId,
        status: { not: 'ARCHIVED' },
        purchases: { some: { userId: user.id } },
      },
      data: { status: 'ARCHIVED' },
    });
    if (updated.count !== 1) {
      return NextResponse.json({ error: 'Купленный лид не найден' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error('[ARCHIVE LEAD]', error);
    return NextResponse.json({ error: 'Не удалось переместить лид в архив' }, { status: 500 });
  }
}
