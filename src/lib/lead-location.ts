const UNKNOWN = /^(?:не\s*указан[ао]?|неизвест[а-я]*|нет|—|-|адрес в тексте|уточняется|уточняйте.*)$/iu;
const PREFIX = /^(?:адрес(?:\s+работы|\s+объекта)?|место работы|локация)\s*:\s*/iu;
const STREET = /(?<!\p{L})(?:ул\.|улица|улице|улицы|проспект|пр-т|просп\.|переулок|пер\.|шоссе|бульвар|б-р|набережная|наб\.|площадь|пл\.|проезд|аллея|тупик|микрорайон|мкр\.?)(?!\p{L})/iu;
const NAMED_STREET = /^(?:(?:улица|ул\.)\s+[А-ЯЁ][\p{L} -]*|[А-ЯЁ][\p{L} -]*\s+улица)$/u;
const METRO = /(?:метро|м\.|Ⓜ\uFE0F?|🚇|🚉)\s*([А-ЯЁ][\p{L}-]*(?:\s+[А-ЯЁ][\p{L}-]*)?)/iu;

function plainLine(value: string): string {
  return value.replace(/^[\s📍📌🗺\uFE0F]+/u, '').trim();
}

/** Распознаём только написанный адрес; географию и номер дома не додумываем. */
export function isLeadAddressLine(value: string): boolean {
  const line = plainLine(value);
  const address = line.replace(PREFIX, '').trim();
  if (!address || UNKNOWN.test(address)) return false;
  return PREFIX.test(line) || NAMED_STREET.test(line) || (STREET.test(line) && /\d/u.test(line));
}

/** Город имеет приоритет; без города показываем метро или наличие адреса в тексте. */
export function leadLocationLabel(rawText: string, city?: string | null): string | null {
  const lines = String(rawText || '').split(/\r?\n/).map(plainLine);
  const addresses = lines.filter(isLeadAddressLine).map((line) => line.replace(PREFIX, '').trim());
  const knownCity = city?.trim();
  const hasCity = Boolean(knownCity && !UNKNOWN.test(knownCity));
  if (hasCity) return knownCity!;
  const metro = lines.map((line) => line.match(METRO)?.[1]?.trim()).find(Boolean);
  if (metro) return `метро ${metro}`;
  return addresses.length ? 'Адрес в тексте' : null;
}
