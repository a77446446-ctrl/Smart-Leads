const DAY_MS = 24 * 60 * 60 * 1_000;

const RUSSIAN_MONTHS: Record<string, number> = {
  января: 1,
  февраля: 2,
  марта: 3,
  апреля: 4,
  мая: 5,
  июня: 6,
  июля: 7,
  августа: 8,
  сентября: 9,
  октября: 10,
  ноября: 11,
  декабря: 12,
};

function validDateKey(year: number, month: number, day: number): number | null {
  const key = Date.UTC(year, month - 1, day);
  const value = new Date(key);
  if (
    value.getUTCFullYear() !== year
    || value.getUTCMonth() !== month - 1
    || value.getUTCDate() !== day
  ) {
    return null;
  }
  return key;
}

function normalizeYear(rawYear: string | undefined): number | null {
  if (!rawYear) return null;
  const parsed = Number.parseInt(rawYear, 10);
  if (!Number.isInteger(parsed)) return null;
  if (rawYear.length === 2) return parsed >= 70 ? 1900 + parsed : 2000 + parsed;
  return parsed;
}

function inferredDateKey(day: number, month: number, year: number | null, todayKey: number): number | null {
  if (year !== null) return validDateKey(year, month, day);

  const currentYear = new Date(todayKey).getUTCFullYear();
  const candidates = [currentYear - 1, currentYear, currentYear + 1]
    .map((candidateYear) => validDateKey(candidateYear, month, day))
    .filter((candidate): candidate is number => candidate !== null);
  if (candidates.length === 0) return null;
  return candidates.reduce((nearest, candidate) =>
    Math.abs(candidate - todayKey) < Math.abs(nearest - todayKey) ? candidate : nearest
  );
}

function moscowTodayKey(referenceDate: Date): number {
  const moscowTime = new Date(referenceDate.getTime() + 3 * 60 * 60 * 1_000);
  return Date.UTC(
    moscowTime.getUTCFullYear(),
    moscowTime.getUTCMonth(),
    moscowTime.getUTCDate(),
  );
}

export function hasOnlyExpiredLeadDates(text: string, referenceDate = new Date()): boolean {
  if (!text.trim()) return false;

  const todayKey = moscowTodayKey(referenceDate);
  const dates = new Set<number>();
  const numericDate = /(?<!\d)([0-3]?\d)([./-])([01]?\d)(?:\2(\d{2}|\d{4}))?(?!\d)/g;
  const namedDate = /(?<!\d)([0-3]?\d)\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\s+(\d{4}))?(?!\d)/gi;

  for (const match of text.matchAll(numericDate)) {
    const key = inferredDateKey(
      Number.parseInt(match[1], 10),
      Number.parseInt(match[3], 10),
      normalizeYear(match[4]),
      todayKey,
    );
    if (key !== null) dates.add(key);
  }

  for (const match of text.matchAll(namedDate)) {
    const key = inferredDateKey(
      Number.parseInt(match[1], 10),
      RUSSIAN_MONTHS[match[2].toLowerCase()],
      normalizeYear(match[3]),
      todayKey,
    );
    if (key !== null) dates.add(key);
  }

  if (dates.size === 0) return false;
  return Math.max(...dates) <= todayKey - DAY_MS;
}
