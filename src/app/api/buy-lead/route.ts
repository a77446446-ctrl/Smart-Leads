import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { AuthenticationError, requireCurrentUser } from '@/lib/auth/current-user';
import { kopecksToRubles, rublesToKopecks } from '@/lib/money';
import { prisma } from '@/lib/prisma';
import { enqueuePurchaseDelivery } from '@/services/bot-outbox';
import { hasCurrentLegalAcceptance } from '@/lib/legal';

export const dynamic = 'force-dynamic';

class PurchaseError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) {
    super(message);
  }
}

function getPrismaCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

async function runSerializablePurchase<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (getPrismaCode(error) !== 'P2034' || attempt === 2) throw error;
    }
  }
  throw lastError;
}

export async function POST(request: Request) {
  try {
    const currentUser = await requireCurrentUser();
    if (!await hasCurrentLegalAcceptance(currentUser.id)) {
      throw new PurchaseError('LEGAL_ACCEPTANCE_REQUIRED', 'Примите актуальные юридические документы перед продолжением работы', 428);
    }
    const body = (await request.json()) as { leadId?: unknown };
    if (typeof body.leadId !== 'string' || body.leadId.length < 1 || body.leadId.length > 100) {
      return NextResponse.json({ error: 'Некорректный идентификатор лида', code: 'INVALID_LEAD_ID' }, { status: 400 });
    }

    const result = await runSerializablePurchase(() => prisma.$transaction(async (tx) => {
      const existingPurchase = await tx.purchase.findFirst({
        where: { userId: currentUser.id, leadId: body.leadId as string },
        select: { id: true, price: true },
      });
      if (existingPurchase) {
        const existingUser = await tx.user.findUniqueOrThrow({
          where: { id: currentUser.id },
          select: { balance: true },
        });
        return {
          purchaseId: existingPurchase.id,
          price: existingPurchase.price,
          balance: existingUser.balance,
          alreadyPurchased: true,
        };
      }

      const lead = await tx.lead.findUnique({
        where: { id: body.leadId as string },
        include: { category: true },
      });
      if (!lead) throw new PurchaseError('LEAD_NOT_FOUND', 'Лид не найден', 404);
      if (lead.status !== 'NEW') throw new PurchaseError('LEAD_UNAVAILABLE', 'Лид уже забран или перемещён в архив', 409);

      const monetizationSetting = await tx.setting.findUnique({ where: { key: 'maks_monetization_enabled' } });
      const isMonetizationEnabled = monetizationSetting?.value !== 'false';

      const subscription = await tx.subscription.findFirst({
        where: {
          userId: currentUser.id,
          categoryId: { in: [lead.categoryId, 'GLOBAL_PRO'] },
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });

      const subscriptionOnly = ['SUB', 'SUBSCRIPTION', 'PRO'].includes(lead.category.paymentMode);
      if (isMonetizationEnabled && subscriptionOnly && !subscription) {
        throw new PurchaseError('SUBSCRIPTION_REQUIRED', 'Для этой категории требуется подписка', 402);
      }

      const price = (!isMonetizationEnabled || subscription) ? 0 : rublesToKopecks(lead.price);
      const claimed = await tx.lead.updateMany({
        where: { id: lead.id, status: 'NEW' },
        data: { status: 'SOLD' },
      });
      if (claimed.count !== 1) throw new PurchaseError('LEAD_UNAVAILABLE', 'Лид уже забрал другой пользователь', 409);

      if (price > 0) {
        const debited = await tx.user.updateMany({
          where: { id: currentUser.id, balance: { gte: price } },
          data: {
            balance: { decrement: price },
          },
        });
        if (debited.count !== 1) throw new PurchaseError('INSUFFICIENT_BALANCE', 'Недостаточно средств', 402);
      }

      const purchase = await tx.purchase.create({
        data: {
          userId: currentUser.id,
          leadId: lead.id,
          price,
        },
        select: { id: true },
      });

      await tx.transaction.create({
        data: {
          userId: currentUser.id,
          type: 'BUY',
          
          amount: price,
        },
      });

      const updatedUser = await tx.user.findUniqueOrThrow({
        where: { id: currentUser.id },
        select: { balance: true, maxId: true, notifyEnabled: true, botStartedAt: true },
      });
      await enqueuePurchaseDelivery(tx, {
        purchaseId: purchase.id,
        leadId: lead.id,
        userId: currentUser.id,
        maxId: updatedUser.maxId,
        notifyEnabled: updatedUser.notifyEnabled,
        botStartedAt: updatedUser.botStartedAt,
      });
      return {
        purchaseId: purchase.id,
        price,
        balance: updatedUser.balance,
        alreadyPurchased: false,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));

    return NextResponse.json({
      success: true,
      purchaseId: result.purchaseId,
      newBalance: result.balance,
      alreadyPurchased: result.alreadyPurchased,
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message, code: 'UNAUTHORIZED' }, { status: 401 });
    }
    if (error instanceof PurchaseError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (getPrismaCode(error) === 'P2002') {
      return NextResponse.json({ error: 'Этот лид уже был приобретён', code: 'LEAD_UNAVAILABLE' }, { status: 409 });
    }
    console.error('[BUY LEAD]', error);
    return NextResponse.json({ error: 'Не удалось завершить покупку', code: 'PURCHASE_FAILED' }, { status: 500 });
  }
}
