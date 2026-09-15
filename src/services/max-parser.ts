import { spawn } from 'child_process';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { acquireParserLease, refreshParserLease, releaseParserLease } from '@/lib/parser-lease';
import {
  decryptProxyUrl,
  parserCooldown,
  persistParserSessionFile,
  safeParserError,
  sessionFileExists,
  synchronizeParserSessionFiles,
} from '@/lib/parser-accounts';
import { normalizeMaxChatUrl } from '@/lib/max-chat-url';
import { buildLeadTitle } from '@/lib/lead-title';
import { buildParserMessageFingerprint, isTechnicalParserMessage } from '@/lib/parser-message-policy';
import { parserPythonExecutable, parserPythonSpawnError } from '@/lib/python-runtime';
import { hasActionableLeadContact } from '@/lib/redact-contact';
import { hasOnlyExpiredLeadDates } from '@/lib/lead-date';
import { removeSourceChatLinks } from '@/lib/lead-source-link';
import { createLeadWithDeliveries } from './bot-outbox';
import { aiService, type ProcessedLead } from './ai';

type ParserAccount = {
  id: string;
  name: string;
  sessionFile: string;
  proxyUrl: string | null;
  consecutiveFailures: number;
};

type ParserChat = {
  targetId?: string;
  name: string;
  url: string;
  parseAll: boolean;
  lastRunLeadsCount: number | null;
  lastParsedAt: string | null;
};

type WorkerStatus = 'OK' | 'EMPTY' | 'AUTH_REQUIRED' | 'RATE_LIMITED' | 'PROXY_ERROR' | 'TIMEOUT' | 'ERROR';

type WorkerResult = {
  title: string | null;
  messages: Array<{ text: string; id?: string }>;
  source_chat: string;
  status: WorkerStatus;
  error?: string;
};

type LogEntry = { time: string, msg: string, type: 'info' | 'success' | 'error' };

type SyncResult = {
  success: boolean;
  skipped?: boolean;
  leadsCount: number;
  failedChats?: number;
  message?: string;
  logs: LogEntry[];
};

const MAX_UI_LOGS = 500;
const MAX_CHATS_CONFIG = 1000;

function pushLog(logs: LogEntry[], message: string, type: 'info' | 'success' | 'error' = 'info'): void {
  const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
  if (logs.length < MAX_UI_LOGS) logs.push({ time, msg: message.slice(0, 500), type });
}

function positiveIntEnv(name: string, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

async function withDbRetry<T>(operation: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const message = safeParserError(error).toLowerCase();
      const transient = ['connection terminated', 'connection timeout', 'tls', 'econnrefused', 'too many clients']
        .some((marker) => message.includes(marker));
      if (!transient || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
    }
  }
  throw lastError;
}

/** Вычитает рабочие минуты, исключая 23:00–07:00 по Москве. */
function businessCutoff(nowMs: number, ttlMinutes: number): Date {
  const moscowOffsetMs = 3 * 60 * 60 * 1000;
  const cursor = new Date(nowMs + moscowOffsetMs);
  let remaining = Math.max(1, Math.min(30 * 24 * 60, ttlMinutes));

  while (remaining > 0) {
    const hour = cursor.getUTCHours();
    if (hour >= 23) {
      cursor.setUTCHours(22, 59, 59, 999);
      continue;
    }
    if (hour < 7) {
      cursor.setUTCDate(cursor.getUTCDate() - 1);
      cursor.setUTCHours(22, 59, 59, 999);
      continue;
    }
    const dayStart = new Date(cursor);
    dayStart.setUTCHours(7, 0, 0, 0);
    const available = Math.max(1, Math.floor((cursor.getTime() - dayStart.getTime()) / 60_000));
    const step = Math.min(remaining, available);
    cursor.setTime(cursor.getTime() - step * 60_000);
    remaining -= step;
    if (remaining > 0 && cursor.getTime() <= dayStart.getTime()) {
      cursor.setUTCDate(cursor.getUTCDate() - 1);
      cursor.setUTCHours(22, 59, 59, 999);
    }
  }
  return new Date(cursor.getTime() - moscowOffsetMs);
}

