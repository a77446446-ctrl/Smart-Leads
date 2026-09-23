// 23.09.2026: владелец разрешил только подключение отдельного тематического обработчика.
// Удаляем ровно три согласованные правки для сравнения всего остального файла с исходным SHA-256.
// Эталон взят из de09017:src/services/max-parser.ts, переносы строк приведены к LF.
export const ORIGINAL_PARSER_NORMALIZED_SHA256 = '02d18d99caaac3e18ac1a377af0f388068c6fd2486b5b7a60910acd29dd7b4af';
export function originalParserSource(source) {
  const changes = [
    ["import { selectMessageProcessor } from './themed-message-processor';", ''],
    ['      const processReceivedMessage = await selectMessageProcessor(processMessage);', ''],
    ['        if (await processReceivedMessage(message, chatUrl, title, item.chat.parseAll, logs)) {', '        if (await processMessage(message, chatUrl, title, item.chat.parseAll, logs)) {'],
  ];
  for (const [after, before] of changes) {
    if (source.split(after).length !== 2) throw new Error('Не совпадает согласованная точка подключения тематического обработчика');
    const suffix = before === '' ? (source.slice(source.indexOf(after) + after.length).startsWith('\r\n') ? '\r\n' : '\n') : '';
    source = source.replace(after + suffix, before);
  }
  return source.replace(/\r\n/g, '\n');
}
