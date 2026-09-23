import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './helpers/load-ts.mjs';
import * as categoryRules from '../src/lib/lead-category.ts';
import * as titles from '../src/lib/lead-title.ts';
import * as contacts from '../src/lib/redact-contact.ts';
import * as dates from '../src/lib/lead-date.ts';
import * as sourceLinks from '../src/lib/lead-source-link.ts';
import * as messagePolicy from '../src/lib/parser-message-policy.ts';
import * as content from '../src/lib/lead-content.ts';
import * as moderation from '../src/lib/lead-moderation.ts';

const rules = [{ id: 'cleaning', slug: 'cleaning', name: 'Уборка', active: true, plusKeywords: 'уборщица, уборка', minusKeywords: 'обучение', leadPrice: 100 }];

function harness({ categories = rules, aiFailure = false, processed = null } = {}) {
  const leads = [];
  const seen = new Set();
  const prisma = {
    setting: { findUnique: async () => null },
    category: {
      findMany: async ({ where }) => categories.filter(category => !where.active || category.active),
      findFirst: async ({ where }) => categories.find(category => where.OR.some(rule => rule.slug === category.slug || rule.name === category.name)) || null,
      upsert: async () => ({ id: 'other', leadPrice: 50 }),
    },
    lead: { findUnique: async ({ where }) => leads.find(lead => lead.fingerprint === where.fingerprint) || null, findFirst: async () => null },
    parserSeenMessage: {
      findUnique: async ({ where }) => seen.has(where.fingerprint) ? { fingerprint: where.fingerprint } : null,
      upsert: async ({ where }) => { seen.add(where.fingerprint); return where; },
    },
  };
  const { aiService } = loadTs('src/services/ai.ts', {
    '@/lib/prisma': { prisma }, '@/lib/lead-category': categoryRules, '@/lib/lead-title': titles,
    '@/lib/redact-contact': contacts, '@/lib/lead-content': content, '@/lib/lead-moderation': moderation,
  });
  const api = loadTs('src/services/max-parser.ts', {
    './lead-media': { photoCaptureEnvironment: async () => ({ PARSER_CAPTURE_PHOTOS: '0' }) },
    './themed-message-processor': { selectMessageProcessor: async legacy => legacy },
    '@/lib/prisma': { prisma }, '@/lib/parser-lease': {},
    '@/lib/parser-accounts': { safeParserError: error => String(error) },
    '@/lib/max-chat-url': {}, '@/lib/lead-title': titles, '@/lib/parser-message-policy': messagePolicy,
    '@/lib/python-runtime': {}, '@/lib/redact-contact': contacts, '@/lib/lead-date': dates,
    '@/lib/lead-source-link': sourceLinks,
    './bot-outbox': { createLeadWithDeliveries: async lead => { leads.push(lead); } },
    './ai': { aiService: { processLead: text => {
      if (aiFailure) throw new Error('Тестовая недоступность анализа');
      return processed || aiService.processLead(text);
    } } },
  }, 'export const processMessageForTest = processMessage;');
  const logs = [];
  return { leads, seen, logs, run: (text, parseAll = false, id = 'message-1') => api.processMessageForTest({ text, id }, 'https://max.ru/test_source', 'Тестовый чат', parseAll, logs) };
}

test('Целевые: совпавшая заявка сохраняется один раз и передаётся в доставку', async () => {
  const app = harness();
  const text = 'Требуется уборщица в офис, контакт +7 999 123-45-67';
  assert.equal(await app.run(text), true);
  assert.equal(await app.run(text), false);
  assert.equal(app.leads.length, 1);
  assert.equal(app.leads[0].categoryId, 'cleaning');
  assert.equal(app.leads[0].allowContactless, false);
});

test('исходные Целевые: отсутствие совпадения категории само по себе не отклоняет качественную заявку', async () => {
  for (const [text, options] of [
    ['Требуется фотограф на мероприятие, контакт +7 999 123-45-67', {}],
    ['Требуется уборщица, обучение обязательно, контакт +7 999 123-45-67', {}],
    ['Требуется уборщица в офис, контакт +7 999 123-45-67', { categories: rules.map(rule => ({ ...rule, active: false })) }],
    ['Требуется уборщица в офис, контакт +7 999 123-45-67', { categories: [] }],
  ]) {
    const app = harness(options);
    assert.equal(await app.run(text), true);
    assert.equal(app.leads.length, 1);
    assert.equal(app.leads[0].categoryId, 'other');
    assert.equal(app.seen.size, 0);
  }
});

test('Все: отсутствие категории, контакта, низкая оценка и ошибка анализа не препятствуют сохранению', async () => {
  for (const options of [{}, { aiFailure: true }, { processed: { category: 'other', categoryMatched: false, isSpam: true, score: 0 } }]) {
    const app = harness(options);
    const text = 'Фотографии с городского праздника';
    assert.equal(await app.run(text, true), true);
    assert.equal(app.leads[0].rawText, text);
    assert.equal(app.leads[0].allowContactless, true);
    assert.equal(await app.run(text, true), false);
    assert.equal(app.leads.length, 1);
  }
});

test('Целевые сохраняют проверки контактов, антиспама и оценки; Все отбрасывают служебные сообщения', async () => {
  const noContact = harness();
  assert.equal(await noContact.run('Требуется уборщица в офис без указанных контактов'), false);
  for (const processed of [{ isSpam: true, score: 80 }, { isSpam: false, score: 10 }]) {
    const app = harness({ processed: { ...processed, category: 'cleaning', categoryMatched: true } });
    assert.equal(await app.run('Требуется уборщица в офис +7 999 123-45-67'), false);
    assert.equal(app.leads.length, 0);
  }
  const all = harness();
  assert.equal(await all.run('Сообщение удалено', true), false);
  assert.equal(all.leads.length, 0);
});
