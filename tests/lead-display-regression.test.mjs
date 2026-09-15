import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { cleanLeadText } from '../src/lib/lead-display.ts';
import { buildLeadTitle } from '../src/lib/lead-title.ts';
import { uniqueLeadCards } from '../src/lib/lead-content.ts';
import { buildLeadContentFingerprint } from '../src/lib/lead-identity.ts';
import { backfillLeadIdentities } from '../src/lib/lead-identity-backfill.ts';
import { isLeadAddressLine, leadLocationLabel } from '../src/lib/lead-location.ts';

const body = 'Требуется сварщик\nАдрес: метро Комсомольская\nОплата 4 500 ₽ за смену\nТелефон +79991234567';

test('единая строка просмотров, времени и подпись вакансий не остаются в карточке', () => {
  for (const tail of [
    '153 просмотра · 19:30', '👁️ 153 19:30 💬 2', 'Вакансии\n153 просмотра\n19:30',
    '153\n19:30\nВакансии', '153 просмотра\nВакансии\n19:30',
    '👁\u200d🗨️ 153\n19:30', 'Просмотры: 153 · Комментарии: 2 · 19:30',
    '👁️153\u200b\n19:30\n💬12 комментариев',
    '3:05, 19:30',
  ]) {
    assert.equal(cleanLeadText(body + '\n' + tail), body, tail);
    const footer = '\nКонтакты (ссылки): https://example.com/employer';
    assert.equal(cleanLeadText(body + '\n' + tail + footer), body + footer, tail);
  }
  assert.equal(cleanLeadText('Писать в мессенджер TG или MAX\nTelegram\nJoin group chat on Telegram\nTelegram – a new era of messaging\nFast. Secure. Powerful.\n189\n07:18\n💬 Комментарии (1)\nКонтакты (ссылки): [контакт скрыт:link]'),
    'Писать в мессенджер TG или MAX\nКонтакты (ссылки): [контакт скрыт:link]');
});

test('очистка сохраняет ставки со значками, ночные смены и инструкции работодателя', () => {
  for (const details of ['💰 4500', '4500', '19:30', '9991234567', '⏰ 19:30', 'Время смены:\n19:30\n08:00',
    'Начало смены:\n19:30', 'Оплата:\n4500', 'Просмотры квартир: с 19:30',
    'Для записи на смену переходите в чат: https://example.com/employer']) {
    const original = body + '\n' + details;
    assert.equal(cleanLeadText(original), original);
    assert.equal(cleanLeadText(original + '\n👁 153\n💬 2 комментария'), original);
  }
});

test('название совпадает с первой строкой вакансии, а не с призывом ниже', () => {
  for (const headline of ['Требуется сварщик', 'Горничная в отель 5* (Ⓜ️ Комсомольская)',
    'В отель требуется горничная', 'Срочный набор на склад «Снежная королева» в г. Подольск',
    'Требуется опытный сварщик на постоянную работу в цех металлоконструкций рядом с метро Комсомольская']) {
    assert.equal(buildLeadTitle(headline + '\nПриглашаем на работу!\nОбязанности:\nНужно убирать номера', 'Случайное название'), headline);
  }
});

test('изменение счётчиков не создаёт новый ключ и повторную карточку', () => {
  const leads = ['153 просмотра · 19:30', 'Вакансии\n👁 200\n20:15\n💬 12 комментариев']
    .map((tail, id) => ({ id, rawText: body + '\n' + tail }));
  assert.equal(buildLeadContentFingerprint(leads[0]), buildLeadContentFingerprint(leads[1]));
  assert.equal(uniqueLeadCards(leads).length, 1);
  for (const changed of [body.replace('4 500', '4 800'), body.replace('Комсомольская', 'Курская'),
    body.replace('79991234567', '79991234568'), body + '\nСмена 20:00–08:00']) {
    assert.notEqual(buildLeadContentFingerprint({ rawText: changed }), buildLeadContentFingerprint({ rawText: body }));
    assert.equal(uniqueLeadCards([leads[0], { rawText: changed }]).length, 2);
  }
});

// Исполняем реальные TSX-компоненты через React SSR, без подмены их разметки.
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
function loadComponent(relative, overrides = {}) {
  const filename = path.join(root, relative);
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)((name) => {
    if (name in overrides) return overrides[name];
    if (!name.startsWith('@/')) return require(name);
    const target = 'src/' + name.slice(2);
    if (existsSync(path.join(root, target + '.tsx'))) return loadComponent(target + '.tsx');
    return require(path.join(root, target + '.ts'));
  }, module, module.exports);
  return module.exports;
}