async function cleanupExpiredLeads(logs: LogEntry[]): Promise<void> {
  try {
    const categories = await prisma.category.findMany({ select: { id: true, ttlMinutes: true } });
    let deleted = 0;
    for (const category of categories) {
      const result = await prisma.lead.updateMany({
        where: {
          categoryId: category.id,
          status: { in: ['NEW', 'SPAM'] },
          createdAt: { lt: businessCutoff(Date.now(), category.ttlMinutes || 1440) },
        },
        data: {
          status: 'ARCHIVED',
          deletedAt: new Date(),
        }
      });
      deleted += result.count;
    }
    pushLog(logs, `Удалено устаревших лидов: ${deleted}`);
  } catch (error) {
    console.error('[PARSER] Ошибка очистки:', safeParserError(error));
    pushLog(logs, 'Очистка старых лидов временно недоступна');
  }
}

function parseChats(value: string | undefined): ParserChat[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value || '[]');
  } catch {
    throw new Error('Конфигурация чатов содержит некорректный JSON');
  }
  if (!Array.isArray(parsed)) throw new Error('Конфигурация чатов должна быть массивом');
  return parsed.slice(0, MAX_CHATS_CONFIG).flatMap((item): ParserChat[] => {
    const source = typeof item === 'string' ? { url: item } : item;
    if (!source || typeof source !== 'object') return [];
    const candidate = source as Record<string, unknown>;
    const url = typeof candidate.url === 'string' ? candidate.url.trim() : '';
    if (!url) return [];
    return [{
      name: typeof candidate.name === 'string' && candidate.name.trim()
        ? candidate.name.trim().slice(0, 100)
        : 'Новый чат',
      url,
      parseAll: typeof candidate.parseAll === 'boolean' ? candidate.parseAll : true,
      lastRunLeadsCount: typeof candidate.lastRunLeadsCount === 'number' && Number.isInteger(candidate.lastRunLeadsCount) && candidate.lastRunLeadsCount >= 0
        ? candidate.lastRunLeadsCount
        : null,
      lastParsedAt: typeof candidate.lastParsedAt === 'string' ? candidate.lastParsedAt : null,
    }];
  });
}

function mergeTargetChats(
  legacyValue: string | undefined,
  targets: Array<{ id: string; url: string; name: string | null; parseAll: boolean }>,
): ParserChat[] {
  const merged = new Map<string, ParserChat>();
  for (const chat of parseChats(legacyValue)) {
    try { merged.set(normalizeMaxChatUrl(chat.url), chat); } catch { merged.set(chat.url, chat); }
  }
  for (const target of targets) {
    try {
      const url = normalizeMaxChatUrl(target.url);
      const previous = merged.get(url);
      merged.set(url, {
        targetId: target.id,
        name: target.name || previous?.name || 'Новый чат',
        url,
        parseAll: target.parseAll,
        lastRunLeadsCount: previous?.lastRunLeadsCount ?? null,
        lastParsedAt: previous?.lastParsedAt || null,
      });
    } catch {
      // Невалидная запись остаётся в БД для ручной проверки, но не запускается.
    }
  }
  return [...merged.values()].slice(0, MAX_CHATS_CONFIG);
}

