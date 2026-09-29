import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import vm from 'node:vm';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const read = file => readFile(new URL('../' + file, import.meta.url), 'utf8');
const compile = source => ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
} }).outputText;
const progressModule = await import('data:text/javascript;base64,' + Buffer.from(compile(await read('src/services/parser-worker-progress.ts'))).toString('base64'));
const parser = await read('src/services/max-parser.ts');
const url = 'https://web.max.ru/test';
const snapshot = { status: 'OK', source_chat: url, title: 'Тест', messages: [{ text: 'Полученное сообщение' }] };
const line = value => JSON.stringify(value) + '\n';

function workerContext(emit) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  child.stdout.setEncoding = child.stderr.setEncoding = () => {};
  let stopped = false;
  const context = vm.createContext({
    Buffer, setTimeout, clearTimeout, process, path,
    ParserWorkerProgress: progressModule.ParserWorkerProgress,
    photoCaptureEnvironment: async () => ({}),
    positiveIntEnv: () => 20,
    parserPythonExecutable: () => 'python',
    parserPythonSpawnError: error => error.message,
    safeParserError: String,
    failedWorker: (chatUrl, status, error) => ({ source_chat: chatUrl, status, error: String(error), title: null, messages: [] }),
    stopParserWorker: () => { stopped = true; },
    spawn: (_binary, _args, options) => {
      assert.equal(options.env.PARSER_WORKER_TIMEOUT_MS, '20');
      queueMicrotask(() => emit(child));
      return child;
    },
  });
  const body = parser.slice(parser.indexOf('async function runPlaywrightParse'), parser.indexOf('async function saveChats'));
  vm.runInContext(compile(body), context);
  return { run: () => context.runPlaywrightParse(url, { sessionFile: 'test.json', proxyUrl: 'direct' }), stopped: () => stopped };
}

test('тайм-аут медиа сохраняет прочитанный текст и не превращает его в ошибку аккаунта', async () => {
  const worker = workerContext(child => {
    const record = line({ event: 'checkpoint', result: snapshot });
    child.stdout.emit('data', record.slice(0, 13));
    child.stdout.emit('data', record.slice(13));
    child.stdout.emit('data', line({ event: 'stage', stage: 'обработка фотографий' }));
  });
  const result = await worker.run();
  assert.equal(result.status, 'OK');
  assert.equal(result.messages[0].text, snapshot.messages[0].text);
  assert.match(result.error, /фотографий/);
  assert.equal(worker.stopped(), true);
});

test('без прочитанных сообщений тайм-аут остаётся ошибкой с этапом', async () => {
  const worker = workerContext(child => child.stdout.emit('data', line({ event: 'stage', stage: 'открытие целевого чата MAX' })));
  const result = await worker.run();
  assert.equal(result.status, 'TIMEOUT');
  assert.match(result.error, /открытие целевого чата/);
  assert.equal(result.messages.length, 0);
});

test('окончательная ошибка авторизации имеет приоритет над промежуточным результатом', async () => {
  const worker = workerContext(child => {
    child.stdout.emit('data', line({ event: 'checkpoint', result: snapshot }));
    child.stdout.emit('data', line({ ...snapshot, status: 'AUTH_REQUIRED', messages: [], error: 'Нужен вход' }));
    child.emit('close', 0);
  });
  assert.equal((await worker.run()).status, 'AUTH_REQUIRED');
  assert.equal(worker.stopped(), false);
});

test('нормальное завершение сохраняет обогащённый результат', async () => {
  const worker = workerContext(child => {
    child.stdout.emit('data', line({ event: 'checkpoint', result: snapshot }));
    child.stdout.emit('data', line({ ...snapshot, messages: [{ text: 'Полученное сообщение', photos: [{ key: 'test' }] }] }));
    child.emit('close', 0);
  });
  const result = await worker.run();
  assert.equal(result.messages[0].photos[0].key, 'test');
  assert.equal(result.error, undefined);
});

test('чужой чат, пустой и повреждённый результат не используются для восстановления', () => {
  for (const result of [{ ...snapshot, source_chat: url + '/other' }, { ...snapshot, messages: [] },
    { ...snapshot, status: 'AUTH_REQUIRED' }, { ...snapshot, messages: [{}] }]) {
    const progress = new progressModule.ParserWorkerProgress(url);
    progress.collect(line({ event: 'checkpoint', result }));
    assert.equal(progress.recover(), null);
  }
});

