import { timingSafeEqual } from 'node:crypto';
import { extractContactInfo, redactContactInfo } from '@/lib/redact-contact';
import { cleanLeadText } from '@/lib/lead-content';
import { buildLeadTitle } from '@/lib/lead-title';

const MAX_API_BASE_URL = 'https://platform-api2.max.ru';
const MAX_MESSAGE_LIMIT = 4_000;
const MAX_ID_LIMIT = 9_223_372_036_854_775_807n;
const MIN_MAX_ID = -9_223_372_036_854_775_808n;

export type MaxRecipientType = 'USER' | 'CHAT';

export interface LeadMessageData {
  id: string;
  title: string;
  rawText: string;
  city: string;
  price: number;
  category: {
    name: string;
    paymentMode: string;
  };
}

export interface MaxMessagePayload {
  text: string;
  attachments?: Array<{
    type: 'inline_keyboard';
    payload: {
      buttons: Array<Array<{
        type: 'link';
        text: string;
        url: string;
      }>>;
    };
  }>;
  notify?: boolean;
}

export class MaxBotApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryable: boolean,
  ) {
    super(message);
  }
}

function truncate(value: string, maxLength: number): string {
  const normalized = value.replace(/\r\n/g, '\n').trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

export function normalizeMaxNumericId(value: unknown): string | null {
  const raw = typeof value === 'string'
    ? value.trim()
    : typeof value === 'bigint'
      ? value.toString()
      : typeof value === 'number' && Number.isSafeInteger(value)
        ? String(value)
        : '';
  if (!/^-?\d{1,19}$/.test(raw)) return null;
  try {
    const parsed = BigInt(raw);
    if (parsed === 0n || parsed < MIN_MAX_ID || parsed > MAX_ID_LIMIT) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export async function configureMaxWebhookSubscription(): Promise<string> {
  const token = (process.env.MAX_BOT_TOKEN || '').trim();
  if (!token) throw new MaxBotApiError('MAX_BOT_TOKEN не настроен', 503, true);

  const secret = (process.env.MAX_WEBHOOK_SECRET || '').trim();
  if (!/^[A-Za-z0-9_-]{5,256}$/.test(secret)) {
    throw new MaxBotApiError('MAX_WEBHOOK_SECRET не настроен', 503, false);
  }

  let webhookUrl: URL;
  try {
    webhookUrl = new URL('/api/webhooks/max', (process.env.NEXT_PUBLIC_APP_URL || '').trim());
  } catch {
    throw new MaxBotApiError('NEXT_PUBLIC_APP_URL не настроен', 503, false);
  }
  if (webhookUrl.protocol !== 'https:' || webhookUrl.port) {
    throw new MaxBotApiError('NEXT_PUBLIC_APP_URL должен быть HTTPS-доменом без нестандартного порта', 503, false);
  }

  let response: Response;
  try {
    response = await fetch(`${MAX_API_BASE_URL}/subscriptions`, {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl.toString(),
        update_types: [
          'bot_started',
          'bot_stopped',
          'bot_added',
          'bot_removed',
          'chat_title_changed',
          'message_created',
          'dialog_removed',
          'dialog_muted',
          'dialog_unmuted',
        ],
        secret,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new MaxBotApiError('MAX API временно недоступен', 503, true);
  }

  const result = await response.json().catch(() => null) as {
    success?: boolean;
    message?: string;
  } | null;

  if (!response.ok || result?.success !== true) {
    const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
    const detail = typeof result?.message === 'string' ? `: ${result.message.slice(0, 200)}` : '';
    throw new MaxBotApiError(`MAX отклонил настройку webhook, HTTP ${response.status}${detail}`, response.status, retryable);
  }

  return webhookUrl.toString();
}

export function verifyMaxWebhookSecret(actual: string | null, expected = process.env.MAX_WEBHOOK_SECRET): boolean {
  if (!expected || !actual) return false;
  const actualBuffer = Buffer.from(actual, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function getBotUsername(): string {
  const username = (process.env.MAX_BOT_USERNAME || '').trim().replace(/^@/, '');
  if (!/^[A-Za-z0-9_][A-Za-z0-9_-]{1,63}$/.test(username)) {
    throw new Error('MAX_BOT_USERNAME не настроен');
  }
  return username;
}

export function buildMaxBotLink(): string {
  return `https://max.ru/${getBotUsername()}`;
}

export function buildMaxMiniAppLink(payload: string): string {
  const username = getBotUsername();  if (!/^[A-Za-z0-9_-]{1,512}$/.test(payload)) {
    throw new Error('Некорректный payload Mini App');
  }
  return `https://max.ru/${username}?startapp=${payload}`;
}

function priceLabel(lead: LeadMessageData): string {
  if (['SUB', 'SUBSCRIPTION', 'PRO'].includes(lead.category.paymentMode)) return 'по подписке PRO';
  return lead.price > 0 ? `${lead.price.toFixed(2).replace(/\.00$/, '')} ₽` : 'бесплатно';
}

function keyboard(buttons: Array<{text: string, url: string}>): MaxMessagePayload['attachments'] {
  return [{
    type: 'inline_keyboard',
    payload: { buttons: buttons.map(b => [{ type: 'link', text: b.text, url: b.url }]) },
  }];
}

const MAP_REGEX = /(https?:\/\/(?:yandex\.(?:ru|com)\/maps|maps\.yandex\.(?:ru|com)|2gis\.(?:ru|com)|go\.2gis\.com|maps\.google|goo\.gl\/maps)[^\s]*)/gi;

function formatHiddenContacts(text: string): string {
  return text
    .replace(/\[контакт скрыт:phone\]/g, '📞 [КОНТАКТ СКРЫТ]')
    .replace(/\[контакт скрыт:link\]/g, '🔗 [ССЫЛКА СКРЫТА]')
    .replace(/\[контакт скрыт\]/g, '🔒 [КОНТАКТ СКРЫТ]');
}


/** Ограничиваем только сообщение MAX; полный текст остаётся доступен в приложении. */
function composeLeadMessage(header: string[], body: string, footer: string[]): string {
  const prefix = truncate(header.join('\n'), 900) + '\n\n';
  const suffix = '\n\n' + footer.join('\n');
  if (prefix.length + body.length + suffix.length <= MAX_MESSAGE_LIMIT) return prefix + body + suffix;
  const notice = '\n\nПоказан фрагмент. Полное объявление — в приложении.';
  const available = Math.max(0, MAX_MESSAGE_LIMIT - prefix.length - suffix.length - notice.length - 1);
  let excerpt = body.slice(0, available).replace(/[\uD800-\uDBFF]$/, '');
  const boundary = excerpt.lastIndexOf('\n');
  if (boundary > available * 0.65) excerpt = excerpt.slice(0, boundary);
  return prefix + excerpt.trimEnd() + '…' + notice + suffix;
}

export function buildLeadTeaserMessage(lead: LeadMessageData): MaxMessagePayload {
  const cleanedText = cleanLeadText(lead.rawText);
  const mapLinks = Array.from(new Set(cleanedText.match(MAP_REGEX) || []));
  const rawWithoutMaps = cleanedText.replace(MAP_REGEX, '').replace(/\n{3,}/g, '\n\n').trim();
  
  const title = formatHiddenContacts(truncate(redactContactInfo(buildLeadTitle(cleanedText, lead.title), true), 180));
  const description = formatHiddenContacts(redactContactInfo(rawWithoutMaps, true));
  
  const text = composeLeadMessage([
    title,
    '',
    '🗂️ Категория: ' + lead.category.name,
    '📍 Город: ' + (lead.city?.toUpperCase() === 'НЕ УКАЗАН' ? 'в тексте объявления' : lead.city),
  ], description, [
    'Доступ к контакту: ' + priceLabel(lead),
    'Контакт скрыт до получения лида.',
  ]);

  const buttons = [];
  if (mapLinks.length > 0) {
    buttons.push({ text: '🗺️ Карта объекта', url: mapLinks[0] });
  }
  buttons.push({ text: '[ ЗАБРАТЬ КОНТАКТ ]', url: buildMaxMiniAppLink(`lead_${lead.id}`) });

  return {
    text,
    attachments: keyboard(buttons),
    notify: true,
  };
}

export function buildPurchaseMessage(lead: LeadMessageData): MaxMessagePayload {
  const cleanedText = cleanLeadText(lead.rawText);
  const contacts = extractContactInfo(`${lead.title}\n${cleanedText}`);
  const mapLinks = Array.from(new Set(cleanedText.match(MAP_REGEX) || []));
  const rawWithoutMaps = cleanedText.replace(MAP_REGEX, '').replace(/\n{3,}/g, '\n\n').trim();

  const text = composeLeadMessage([
    '✅ Контакт получен',
    '',
    buildLeadTitle(cleanedText, lead.title),
    '🗂️ Категория: ' + lead.category.name,
    '📍 Город: ' + (lead.city?.toUpperCase() === 'НЕ УКАЗАН' ? 'в тексте объявления' : lead.city),
    'Доступ к контакту: ' + priceLabel(lead),
    ...(contacts.length > 0 ? ['Контакты: ' + contacts.join(', ')] : []),
  ], rawWithoutMaps, [
    'Лид сохранён в разделе «Мои лиды».',
  ]);

  const buttons = [];
  if (mapLinks.length > 0) {
    buttons.push({ text: '🗺️ Карта объекта', url: mapLinks[0] });
  }
  buttons.push({ text: 'Открыть мои лиды', url: buildMaxMiniAppLink(`purchase_${lead.id}`) });

  return {
    text,
    attachments: keyboard(buttons),
    notify: true,
  };
}

export function buildWelcomeMessage(): MaxMessagePayload {
  return {
    text: 'Добро пожаловать в «ПО ДЕЛАМ». Здесь будут приходить новые заказы по выбранным категориям и контакты купленных лидов.',
    attachments: keyboard([{ text: 'Открыть приложение', url: buildMaxMiniAppLink('home') }]),
    notify: true,
  };
}

export function buildCategorySubscribedMessage(categoryName: string): MaxMessagePayload {
  return {
    text: `Уведомления по категории «${truncate(categoryName, 100)}» включены. Новые заказы будут приходить в этот диалог без раскрытия контактов.`,
    attachments: keyboard([{ text: 'Открыть заказы', url: buildMaxMiniAppLink('home') }]),
    notify: true,
  };
}

export async function sendMaxMessage(
  recipientType: MaxRecipientType,
  recipientId: string,
  payload: MaxMessagePayload,
): Promise<string | null> {
  const token = (process.env.MAX_BOT_TOKEN || '').trim();
  if (!token) throw new MaxBotApiError('MAX_BOT_TOKEN не настроен', 503, true);
  const normalizedRecipientId = normalizeMaxNumericId(recipientId);
  if (!normalizedRecipientId) throw new MaxBotApiError('Некорректный MAX ID получателя', 400, false);
  if (!payload.text || payload.text.length > MAX_MESSAGE_LIMIT) {
    throw new MaxBotApiError('Некорректная длина сообщения MAX', 400, false);
  }

  const url = new URL('/messages', MAX_API_BASE_URL);
  url.searchParams.set(recipientType === 'USER' ? 'user_id' : 'chat_id', normalizedRecipientId);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new MaxBotApiError('MAX API временно недоступен', 503, true);
  }

  if (!response.ok) {
    const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
    throw new MaxBotApiError(`MAX API вернул HTTP ${response.status}`, response.status, retryable);
  }

  const result = await response.json().catch(() => null) as {
    message?: { body?: { mid?: string }; mid?: string; message_id?: string };
  } | null;
  return result?.message?.body?.mid || result?.message?.mid || result?.message?.message_id || null;
}