async function loadAccounts(logs: LogEntry[]): Promise<ParserAccount[]> {
  await synchronizeParserSessionFiles();
  const rows = await prisma.maksAccount.findMany({
    where: {
      active: true,
      status: { in: ['ACTIVE', 'COOLDOWN', 'PROXY_ERROR'] },
      OR: [{ cooldownUntil: null }, { cooldownUntil: { lte: new Date() } }],
    },
    orderBy: [{ lastUsed: 'asc' }, { createdAt: 'asc' }],
  });
  const accounts: ParserAccount[] = [];
  for (const row of rows) {
    const sessionId = row.sessionFile.replace(/\.json$/i, '');
    if (!(await sessionFileExists(sessionId))) {
      await prisma.maksAccount.update({
        where: { id: row.id },
        data: { active: false, status: 'AUTH_REQUIRED', lastError: 'Файл сессии отсутствует', lastErrorAt: new Date() },
      });
      continue;
    }
    try {
      accounts.push({
        id: row.id,
        name: row.name,
        sessionFile: row.sessionFile,
        proxyUrl: decryptProxyUrl(row.proxyString),
        consecutiveFailures: row.consecutiveFailures,
      });
    } catch (error) {
      await prisma.maksAccount.update({
        where: { id: row.id },
        data: { status: 'PROXY_ERROR', lastError: safeParserError(error), lastErrorAt: new Date() },
      });
    }
  }
  pushLog(logs, `Готово аккаунтов: ${accounts.length}`);
  return accounts;
}

function cleanMessageText(text: string, chatTitle: string): string {
  let result = text.trim();
  if (chatTitle.length > 5) {
    const escaped = chatTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`^${escaped}\\s*\\n*`, 'i'), '').trim();
  }
  result = result.replace(/^(Пересланное сообщение:|Forwarded message:|Переслано от:|Переслано:|Forwarded from:)\s*\n*.+?\n+/i, '').trim();
  const lines = result.split('\n');
  if (lines.length > 1) {
    const first = lines[0].toLowerCase();
    const words = ['работа', 'ваканси', 'подработк', 'халтур', 'шабашк', 'каждый час', 'москва', 'спб', 'питер', 'жилье', 'область', 'тюмень', 'вахта'];
    if (words.filter((word) => first.includes(word)).length >= 3) {
      lines.shift();
      result = lines.join('\n').trim();
    }
  }
  return result;
}

async function resolveCategory(categoryValue: unknown) {
  const value = String(categoryValue || 'other').trim().slice(0, 100);
  const existing = await withDbRetry(() => prisma.category.findFirst({
    where: { OR: [{ slug: value }, { slug: value.toLowerCase() }, { name: value }] },
  }));
  if (existing) return existing;
  const fallback = await withDbRetry(() => prisma.category.findFirst({
    where: { OR: [{ slug: 'other' }, { name: { in: ['Другое', 'Прочее', 'Other'] } }] },
  }));
  if (fallback) return fallback;
  return withDbRetry(() => prisma.category.upsert({
    where: { slug: 'other' },
    update: {},
    create: { name: 'Другое', slug: 'other', leadPrice: 50 },
  }));
}

async function parserMessageWasProcessed(fingerprint: string): Promise<boolean> {
  const [lead, seen] = await withDbRetry(() => Promise.all([
    prisma.lead.findUnique({ where: { fingerprint }, select: { id: true } }),
    prisma.parserSeenMessage.findUnique({ where: { fingerprint }, select: { fingerprint: true } }),
  ]));
  return Boolean(lead || seen);
}

async function rememberFilteredMessage(
  fingerprint: string,
  chatUrl: string,
  messageId: string | undefined,
): Promise<void> {
  await withDbRetry(() => prisma.parserSeenMessage.upsert({
    where: { fingerprint },
    update: {},
    create: {
      fingerprint,
      sourceChat: chatUrl,
      messageId: messageId?.trim().slice(0, 200) || null,
    },
  }));
}

