// 23.09.2026: владелец разрешил только подключение отдельного тематического обработчика.
// 23.09.2026: дополнительно разрешено извлечение фотографий без изменения входа, сессий и прокси.
// Удаляем только согласованные правки для сравнения всего остального файла с исходным SHA-256.
// Эталон взят из de09017:src/services/max-parser.ts, переносы строк приведены к LF.
export const ORIGINAL_PARSER_NORMALIZED_SHA256 = '02d18d99caaac3e18ac1a377af0f388068c6fd2486b5b7a60910acd29dd7b4af';
export function originalParserSource(source) {
  const changes = [
    // 26.09.2026: сохранение настроек во время парсинга не должно откатываться его результатом.
    ["import { saveParserChatResults } from './parser-chat-results';", ''],
    ['  await saveParserChatResults(legacyChats);', [
      '  await prisma.setting.upsert({',
      "    where: { key: 'maks_parsing_chats' },",
      '    update: { value: JSON.stringify(legacyChats) },',
      "    create: { key: 'maks_parsing_chats', value: JSON.stringify(legacyChats) },",
      '  });',
    ].join(source.includes('\r\n') ? '\r\n' : '\n')],
    ['          .filter((item): item is WorkerResult[\'messages\'][number] => Boolean(item && typeof item.text === \'string\'))',
      '          .filter((item): item is { text: string; id?: string } => Boolean(item && typeof item.text === \'string\'))'],
    ['  messages: Array<{ text: string; id?: string; photos?: StagedPhoto[]; photoError?: string; photoReport?: PhotoReport; engagement?: unknown }>;',
      '  messages: Array<{ text: string; id?: string }>;'],
    ['          expiresAt: null,', ''],
    ["import { photoCaptureEnvironment } from './lead-media';", ''],
    ["import type { StagedPhoto, PhotoReport } from '@/lib/lead-media';", ''],
    ['  const photoEnvironment = await photoCaptureEnvironment();', ''],
    ['        ...photoEnvironment,', ''],
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

// Эталон Python-worker до дополнения фотографиями, переносы приведены к LF.
export const ORIGINAL_WORKER_NORMALIZED_SHA256 = '0498e26e289da8005d6972bfdea41a653a4aa56c50c297a5233b386e2fff57e5';
export function originalWorkerSource(source) {
  source = source.replace(/\r\n/g, '\n');
  // 26.09.2026: пользователь запросил отдельное отображение реакций и счётчиков MAX.
  for (const line of ['from parser_engagement import enrich_engagement', '            enrich_engagement(page, messages)']) {
    if (source.split(line + '\n').length !== 2) throw new Error('Не совпадает точка сбора статистики MAX');
    source = source.replace(line + '\n', '');
  }
  for (const line of ['from parser_media import MessagePhotos', '            photos = MessagePhotos(page)', '            photos.enrich(messages)']) {
    if (source.split(line + '\n').length !== 2) throw new Error('Не совпадает согласованное дополнение фотографий');
    source = source.replace(line + '\n', '');
  }
  return source;
}
