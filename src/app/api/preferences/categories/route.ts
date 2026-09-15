import { NextResponse } from 'next/server';
import { AuthenticationError, requireCurrentUser } from '@/lib/auth/current-user';
import { buildMaxBotLink } from '@/lib/max-bot';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const [categories, preferences] = await Promise.all([
      prisma.category.findMany({
        where: { active: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, slug: true },
      }),
      prisma.userCategoryPreference.findMany({
        where: { userId: user.id, enabled: true },
        select: { categoryId: true },
      }),
    ]);
    const enabled = new Set(preferences.map((preference) => preference.categoryId));
    return NextResponse.json(categories.map((category) => ({
      ...category,
      notifyEnabled: enabled.has(category.id),
    })));
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error('[CATEGORY PREFERENCES GET]', error);
    return NextResponse.json({ error: 'Не удалось загрузить подписки' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const parsedBody = await request.json() as unknown;
    if (typeof parsedBody !== 'object' || parsedBody === null || Array.isArray(parsedBody)) {
      return NextResponse.json({ error: 'Некорректное тело запроса' }, { status: 400 });
    }
    const body = parsedBody as Record<string, unknown>;
    const categoryId = typeof body.categoryId === 'string' ? body.categoryId.trim() : '';
    const enabled = body.enabled;
    if (!categoryId || categoryId.length > 100 || typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'Некорректная настройка категории' }, { status: 400 });
    }
    const userUpdates: any = {};
    if (enabled) {
      userUpdates.notifyEnabled = true;
      if (!user.botStartedAt) {
        userUpdates.botStartedAt = new Date();
      }
    }

    const category = await prisma.category.findFirst({
      where: { id: categoryId, active: true },
      select: { id: true },
    });
    if (!category) return NextResponse.json({ error: 'Категория не найдена' }, { status: 404 });

    await prisma.$transaction([
      prisma.userCategoryPreference.upsert({
        where: { userId_categoryId: { userId: user.id, categoryId } },
        create: { userId: user.id, categoryId, enabled },
        update: { enabled },
      }),
      ...(Object.keys(userUpdates).length > 0 ? [prisma.user.update({ where: { id: user.id }, data: userUpdates })] : []),
    ]);
    return NextResponse.json({ success: true, categoryId, enabled });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : '';
    if (message.includes('MAX_BOT_USERNAME')) {
      return NextResponse.json({ error: 'MAX Bot не настроен' }, { status: 503 });
    }
    console.error('[CATEGORY PREFERENCES POST]', error);
    return NextResponse.json({ error: 'Не удалось сохранить подписку' }, { status: 500 });
  }
}
