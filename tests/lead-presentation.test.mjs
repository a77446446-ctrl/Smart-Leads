import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { cleanLeadText } from '../src/lib/lead-display.ts';
import { leadContentKey } from '../src/lib/lead-content.ts';
import { buildLeadTitle } from '../src/lib/lead-title.ts';
import { hasTargetedChats } from '../src/lib/lead-filter-mode.ts';
import { removeSourceChatLinks } from '../src/lib/lead-source-link.ts';
import { detectLeadSpam } from '../src/lib/lead-moderation.ts';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('хвосты MAX с эмодзи, счётчиками и комментариями удаляются перед контактами', () => {
  const content = 'Нужны грузчики\nОплата 4 500 ₽, начало в 09:15.';
  for (const tail of [
    '67\n14:13\n💬 Комментарии',
    '👁️ 67\n14:13\n💬 12 комментариев',
    '👍 3 🔥 2\n👀 120\n14:13',
    '67\n\n14:13\n\n💬 Комментарии',
  ]) {
    const cleaned = cleanLeadText(content + '\n' + tail + '\nКонтакты (ссылки): https://example.com');
    assert.equal(cleaned, content + '\nКонтакты (ссылки): https://example.com');
    assert.equal(cleanLeadText(cleaned), cleaned);
  }
});

test('суммы, даты, адреса, время смен и неоднозначные числа остаются дословными', () => {
  for (const text of [
    'Оплата:\n4500', 'Начало смены:\n09:15', 'Нужно:\n67',
    'Нужны грузчики\n4500', 'Нужны грузчики\n09:15',
    'Ночь — 5 000 ₽ / Вахта — 4 800 ₽.\nДень — 4 500 ₽ / Вахта — 4 300 ₽.',
    'Адрес: дом 67, корпус 2.\nВыход 12.09.2026, в 14:13.\nЗвонить после 18:00',
    '🚇 Текстильщики\n💰 4 500 ₽\n⏰ 20:00–08:00',
  ]) assert.equal(cleanLeadText(text), text);
  assert.equal(cleanLeadText('Оплата:\n4500\n👁 67\n💬 Комментарии'), 'Оплата:\n4500');
  assert.equal(cleanLeadText('Начало смены:\n09:15\n👁 67'), 'Начало смены:\n09:15');
});

test('очистка удаляет только промо-переходы и не переписывает инструкции работодателя', () => {
  for (const text of [
    'Для записи на смену переходите в чат.\nОставьте номер для связи.',
    'Адрес: метро Автово.\nОплата: 4 500 ₽.\nКомпенсации проезда нет.',
  ]) assert.equal(cleanLeadText(text), text);
  assert.equal(cleanLeadText('Подписывайтесь на наш канал\nhttps://example.com\nБольше вакансий'), '');
});

test('служебная статистика и посторонний сохранённый заголовок не становятся названием', () => {
  const text = 'Создано заказов: 441\nЗарегистрирован: 218 дней назад\nУпаковщики МОСКВА | Работа Подработка Шабашка\nПриглашаем на работу комплектовщиков и грузчиков.';
  assert.equal(buildLeadTitle(text, 'заказов: 441 Зарегистрирован: 218 дней назад'),
    'Приглашаем на работу комплектовщиков и грузчиков.');
  assert.equal(buildLeadTitle('Работа в Москве\nСотрудник на производство одежды\nРабота для студентов',
    'ЗАКАЗ ЛЮБОЙ СЛОЖНОСТИ В МАКСИМАЛЬНО КОРОТКИЕ СРОКИ'), 'Сотрудник на производство одежды');
  assert.equal(buildLeadTitle('Требуются\nДва курьера\nОплата: 4500'), 'Требуются Два курьера');
  assert.equal(buildLeadTitle('🧑‍🔧 Требуется сантехник\nТелефон: +79991234567'), 'Требуется сантехник');
});

test('стоп-слова активны при наличии хотя бы одного целевого чата', () => {
  assert.equal(hasTargetedChats([]), false);
  assert.equal(hasTargetedChats([{ parseAll: true }, {}]), false);
  assert.equal(hasTargetedChats([{ parseAll: false }]), true);
  assert.equal(hasTargetedChats([{ parseAll: true }, { parseAll: false }]), true);
});

