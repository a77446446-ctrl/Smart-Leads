import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildLeadTitle } from '../src/lib/lead-title.ts';
import { buildParserMessageFingerprint, isTechnicalParserMessage } from '../src/lib/parser-message-policy.ts';
import { hasActionableLeadContact } from '../src/lib/redact-contact.ts';
import { removeSourceChatLinks } from '../src/lib/lead-source-link.ts';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('заголовок выбирает смысловую фразу и не обрывает слова', () => {
  assert.equal(
    buildLeadTitle('РАБОТА МОСКВА 🟢 ТРЕБУЕТСЯ КОМПЛЕКТОВЩИК НА ТЁПЛЫЙ СКЛАД\nСклад отапливаемый'),
    'ТРЕБУЕТСЯ КОМПЛЕКТОВЩИК НА ТЁПЛЫЙ СКЛАД',
  );
  const projectTitle = buildLeadTitle('ПРОЕКТ «СЕВЕРНЫЙ РУБЕЖ» СПЕЦИАЛЬНАЯ ПРОГРАММА ПОДГОТОВКИ РЕЗЕРВНОГО КОРПУСА');
  assert.doesNotMatch(projectTitle, /\.{3}|…/);
  assert.doesNotMatch(projectTitle, /\bПОДГ$/i);
});

test('оборванный заголовок ИИ заменяется заголовком из исходного текста', () => {
  const title = buildLeadTitle(
    'Требуется бригада монолитчиков на устройство фундамента объёмом 800 кубов',
    'Требуется бригада монолитчиков на устройство фунда...',
  );
  assert.equal(title, 'Требуется бригада монолитчиков на устройство фундамента объёмом 800 кубов');
});

test('призыв написать в личку без адреса не считается контактом', () => {
  assert.equal(hasActionableLeadContact('Свяжитесь со мной, пишите в личные сообщения'), false);
  assert.equal(hasActionableLeadContact('Пишите в ЛС Ивану и добавляйте в контакты'), false);
  assert.equal(hasActionableLeadContact('Телефон +7 999 123-45-67'), true);
  assert.equal(hasActionableLeadContact('Профиль https://max.ru/example'), true);
  assert.equal(hasActionableLeadContact('Пишите @master'), true);
  assert.equal(hasActionableLeadContact('Почта master@example.ru'), true);
});

test('целевой лид не содержит ссылку возврата в исходный чат', () => {
  const sourceChat = 'https://web.max.ru/workers/#chat-42';
  const text = 'Нужен грузчик\nКонтакты (ссылки): https://max.ru/workers/#chat-42';
  assert.equal(removeSourceChatLinks(text, sourceChat), 'Нужен грузчик');
  assert.equal(
    removeSourceChatLinks('Нужен грузчик\nКонтакты (ссылки): https://max.ru/workers/#chat-42, https://employer.example/apply', sourceChat),
    'Нужен грузчик\nКонтакты (ссылки): https://employer.example/apply',
  );
});

test('контакт обязателен по умолчанию и отключается только явным opt-in режима Все', () => {
  const parser = read('src/services/max-parser.ts');
  const outbox = read('src/services/bot-outbox.ts');
  const leadsApi = read('src/app/api/leads/route.ts');
  const schema = read('prisma/schema.prisma');

  assert.match(parser, /if \(!hasActionableLeadContact\(cleaned\)\)/);
  assert.match(parser, /allowContactless: parseAll/);
  assert.match(parser, /parserMessageWasProcessed\(fingerprint\)/);
  assert.match(parser, /rememberFilteredMessage\(fingerprint, chatUrl, message\.id\)/);
  assert.match(parser, /status: 'NEW'/);
  assert.doesNotMatch(parser, /status: processed\.isSpam/);
  assert.match(schema, /allowContactless\s+Boolean\s+@default\(false\)/);
  assert.match(schema, /model ParserSeenMessage[\s\S]*fingerprint\s+String\s+@id/);
  assert.match(outbox, /!data\.allowContactless\s*&&\s*!hasActionableLeadContact/);
  assert.match(outbox, /throw new LeadContactRequiredError/);
  assert.match(outbox, /!delivery\.lead\.allowContactless\s*&&\s*!hasActionableLeadContact/);
  assert.match(leadsApi, /\.filter\(\(lead\) => lead\.allowContactless[\s\S]*hasActionableLeadContact/);
});

test('технический фильтр пропускает пользовательский текст и отклоняет только заглушки', () => {
  assert.equal(isTechnicalParserMessage(''), true);
  assert.equal(isTechnicalParserMessage('Сообщение удалено'), true);
  assert.equal(isTechnicalParserMessage('Служебное сообщение'), true);
  assert.equal(isTechnicalParserMessage('Ищу работу без телефона и любых ссылок'), false);
  assert.equal(isTechnicalParserMessage('Казино, реклама и любой другой текст'), false);
});

test('fingerprint защищает от повтора после перезапуска и разделяет чаты', () => {
  const first = buildParserMessageFingerprint('https://web.max.ru/a/#chat-1', '42', 'Текст');
  assert.equal(first, buildParserMessageFingerprint('https://web.max.ru/a/#chat-1', '42', 'Другой DOM-текст'));
  assert.notEqual(first, buildParserMessageFingerprint('https://web.max.ru/a/#chat-2', '42', 'Текст'));
  assert.notEqual(first, buildParserMessageFingerprint('https://web.max.ru/a/#chat-1', '43', 'Текст'));
});
