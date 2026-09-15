import { cleanLeadText } from './lead-display.ts';
export { cleanLeadText };

const CONTACT_FOOTER = /^Контакты\s*\(ссылки\):/iu;
const EMOJI_PREFIX = /^(?:[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]|\s)*/;
const META_LINE = new RegExp(EMOJI_PREFIX.source + '(?:(?:сегодня|вчера|завтра)?\\s*(?:в\\s*)?(?:[01]?\\d|2[0-3]):[0-5]\\d|\\d{1,7}(?:[.,]\\d+)?[kкmм]?|комментари[а-я]*|просмотр[а-я]*|реакци[а-я]*|поделил[а-я]*|переслал[а-я]*|изменен[а-я]*)\\s*$', 'iu');
const VALUE_LABEL = /(?:оплат\p{L}*|зарплат\p{L}*|оклад|ставк\p{L}*|бюджет|сумм\p{L}*|телефон|контакт|адрес|дом|кв\.?|корпус|начало|окончание|смен\p{L}*|график|время)\s*[:—–-]?$/iu;
const PROMO_FOOTER = /^(?:подборка вакансий|больше вакансий|все вакансии|подписывайтесь|подпишись|подписывайся|переходи в|наш канал|telegram канал).*/iu;

/** Удаляет хвост интерфейса, сохраняя числа и время внутри объявления. */
function cleanBlock(lines: string[]): string[] {
  const result = lines.filter((line) => !PROMO_FOOTER.test(line) && !/^[_\-\s=~*]{4,}$/.test(line));
  while (result.length && !result.at(-1)) result.pop();
  
  if (result.length === 0) return result;

  let end = result.length - 1;
  if (!META_LINE.test(result[end])) {
    return result;
  }

  let start = end;
  while (start > 0 && META_LINE.test(result[start - 1])) {
    start--;
  }

  let label = start - 1;
  while (label >= 0 && !result[label]) label--;
  // «Начало смены: / 09:15» и «Оплата: / 4500» — данные объявления, не счётчики.
  if (label >= 0 && VALUE_LABEL.test(result[label])) return result;
  
  result.splice(start, end - start + 1);
  while (result.length && !result.at(-1)) result.pop();
  return result;
}

/** Зафиксированная нормализация старых отпечатков. Не используется для отображения. */
function legacyIdentityText(value: string): string {
  const lines = String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/🚇/g, 'М')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b\ufeff]/g, '')
    .split('\n')
    .map((line) => line.replace(/[\t\u00a0 ]+/g, ' ').trim());
  const output: string[] = [];
  let block: string[] = [];
  for (const line of lines) {
    if (CONTACT_FOOTER.test(line)) {
      output.push(...cleanBlock(block), line);
      block = [];
    } else {
      block.push(line);
    }
  }
  output.push(...cleanBlock(block));
  
  let result = output.join('\n');
  result = result.replace(/(?:^|\s)(?:[Мм]\.|[Мм]етро)\s+([А-ЯЁ][а-яёА-ЯЁ0-9\s-]+)/gu, ' Ⓜ️ $1').trim();
  
  return result.replace(/\n{3,}/g, '\n\n').trim();
}

/** Точное содержимое, без нечёткого сравнения профессий, адресов или телефонов. */
export function leadContentKey(lead: { rawText: string; phone?: string | null }): string {
  const text = legacyIdentityText(lead.rawText).normalize('NFC').replace(/\s+/g, ' ').trim();
  const phone = (lead.phone || '').replace(/[^\d+]/g, '');
  return JSON.stringify([text, phone]);
}

/** Общий ключ для записи и ленты: счётчики MAX не создают новое объявление. */
export function currentLeadContentKey(lead: { rawText: string; phone?: string | null }): string {
  const text = cleanLeadText(lead.rawText).normalize('NFC')
    .replace(/[\u200b-\u200f\u2060\ufeff]/g, '')
    .replace(/\s+/g, ' ').trim();
  const phone = (lead.phone || '').replace(/[^\d+]/g, '');
  return JSON.stringify([text, phone]);
}

/** Старые записи остаются в БД вместе с покупками; в списке показываем одну копию. */
export function uniqueLeadCards<T extends { rawText: string; phone?: string | null }>(leads: T[]): T[] {
  const seen = new Set<string>();
  return leads.filter((lead) => {
    if (!cleanLeadText(lead.rawText)) return true;
    const key = currentLeadContentKey(lead);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