test('старые отпечатки содержимого не изменяются из-за новых правил отображения', () => {
  assert.equal(leadContentKey({ rawText: 'Нужны грузчики\n67\n14:13\nКомментарии', phone: '+7 999 123-45-67' }),
    JSON.stringify(['Нужны грузчики', '+79991234567']));
  assert.equal(leadContentKey({ rawText: 'Нужны грузчики\nПодписывайтесь на наш канал' }),
    JSON.stringify(['Нужны грузчики', '']));
  assert.notEqual(leadContentKey({ rawText: 'Оплата: 4500' }), leadContentKey({ rawText: 'Оплата: 4800' }));
});

/** Выполняем настоящую ветку обработки с изолированной БД и без отправки в MAX. */
function parserHarness() {
  const source = stripTypeScriptTypes(read('src/services/max-parser.ts'));
  const clean = source.slice(source.indexOf('function cleanMessageText('), source.indexOf('async function resolveCategory('));
  const process = source.slice(source.indexOf('async function processMessage('), source.indexOf('async function recordAccountResult('));
  const saved = [];
  const dependencies = {
    isTechnicalParserMessage: () => false,
    buildParserMessageFingerprint: () => 'test',
    parserMessageWasProcessed: async () => false,
    rememberFilteredMessage: async () => {},
    hasOnlyExpiredLeadDates: () => false,
    removeSourceChatLinks,
    hasActionableLeadContact: () => true,
    aiService: { processLead: async (text) => ({
      isSpam: detectLeadSpam(text, 'реклама'), score: 80, category: 'other',
      title: buildLeadTitle(text), cleanedText: cleanLeadText(text),
    }) },
    pushLog: () => {}, safeParserError: String,
    resolveCategory: async () => ({ id: 'test', leadPrice: 100 }),
    withDbRetry: async (fn) => fn(),
    prisma: { lead: { findFirst: async () => null } },
    createLeadWithDeliveries: async (data, original) => saved.push({ data, original }),
    buildLeadTitle,
  };
  const run = new Function(...Object.keys(dependencies), clean + process + '; return processMessage;')(...Object.values(dependencies));
  return { saved, run };
}

test('ВСЁ сохраняет рекламу и полный исходник длиннее 1500 символов', async () => {
  const { run, saved } = parserHarness();
  const original = 'Реклама. Подписывайтесь на наш канал.\n' + 'Точные условия. '.repeat(150) + '\nКонтакт в конце: +79991234567';
  assert.equal(await run({ text: original }, 'chat', 'Источник', true, []), true);
  assert.equal(saved[0].original, original);
  assert.equal(saved[0].data.rawText, original);
});

test('ЦЕЛЕВЫЕ отклоняют стоп-слова, а условия принятого объявления не обрезаются', async () => {
  const { run, saved } = parserHarness();
  assert.equal(await run({ text: 'Требуются грузчики. Реклама +79991234567' }, 'chat', 'Источник', false, []), false);
  assert.equal(saved.length, 0);
  const original = 'Требуются грузчики.\n' + 'Условия работы. '.repeat(105) + '\nОплата 4500. Телефон +79991234567';
  assert(original.length > 1500 && original.length < 2000);
  assert.equal(await run({ text: original }, 'chat', 'Источник', false, []), true);
  assert.equal(saved[0].original, original);
  assert.match(saved[0].data.rawText, /Телефон \+79991234567$/);
});

test('активность учитывает найденные чаты и их приоритет над ручными настройками', () => {
  assert.equal(hasTargetedChats([], '[{"url":"https://max.ru/target","parseAll":false}]'), true);
  assert.equal(hasTargetedChats([{ url: 'https://max.ru/target', parseAll: false }],
    '[{"url":"https://max.ru/target","parseAll":true}]'), false);
  assert.equal(hasTargetedChats([{ parseAll: false }], 'ошибка JSON'), true);
});
