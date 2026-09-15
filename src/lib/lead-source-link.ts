import { normalizeMaxChatUrl } from './max-chat-url.ts';

const URL_TOKEN = /https?:\/\/[^\s<>"'`]+/giu;
const ORPHAN_CONTACT_FOOTER = /^\s*Контакты\s*\(ссылки\):[\s,;|·-]*$/iu;

function canonicalMaxLink(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['max.ru', 'web.max.ru'].includes(url.hostname.toLowerCase())) return null;
    url.hostname = 'web.max.ru';
    return url;
  } catch {
    return null;
  }
}

function isSourceChatLink(value: string, sourceChat: string): boolean {
  const source = canonicalMaxLink(normalizeMaxChatUrl(sourceChat));
  const candidate = canonicalMaxLink(value);
  if (!source || !candidate) return false;

  const sourcePath = source.pathname.replace(/\/+$/u, '') || '/';
  const candidatePath = candidate.pathname.replace(/\/+$/u, '') || '/';
  if (candidatePath !== sourcePath && !candidatePath.startsWith(`${sourcePath}/`)) return false;
  return !source.search || source.search === candidate.search;
}

/** Удаляет ссылку возврата в исходный чат, сохраняя контакты работодателя. */
export function removeSourceChatLinks(value: string, sourceChat: string): string {
  const lines = String(value || '').replace(/\r\n?/g, '\n').split('\n');
  return lines
    .map((line) => line.replace(URL_TOKEN, (match) => (isSourceChatLink(match, sourceChat) ? '' : match)))
    .filter((line) => !ORPHAN_CONTACT_FOOTER.test(line))
    .join('\n')
    .replace(/(Контакты\s*\(ссылки\):)\s{2,}/giu, '$1 ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