async function processMessage(
  message: { text: string; id?: string },
  chatUrl: string,
  chatTitle: string,
  parseAll: boolean,
  logs: LogEntry[],
): Promise<boolean> {
  try {
    const original = message.text.replace(/\u0000/g, '').trim();
    if (isTechnicalParserMessage(original)) {
      pushLog(logs, 'Сообщение пропущено: пустое, удалённое или служебное');
      return false;
    }
    const fingerprint = buildParserMessageFingerprint(chatUrl, message.id, original);
    if (await parserMessageWasProcessed(fingerprint)) return false;

    let processed: ProcessedLead | null = null;
    let stableText: string;

    if (parseAll) {
      // В режиме «Все» анализ используется только для метаданных и не может отклонить сообщение.
      stableText = original;
      try {
        processed = await aiService.processLead(stableText);
      } catch (error) {
        pushLog(logs, `Обогащение сообщения недоступно, используется категория «Другое»: ${safeParserError(error)}`);
      }
    } else {
      // Проверенный конвейер целевых лидов: качество, срок, контакт, плюс/минус и антиспам.
      if (original.length <= 15 || original.length >= 2000 || /^\p{L}+$/u.test(original)) {
        await rememberFilteredMessage(fingerprint, chatUrl, message.id);
        return false;
      }
      const cleaned = removeSourceChatLinks(cleanMessageText(original, chatTitle), chatUrl);
      if (cleaned.length <= 15) {
        await rememberFilteredMessage(fingerprint, chatUrl, message.id);
        return false;
      }
      if (hasOnlyExpiredLeadDates(cleaned)) {
        pushLog(logs, 'Сообщение пропущено: все указанные даты уже прошли');
        await rememberFilteredMessage(fingerprint, chatUrl, message.id);
        return false;
      }
      if (!hasActionableLeadContact(cleaned)) {
        pushLog(logs, 'Сообщение пропущено: отсутствует телефон или ссылка для связи');
        await rememberFilteredMessage(fingerprint, chatUrl, message.id);
        return false;
      }

      processed = await aiService.processLead(cleaned);
      if (processed.isSpam) {
        await rememberFilteredMessage(fingerprint, chatUrl, message.id);
        return false;
      }
      if (processed.score < 30) {
        await rememberFilteredMessage(fingerprint, chatUrl, message.id);
        return false;
      }
      stableText = removeSourceChatLinks(String(processed.cleanedText || cleaned).trim(), chatUrl);
    }

    const category = await resolveCategory(processed?.category || 'other');
    
    const duplicate = await withDbRetry(() => prisma.lead.findFirst({
      where: {
        OR: [
          { fingerprint },
          { rawText: original, sourceChat: chatUrl },
        ],
      },
      select: { id: true },
    }));
    
    if (duplicate) {
      return false;
    }

    await withDbRetry(() => createLeadWithDeliveries({
      title: buildLeadTitle(stableText, processed?.title).slice(0, 200),
      rawText: stableText,
      city: String(processed?.city || 'Не указан').slice(0, 100),
      categoryId: category.id,
      sourceChat: chatUrl,
      fingerprint,
      allowContactless: parseAll,
      score: parseAll ? 100 : Math.min(100, Math.max(0, processed?.score || 50)),
      price: category.leadPrice ?? 100,
      status: 'NEW',
    }, stableText));
    return true;
  } catch (error) {
    console.error('[PARSER] Ошибка сообщения:', safeParserError(error));
    pushLog(logs, `Сообщение пропущено: ${safeParserError(error)}`);
    return false;
  }
}

async function recordAccountResult(account: ParserAccount, worker: WorkerResult): Promise<void> {
  const now = new Date();
  if (worker.status === 'OK' || worker.status === 'EMPTY') {
    account.consecutiveFailures = 0;
    await prisma.maksAccount.update({
      where: { id: account.id },
      data: {
        active: true,
        status: 'ACTIVE',
        lastUsed: now,
        lastSuccessAt: now,
        cooldownUntil: null,
        consecutiveFailures: 0,
        totalRuns: { increment: 1 },
        lastError: null,
      },
    });
    return;
  }
  const failures = account.consecutiveFailures + 1;
  account.consecutiveFailures = failures;
  const status = worker.status === 'AUTH_REQUIRED'
    ? 'AUTH_REQUIRED'
    : worker.status === 'PROXY_ERROR' ? 'PROXY_ERROR' : 'COOLDOWN';
  await prisma.maksAccount.update({
    where: { id: account.id },
    data: {
      active: worker.status !== 'AUTH_REQUIRED',
      status,
      lastUsed: now,
      lastErrorAt: now,
      cooldownUntil: parserCooldown(failures, worker.status),
      consecutiveFailures: failures,
      totalRuns: { increment: 1 },
      totalErrors: { increment: 1 },
      lastError: safeParserError(worker.error || worker.status),
    },
  });
}

