import { NextResponse } from 'next/server';
import { adminGuard } from '@/lib/auth/admin-guard';
import { prisma } from '@/lib/prisma';
import { addManualTargetChat } from '@/services/chat-discovery';

export const runtime = 'nodejs';
const STATUSES = new Set(['PENDING', 'ACTIVE', 'REJECTED']);

export async function GET() {
  const denied = await adminGuard();
  if (denied) return denied;
  const [chats, runs] = await Promise.all([
    prisma.targetChat.findMany({ orderBy: [{ active: 'desc' }, { lastDiscoveredAt: 'desc' }], take: 500 }),
    prisma.discoveryRun.findMany({ orderBy: { startedAt: 'desc' }, take: 20 }),
  ]);
  return NextResponse.json({ chats, runs });
}

export async function POST(request: Request) {
  const denied = await adminGuard();
  if (denied) return denied;
  try {
    const body = await request.json() as { url?: unknown; name?: unknown };
    const chat = await addManualTargetChat(body.url, body.name);
    return NextResponse.json(chat, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Некорректные данные' }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const denied = await adminGuard();
  if (denied) return denied;
  const body = await request.json() as { id?: unknown; status?: unknown; parseAll?: unknown; name?: unknown };
  if (typeof body.id !== 'string' || typeof body.status !== 'string' || !STATUSES.has(body.status)) {
    return NextResponse.json({ error: 'Некорректный id или статус' }, { status: 400 });
  }
  const chat = await prisma.targetChat.update({
    where: { id: body.id },
    data: {
      status: body.status,
      active: body.status === 'ACTIVE',
      parseAll: typeof body.parseAll === 'boolean' ? body.parseAll : undefined,
      name: typeof body.name === 'string' ? body.name.trim().slice(0, 160) || null : undefined,
      lastError: body.status === 'ACTIVE' ? null : undefined,
    },
  });
  return NextResponse.json(chat);
}

export async function DELETE(request: Request) {
  const denied = await adminGuard();
  if (denied) return denied;
  try {
    const body = await request.json() as { id?: unknown };
    if (typeof body.id !== 'string') {
      return NextResponse.json({ error: 'Некорректный id' }, { status: 400 });
    }
    await prisma.targetChat.delete({ where: { id: body.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error && error.message.includes('Record to delete does not exist')
      ? 'Источник не найден' : 'Не удалось удалить источник';
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
