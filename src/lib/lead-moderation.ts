const VACANCY = /(?:^|[^\p{L}])(?:требу(?:ется|ются)|нуж(?:ен|на|ны)|ищем|приглашаем|набираем|ваканси[яи])(?:$|[^\p{L}])/iu;
const RESUME = /(?:^|[^\p{L}])(?:ищу работу|ищем работу|ищет работу|бригада ищет|предлагаю услуги|предлагаем услуги|предоставляем услуги|оказываем услуги|выполним работы|выполняем работы)(?:$|[^\p{L}])/iu;
const PROMOTION = /(?:^|[^\p{L}])(?:казино|ставки на спорт|крипта|заработок в интернете|эскорт|интим)(?:$|[^\p{L}])/iu;

export function hasVacancyIntent(text: string): boolean {
  return VACANCY.test(text);
}

/** Стоп-фразы администратора сохраняются; название профессии само по себе не спам. */
export function detectLeadSpam(text: string, customWords = ''): boolean {
  const lower = text.normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  const custom = customWords.split(/[,;\n]+/).map((word) => word.trim().toLowerCase().replace(/ё/g, 'е')).filter((word) => word.length > 2);
  if (custom.some((word) => lower.includes(word))) return true;
  if (/(?:подписывайтесь|наш канал|размещение рекламы|накрутка|раскрутка|переходите.*в чат|переходи.*в чат|оставьте.*объявление|приглашаю.*в чат|вступай.*в чат)/iu.test(lower)) return true;
  if (PROMOTION.test(lower)) return true;
  if (hasVacancyIntent(lower)) return false;
  return RESUME.test(lower);
}
