import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { hasActionableLeadContact } from '@/lib/redact-contact';
import { cleanLeadText } from '@/lib/lead-content';
import { buildLeadTitle } from '@/lib/lead-title';
import { buildLeadContentFingerprint, DuplicateLeadError, isUniqueConstraintError } from '@/lib/lead-identity';
import {
  buildLeadTeaserMessage,
  buildMaxMiniAppLink,
  buildPurchaseMessage,
  buildWelcomeMessage,
  MaxBotApiError,
  sendMaxMessage,
} from '@/lib/max-bot';

const MAX_ATTEMPTS = 8;
const STALE_LOCK_MS = 5 * 60 * 1_000;
const MAX_BATCH_SIZE = 20;

type TransactionClient = Prisma.TransactionClient;

export class LeadContactRequiredError extends Error {
  constructor() {
    super('Лид не содержит телефона или ссылки для связи');
    this.name = 'LeadContactRequiredError';
  }
}

function contactText(lead: { title: string; rawText: string; phone?: string | null }): string {
  return [lead.title, lead.rawText, lead.phone || ''].join('\n');
}

export async function enqueueLeadDeliveries(
  tx: TransactionClient,
  leadId: string,
  categoryId: string,
): Promise<void> {
  const [category, preferences] = await Promise.all([
    tx.category.findUniqueOrThrow({
      where: { id: categoryId },
      select: { showcaseChatId: true, showcaseEnabled: true },
    }),
    tx.userCategoryPreference.findMany({
      where: {
        categoryId,
        enabled: true,
        user: { notifyEnabled: true, botStartedAt: { not: null } },
      },
      select: { user: { select: { id: true, maxId: true } } },
    }),
  ]);

  const deliveries: Prisma.BotDeliveryCreateManyInput[] = [];
  if (category.showcaseEnabled && category.showcaseChatId) {
    deliveries.push({
      kind: 'LEAD_TEASER_CHANNEL',
      deduplicationKey: `lead-channel:${leadId}:${category.showcaseChatId}`,
      recipientType: 'CHAT',
      recipientId: category.showcaseChatId,
      leadId,
    });
  }

  for (const preference of preferences) {
    deliveries.push({
      kind: 'LEAD_TEASER_USER',
      deduplicationKey: `lead-user:${leadId}:${preference.user.id}`,
      recipientType: 'USER',
      recipientId: preference.user.maxId.toString(),
      userId: preference.user.id,
      leadId,
    });
  }

  if (deliveries.length > 0) {
    await tx.botDelivery.createMany({ data: deliveries, skipDuplicates: true });
  }
}

export async function createLeadWithDeliveries(data: Prisma.LeadUncheckedCreateInput, sourceText = data.rawText) {
  // Храним полный исходник; оформление вычисляется отдельно при показе.
  const rawText = String(sourceText || '').trim();
  data = {
    ...data,
    rawText,
    title: buildLeadTitle(cleanLeadText(rawText), data.title),
    contentFingerprint: buildLeadContentFingerprint({ rawText, phone: data.phone }),
    duplicateOfId: null,
  };
  if (!data.allowContactless && !hasActionableLeadContact(contactText(data))) {
    throw new LeadContactRequiredError();
  }
  const existing = await prisma.lead.findUnique({
    where: { contentFingerprint: data.contentFingerprint }, select: { id: true },
  });
  if (existing) throw new DuplicateLeadError(existing.id);
  try {
    return await prisma.$transaction(async (tx) => {
      const lead = await tx.lead.create({ data });
      await enqueueLeadDeliveries(tx, lead.id, lead.categoryId);
      return lead;
    });
  } catch (error) {
    // Уникальный индекс закрывает гонку между одновременными запросами.
    if (isUniqueConstraintError(error)) {
      const duplicate = await prisma.lead.findFirst({
        where: { OR: [
          { contentFingerprint: data.contentFingerprint },
          ...(data.fingerprint ? [{ fingerprint: data.fingerprint }] : []),
        ] },
        select: { id: true },
      });
      if (duplicate) throw new DuplicateLeadError(duplicate.id);
    }
    throw error;
  }
}

export async function enqueuePurchaseDelivery(
  tx: TransactionClient,
  input: {
    purchaseId: string;
    leadId: string;
    userId: string;
    maxId: bigint;
    notifyEnabled: boolean;
    botStartedAt: Date | null;
  },
): Promise<void> {
  if (!input.notifyEnabled || !input.botStartedAt) return;
  await tx.botDelivery.createMany({
    data: [{
      kind: 'PURCHASE',
      deduplicationKey: `purchase:${input.purchaseId}`,
      recipientType: 'USER',
      recipientId: input.maxId.toString(),
      userId: input.userId,
      leadId: input.leadId,
    }],
    skipDuplicates: true,
  });
}

export async function enqueueWelcomeDelivery(
  tx: TransactionClient,
  userId: string,
  maxId: bigint,
): Promise<void> {
  await tx.botDelivery.createMany({
    data: [{
      kind: 'WELCOME',
      deduplicationKey: `welcome:${userId}`,
      recipientType: 'USER',
      recipientId: maxId.toString(),
      userId,
    }],
    skipDuplicates: true,
  });
}

