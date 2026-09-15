import fs from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import { adminGuard } from '@/lib/auth/admin-guard';
import { assertSessionId, authQrFilePath } from '@/lib/parser-accounts';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const denied = await adminGuard();
  if (denied) return denied;

  try {
    const accountId = new URL(req.url).searchParams.get('id');
    if (!accountId) return NextResponse.json({ error: 'Не указан аккаунт' }, { status: 400 });
    const account = await prisma.maksAccount.findUnique({ where: { id: accountId }, select: { sessionFile: true } });
    if (!account) return NextResponse.json({ error: 'Аккаунт не найден' }, { status: 404 });
    const sessionId = assertSessionId(account.sessionFile.replace(/\.json$/i, ''));
    const file = authQrFilePath(sessionId);
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size <= 0 || stat.size > 5 * 1024 * 1024) throw new Error('Некорректный QR-файл');
    const image = await fs.readFile(file);
    return new NextResponse(image, {
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(image.length),
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json({ error: 'QR-код ещё не готов' }, { status: 404 });
  }
}
