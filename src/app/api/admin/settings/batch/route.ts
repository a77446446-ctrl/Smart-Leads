import { NextResponse } from 'next/server';
import { adminGuard } from '@/lib/auth/admin-guard';
import { prisma } from '@/lib/prisma';
import { readBoundedJson } from '@/lib/bounded-json';
import { isSameAppOrigin } from '@/lib/same-app-origin';
import { isSecretSettingKey, SECRET_MASK } from '@/lib/security/secret-mask';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
const editableKeys = new Set([
  'maks_main_channel', 'maks_ai_api_key', 'maks_ai_enabled', 'maks_spam_keywords',
  'maks_monetization_enabled', 'maks_welcome_bonus_enabled', 'maks_welcome_bonus_amount',
  'maks_parsing_chats', 'maks_parser_auto', 'maks_parser_interval', 'lead_retention_days',
  'maks_parser_time_start', 'maks_parser_time_end', 'maks_parser_time_enabled', 'maks_connection_mode',
]);

export async function POST(request: Request) {
  const denied = await adminGuard();
  if (denied) return denied;
  if (!isSameAppOrigin(request)) return NextResponse.json({ error: 'Запрос с другого сайта запрещён' }, { status: 403, headers });
  let settings: { key: string; value: string }[];
  try {
    const input = await readBoundedJson(request, 512 * 1024) as { settings?: unknown } | null;
    if (!input || !Array.isArray(input.settings) || !input.settings.length || input.settings.length > editableKeys.size) throw new Error();
    const keys = new Set<string>();
    settings = input.settings.map(item => {
      if (!item || typeof item.key !== 'string' || !editableKeys.has(item.key) || keys.has(item.key)
        || typeof item.value !== 'string' || item.value.length > 100_000) throw new Error();
      keys.add(item.key);
      return { key: item.key, value: item.value };
    });
  } catch {
    return NextResponse.json({ error: 'Некорректный набор настроек или превышен допустимый размер' }, { status: 400, headers });
  }
  try {
    // Единая транзакция исключает частично сохранённую форму. Порядок ключей уменьшает риск взаимных блокировок.
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      await tx.$executeRaw`SET LOCAL statement_timeout = '8s'`;
      for (const { key, value } of settings.sort((a, b) => a.key.localeCompare(b.key))) {
        if (isSecretSettingKey(key) && value === SECRET_MASK) continue;
        await tx.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
      }
    }, { maxWait: 3000, timeout: 10000 });
    return NextResponse.json({ saved: true }, { headers });
  } catch {
    console.error('[НАСТРОЙКИ] Не удалось завершить транзакцию сохранения');
    return NextResponse.json({ error: 'Не удалось сохранить настройки. База данных занята или недоступна. Повторите попытку.' }, { status: 503, headers });
  }
}
