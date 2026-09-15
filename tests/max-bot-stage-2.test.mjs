import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

async function loadMaxBotModule() {
  const source = await read('src/lib/max-bot.ts');
  const selfContained = source.replace(/from '\@\/lib\/([^']+)'/g, (_, name) => 'from ' + JSON.stringify(new URL('src/lib/' + name + '.ts', root).href));
  const output = ts.transpileModule(selfContained, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

test('MAX-ссылки мини-приложения и идентификаторы ограничены безопасным форматом', async () => {
  process.env.MAX_BOT_USERNAME = '@PoDelamBot';
  const bot = await loadMaxBotModule();
  assert.equal(bot.buildMaxMiniAppLink('lead_123-abc'), 'https://max.ru/PoDelamBot?startapp=lead_123-abc');
  assert.equal(bot.normalizeMaxNumericId('000123'), '123');
  assert.equal(bot.normalizeMaxNumericId('0'), null);
  assert.equal(bot.normalizeMaxNumericId('@mychannel'), null);
  assert.equal(bot.normalizeMaxNumericId('max.ru/mychannel'), null);
  assert.equal(bot.normalizeMaxNumericId('9223372036854775807'), '9223372036854775807');
  assert.equal(bot.normalizeMaxNumericId('-9223372036854775808'), '-9223372036854775808');
  assert.equal(bot.normalizeMaxNumericId(123n), '123');
  const categoryPage = await read('src/app/(admin)/admin/categories/page.tsx');
  assert.match(categoryPage, /Начать обнаружение/);
  assert.match(categoryPage, /Опубликуйте любой новый пост/);
  assert.match(categoryPage, /<select[\s\S]*showcaseChatId/);
  assert.match(categoryPage, /method: 'POST'/);
  assert.doesNotMatch(categoryPage, /@mychannel/);
  assert.doesNotMatch(categoryPage, /max\.ru\/chat\//);
  assert.equal(bot.normalizeMaxNumericId(Number.MAX_SAFE_INTEGER + 1), null);
  assert.equal(bot.normalizeMaxNumericId('9223372036854775808'), null);
  assert.throws(() => bot.buildMaxMiniAppLink('bad payload'));
});

test('администратор может включить webhook и обнаружить канал по событию MAX', async () => {
  const [route, bot, webhookSetup, categoryPage] = await Promise.all([
    read('src/app/api/admin/bot/chats/route.ts'),
    read('src/lib/max-bot.ts'),
    read('scripts/setup-max-webhook.js'),
    read('src/app/(admin)/admin/categories/page.tsx'),
  ]);

  assert.match(route, /adminGuard/);
  assert.match(route, /configureMaxWebhookSubscription/);
  assert.match(route, /where: \{ active: true \}/);
  assert.match(bot, /platform-api2\.max\.ru/);
  assert.match(bot, /\/subscriptions/);
  assert.match(bot, /'message_created'/);
  assert.match(bot, /MAX_WEBHOOK_SECRET/);
  assert.match(webhookSetup, /"message_created"/);
  assert.match(categoryPage, /knownChatIds/);
  assert.match(categoryPage, /detectedChat/);
  assert.match(categoryPage, /showcaseChatId: detectedChat\.chatId/);
});

test('webhook MAX настраивается официальной подпиской и принимает события каналов', async () => {
  process.env.MAX_BOT_TOKEN = 'test-token';
  process.env.MAX_WEBHOOK_SECRET = 'test-secret';
  process.env.NEXT_PUBLIC_APP_URL = 'https://podelam24.ru';
  const bot = await loadMaxBotModule();
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  let requestedOptions;

  globalThis.fetch = async (url, options) => {
    requestedUrl = String(url);
    requestedOptions = options;
    assert.equal(options.headers.Authorization, 'test-token');
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const webhookUrl = await bot.configureMaxWebhookSubscription();
    const requestBody = JSON.parse(requestedOptions.body);
    assert.equal(webhookUrl, 'https://podelam24.ru/api/webhooks/max');
    assert.match(requestedUrl, /platform-api2\.max\.ru\/subscriptions$/);
    assert.equal(requestedOptions.method, 'POST');
    assert.equal(requestBody.url, webhookUrl);
    assert.equal(requestBody.secret, 'test-secret');
    assert.ok(requestBody.update_types.includes('message_created'));
    assert.ok(requestBody.update_types.includes('bot_added'));

    const webhookRoute = await read('src/app/api/webhooks/max/route.ts');
    assert.match(webhookRoute, /recipient\?\.chat_id/);
    assert.match(webhookRoute, /exactChatIdFromJson\(rawBody\)/);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.MAX_BOT_TOKEN;
    delete process.env.MAX_WEBHOOK_SECRET;
    delete process.env.NEXT_PUBLIC_APP_URL;
  }
});

test('сохранение витринного чата проверяет MAX и ставит все NEW-лиды в очередь без дублей', async () => {
  const source = await read('src/app/api/admin/category/route.ts');
  assert.match(source, /maxBotChat\.findUnique/);
  assert.match(source, /knownChat\?\.active/);
  assert.match(source, /prisma\.\$transaction/);
  assert.match(source, /status: \{ in: \['PENDING', 'RETRY', 'FAILED'\] \}/);
  assert.match(source, /status: 'RETRY'/);
  assert.match(source, /attempts: 0/);
  assert.match(source, /tx\.lead\.findMany/);
  assert.match(source, /status: 'NEW', deletedAt: null/);
  assert.match(source, /tx\.botDelivery\.createMany/);
  assert.match(source, /skipDuplicates: true/);
  assert.match(source, /offset \+= 500/);
});

test('тизер не раскрывает контакты, покупка возвращает полный текст', async () => {
  process.env.MAX_BOT_USERNAME = 'PoDelamBot';
  const bot = await loadMaxBotModule();
  const lead = {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Позвоните +7 999 123-45-67',
    rawText: 'Телефон +7 999 123-45-67, @master, mail@example.ru, https://example.ru/order',
    city: 'Москва',
    price: 100,
    category: { name: 'Грузчики', paymentMode: 'LEAD' },
  };
  const teaser = bot.buildLeadTeaserMessage(lead);
  assert.doesNotMatch(teaser.text, /999 123|@master|mail@example|https:\/\/example/);
  assert.match(teaser.text, /контакт скрыт/i);
  assert.match(teaser.text, /🗂️ Категория: Грузчики/);
  assert.match(teaser.text, /📍 Город: Москва/);
  assert.match(teaser.text, /Доступ к контакту: 100 ₽/);
  assert.match(teaser.attachments[0].payload.buttons[0][0].url, /startapp=lead_/);

  const freeTeaser = bot.buildLeadTeaserMessage({ ...lead, price: 0 });
  assert.match(freeTeaser.text, /Доступ к контакту: бесплатно/);

  const subscriptionTeaser = bot.buildLeadTeaserMessage({
    ...lead,
    category: { ...lead.category, paymentMode: 'SUBSCRIPTION' },
  });
  assert.match(subscriptionTeaser.text, /Доступ к контакту: по подписке PRO/);

  const purchase = bot.buildPurchaseMessage(lead);
  assert.match(purchase.text, /\+7 999 123-45-67/);
  assert.match(purchase.text, /🗂️ Категория: Грузчики/);
  assert.match(purchase.text, /📍 Город: Москва/);
  assert.match(purchase.text, /Доступ к контакту: 100 ₽/);
  assert.match(purchase.attachments[0].payload.buttons[0][0].url, /startapp=purchase_/);
});

test('секрет webhook сравнивается точно', async () => {
  const bot = await loadMaxBotModule();
  assert.equal(bot.verifyMaxWebhookSecret('secret_123', 'secret_123'), true);
  assert.equal(bot.verifyMaxWebhookSecret('secret_124', 'secret_123'), false);
  assert.equal(bot.verifyMaxWebhookSecret(null, 'secret_123'), false);
});

test('сырой MAX webhook не сохраняется и не выдаётся диагностикой', async () => {
  const [webhook, diagnostics] = await Promise.all([
    read('src/app/api/webhooks/max/route.ts'),
    read('src/app/api/dev/bot-status/route.ts'),
  ]);

  assert.doesNotMatch(webhook, /lastWebhook/);
  assert.doesNotMatch(diagnostics, /lastWebhook/);
});

test('этап 2 использует webhook, outbox и транзакционные точки постановки', async () => {
  const [webhook, outbox, parser, ingest, purchase, cron, migration] = await Promise.all([
    read('src/app/api/webhooks/max/route.ts'),
    read('src/services/bot-outbox.ts'),
    read('src/services/max-parser.ts'),
    read('src/app/api/ingest/route.ts'),
    read('src/app/api/buy-lead/route.ts'),
    read('scripts/cron.js'),
    read('prisma/migrations/20260823020000_stage_2_max_bot/migration.sql'),
  ]);
  assert.match(webhook, /x-max-bot-api-secret/i);
  assert.match(webhook, /bot_started/);
  assert.match(outbox, /skipDuplicates: true/);
  assert.match(outbox, /status: 'PROCESSING'/);
  assert.match(outbox, /status: willRetry \? 'RETRY' : 'FAILED'/);
  assert.match(parser, /createLeadWithDeliveries/);
  assert.match(ingest, /createLeadWithDeliveries/);
  assert.match(purchase, /enqueuePurchaseDelivery/);
  assert.match(cron, /\/api\/internal\/bot\/dispatch/);
  assert.match(cron, /setInterval\(pollBot, 5_000\)/);
  assert.match(migration, /UNIQUE INDEX "BotDelivery_deduplicationKey_key"/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|TRUNCATE/i);
});

test('длинное сообщение MAX сохраняет дословный фрагмент и явно ведёт к полному объявлению', async () => {
  process.env.MAX_BOT_USERNAME = 'PoDelamBot';
  const bot = await loadMaxBotModule();
  const lead = {
    id: 'long-text', title: 'Посторонний старый заголовок', city: 'Подольск', price: 100,
    category: { name: 'Грузчики', paymentMode: 'SINGLE' },
    rawText: 'Требуются грузчики.\nОплата 4 500 ₽, ночная смена — 4 800 ₽.\n' +
      'Проезд не компенсируется. '.repeat(220) + '\nТелефон: +7 999 123-45-67\n67\n14:13\n💬 Комментарии',
  };
  for (const payload of [bot.buildLeadTeaserMessage(lead), bot.buildPurchaseMessage(lead)]) {
    assert(payload.text.length <= 4000);
    assert.match(payload.text, /Показан фрагмент. Полное объявление — в приложении/);
    assert.match(payload.text, /Оплата 4 500 ₽, ночная смена — 4 800 ₽/);
    assert.doesNotMatch(payload.text, /Посторонний старый|💬 Комментарии/);
  }
  assert.doesNotMatch(bot.buildLeadTeaserMessage(lead).text, /999 123-45-67/);
});

test('объявление до лимита MAX передаётся полностью и не сокращается до 1200 символов', async () => {
  process.env.MAX_BOT_USERNAME = 'PoDelamBot';
  const bot = await loadMaxBotModule();
  const rawText = 'Сотрудник на производство одежды.\n' + 'Точные условия. '.repeat(100) + '\nПитание предоставляется.';
  const payload = bot.buildLeadTeaserMessage({
    id: 'full-text', title: 'Плохой заголовок', city: 'Москва', price: 0,
    category: { name: 'Работа', paymentMode: 'SINGLE' }, rawText,
  });
  assert(payload.text.includes(rawText));
  assert.doesNotMatch(payload.text, /Показан фрагмент/);
  assert.match(payload.text, /Доступ к контакту: бесплатно/);
});
