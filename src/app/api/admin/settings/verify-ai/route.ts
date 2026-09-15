import { NextRequest, NextResponse } from 'next/server';
import { adminGuard } from '@/lib/auth/admin-guard';
import { prisma } from '@/lib/prisma';
import { SECRET_MASK } from '@/lib/security/secret-mask';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const denied = await adminGuard();
  if (denied) return denied;

  try {
    const parsedBody = await req.json() as unknown;
    if (typeof parsedBody !== 'object' || parsedBody === null || Array.isArray(parsedBody)) {
      return NextResponse.json({ success: false, message: 'Некорректный запрос' }, { status: 400 });
    }

    const suppliedKey = (parsedBody as Record<string, unknown>).apiKey;
    let apiKey = typeof suppliedKey === 'string' ? suppliedKey.trim() : '';
    if (apiKey === SECRET_MASK) {
      apiKey = (await prisma.setting.findUnique({ where: { key: 'maks_ai_api_key' } }))?.value?.trim() || '';
    }
    if (!apiKey || apiKey.length > 512) {
      return NextResponse.json({ success: false, message: 'Ключ не указан или имеет некорректную длину' }, { status: 400 });
    }

    const isOpenAI = apiKey.startsWith('sk-proj-') || apiKey.startsWith('sk-svcacct-');
    const response = await fetch(
      isOpenAI ? 'https://api.openai.com/v1/chat/completions' : 'https://api.deepseek.com/chat/completions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: isOpenAI ? 'gpt-4o-mini' : 'deepseek-chat',
          messages: [{ role: 'user', content: 'Ping' }],
          max_tokens: 5,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (response.ok) {
      return NextResponse.json({ success: true, message: 'API-ключ подтверждён' });
    }

    const messages: Record<number, string> = {
      400: 'Провайдер отклонил тестовый запрос',
      401: 'Неверный API-ключ',
      402: 'На аккаунте провайдера недостаточно средств',
      429: 'Превышен лимит запросов провайдера',
    };
    return NextResponse.json({
      success: false,
      message: messages[response.status] || `Провайдер вернул ошибку ${response.status}`,
    });
  } catch (error) {
    console.error('[VERIFY AI]', error);
    return NextResponse.json({ success: false, message: 'Не удалось проверить API-ключ' }, { status: 502 });
  }
}