const { LeadText } = loadComponent('src/components/ui/LeadText.tsx');
const { LeadCard } = loadComponent('src/components/cards/LeadCard.tsx');

test('местоположение показывает город, а без города — метро или адрес в тексте', () => {
  for (const address of ['улица Лукьянова, дом 5', 'Москва, Волочаевская улица, 12АС1А',
    'Адрес: Москва, Комсомольская площадь, 3', '📍 ул. Парковая, д. 5']) {
    assert.equal(isLeadAddressLine(address), true);
    assert.equal(leadLocationLabel('Требуется кассир\n' + address, 'Москва'), 'Москва');
  }
  for (const empty of ['Не указан', 'Не указано', '', null]) {
    assert.equal(leadLocationLabel('Требуется кассир\nАдрес: не указан', empty), null);
    assert.equal(leadLocationLabel('Требуется кассир\nулица Войкова, дом 5', empty), 'Адрес в тексте');
    assert.equal(leadLocationLabel('Требуется кассир\nулица Войкова', empty), 'Адрес в тексте');
  }
  assert.equal(leadLocationLabel('Адрес не указан', 'Москва'), 'Москва');
  assert.equal(leadLocationLabel('Требуется кассир\n🚇 Коломенская', 'Не указан'), 'метро Коломенская');
  assert.equal(leadLocationLabel('Требуется кассир\nметро Савеловская', null), 'метро Савеловская');
  assert.equal(isLeadAddressLine('🚇 Комсомольская'), false);
  assert.equal(isLeadAddressLine('Работа на улице'), false);
});

