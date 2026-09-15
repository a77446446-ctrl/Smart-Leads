import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { normalizeMaxNumericId, verifyMaxWebhookSecret } from '@/lib/max-bot';
import { enqueueWelcomeDelivery } from '@/services/bot-outbox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_WEBHOOK_BYTES = 64 * 1_024;

class BlockedMaxUserError extends Error {}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function optionalText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/[\u0000-\u001f\u007f]/g, ' ');
  return normalized ? normalized.slice(0, maxLength) : null;
}

function eventDate(value: unknown): Date {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) return new Date();
  const date = new Date(value);
  const distance = Math.abs(Date.now() - date.getTime());
  return Number.isNaN(date.getTime()) || distance > 24 * 60 * 60 * 1_000 ? new Date() : date;
}

function exactChatIdFromJson(rawBody: string): string | null {
  const match = rawBody.match(/"chat_id"\s*:\s*(?:"(-?\d{1,19})"|(-?\d{1,19}))/);
  return normalizeMaxNumericId(match?.[1] || match?.[2]);
}

export async function POST(request: Request) {
  const configuredSecret = process.env.MAX_WEBHOOK_SECRET;
  if (!configuredSecret) {
    return NextResponse.json({ error: 'Webhook MAX не настроен' }, { status: 503 });
  }
  if (!verifyMaxWebhookSecret(request.headers.get('x-max-bot-api-secret'), configuredSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const contentLength = Number(request.headers.get('content-length') || '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  let update: Record<string, unknown>;
  let rawBody = '';
  try {
    rawBody = await request.text();
    if (!rawBody || Buffer.byteLength(rawBody, 'utf8') > MAX_WEBHOOK_BYTES) {
      return NextResponse.json({ error: 'Некорректный размер webhook' }, { status: 400 });
    }
    const parsed = asObject(JSON.parse(rawBody));
    if (!parsed) return NextResponse.json({ error: 'Некорректный webhook' }, { status: 400 });
    update = parsed;
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 });
  }

  const updateType = optionalText(update.update_type, 100);
  if (!updateType) return NextResponse.json({ ok: true, ignored: true });

  try {
    if (updateType === 'bot_started') {
      const maxUser = asObject(update.user);
      const maxId = normalizeMaxNumericId(maxUser?.user_id ?? maxUser?.id);
      if (!maxId) return NextResponse.json({ ok: true, ignored: true });
      const name = optionalText(maxUser?.name, 100)
        || optionalText(maxUser?.first_name, 100)
        || 'Пользователь MAX';
      const startedAt = eventDate(update.timestamp);

      const activated = await prisma.$transaction(async (tx) => {
        const numericMaxId = BigInt(maxId);
        const blockedBeforeActivation = await tx.blockedMaxUser.findUnique({
          where: { maxId: numericMaxId },
          select: { maxId: true },
        });
        if (blockedBeforeActivation) return false;

        const user = await tx.user.upsert({
          where: { maxId: numericMaxId },
          create: {
            maxId: numericMaxId,
            name,
            notifyEnabled: true,
            botStartedAt: startedAt,
            deletedAt: null,
          },
          update: {
            name,
            notifyEnabled: true,
            botStartedAt: startedAt,
          },
          select: { id: true, maxId: true },
        });

        const blockedAfterActivation = await tx.blockedMaxUser.findUnique({
          where: { maxId: numericMaxId },
          select: { maxId: true },
        });
        if (blockedAfterActivation) throw new BlockedMaxUserError('Учётная запись заблокирована');

        await enqueueWelcomeDelivery(tx, user.id, user.maxId);
        return true;
      });
      if (!activated) return NextResponse.json({ ok: true, ignored: true });
    } else if (['bot_stopped', 'dialog_removed', 'dialog_muted'].includes(updateType)) {
      const maxUser = asObject(update.user);
      const maxId = normalizeMaxNumericId(maxUser?.user_id ?? maxUser?.id);
      if (maxId) {
        await prisma.user.updateMany({
          where: { maxId: BigInt(maxId) },
          data: { notifyEnabled: false },
        });
      }
    } else if (updateType === 'dialog_unmuted') {
      const maxUser = asObject(update.user);
      const maxId = normalizeMaxNumericId(maxUser?.user_id ?? maxUser?.id);
      if (maxId) {
        await prisma.user.updateMany({
          where: { maxId: BigInt(maxId), deletedAt: null, botStartedAt: { not: null } },
          data: { notifyEnabled: true },
        });
      }
    } else if (['bot_added', 'chat_title_changed', 'message_created'].includes(updateType)) {
      const messageObj = asObject(update.message);
      const recipient = asObject(messageObj?.recipient);
      const chat = asObject(update.chat) || asObject(messageObj?.chat) || update;
      const rawChatId = chat.id ?? chat.chat_id ?? recipient?.chat_id ?? messageObj?.chat_id ?? update.chat_id;
      const chatId = normalizeMaxNumericId(rawChatId) || exactChatIdFromJson(rawBody);
      if (chatId) {
        const isChannel = chat.type === 'channel'
          || recipient?.chat_type === 'channel'
          || update.is_channel === true;
        await prisma.maxBotChat.upsert({
          where: { chatId },
          create: {
            chatId,
            title: optionalText(chat.title ?? update.title, 200) || (isChannel ? 'MAX-канал' : 'MAX-чат'),
            kind: isChannel ? 'CHANNEL' : 'CHAT',
          },
          update: {
            active: true,
            ...(optionalText(chat.title ?? update.title, 200) ? { title: optionalText(chat.title ?? update.title, 200) } : {}),
          },
        });
      }
    } else if (updateType === 'bot_removed') {
      const chat = asObject(update.chat) || update;
      const rawChatId = chat.id ?? chat.chat_id ?? update.chat_id;
      const chatId = normalizeMaxNumericId(rawChatId);
      if (chatId) {
        await prisma.maxBotChat.updateMany({ where: { chatId }, data: { active: false } });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof BlockedMaxUserError) {
      return NextResponse.json({ ok: true, ignored: true });
    }
    console.error('[MAX WEBHOOK]', error instanceof Error ? error.message : 'Ошибка обработки');
    return NextResponse.json({ error: 'Не удалось обработать событие MAX' }, { status: 500 });
  }
}
