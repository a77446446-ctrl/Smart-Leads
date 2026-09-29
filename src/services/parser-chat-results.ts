import { prisma } from '@/lib/prisma';

type ChatResult = { url: string; lastRunLeadsCount: number | null; lastParsedAt: string | null };

/** Промежуточный журнал доступен интерфейсу ещё до завершения всей очереди. */
export async function saveParserProgress(logs: Array<{ time: string; msg: string; type: string }>) {
  await prisma.setting.upsert({
    where: { key: 'sync_logs' },
    update: { value: JSON.stringify(logs) },
    create: { key: 'sync_logs', value: JSON.stringify(logs) },
  });
}

/** Обновляем только итоги имеющихся источников, сохраняя правки администратора. */
export function mergeChatResults(value: string, results: ChatResult[]): string {
  const chats: unknown = JSON.parse(value);
  if (!Array.isArray(chats)) throw new Error('Некорректный список чатов');
  const latest = new Map(results.map(result => [result.url, result]));
  return JSON.stringify(chats.map(chat => {
    const url = typeof chat === 'string' ? chat : chat?.url;
    const result = latest.get(url);
    if (!result) return chat;
    return { ...(typeof chat === 'string' ? { url: chat } : chat),
      lastRunLeadsCount: result.lastRunLeadsCount, lastParsedAt: result.lastParsedAt };
  }));
}

export async function saveParserChatResults(results: ChatResult[]) {
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
    const rows = await tx.$queryRaw<{ value: string }[]>`SELECT "value" FROM "Setting" WHERE "key" = 'maks_parsing_chats' FOR UPDATE`;
    if (!rows.length) return;
    await tx.setting.update({ where: { key: 'maks_parsing_chats' }, data: { value: mergeChatResults(rows[0].value, results) } });
  }, { maxWait: 3000, timeout: 10000 });
}
