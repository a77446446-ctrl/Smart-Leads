import { adminGuard } from '@/lib/auth/admin-guard';
import { prisma } from '@/lib/prisma';
import {
  assertSessionId,
  decryptProxyUrl,
  ensureParserSessionFile,
  maskProxyUrl,
  sessionFileExists,
  sessionFilePath,
  synchronizeParserSessionFiles,
} from '@/lib/parser-accounts';
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const denied = await adminGuard();
  if (denied) return denied;
  try {
    if (req.nextUrl.searchParams.get('sync') === 'true') {
      await synchronizeParserSessionFiles();
    }
    const accounts = await prisma.maksAccount.findMany({ orderBy: { createdAt: 'desc' } });
    const sessions = await Promise.all(accounts.map(async (account) => {
      const sessionId = account.sessionFile.replace(/\.json$/i, '');
      const hasSession = await sessionFileExists(sessionId);

      let computedStatus = hasSession ? account.status : 'AUTH_REQUIRED';
      if (computedStatus === 'ACTIVE' && account.cooldownUntil && new Date(account.cooldownUntil) > new Date()) {
        computedStatus = 'COOLDOWN';
      }

      const proxy = account.proxyString ? (account.proxyString === 'direct' ? 'direct' : maskProxyUrl(decryptProxyUrl(account.proxyString))) : null;
      return {
        id: account.id,
        name: account.name,
        active: account.active && hasSession,
        status: computedStatus,
        lastUsed: account.lastUsed?.toISOString() || null,
        lastSuccessAt: account.lastSuccessAt?.toISOString() || null,
        cooldownUntil: account.cooldownUntil?.toISOString() || null,
        consecutiveFailures: account.consecutiveFailures,
        totalRuns: account.totalRuns,
        totalErrors: account.totalErrors,
        lastError: account.lastError,
        proxy,
      };
    }));
    return NextResponse.json({ sessions });
  } catch (error) {
    console.error('[SESSIONS] Не удалось получить аккаунты:', error instanceof Error ? error.message : 'ошибка');
    return NextResponse.json({ error: 'Не удалось получить аккаунты' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const denied = await adminGuard();
  if (denied) return denied;
  try {
    const body = await req.json() as { id?: unknown; active?: unknown };
    if (typeof body.id !== 'string' || typeof body.active !== 'boolean') {
      return NextResponse.json({ error: 'Некорректные параметры' }, { status: 400 });
    }
    const account = await prisma.maksAccount.findUnique({ where: { id: body.id } });
    if (!account) return NextResponse.json({ error: 'Аккаунт не найден' }, { status: 404 });
    if (body.active && !(await ensureParserSessionFile(account))) {
      return NextResponse.json({ error: 'Файл сессии отсутствует' }, { status: 409 });
    }
    await prisma.maksAccount.update({
      where: { id: account.id },
      data: body.active
        ? { active: true, status: 'ACTIVE', cooldownUntil: null, consecutiveFailures: 0, lastError: null }
        : { active: false, status: 'DISABLED', cooldownUntil: null },
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Не удалось изменить аккаунт' }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const denied = await adminGuard();
  if (denied) return denied;
  try {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Не указан аккаунт' }, { status: 400 });
    const account = await prisma.maksAccount.findUnique({ where: { id } });
    if (!account) return NextResponse.json({ error: 'Аккаунт не найден' }, { status: 404 });
    const sessionId = assertSessionId(account.sessionFile.replace(/\.json$/i, ''));
    try { await fs.unlink(sessionFilePath(sessionId)); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await prisma.maksAccount.delete({ where: { id: account.id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Не удалось удалить аккаунт' }, { status: 500 });
  }
}
