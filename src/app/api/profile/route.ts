import { NextResponse } from 'next/server';
import { AuthenticationError, requireCurrentUser, serializeCurrentUser } from '@/lib/auth/current-user';
import { buildMaxBotLink } from '@/lib/max-bot';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = serializeCurrentUser(await requireCurrentUser());
    const monetizationSetting = await prisma.setting.findUnique({ where: { key: 'maks_monetization_enabled' } });
    const monetizationEnabled = monetizationSetting?.value !== 'false';
    return NextResponse.json({ ...user, monetizationEnabled });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error('[PROFILE]', error);
    return NextResponse.json({ error: 'Не удалось загрузить профиль' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const currentUser = await requireCurrentUser();
    const parsedBody = await request.json() as unknown;
    if (typeof parsedBody !== 'object' || parsedBody === null || Array.isArray(parsedBody)) {
      return NextResponse.json({ error: 'Некорректное тело запроса' }, { status: 400 });
    }
    const notifyEnabled = (parsedBody as Record<string, unknown>).notifyEnabled;
    if (typeof notifyEnabled !== 'boolean') {
      return NextResponse.json({ error: 'Некорректное значение уведомлений' }, { status: 400 });
    }
    const updateData: any = { notifyEnabled };
    if (notifyEnabled && !currentUser.botStartedAt) {
      updateData.botStartedAt = new Date();
    }

    const user = await prisma.user.update({
      where: { id: currentUser.id },
      data: updateData,
      select: {
        id: true,
        maxId: true,
        name: true,
        role: true,
        balance: true,
        rating: true,
        notifyEnabled: true,
        botStartedAt: true,
        registrationCycle: true,
        createdAt: true,
      },
    });
    return NextResponse.json(serializeCurrentUser(user));
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : '';
    if (message.includes('MAX_BOT_USERNAME')) {
      return NextResponse.json({ error: 'MAX Bot не настроен' }, { status: 503 });
    }
    console.error('[PROFILE PATCH]', error);
    return NextResponse.json({ error: 'Не удалось изменить уведомления' }, { status: 500 });
  }
}
