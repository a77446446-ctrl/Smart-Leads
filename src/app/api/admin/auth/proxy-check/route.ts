import { adminGuard } from '@/lib/auth/admin-guard';
import { safeParserError } from '@/lib/parser-accounts';
import { resolveProxyInput } from '@/lib/proxy-draft';
import { parserPythonExecutable, parserPythonSpawnError } from '@/lib/python-runtime';
import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export const runtime = 'nodejs';
const MAX_OUTPUT_BYTES = 16 * 1024;
const CHECK_TIMEOUT_MS = 15_000;

export async function POST(req: NextRequest) {
  const denied = await adminGuard();
  if (denied) return denied;
  try {
    const body = await req.json() as { proxy?: unknown };
    if (body.proxy === 'direct' || body.proxy === '' || body.proxy == null) return NextResponse.json({ valid: true });
    const proxy = await resolveProxyInput(body.proxy);
    if (!proxy) return NextResponse.json({ valid: true });

    return await new Promise<NextResponse>((resolve) => {
      const scriptPath = path.join(process.cwd(), 'scripts', 'proxy_check.py');
      const child = spawn(parserPythonExecutable(), [scriptPath], {
        cwd: process.cwd(),
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', TEST_PROXY_URL: proxy },
      });
      let output = '';
      let settled = false;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const finish = (response: NextResponse) => {
        if (settled) return;
        settled = true;
        if (timeout) clearTimeout(timeout);
        resolve(response);
      };
      const append = (chunk: Buffer) => {
        if (output.length < MAX_OUTPUT_BYTES) output += chunk.toString('utf8').slice(0, MAX_OUTPUT_BYTES - output.length);
      };
      child.stdout.on('data', append);
      child.stderr.on('data', append);
      child.once('error', (error) => finish(NextResponse.json({ valid: false, error: parserPythonSpawnError(error).message })));
      child.once('close', (code) => finish(code === 0
        ? NextResponse.json({ valid: true })
        : NextResponse.json({ valid: false, error: safeParserError(output) || 'Соединение через прокси не установлено' })));
      timeout = setTimeout(() => {
        child.kill('SIGTERM');
        finish(NextResponse.json({ valid: false, error: 'Истекло время проверки прокси' }));
      }, CHECK_TIMEOUT_MS);
    });
  } catch (error) {
    return NextResponse.json({ valid: false, error: safeParserError(error) }, { status: 400 });
  }
}