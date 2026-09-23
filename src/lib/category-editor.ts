import { classifyLeadCategory, normalizeCategoryText } from '@/lib/lead-category';

/** Собирает теги вместе с ещё не подтверждённым вводом, сохраняя первое написание. */
export function mergeCategoryKeywords(input: string, current: readonly string[] = []): string[] {
  const unique = new Map<string, string>();
  for (const item of [...current, input]) {
    for (const part of item.split(/[,;.\r\n]+/)) {
      const word = part.trim();
      const key = normalizeCategoryText(word);
      if (key && !unique.has(key)) unique.set(key, word);
    }
  }
  return [...unique.values()];
}

export type CategoryRulePreview = {
  status: 'empty' | 'inactive' | 'missing-plus' | 'excluded' | 'unmatched' | 'matched';
  plusMatches: string[];
  minusMatches: string[];
  conflicts: string[];
};

/** Проверяет только рубрику; не запускает MAX, ИИ, очистку текста и отбор лидов. */
export function previewCategoryRule(text: string, plus: readonly string[], minus: readonly string[], active: boolean): CategoryRulePreview {
  const plusWords = mergeCategoryKeywords('', plus);
  const minusWords = mergeCategoryKeywords('', minus);
  const minusKeys = new Set(minusWords.map(normalizeCategoryText));
  const conflicts = plusWords.filter(word => minusKeys.has(normalizeCategoryText(word)));
  // Повторно используем действующее сопоставление, не меняя общую логику парсера.
  const match = (words: string[]) => classifyLeadCategory(text, [{ slug: 'preview', plusKeywords: words.join(',') }]).matchedKeywords;
  const plusMatches = match(plusWords);
  const minusMatches = match(minusWords);
  const status = !normalizeCategoryText(text) ? 'empty'
    : !active ? 'inactive'
    : minusMatches.length ? 'excluded'
    : !plusWords.length ? 'missing-plus'
    : plusMatches.length ? 'matched' : 'unmatched';
  return { status, plusMatches, minusMatches, conflicts };
}
