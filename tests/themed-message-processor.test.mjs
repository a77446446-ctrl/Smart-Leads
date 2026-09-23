import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './helpers/load-ts.mjs';
import * as identity from '../src/lib/lead-identity.ts';
import * as contacts from '../src/lib/redact-contact.ts';
import * as dates from '../src/lib/lead-date.ts';
import * as sourceLinks from '../src/lib/lead-source-link.ts';

const rules = [
  { id: 'sport', slug: 'sport', name: 'Спорт', active: true, plusKeywords: 'футбол, турнир', minusKeywords: 'ставки', leadPrice: 100 },
  { id: 'auto', slug: 'auto', name: 'Авто', active: true, plusKeywords: 'автомобиль', minusKeywords: '', leadPrice: 200 },
];
async function harness({ theme = 'news', categories = rules, aiFails = false, settingFails = false, writeFails = false, race = false, photoFails = false, seen = false } = {}) {
  const saved = [];
  const attachments = [];
  const discarded = [];
  const delivered = [];
  const logs = [];
  let analysisCount = 0;
  const insert = async ({ data }) => {
    if (race) throw { code: 'P2002' };
    if (writeFails) throw new Error('Ошибка базы');
    const row = { id: `lead-${saved.length}`, ...data }; saved.push(row); return row;
  };
  const prisma = {
    parserSeenMessage: { findUnique: async () => seen ? { fingerprint: 'seen' } : null },
    setting: { findUnique: async () => { if (settingFails) throw new Error('Ошибка настроек'); return theme === null ? null : { value: theme }; } },
    category: { findMany: async () => categories.filter(c => c.active), upsert: async () => ({ id: 'other', slug: 'other', leadPrice: 50 }) },
    lead: { findFirst: async ({ where }) => saved.find(row => where.OR.some(condition => Object.entries(condition).every(([key, value]) => row[key] === value))) ?? null, create: insert },
  };
  const processor = loadTs('src/services/themed-message-processor.ts', {
    '@/lib/lead-media': loadTs('src/lib/lead-media.ts', {}),
    './lead-media': { attachLeadPhotos: async (id, message) => { if (photoFails) throw new Error('Нет места'); attachments.push({ id, photos: message.photos }); }, discardStagedPhotos: async message => discarded.push(message) },
    '@/lib/prisma': { prisma }, '@/lib/application-theme': loadTs('src/lib/application-theme.ts', {}),
    '@/lib/lead-category': loadTs('src/lib/lead-category.ts', {}),
    '@/lib/parser-message-policy': loadTs('src/lib/parser-message-policy.ts', {}),
    '@/lib/lead-identity': identity,
    '@/lib/redact-contact': contacts,
    '@/lib/lead-date': dates,
    '@/lib/lead-source-link': sourceLinks,
    '@/lib/publication-policy': loadTs('src/lib/publication-policy.ts', {}),
    '@/lib/parser-accounts': { safeParserError: String },
    './ai': { aiService: { processLead: async () => { analysisCount++; if (aiFails) throw new Error('Анализ недоступен'); return { city: 'Ростов-на-Дону', category: 'auto', isSpam: false, score: 80 }; } } },
    './bot-outbox': { createLeadWithDeliveries: async data => { delivered.push(data); return insert({ data }); } },
  });
  const legacy = async () => 'legacy';
  const run = await processor.selectMessageProcessor(legacy);
  return { run: (text, all = false, id = '1', photos = []) => run({ text, id, photos }, 'https://max.ru/source', 'Источник', all, logs), selected: run, legacy, saved, delivered, logs, attachments, discarded, analysisCount: () => analysisCount };
}

test('без темы используется тот же старый обработчик; ошибки настройки не включают другой режим', async () => {
  const h = await harness({ theme: null });
  assert.equal(h.selected, h.legacy);
  await assert.rejects(harness({ theme: 'broken' }), /Неизвестная тема/);
  await assert.rejects(harness({ settingFails: true }), /Ошибка настроек/);
});

test('новость без контакта проходит строгую рубрику, а категория ИИ не заменяет совпадение слов', async () => {
  const h = await harness();
  assert.equal(await h.run('Сегодня футбольный турнир'), true);
  assert.equal(h.saved[0].categoryId, 'sport');
  assert.equal(h.saved[0].accessMode, 'PUBLIC');
  assert.equal(h.saved[0].publicationTheme, 'news');
  assert.equal(h.saved[0].price, 0);
  assert.equal(h.saved[0].allowContactless, true);
  assert.equal(h.delivered.length, 0);
  assert.equal(h.saved[0].rawText, 'Сегодня футбольный турнир');
});

