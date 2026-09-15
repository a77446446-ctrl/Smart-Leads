import { createHash } from 'crypto';

const TECHNICAL_MESSAGE_PATTERNS = [
  /^(?:сообщение|message) (?:удалено|deleted)$/iu,
  /^(?:сообщение недоступно|message unavailable)$/iu,
  /^(?:служебное сообщение|service message)$/iu,
  /^(?:вы|you) (?:вступили|joined|покинули|left) (?:в чат|the chat)$/iu,
];

/**
 * Отделяет технические заглушки MAX от пользовательских сообщений.
 * Проверка намеренно узкая: смысловые и рекламные фильтры здесь запрещены.
 */
export function isTechnicalParserMessage(value: unknown): boolean {
  if (typeof value !== 'string') return true;
  const normalized = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized) return true;
  return TECHNICAL_MESSAGE_PATTERNS.some((pattern) => pattern.test(normalized));
}

/** Формирует стабильный ключ сообщения для защиты от повторной отправки. */
export function buildParserMessageFingerprint(chatUrl: string, messageId: string | undefined, text: string): string {
  const identity = messageId?.trim() ? `id:${messageId.trim()}` : `text:${text}`;
  return createHash('sha256').update(`max-chat:${chatUrl}\n${identity}`, 'utf8').digest('hex');
}
