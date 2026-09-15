import { cleanLeadText } from './lead-display.ts';

const GENERIC = /^(?:требуется|требуются|ищем|нужен|нужна|нужны|нужно|вакансия|работа|новый заказ|новое сообщение)[!:.\s]*$/iu;
const SERVICE = /^(?:(?:создано\s+)?заказов\s*:|зарегистрирован[а-я]*\s*:|\d+\s+подписчик|контакты?|телефон|telegram|телеграм|https?:|@|№\d|комментари[а-я]*|просмотр[а-я]*)/iu;
const DETAILS = /^(?:адрес|город|метро|м\.|г\.|ул\.|район|оплата|зарплата|график|условия|требования|обязанности|гражданство|оформление|контакты|начало смены)(?:\s|:)/iu;
const PROMOTION = /(?:подписывай|наш канал|больше (?:вакансий|объявлений)|заказ любой сложности|максимально короткие сроки)/iu;
const LOCATION_HEADING = /^работа\s+(?:в\s+)?(?:москв[ае]|спб|санкт-петербург[е]?)[!:.\s]*$/iu;

function cleanCandidate(value: string): string {
  return value.replace(/^[\s\p{Extended_Pictographic}\uFE0F\u200D•|—–!-]+/u, '')
    .replace(/[\s:;—–-]+$/u, '').replace(/\s+/g, ' ').trim();
}

/** Первая содержательная строка исходника; сохранённый заголовок и ответ ИИ не добавляют фактов. */
export function buildLeadTitle(sourceText: string, _suggestedTitle?: unknown): string {
  void _suggestedTitle; // Параметр оставлен для совместимости вызовов; факты берём только из исходника.
  const lines = cleanLeadText(sourceText).split(/\n+/).map(cleanCandidate)
    .filter((line) => line.length >= 4 && /\p{L}/u.test(line) && !SERVICE.test(line));
  let best = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (DETAILS.test(line) || LOCATION_HEADING.test(line) || PROMOTION.test(line)) continue;
    // Убираем только узнаваемую приставку канала, сохраняя исходную фразу целиком.
    let candidate = line.replace(/^работа\s+(?:москва|спб)\s+[\p{Extended_Pictographic}\uFE0F\s]+/iu, '');
    if (GENERIC.test(candidate)) {
      const next = lines[i + 1];
      if (!next || DETAILS.test(next) || GENERIC.test(next)) continue;
      candidate += ' ' + next;
    }
    const channelHeading = /\|/.test(line) && /работа|подработка|шабашка/iu.test(line);
    if (channelHeading) continue;
    best = candidate;
    break;
  }
  const words = cleanCandidate(best || lines[0] || '').split(/\s+/).filter(Boolean);
  while (words.join(' ').length > 200 && words.length > 1) words.pop();
  return words.join(' ') || 'Новое объявление';
}