test('целевые отклоняют минус, отсутствие плюса и выключенные рубрики до анализа', async () => {
  for (const options of [{}, { categories: [] }, { categories: rules.map(c => ({ ...c, active: false })) }]) {
    const h = await harness(options);
    assert.equal(await h.run('Ставки на футбол'), false);
    assert.equal(await h.run('Погода на завтра'), false);
    assert.equal(h.saved.length, 0);
    assert.equal(h.analysisCount(), 0);
  }
});

test('всё сохраняет несовпавший текст в Другое и переживает ошибку анализа', async () => {
  const h = await harness({ aiFails: true });
  assert.equal(await h.run('Погода на завтра', true), true);
  assert.equal(h.saved[0].categoryId, 'other');
  assert.equal(h.saved[0].city, 'Не указан');
  assert.equal(h.saved[0].price, 0);
  assert.equal(await h.run('Сообщение удалено', true, '2'), false);
});

test('новости, события и отдам даром принимают совпадения при недоступном ИИ', async () => {
  for (const theme of ['news', 'events', 'free']) {
    const h = await harness({ theme, aiFails: true });
    assert.equal(await h.run('Футбол'), true);
    assert.equal(h.saved[0].accessMode, 'PUBLIC');
  }
});

test('повторный сбор и гонка уникального индекса не создают дубль; ошибка записи не считается успехом', async () => {
  const h = await harness();
  assert.equal(await h.run('Футбольный турнир'), true);
  assert.equal(await h.run('Футбольный турнир'), false);
  assert.equal(await h.run('Футбольный турнир', true, '2'), false);
  assert.equal(h.saved.length, 1);
  assert.equal(await (await harness({ race: true })).run('Футбол'), false);
  const failed = await harness({ writeFails: true });
  assert.equal(await failed.run('Футбол'), false);
  assert.equal(failed.logs.at(-1).type, 'error');
});

test('платные темы сохраняют контактный доступ и прежнюю очередь доставки', async () => {
  const h = await harness({ theme: 'orders' });
  assert.equal(await h.run('Требуется организатор футбольного турнира'), false);
  assert.equal(await h.run('Требуется организатор футбольного турнира +79991234567', false, '2'), true);
  assert.equal(h.saved[0].accessMode, 'CONTACT');
  assert.equal(h.saved[0].price, 100);
  assert.equal(h.delivered.length, 1);
  const all = await harness({ theme: 'orders', aiFails: true });
  assert.equal(await all.run('Публикация без контакта', true), true);
  assert.equal(all.saved[0].accessMode, 'CONTACT');
});

test('фотографии следуют настройке категории; срок бесплатной публикации не затрагивает платные лиды', async () => {
  const h = await harness({ categories: rules.map(rule => ({ ...rule, capturePhotos: rule.id === 'auto', ttlMinutes: 180 })) });
  const photos = [{ key: 'photo', mimeType: 'image/jpeg' }];
  const before = Date.now();
  assert.equal(await h.run('Автомобиль на выставке', false, '1', photos), true);
  assert.equal(await h.run('Футбольный турнир', false, '2', photos), true);
  assert.equal(h.attachments.length, 1);
  assert.deepEqual(h.attachments[0].photos, photos);
  assert.ok(h.saved[0].expiresAt.getTime() >= before + 180 * 60_000);
  assert.equal(h.discarded.length, 2);
  const paid = await harness({ theme: 'orders' });
  await paid.run('Футбол контакт +79991234567');
  assert.equal(paid.saved[0].expiresAt, null);
});

test('сбой фотографии сохраняет текст, отклонение убирает временные файлы, удалённая новость не воскресает', async () => {
  const h = await harness({ categories: rules.map(rule => ({ ...rule, capturePhotos: true })), photoFails: true });
  assert.equal(await h.run('Футбол'), true);
  assert.equal(h.saved.length, 1);
  assert.match(h.logs.at(-1).msg, /Текст сохранён/);
  assert.equal(await h.run('Нет совпадения', false, '2'), false);
  assert.equal(h.discarded.length, 2);
  const old = await harness({ seen: true });
  assert.equal(await old.run('Футбол'), false);
  assert.equal(old.saved.length, 0);
  assert.equal(old.discarded.length, 1);
});
