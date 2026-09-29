// 28.09.2026: владелец запросил восстановление проходов после тайм-аутов медиа.
// Проверяем прежние контрольные суммы, исключая только перечисленные точки восстановления.
export function originalBeforeRecovery(file, source) {
  source = source.replace(/\r\n/g, '\n');
  const changes = file === 'worker' ? [
    ["from parser_progress import begin, checkpoint, stage as report_stage\n", ''],
    ['    begin()\n', ''],
    ['    requested_chat_url = chat_url\n', ''],
    ['            report_stage(stage)\n', '', 3],
    ['            report_stage("чтение последних сообщений")\n', ''],
    ['            checkpoint(result(requested_chat_url, "OK", title=title, messages=messages))\n', ''],
    ['            report_stage("обработка фотографий")\n', ''],
    ['            report_stage("обработка реакций")\n', ''],
    ['        report_stage("закрытие браузера")\n', ''],
    ['    main()\n', '    main()'],
  ] : [
    ["import { saveParserChatResults, saveParserProgress } from './parser-chat-results';", "import { saveParserChatResults } from './parser-chat-results';"],
    ["import { ParserWorkerProgress, stopParserWorker } from './parser-worker-progress';\n", ''],
    ['    const progress = new ParserWorkerProgress<WorkerResult>(chatUrl);\n', ''],
    ["      detached: process.platform !== 'win32',\n", ''],
    ['        PARSER_WORKER_TIMEOUT_MS: String(timeoutMs),\n', ''],
    ["    const collect = (target: 'stdout' | 'stderr', chunk: Buffer | string) => {\n      if (finished) return;", "    const collect = (target: 'stdout' | 'stderr', chunk: Buffer | string) => {"],
    ['stopParserWorker(child);', "child.kill('SIGTERM');", 2],
    ["      if (target === 'stdout') { stdout = next; progress.collect(typeof chunk === 'string' ? chunk : chunk.toString('utf8')); }", "      if (target === 'stdout') stdout = next;"],
    ['progress.recover() || ', '', 4],
    ['`Worker превысил ${timeoutMs} мс; этап: ${progress.stage}`', '`Worker превысил ${timeoutMs} мс`'],
    ['    pushLog(logs, `Начат проход: чатов ${selected.length}`);\n    await saveParserProgress(logs);\n', ''],
    ['      pushLog(logs, `[${item.chat.name}] Начат разбор чата`);\n      await saveParserProgress(logs);\n', ''],
    ["          if (worker.status === 'OK' && worker.error) pushLog(logs, `[${item.chat.name}] ${worker.error}`);\n", ''],
    ['        await saveParserProgress(logs);\n', ''],
    ['      await saveChats([item.chat]);\n      await saveParserProgress(logs);\n', ''],
  ];
  for (const [after, before, count = 1] of changes) {
    if (source.split(after).length - 1 !== count) throw new Error('Изменена точка восстановления: ' + file + ': ' + after);
    source = source.split(after).join(before);
  }
  return source;
}
