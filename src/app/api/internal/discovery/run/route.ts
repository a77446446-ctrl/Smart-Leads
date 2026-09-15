import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyBearerSecret } from '@/lib/security/api-secret';
import { runChatDiscovery } from '@/services/chat-discovery';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!verifyBearerSecret(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (process.env.DISCOVERY_ENABLED !== 'true') {
    return NextResponse.json({ skipped: true, message: 'Автопоиск отключён' });
  }
  const hours = Math.min(168, Math.max(1, Number.parseInt(process.env.DISCOVERY_INTERVAL_HOURS || '6', 10) || 6));
  const setting = await prisma.setting.findUnique({ where: { key: 'discovery_last_run' } });
  const lastRun = Number.parseInt(setting?.value || '0', 10) || 0;
  if (Date.now() - lastRun < hours * 3_600_000) {
    return NextResponse.json({ skipped: true, message: 'Интервал ещё не наступил' });
  }
  await prisma.setting.upsert({
    where: { key: 'discovery_last_run' },
    update: { value: String(Date.now()) },
    create: { key: 'discovery_last_run', value: String(Date.now()) },
  });
  const result = await runChatDiscovery();
  return NextResponse.json(result, { status: result.success ? 200 : 502 });
}