function failedWorker(chatUrl: string, status: WorkerStatus, error: unknown): WorkerResult {
  return { title: null, messages: [], source_chat: chatUrl, status, error: safeParserError(error) };
}

async function runPlaywrightParse(chatUrl: string, account: ParserAccount): Promise<WorkerResult> {
  return new Promise((resolve) => {
    const scriptPath = path.join(process.cwd(), 'scripts', 'parser_worker.py');
    const sessionId = account.sessionFile.replace(/\.json$/i, '');
    const timeoutMs = positiveIntEnv('PARSER_WORKER_TIMEOUT_MS', 120_000, 30_000, 300_000);
    const outputLimit = 2 * 1024 * 1024;
    let stdout = '';
    let stderr = '';
    let finished = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const child = spawn(parserPythonExecutable(), [scriptPath, sessionId, chatUrl], {
      cwd: process.cwd(),
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PARSER_PROXY_URL: account.proxyUrl || 'direct',
        PARSER_SESSIONS_DIR: process.env.PARSER_SESSIONS_DIR || path.join(process.cwd(), 'sessions'),
      },
    });

    const finish = (value: WorkerResult) => {
      if (finished) return;
      finished = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      resolve(value);
    };
    const collect = (target: 'stdout' | 'stderr', chunk: Buffer | string) => {
      const current = target === 'stdout' ? stdout : stderr;
      const next = current + (typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
      if (next.length > outputLimit) {
        child.kill('SIGTERM');
        finish(failedWorker(chatUrl, 'ERROR', `Превышен лимит ${target}`));
        return;
      }
      if (target === 'stdout') stdout = next;
      else stderr = next;
    };
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => collect('stdout', chunk));
    child.stderr.on('data', (chunk: string) => collect('stderr', chunk));
    child.once('error', (error) => finish(failedWorker(chatUrl, 'ERROR', parserPythonSpawnError(error))));
    child.once('close', (code) => {
      if (finished) return;
      if (code !== 0) {
        finish(failedWorker(chatUrl, 'ERROR', stderr || `Worker завершился с кодом ${code}`));
        return;
      }
      try {
        const line = stdout.trim().split(/\r?\n/).reverse().find((candidate) => candidate.trim().startsWith('{'));
        if (!line) throw new Error('Worker не вернул JSON');
        const parsed = JSON.parse(line) as Partial<WorkerResult>;
        const statuses = new Set<WorkerStatus>(['OK', 'EMPTY', 'AUTH_REQUIRED', 'RATE_LIMITED', 'PROXY_ERROR', 'TIMEOUT', 'ERROR']);
        if (!parsed.status || !statuses.has(parsed.status) || !Array.isArray(parsed.messages)) {
          throw new Error('Worker вернул некорректную структуру');
        }
        const messages = parsed.messages
          .filter((item): item is { text: string; id?: string } => Boolean(item && typeof item.text === 'string'))
          .slice(-100);
        finish({
          title: typeof parsed.title === 'string' ? parsed.title.slice(0, 200) : null,
          messages,
          source_chat: chatUrl,
          status: parsed.status,
          error: typeof parsed.error === 'string' ? safeParserError(parsed.error) : undefined,
        });
      } catch (error) {
        finish(failedWorker(chatUrl, 'ERROR', error));
      }
    });
    timeoutHandle = setTimeout(() => {
      child.kill('SIGTERM');
      finish(failedWorker(chatUrl, 'TIMEOUT', `Worker превысил ${timeoutMs} мс`));
    }, timeoutMs);
  });
}

