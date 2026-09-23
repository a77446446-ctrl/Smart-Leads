import { NextResponse } from 'next/server';
import { verifyBearerSecret } from '@/lib/security/api-secret';
import { cleanupLeadMedia } from '@/services/lead-media';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  if (!verifyBearerSecret(request.headers.get('authorization'), process.env.CRON_SECRET)) return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  try { return NextResponse.json(await cleanupLeadMedia()); }
  catch {
    console.error('[ФОТО] Очистка не завершена, следующая попытка через минуту');
    return NextResponse.json({ error: 'Очистка не завершена' }, { status: 503 });
  }
}