function retryDelayMs(attempt: number): number {
  return Math.min(60 * 60 * 1_000, 30_000 * (2 ** Math.max(0, attempt - 1)));
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Неизвестная ошибка доставки';
  return message.replace(/[\r\n]+/g, ' ').slice(0, 500);
}

async function markSkipped(id: string, reason: string): Promise<void> {
  await prisma.botDelivery.update({
    where: { id },
    data: { status: 'SKIPPED', lockedAt: null, lastError: reason.slice(0, 500) },
  });
}

export async function dispatchBotDeliveries(requestedLimit = 10): Promise<{
  processed: number;
  sent: number;
  retried: number;
  failed: number;
  skipped: number;
}> {
  if (!(process.env.MAX_BOT_TOKEN || '').trim()) throw new Error('MAX_BOT_TOKEN не настроен');
  buildMaxMiniAppLink('home');

  const limit = Math.min(Math.max(Math.trunc(requestedLimit), 1), MAX_BATCH_SIZE);
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_LOCK_MS);
  const candidates = await prisma.botDelivery.findMany({
    where: {
      OR: [
        { status: { in: ['PENDING', 'RETRY'] }, availableAt: { lte: now } },
        { status: 'PROCESSING', lockedAt: { lt: staleBefore } },
      ],
    },
    orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }],
    take: limit,
    select: { id: true, status: true, attempts: true },
  });

  const summary = { processed: 0, sent: 0, retried: 0, failed: 0, skipped: 0 };
  for (const candidate of candidates) {
    const claimed = await prisma.botDelivery.updateMany({
      where: { id: candidate.id, status: candidate.status, attempts: candidate.attempts },
      data: { status: 'PROCESSING', lockedAt: new Date(), attempts: { increment: 1 } },
    });
    if (claimed.count !== 1) continue;
    summary.processed += 1;

    const delivery = await prisma.botDelivery.findUnique({
      where: { id: candidate.id },
      include: {
        user: { select: { notifyEnabled: true, botStartedAt: true } },
        lead: {
          include: { category: { select: { name: true, paymentMode: true } } },
        },
      },
    });
    if (!delivery) continue;

    if (delivery.recipientType === 'USER' && (!delivery.user?.notifyEnabled || !delivery.user.botStartedAt)) {
      await markSkipped(delivery.id, 'Пользователь отключил уведомления MAX');
      summary.skipped += 1;
      continue;
    }

    if (delivery.kind.startsWith('LEAD_TEASER') && delivery.lead?.status !== 'NEW') {
      await markSkipped(delivery.id, 'Лид уже недоступен');
      summary.skipped += 1;
      continue;
    }

    if (delivery.kind.startsWith('LEAD_TEASER') && delivery.lead?.duplicateOfId) {
      await markSkipped(delivery.id, 'Повтор объявления: сохранена основная запись');
      summary.skipped += 1;
      continue;
    }

    if (delivery.kind.startsWith('LEAD_TEASER') && delivery.lead && !delivery.lead.allowContactless && !hasActionableLeadContact(contactText(delivery.lead))) {
      await markSkipped(delivery.id, 'В лиде отсутствует телефон или ссылка для связи');
      summary.skipped += 1;
      continue;
    }

    if (delivery.kind !== 'WELCOME' && !delivery.lead) {
      await markSkipped(delivery.id, 'Связанный лид не найден');
      summary.skipped += 1;
      continue;
    }

    try {
      const payload = delivery.kind === 'WELCOME'
        ? buildWelcomeMessage()
        : delivery.kind === 'PURCHASE'
          ? buildPurchaseMessage(delivery.lead!)
          : buildLeadTeaserMessage(delivery.lead!);
      const messageId = await sendMaxMessage(
        delivery.recipientType === 'CHAT' ? 'CHAT' : 'USER',
        delivery.recipientId,
        payload,
      );
      await prisma.botDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          lockedAt: null,
          lastError: null,
          maxMessageId: messageId,
        },
      });
      summary.sent += 1;
    } catch (error) {
      const attempt = delivery.attempts;
      const retryable = error instanceof MaxBotApiError ? error.retryable : true;
      const willRetry = retryable && attempt < MAX_ATTEMPTS;
      await prisma.botDelivery.update({
        where: { id: delivery.id },
        data: {
          status: willRetry ? 'RETRY' : 'FAILED',
          availableAt: willRetry ? new Date(Date.now() + retryDelayMs(attempt)) : delivery.availableAt,
          lockedAt: null,
          lastError: safeErrorMessage(error),
        },
      });
      if (error instanceof MaxBotApiError && error.status === 403 && delivery.recipientType === 'USER' && delivery.userId) {
        await prisma.user.updateMany({ where: { id: delivery.userId }, data: { notifyEnabled: false } });
      }
      if (willRetry) summary.retried += 1;
      else summary.failed += 1;
    }

    await new Promise((resolve) => setTimeout(resolve, 520));
  }

  return summary;
}
