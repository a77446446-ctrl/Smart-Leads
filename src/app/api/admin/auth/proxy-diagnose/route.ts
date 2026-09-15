import { adminGuard } from '@/lib/auth/admin-guard';
import { safeParserError } from '@/lib/parser-accounts';
import { resolveProxyInput } from '@/lib/proxy-draft';
import { parserPythonExecutable, parserPythonSpawnError } from '@/lib/python-runtime';
import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export const runtime = 'nodejs';
const MAX_OUTPUT_BYTES = 32 * 1024;
const DIAGNOSE_TIMEOUT_MS = 30_000;

export async function POST(req: NextRequest) {
  const denied = await adminGuard();
  if (denied) return denied;
  try {
    const body = await req.json() as { proxy?: unknown };
    if (body.proxy === 'direct' || body.proxy === '' || body.proxy == null) {
      return NextResponse.json({ success: true, steps: [{ step: 'Прямое подключение', ok: true, detail: 'Прокси не используется' }] });
    }
    const proxy = await resolveProxyInput(body.proxy);
    if (!proxy) return NextResponse.json({ success: true, steps: [] });

    return await new Promise<NextResponse>((resolve) => {
      const scriptPath = path.join(process.cwd(), 'scripts', 'proxy_diagnose.py');
      const child = spawn(parserPythonExecutable(), [scriptPath], {
        cwd: process.cwd(),
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', TEST_PROXY_URL: proxy },
      });
      let stdout = '';
      let stderr = '';
      let settled = false;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const finish = (response: NextResponse) => {
        if (settled) return;
        settled = true;
        if (timeout) clearTimeout(timeout);
        resolve(response);
      };
      child.stdout.on('data', (chunk: Buffer) => {
        if (stdout.length < MAX_OUTPUT_BYTES) stdout += chunk.toString('utf8').slice(0, MAX_OUTPUT_BYTES - stdout.length);
      });
      child.stderr.on('data', (chunk: Buffer) => {
        if (stderr.length < MAX_OUTPUT_BYTES) stderr += chunk.toString('utf8').slice(0, MAX_OUTPUT_BYTES - stderr.length);
      });
      child.once('error', (error) => finish(NextResponse.json({ success: false, error: parserPythonSpawnError(error).message }, { status: 500 })));
      child.once('close', () => {
        try {
          const parsed = JSON.parse(stdout);
          finish(NextResponse.json(parsed));
        } catch {
          finish(NextResponse.json({ success: false, error: stderr || stdout || 'Диагностика не вернула результат' }));
        }
      });
      timeout = setTimeout(() => {
        child.kill('SIGTERM');
        finish(NextResponse.json({ success: false, error: 'Диагностика: истекло время ожидания (30 сек)' }));
      }, DIAGNOSE_TIMEOUT_MS);
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: safeParserError(error) }, { status: 400 });
  }
}
