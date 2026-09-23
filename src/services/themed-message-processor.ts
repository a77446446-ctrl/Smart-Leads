import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { APPLICATION_THEME_SETTING_KEY, isApplicationThemeId } from '@/lib/application-theme';
import { classifyLeadCategory } from '@/lib/lead-category';
import { buildParserMessageFingerprint, isTechnicalParserMessage } from '@/lib/parser-message-policy';
import { buildLeadContentFingerprint, DuplicateLeadError, isUniqueConstraintError } from '@/lib/lead-identity';
import { hasActionableLeadContact } from '@/lib/redact-contact';
import { hasOnlyExpiredLeadDates } from '@/lib/lead-date';
import { removeSourceChatLinks } from '@/lib/lead-source-link';
import { themeHasPublications } from '@/lib/publication-policy';
import { safeParserError } from '@/lib/parser-accounts';
import { aiService } from './ai';
import { createLeadWithDeliveries } from './bot-outbox';

type LogEntry = { time: string; msg: string; type: 'info' | 'success' | 'error' };
type MessageProcessor = (message: { text: string; id?: string }, chatUrl: string, chatTitle: string, parseAll: boolean, logs: LogEntry[]) => Promise<boolean>;

function log(logs: LogEntry[], msg: string, type: LogEntry['type'] = 'info') {
  if (logs.length < 500) logs.push({ time: new Date().toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow' }), msg: msg.slice(0, 500), type });
}

/** Выбор делается после получения сообщений; конфигурация стабильна в пределах пакета чата. */
export async function selectMessageProcessor(legacy: MessageProcessor): Promise<MessageProcessor> {
  const setting = await prisma.setting.findUnique({ where: { key: APPLICATION_THEME_SETTING_KEY } });
  if (!setting) return legacy;
  if (!isApplicationThemeId(setting.value)) throw new Error('Неизвестная тема приложения. Проверьте раздел «Категории».');
  const theme = setting.value;
  const publicAccess = themeHasPublications(theme);
  const categories = await prisma.category.findMany({ where: { active: true }, orderBy: { slug: 'asc' } });

  return async (message, chatUrl, _chatTitle, parseAll, logs) => {
    try {
      const original = message.text.replace(/\u0000/g, '').trim();
      if (isTechnicalParserMessage(original)) return false;
      const fingerprint = buildParserMessageFingerprint(chatUrl, message.id, original);
      const contentFingerprint = buildLeadContentFingerprint({ rawText: original });
      if (await prisma.lead.findFirst({ where: { OR: [{ fingerprint }, { contentFingerprint }, { rawText: original, sourceChat: chatUrl }] }, select: { id: true } })) return false;

      const match = classifyLeadCategory(original, categories);
      if (!parseAll && !match.matched) {
        log(logs, 'Тематический отбор: нет подходящей активной категории по словам');
        // Отказ по текущим правилам не запоминается навсегда: администратор может исправить слова.
        return false;
      }
      if (!parseAll && !publicAccess) {
        const contactText = removeSourceChatLinks(original, chatUrl);
        if (original.length <= 15 || original.length >= 2000 || !hasActionableLeadContact(contactText) || hasOnlyExpiredLeadDates(original)) return false;
      }
      let metadata: Awaited<ReturnType<typeof aiService.processLead>> | null = null;
      try { metadata = await aiService.processLead(original); }
      catch (error) {
        if (!parseAll && !publicAccess) throw error;
        log(logs, `Анализ метаданных недоступен: ${safeParserError(error)}`);
      }
      if (!parseAll && !publicAccess && metadata && (metadata.isSpam || metadata.score < 30)) return false;

      let category = categories.find(item => item.slug === match.categorySlug && match.matched);
      if (!category) {
        // Режим «Всё» сохраняет несовпавшие сообщения в общую рубрику, даже если она выключена для отбора.
        category = await prisma.category.upsert({ where: { slug: 'other' }, update: {}, create: { name: 'Другое', slug: 'other', leadPrice: publicAccess ? 0 : 50 } });
      }
      const data: Prisma.LeadUncheckedCreateInput = {
        title: original.split(/\r?\n/).find(line => line.trim())!.trim().slice(0, 200),
        rawText: original, city: String(metadata?.city || 'Не указан').slice(0, 100),
        categoryId: category.id, sourceChat: chatUrl, fingerprint, contentFingerprint,
        allowContactless: publicAccess || parseAll, publicationTheme: theme,
        accessMode: publicAccess ? 'PUBLIC' : 'CONTACT', price: publicAccess ? 0 : category.leadPrice,
        score: publicAccess || parseAll ? 100 : Math.min(100, Math.max(0, metadata?.score || 50)), status: 'NEW',
      };
      if (publicAccess) {
        // Новость не попадает в прежнюю очередь платных анонсов «забрать контакт».
        // Уникальные индексы fingerprint/contentFingerprint закрывают одновременную запись дублей.
        await prisma.lead.create({ data });
      } else {
        await createLeadWithDeliveries(data, original);
      }
      return true;
    } catch (error) {
      if (error instanceof DuplicateLeadError || isUniqueConstraintError(error)) return false;
      log(logs, `Тематическое сообщение не сохранено: ${safeParserError(error)}`, 'error');
      return false;
    }
  };
}
