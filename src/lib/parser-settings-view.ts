export interface SavedParserChat {
  name: string;
  url: string;
  parseAll: boolean;
  lastRunLeadsCount: number | null;
  lastParsedAt: string | null;
}

/** Ошибочные данные нельзя подменять пустой очередью и затем сохранять поверх базы. */
export function readSavedParserChats(value: string | undefined): SavedParserChat[] {
  if (value === undefined) return [];
  let rows: unknown;
  try { rows = JSON.parse(value); }
  catch { throw new Error('Сохранённый список чатов повреждён. Сохранение заблокировано; исходные данные оставлены в базе.'); }
  if (!Array.isArray(rows)) throw new Error('Сервер вернул некорректный список чатов. Сохранение заблокировано.');
  return rows.map(row => {
    const chat = typeof row === 'string' ? { url: row } : row;
    if (!chat || typeof chat.url !== 'string' || !chat.url.trim()) {
      throw new Error('В сохранённом списке есть чат без ссылки. Сохранение заблокировано; проверьте исходные данные.');
    }
    return {
      url: chat.url,
      name: typeof chat.name === 'string' && chat.name ? chat.name : chat.url,
      parseAll: chat.parseAll !== false,
      lastRunLeadsCount: Number.isInteger(chat.lastRunLeadsCount) && chat.lastRunLeadsCount >= 0 ? chat.lastRunLeadsCount : null,
      lastParsedAt: typeof chat.lastParsedAt === 'string' ? chat.lastParsedAt : null,
    };
  });
}