test('булавка добавляется к адресу один раз, эмодзи и пиктограммы цветные', () => {
  for (const address of ['улица Лукьянова, дом 5', '📍 улица Лукьянова, дом 5']) {
    const html = renderToStaticMarkup(React.createElement(LeadText, { text: address, markAddresses: true }));
    assert.equal((html.match(/aria-label="Адрес"/g) || []).length, 1);
  }
  const html = renderToStaticMarkup(React.createElement(LeadText, { text: '🚇 Комсомольская 💰 4500 📞 Контакты 👉 Обязанности' }));
  assert.match(html, /#dc2626/);
  assert.match(html, /#facc15/);
  assert.match(html, /#16a34a/);
  assert.match(html, /👉/u);
  assert.doesNotMatch(html, /grayscale/u);
});

test('карточка показывает внизу город и цену без слова Доступ', () => {
  for (const price of [0, 150]) {
    const html = renderToStaticMarkup(React.createElement(LeadCard, {
      lead: { id: 'test', title: 'Требуется кассир', rawText: 'улица Лукьянова, дом 5', city: 'Москва', price, category: { slug: 'work' } },
    }));
    assert.equal((html.match(/улица Лукьянова, дом 5/g) || []).length, 1);
    assert.match(html, /Москва/u);
    assert.match(html, price ? /150 ₽/u : /БЕСПЛАТНО/u);
    assert.doesNotMatch(html, /Доступ:|АДРЕС В ТЕКСТЕ/u);
  }
  const html = renderToStaticMarkup(React.createElement(LeadCard, {
    lead: { id: 'test', title: 'Требуется кассир', rawText: 'Оплата 4500', city: 'Не указан', category: { slug: 'work' } },
  }));
  assert.doesNotMatch(html, /АДРЕС В ТЕКСТЕ|Не указан|aria-label="Адрес"/u);
});

test('контакт внутри адресной строки не раскрывается до покупки', () => {
  const html = renderToStaticMarkup(React.createElement(LeadCard, {
    lead: { id: 'test', title: 'Кассир', rawText: 'Адрес: улица Лукьянова, дом 5, телефон +79991234567', city: 'Москва', category: { slug: 'work' } },
  }));
  assert.doesNotMatch(html, /79991234567/u);
  assert.equal((html.match(/КОНТАКТ СКРЫТ/g) || []).length, 1);
});

test('при неизвестном городе метро показывается с красной М вместо булавки', () => {
  const html = renderToStaticMarkup(React.createElement(LeadCard, {
    lead: { id: 'test', title: 'Работа', rawText: '🚇 Коломенская', city: 'Не указан', category: { slug: 'work' } },
  }));
  assert.match(html, /метро Коломенская/u);
  assert.equal((html.match(/aria-label="Метро"/g) || []).length, 2);
  assert.doesNotMatch(html, /aria-label="Адрес"/u);
});
test('очередь MAX пропускает копию объявления, но доставляет купленный контакт', async () => {
  const deliveries = [
    { id: 'copy', kind: 'LEAD_TEASER_CHANNEL', lead: { status: 'NEW', duplicateOfId: 'main', allowContactless: true } },
    { id: 'main', kind: 'LEAD_TEASER_CHANNEL', lead: { status: 'NEW', duplicateOfId: null, allowContactless: true } },
    { id: 'purchase', kind: 'PURCHASE', lead: { status: 'SOLD', duplicateOfId: 'main' } },
  ].map((row) => ({ ...row, status: 'PENDING', attempts: 0, recipientType: 'CHAT', recipientId: '123' }));
  const sent = [];
  const db = { botDelivery: {
    async findMany() { return deliveries.map(({ id, status, attempts }) => ({ id, status, attempts })); },
    async updateMany({ where }) { deliveries.find((row) => row.id === where.id).attempts++; return { count: 1 }; },
    async findUnique({ where }) { return deliveries.find((row) => row.id === where.id); },
    async update({ where, data }) { Object.assign(deliveries.find((row) => row.id === where.id), data); },
  } };
  const { dispatchBotDeliveries } = loadComponent('src/services/bot-outbox.ts', {
    '@/lib/prisma': { prisma: db },
    '@/lib/max-bot': {
      buildMaxMiniAppLink: () => 'test', buildLeadTeaserMessage: () => ({ text: 'объявление' }),
      buildPurchaseMessage: () => ({ text: 'контакт' }),
      sendMaxMessage: async (_type, _id, payload) => { sent.push(payload.text); return 'test'; },
    },
  });
  const previous = process.env.MAX_BOT_TOKEN;
  process.env.MAX_BOT_TOKEN = 'тест';
  try {
    const result = await dispatchBotDeliveries();
    assert.equal(result.skipped, 1);
    assert.equal(result.sent, 2);
    assert.equal(deliveries[0].status, 'SKIPPED');
    assert.deepEqual(sent, ['объявление', 'контакт']);
  } finally {
    if (previous === undefined) delete process.env.MAX_BOT_TOKEN;
    else process.env.MAX_BOT_TOKEN = previous;
  }
});

test('метро имеет видимую подпись, без повторения уже написанного слова', () => {
  for (const text of ['Ⓜ️ Комсомольская', '🚇 Комсомольская', 'м. Комсомольская', 'метро 🚇 Комсомольская', '🚇 метро Комсомольская']) {
    const html = renderToStaticMarkup(React.createElement(LeadText, { text }));
    const visible = html.replace(/<[^>]*>/g, '');
    assert.equal((visible.match(/метро/giu) || []).length, 1, text);
    assert.match(visible, /метро\s+Комсомольская/u);
  }
});

test('телефон зелёный, ссылка чёрная, а внешний значок контакта не повторяется', () => {
  for (const rawText of ['📞 [контакт скрыт:phone]', '📞 +79991234567']) {
    const html = renderToStaticMarkup(React.createElement(LeadCard, {
      lead: { id: 'test', title: 'Требуется сварщик', rawText, category: { slug: 'work' } }, onBuy() {},
    }));
    assert.match(html, /<span[^>]*class="[^"]*bg-accent[^"]*"[^>]*>[\s\S]*?КОНТАКТ СКРЫТ<\/span>/u);
    assert.equal((html.match(/lucide-phone/g) || []).length, 1);
    assert.doesNotMatch(html, /79991234567/u);
  }
  for (const rawText of ['🔗 [контакт скрыт:link]', '🔗 https://example.com/employer']) {
    const html = renderToStaticMarkup(React.createElement(LeadCard, {
      lead: { id: 'test', title: 'Требуется сварщик', rawText, category: { slug: 'work' } }, onBuy() {},
    }));
    assert.match(html, /<span[^>]*class="[^"]*bg-black[^"]*text-white[^"]*"[^>]*>[\s\S]*?КОНТАКТ СКРЫТ<\/span>/u);
    assert.equal((html.match(/lucide-link/g) || []).length, 1);
    assert.doesNotMatch(html, /example\.com/u);
  }
  const literal = renderToStaticMarkup(React.createElement(LeadCard, {
    lead: { id: 'test', title: 'Требуется сварщик', rawText: 'Номер телефона: КОНТАКТ СКРЫТ\nТелеграм: КОНТАКТ СКРЫТ', category: { slug: 'work' } }, onBuy() {},
  }));
  assert.match(literal, /bg-accent[^"]*"[^>]*>[\s\S]*КОНТАКТ СКРЫТ/u);
  assert.match(literal, /bg-black[^"]*"[^>]*>[\s\S]*КОНТАКТ СКРЫТ/u);
});

test('купленные телефон и ссылка используют те же зелёный и чёрный блоки', () => {
  const html = renderToStaticMarkup(React.createElement(LeadCard, {
    lead: { id: 'test', title: 'Работа', rawText: '+79991234567\nhttps://example.com/employer', category: { slug: 'work' } }, isPurchased: true,
  }));
  assert.match(html, /<a[^>]*href="tel:\+79991234567"[^>]*class="[^"]*bg-accent/u);
  assert.match(html, /<a[^>]*href="https:\/\/example\.com\/employer"[^>]*class="[^"]*bg-black[^"]*text-white/u);
  assert.match(html, /lucide-phone/u);
  assert.match(html, /lucide-link/u);
});

test('промо-переходы конкурентов удаляются, контакт работодателя остаётся', () => {
  for (const promo of [
    'Больше вакансий смотрите здесь https://competitor.example/jobs',
    'Больше вакансий смотрите здесь\nhttps://competitor.example/jobs',
    'https://competitor.example/jobs\nБольше вакансий',
    'Подписывайтесь на наш канал\n@competitor',
  ]) {
    assert.equal(cleanLeadText('Телефон работодателя: +79991234567\n' + promo), 'Телефон работодателя: +79991234567');
  }
  assert.equal(cleanLeadText('Для записи на смену переходите в чат: https://employer.example/apply'),
    'Для записи на смену переходите в чат: https://employer.example/apply');
});

test('в шапке карточки сначала показывается время, затем дата поступления лида', () => {
  const html = renderToStaticMarkup(React.createElement(LeadCard, {
    lead: { id: 'test', title: 'Работа', rawText: 'Текст', createdAt: '2026-09-12T18:36:00.000Z', category: { slug: 'work' } },
  }));
  assert.match(html, />21:36, 12\.09</u);
});

test('пересчёт обновляет старые заполненные ключи партиями, сохраняя тексты и покупки', async () => {
  const rows = Array.from({ length: 203 }, (_, i) => ({
    id: String(i).padStart(4, '0'), rawText: i < 2 ? body + `\n${153 + i} просмотра · 19:30` : body + `\nОбъект №${i}`,
    phone: null, contentFingerprint: `старый-${i}`, duplicateOfId: null, purchases: i === 1 ? ['покупка'] : [],
  }));
  const originals = rows.map(({ rawText, purchases }) => ({ rawText, purchases }));
  const db = { lead: {
    async findMany({ where, take }) { return rows.filter((row) => !where || row.id > where.id.gt).slice(0, take).map((row) => ({ ...row })); },
    async findUnique({ where }) { return rows.find((row) => row.contentFingerprint === where.contentFingerprint); },
    async updateMany({ where, data }) {
      const row = rows.find((row) => row.id === where.id && row.contentFingerprint === where.contentFingerprint && row.duplicateOfId === where.duplicateOfId);
      if (!row) return { count: 0 };
      if (data.contentFingerprint && rows.some((other) => other.id !== row.id && other.contentFingerprint === data.contentFingerprint)) throw { code: 'P2002' };
      Object.assign(row, data);
      return { count: 1 };
    },
  } };
  assert.deepEqual(await backfillLeadIdentities(db), { indexed: 202, duplicates: 1 });
  assert.equal(rows[1].duplicateOfId, rows[0].id);
  assert.equal(rows[1].contentFingerprint, null);
  assert.deepEqual(rows.map(({ rawText, purchases }) => ({ rawText, purchases })), originals);
  const firstPass = structuredClone(rows);
  await backfillLeadIdentities(db);
  assert.deepEqual(rows, firstPass);
});