async function saveChats(chats: ParserChat[]): Promise<void> {
  const legacyChats = chats.filter((chat) => !chat.targetId).map((chat) => ({
    name: chat.name,
    url: chat.url,
    parseAll: chat.parseAll,
    lastRunLeadsCount: chat.lastRunLeadsCount,
    lastParsedAt: chat.lastParsedAt,
  }));
  await prisma.setting.upsert({
    where: { key: 'maks_parsing_chats' },
    update: { value: JSON.stringify(legacyChats) },
    create: { key: 'maks_parsing_chats', value: JSON.stringify(legacyChats) },
  });
}

async function syncWithoutLease(leaseToken: string): Promise<SyncResult> {
  const logs: LogEntry[] = [];
  let leadsCount = 0;
  let failedChats = 0;
  try {
    await cleanupExpiredLeads(logs);
    const [accounts, chatsSetting, cursorSetting, targetChats] = await Promise.all([
      loadAccounts(logs),
      prisma.setting.findUnique({ where: { key: 'maks_parsing_chats' } }),
      prisma.setting.findUnique({ where: { key: 'maks_parser_cursor' } }),
      prisma.targetChat.findMany({
        where: { active: true, status: 'ACTIVE' },
        select: { id: true, url: true, name: true, parseAll: true },
        orderBy: { lastDiscoveredAt: 'desc' },
        take: MAX_CHATS_CONFIG,
      }),
    ]);
    const chats = mergeTargetChats(chatsSetting?.value, targetChats);
    const totalAccounts = await prisma.maksAccount.count({ where: { active: true } });
    if (accounts.length === 0) {
      if (totalAccounts > 0) return { success: false, leadsCount: 0, message: 'Все аккаунты на паузе (cooldown)', logs };
      return { success: false, leadsCount: 0, message: 'Нет активных аккаунтов', logs };
    }
    if (chats.length === 0) return { success: false, leadsCount: 0, message: 'Список чатов пуст', logs };

    const maxPerCycle = positiveIntEnv('PARSER_MAX_CHATS_PER_CYCLE', 100, 1, 500);
    const rawCursor = Number.parseInt(cursorSetting?.value || '0', 10);
    const cursor = Number.isFinite(rawCursor) ? Math.max(0, rawCursor) % chats.length : 0;
    const selected = Array.from({ length: Math.min(maxPerCycle, chats.length) }, (_, offset) => ({
      index: (cursor + offset) % chats.length,
      chat: chats[(cursor + offset) % chats.length],
    }));
    let accountIndex = 0;

    for (const item of selected) {
      if (accounts.length === 0) break;
      const originalUrl = item.chat.url;
      let chatUrl: string;
      try {
        chatUrl = normalizeMaxChatUrl(originalUrl);
      } catch (error) {
        failedChats += 1;
        pushLog(logs, `[${item.chat.name}] Небезопасная ссылка: ${safeParserError(error)}`);
        continue;
      }
      if (chatUrl !== originalUrl) item.chat.url = chatUrl;

      let worker: WorkerResult | null = null;
      const maxAccountAttempts = Math.min(2, accounts.length);
      for (let attempt = 0; attempt < maxAccountAttempts && accounts.length > 0; attempt += 1) {
        accountIndex %= accounts.length;
        const account = accounts[accountIndex];
        await refreshParserLease(leaseToken);
        worker = await runPlaywrightParse(chatUrl, account);
        try {
          await persistParserSessionFile(account.id, account.sessionFile.replace(/\.json$/i, ''));
        } catch (error) {
          worker = failedWorker(chatUrl, 'ERROR', `Сессия MAX не сохранена в БД: ${safeParserError(error)}`);
        }
        await recordAccountResult(account, worker);
        if (worker.status === 'OK' || worker.status === 'EMPTY') {
          accountIndex = (accountIndex + 1) % accounts.length;
          break;
        }
        pushLog(logs, `[${item.chat.name}] ${account.name}: ${worker.status}${worker.error ? ` (${worker.error})` : ''}`);
        accounts.splice(accountIndex, 1);
        worker = null;
      }

      if (!worker) {
        failedChats += 1;
        if (item.chat.targetId) {
          await prisma.targetChat.update({
            where: { id: item.chat.targetId },
            data: { lastCheckedAt: new Date(), lastError: 'Не удалось проверить чат активными аккаунтами' },
          });
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
        continue;
      }
        let parsedTitle = worker.status === 'OK' && worker.messages.length > 0 ? worker.title : null;
        if (parsedTitle && (/непрочитан/i.test(parsedTitle) || /сообщен/i.test(parsedTitle))) {
          parsedTitle = null;
        }
        const title = parsedTitle || item.chat.name;
        if (item.chat.targetId && parsedTitle && parsedTitle !== item.chat.name) {
          await prisma.targetChat.update({
            where: { id: item.chat.targetId },
            data: { name: title.slice(0, 100) },
          }).catch(() => {});
        }

      let chatLeads = 0;
      for (const message of worker.messages) {
        if (await processMessage(message, chatUrl, title, item.chat.parseAll, logs)) {
          leadsCount += 1;
          chatLeads += 1;
        }
      }
      item.chat.name = title.slice(0, 100);
      item.chat.lastRunLeadsCount = chatLeads;
      item.chat.lastParsedAt = new Date().toISOString();
      if (item.chat.targetId) {
        await prisma.targetChat.update({
          where: { id: item.chat.targetId },
          data: {
            name: item.chat.name,
            lastCheckedAt: new Date(),
            lastError: worker.status === 'EMPTY' ? worker.error || 'Сообщения в чате не найдены' : null,
          },
        });
      }
      const workerDetail = worker.status === 'EMPTY' && worker.error ? `; ${worker.error}` : '';
      pushLog(logs, `[${item.chat.name}] сообщений: ${worker.messages.length}, новых лидов: ${chatLeads}${workerDetail}`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    await saveChats(chats);
    const nextCursor = (cursor + selected.length) % chats.length;
    await prisma.setting.upsert({
      where: { key: 'maks_parser_cursor' },
      update: { value: String(nextCursor) },
      create: { key: 'maks_parser_cursor', value: String(nextCursor) },
    });
    pushLog(logs, `Готово. Лидов: ${leadsCount}; ошибок чатов: ${failedChats}`);
    if (failedChats > 0) {
      const errorLog = logs.slice().reverse().find(l => l.msg.includes('ERROR') || l.msg.includes('TIMEOUT') || l.msg.includes('PROXY') || l.msg.includes('AUTH') || l.msg.includes('Ошибка'));
      const msg = errorLog ? errorLog.msg.slice(0, 500) : `Сбой в ${failedChats} чатах.`;
      return { success: false, leadsCount, failedChats, message: msg, logs };
    }
    return { success: true, leadsCount, failedChats, logs };
  } catch (error) {
    const message = safeParserError(error);
    console.error('[PARSER] Фатальная ошибка:', message);
    pushLog(logs, `Ошибка: ${message}`);
    return { success: false, leadsCount, failedChats, message, logs };
  }
}

export const maxParser = {
  sync: async (): Promise<SyncResult> => {
    const leaseToken = await acquireParserLease();
    if (!leaseToken) {
      return { success: true, skipped: true, leadsCount: 0, logs: [{ time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }), msg: 'Парсер уже выполняется другим процессом', type: 'info' }] };
    }
    let leaseResult = 'ERROR';
    try {
      const result = await syncWithoutLease(leaseToken);
      leaseResult = result.success ? `SUCCESS:${result.leadsCount}` : `FAILED:${result.message || result.failedChats || 0}`;
      return result;
    } finally {
      await releaseParserLease(leaseToken, leaseResult);
    }
  },
};
