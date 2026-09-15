import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { adminGuard } from '@/lib/auth/admin-guard';
import { encryptProxyUrl, parserSessionDirectory, persistParserSessionFile, safeParserError, sessionFileName } from '@/lib/parser-accounts';
import { resolveProxyInput } from '@/lib/proxy-draft';
import { parserPythonExecutable, parserPythonSpawnError } from '@/lib/python-runtime';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const AUTH_TIMEOUT_MS = 6 * 60_000;
const MAX_OUTPUT_BYTES = 16 * 1024;

export async function POST(req: NextRequest) {
  const denied = await adminGuard();
  if (denied) return denied;
  let accountId: string | null = null;

  try {
    const body = await req.json() as { proxy?: unknown };
    const proxy = body.proxy === 'direct' || body.proxy === '' || body.proxy == null
      ? 'direct'
      : await resolveProxyInput(body.proxy);
    if (!proxy) throw new Error('Прокси не задан');

    const staleBefore = new Date(Date.now() - AUTH_TIMEOUT_MS);
    await prisma.maksAccount.updateMany({
      where: { status: 'AUTHORIZING', createdAt: { lt: staleBefore } },
      data: { status: 'AUTH_REQUIRED', active: false, lastError: 'Предыдущая авторизация не была завершена' },
    });
    const recentAuthorizations = await prisma.maksAccount.count({
      where: { status: 'AUTHORIZING', createdAt: { gt: staleBefore } },
    });
    if (recentAuthorizations >= 3) {
      return NextResponse.json({ success: false, error: 'Уже запущено слишком много авторизаций. Подождите до 6 минут.' }, { status: 429 });
    }

    const sessionId = randomUUID();
    const account = await prisma.maksAccount.create({
      data: {
        name: `Аккаунт ${sessionId.slice(0, 8)}`,
        sessionFile: sessionFileName(sessionId),
        proxyString: encryptProxyUrl(proxy),
        status: 'AUTHORIZING',
        active: false,
      },
    });
    accountId = account.id;

    const scriptPath = path.join(process.cwd(), 'scripts', 'auth_manager.py');
    const child = spawn(parserPythonExecutable(), [scriptPath, sessionId], {
      cwd: process.cwd(),
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PARSER_PROXY_URL: proxy,
        PARSER_SESSIONS_DIR: parserSessionDirectory(),
        PARSER_AUTH_HEADLESS: process.env.PARSER_AUTH_HEADLESS || 'true',
      },
    });

    let output = '';
    const append = (chunk: Buffer) => {
      if (output.length < MAX_OUTPUT_BYTES) output += chunk.toString('utf8').slice(0, MAX_OUTPUT_BYTES - output.length);
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);

    const timeout = setTimeout(() => child.kill('SIGTERM'), AUTH_TIMEOUT_MS);
    timeout.unref();
    child.once('close', async (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        try {
          await persistParserSessionFile(account.id, sessionId);
          await prisma.maksAccount.update({
            where: { id: account.id },
            data: { status: 'ACTIVE', active: true, lastError: null, cooldownUntil: null, consecutiveFailures: 0 },
          });
        } catch (error) {
          const message = `Сессия MAX создана, но не сохранена в БД: ${safeParserError(error)}`;
          await prisma.maksAccount.update({
            where: { id: account.id },
            data: { status: 'AUTH_REQUIRED', active: false, lastError: message },
          }).catch(() => undefined);
        }
        return;
      }
      const message = safeParserError(output) || 'Процесс авторизации MAX завершился с ошибкой';
      await prisma.maksAccount.updateMany({
        where: { id: account.id, status: 'AUTHORIZING' },
        data: { status: 'AUTH_REQUIRED', active: false, lastError: message },
      }).catch(() => undefined);
    });
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', (error) => reject(parserPythonSpawnError(error)));
    });

    return NextResponse.json({ success: true, accountId: account.id });
  } catch (error) {
    if (accountId) await prisma.maksAccount.delete({ where: { id: accountId } }).catch(() => undefined);
    const message = safeParserError(error instanceof Error ? error.message : 'Не удалось запустить авторизацию');
    console.error('MAKS Auth:', message);
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
