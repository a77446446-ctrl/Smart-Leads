import fs from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import { adminGuard } from '@/lib/auth/admin-guard';
import {
  assertSessionId,
  authQrFilePath,
  authStatusFilePath,
  decryptProxyUrl,
  ensureParserSessionFile,
  maskProxyUrl,
  persistParserSessionFile,
  safeParserError,
} from '@/lib/parser-accounts';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AuthStatusDocument = {
  state?: unknown;
  message?: unknown;
  updatedAt?: unknown;
};

async function readStatus(sessionId: string): Promise<AuthStatusDocument | null> {
  try {
    const file = authStatusFilePath(sessionId);
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size <= 0 || stat.size > 8 * 1024) return null;
    return JSON.parse(await fs.readFile(file, 'utf8')) as AuthStatusDocument;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const denied = await adminGuard();
  if (denied) return denied;

  const accountId = new URL(req.url).searchParams.get('id');
  if (!accountId) return NextResponse.json({ error: 'Не указан аккаунт' }, { status: 400 });

  const account = await prisma.maksAccount.findUnique({ where: { id: accountId } });
  if (!account) return NextResponse.json({ error: 'Аккаунт не найден' }, { status: 404 });
  const sessionId = assertSessionId(account.sessionFile.replace(/\.json$/i, ''));


  let hasSession = false;
  try {
    hasSession = await ensureParserSessionFile(account);
    if (hasSession) await persistParserSessionFile(account.id, sessionId);
  } catch (error) {
    const message = `Сессия MAX создана, но не сохранена в БД: ${safeParserError(error)}`;
    await prisma.maksAccount.update({
      where: { id: account.id },
      data: { status: 'AUTH_REQUIRED', active: false, lastError: message },
    });
    return NextResponse.json({ state: 'error', message });
  }
  if (hasSession) {
    const activeAccount = await prisma.maksAccount.update({
      where: { id: account.id },
      data: { status: 'ACTIVE', active: true, lastError: null, cooldownUntil: null, consecutiveFailures: 0 },
    });
    let proxy = 'Прокси настроен';
    try { proxy = maskProxyUrl(decryptProxyUrl(activeAccount.proxyString)); } catch { /* секрет не раскрываем */ }
    return NextResponse.json({
      state: 'success',
      account: {
        id: activeAccount.id,
        name: activeAccount.name,
        active: true,
        status: 'ACTIVE',
        lastUsed: activeAccount.lastUsed?.toISOString() || null,
        lastSuccessAt: activeAccount.lastSuccessAt?.toISOString() || null,
        cooldownUntil: null,
        consecutiveFailures: 0,
        totalRuns: activeAccount.totalRuns,
        totalErrors: activeAccount.totalErrors,
        lastError: null,
        proxy,
      },
    });
  }
  if (account.status !== 'AUTHORIZING' && account.lastError) {
    return NextResponse.json({ state: 'error', message: safeParserError(account.lastError) });
  }

  const status = await readStatus(sessionId);
  const ageMs = Date.now() - account.createdAt.getTime();
  if (!status && ageMs > 6 * 60_000) {
    const message = 'Авторизация не завершилась за 6 минут';
    await prisma.maksAccount.update({ where: { id: account.id }, data: { status: 'AUTH_REQUIRED', active: false, lastError: message } });
    return NextResponse.json({ state: 'error', message });
  }

  if (status?.state === 'error') {
    const message = safeParserError(status.message || 'Авторизация MAX завершилась с ошибкой');
    await prisma.maksAccount.update({ where: { id: account.id }, data: { status: 'AUTH_REQUIRED', active: false, lastError: message } });
    return NextResponse.json({ state: 'error', message });
  }

  if (status?.state === 'qr') {
    try {
      const qrStat = await fs.stat(authQrFilePath(sessionId));
      return NextResponse.json({ state: 'qr', qrUrl: `/api/admin/auth/qr?id=${encodeURIComponent(account.id)}&v=${Math.floor(qrStat.mtimeMs)}` });
    } catch {
      return NextResponse.json({ state: 'starting' });
    }
  }

  return NextResponse.json({ state: 'starting' });
}
