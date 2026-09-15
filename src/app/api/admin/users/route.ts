import { NextResponse } from 'next/server';
import { adminGuard } from '@/lib/auth/admin-guard';
import { requireAdmin } from '@/lib/auth/current-user';
import { isConfiguredAdminIdentity } from '@/lib/auth/admin-config';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const denied = await adminGuard();
  if (denied) return denied;

  try {
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        maxId: true,
        name: true,
        role: true,
        balance: true,
        rating: true,
        createdAt: true,
        externalIdentities: {
          where: { provider: 'TELEGRAM' },
          select: { providerUserId: true },
          take: 1,
        },
      },
    });

    return NextResponse.json(users.map((user) => {
      const telegramId = user.externalIdentities[0]?.providerUserId ?? null;
      return {
      id: user.id,
      maxId: user.maxId?.toString() ?? null,
      telegramId,
      authProvider: user.maxId ? 'MAX' : 'TELEGRAM',
      name: user.name,
      role: user.role,
      balance: user.balance,
      rating: user.rating,
      createdAt: user.createdAt,
      manageable: !isConfiguredAdminIdentity({ maxId: user.maxId, telegramId }),
    };
    }));
  } catch (error) {
    console.error('Не удалось загрузить пользователей:', error);
    return NextResponse.json({ error: 'Не удалось загрузить пользователей' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const denied = await adminGuard();
  if (denied) return denied;

  try {
    const admin = await requireAdmin();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId')?.trim();
    const mode = searchParams.get('mode');

    if (!userId || !['delete', 'block'].includes(mode || '')) {
      return NextResponse.json({ error: 'Некорректное действие с пользователем' }, { status: 400 });
    }

    const target = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        maxId: true,
        externalIdentities: {
          select: { provider: true, providerUserId: true },
        },
      },
    });
    if (!target) {
      return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });
    }
    const targetTelegramId = target.externalIdentities.find((identity) => identity.provider === 'TELEGRAM')?.providerUserId;
    if (target.id === admin.id || isConfiguredAdminIdentity({ maxId: target.maxId, telegramId: targetTelegramId })) {
      return NextResponse.json({ error: 'Администратора удалить или заблокировать нельзя' }, { status: 403 });
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      if (mode === 'block') {
        const reason = `Полная блокировка администратором ${admin.id}`;
        if (target.maxId !== null) {
          await tx.blockedMaxUser.upsert({
            where: { maxId: target.maxId },
            create: { maxId: target.maxId, reason },
            update: { reason, createdAt: now },
          });
        }
        for (const identity of target.externalIdentities) {
          await tx.blockedExternalIdentity.upsert({
            where: {
              provider_providerUserId: {
                provider: identity.provider,
                providerUserId: identity.providerUserId,
              },
            },
            create: { provider: identity.provider, providerUserId: identity.providerUserId, reason },
            update: { reason, createdAt: now },
          });
        }
      }

      await Promise.all([
        tx.userCategoryPreference.deleteMany({ where: { userId: target.id } }),
        tx.subscription.updateMany({
          where: { userId: target.id, expiresAt: { gt: now } },
          data: { expiresAt: now },
        }),
      ]);
      await tx.user.update({
        where: { id: target.id },
        data: {
          deletedAt: now,
          notifyEnabled: false,
          botStartedAt: null,
          registrationCycle: { increment: 1 },
        },
      });
    });

    return NextResponse.json({
      ok: true,
      message: mode === 'block'
        ? 'Пользователь полностью заблокирован'
        : 'Пользователь удалён и должен заново войти и принять документы',
    });
  } catch (error) {
    console.error('Не удалось изменить доступ пользователя:', error);
    return NextResponse.json({ error: 'Не удалось изменить доступ пользователя' }, { status: 500 });
  }
}