test('ссылка с hash сохраняет исходный адрес для результата после преобразования worker', () => {
  const requested = 'https://web.max.ru/a/#@news';
  const progress = new progressModule.ParserWorkerProgress(requested);
  progress.collect(line({ event: 'checkpoint', result: { ...snapshot, source_chat: requested } }));
  assert.equal(progress.recover()?.messages[0].text, 'Полученное сообщение');
  const source = parser;
  assert.match(source, /new ParserWorkerProgress<WorkerResult>\(chatUrl\)/);
});

test('после восстановления текста очередь проходит все чаты и сохраняет каждый итог', async () => {
  const chats = [1, 2, 3].map(number => ({ name: 'Чат ' + number, url: url + number, parseAll: true }));
  const results = [], processed = [], saved = [], journals = [];
  const account = { id: 'test', name: 'Тест', sessionFile: 'test.json' };
  const context = vm.createContext({
    console, Date, setTimeout: callback => { queueMicrotask(callback); },
    cleanupExpiredLeads: async () => {}, loadAccounts: async () => [account],
    mergeTargetChats: () => chats, positiveIntEnv: () => 100, MAX_CHATS_CONFIG: 1000,
    normalizeMaxChatUrl: value => value, refreshParserLease: async () => true,
    runPlaywrightParse: async chatUrl => { processed.push(chatUrl); return { ...snapshot, error: processed.length === 1 ? 'Текст сохранён; медиа прерваны' : undefined }; },
    persistParserSessionFile: async () => {}, recordAccountResult: async (_account, result) => results.push(result.status),
    selectMessageProcessor: async () => async () => true, processMessage: () => {},
    safeParserError: String, failedWorker: () => { throw new Error('Непредвиденная ошибка worker'); },
    pushLog: (logs, msg) => logs.push({ msg }), saveChats: async rows => saved.push(JSON.parse(JSON.stringify(rows))),
    saveParserProgress: async logs => journals.push(JSON.parse(JSON.stringify(logs))),
    prisma: { setting: { findUnique: async () => null, upsert: async () => {} },
      targetChat: { findMany: async () => [] }, maksAccount: { count: async () => 1 } },
  });
  vm.runInContext(compile(parser.slice(parser.indexOf('async function syncWithoutLease'), parser.indexOf('export const maxParser'))), context);
  const result = await context.syncWithoutLease('lease');
  assert.equal(result.success, true);
  assert.equal(result.leadsCount, 3);
  assert.deepEqual(processed, chats.map(chat => chat.url));
  assert.deepEqual(results, ['OK', 'OK', 'OK']);
  assert.equal(saved.filter(rows => rows.length === 1 && rows[0].lastRunLeadsCount === 1 && rows[0].lastParsedAt).length, 3);
  assert.ok(journals.some(logs => logs.some(log => log.msg.includes('Начат проход'))));
});

test('автопарсинг повторяет проход после пяти минут и пропускает ранний вызов', async () => {
  const settings = new Map([['maks_parser_auto', 'true'], ['maks_parser_interval', '300']]);
  let now = 1000000, runs = 0;
  class Clock extends Date { static now() { return now; } }
  const context = vm.createContext({
    console, Date: Clock, NextResponse: { json: value => value }, process: { env: {} },
    verifyBearerSecret: () => true,
    maxParser: { sync: async () => { runs++; return { success: true, leadsCount: 1, logs: [] }; } },
    prisma: { setting: {
      findUnique: async ({ where }) => settings.has(where.key) ? { value: settings.get(where.key) } : null,
      upsert: async ({ where, update }) => settings.set(where.key, update.value),
    } },
  });
  const source = (await read('src/app/api/admin/parser/cron/route.ts')).replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  vm.runInContext(compile(source), context);
  const request = { headers: { get: () => null } };
  assert.equal((await context.POST(request)).success, true);
  now += 10000;
  assert.equal((await context.POST(request)).skipped, true);
  now += 290000;
  assert.equal((await context.POST(request)).success, true);
  assert.equal(runs, 2);
  assert.equal(settings.get('syncing'), 'false');
});
