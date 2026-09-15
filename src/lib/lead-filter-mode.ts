import { normalizeMaxChatUrl } from './max-chat-url.ts';

type ChatMode = { url?: string; parseAll?: boolean };

/** Учитываем режимы всех источников, включая активные чаты, добавленные через поиск. */
export function hasTargetedChats(chats: ReadonlyArray<ChatMode>, discoveredValue = '[]'): boolean {
  const modes = new Map<string, boolean>();
  const key = (url: string) => {
    try { return normalizeMaxChatUrl(url); } catch { return url; }
  };
  chats.forEach((chat, index) => modes.set(chat.url ? key(chat.url) : 'local:' + index, chat.parseAll !== false));
  let discovered: unknown;
  try { discovered = JSON.parse(discoveredValue); } catch { discovered = []; }
  if (Array.isArray(discovered)) {
    for (const chat of discovered) {
      if (chat && typeof chat.url === 'string' && typeof chat.parseAll === 'boolean') {
        modes.set(key(chat.url), chat.parseAll);
      }
    }
  }
  return [...modes.values()].some((parseAll) => !parseAll);
}
