export type LeadCategoryRule = {
  slug: string;
  name?: string;
  plusKeywords?: string | null;
  minusKeywords?: string | null;
};

export type LeadCategoryMatch = {
  categorySlug: string;
  matched: boolean;
  score: number;
  matchedKeywords: string[];
};

type RankedCategory = LeadCategoryMatch & {
  matchedCharacters: number;
};

export function normalizeCategoryText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function keywords(value: string | null | undefined): string[] {
  return [...new Set(
    String(value || '')
      .split(/[,;\n]+/)
      .map(normalizeCategoryText)
      .filter(Boolean),
  )];
}

function containsKeyword(normalizedText: string, keyword: string): boolean {
  if (keyword.length > 3) return normalizedText.includes(keyword);
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'u').test(normalizedText);
}

export function classifyLeadCategory(
  text: string,
  categories: LeadCategoryRule[],
): LeadCategoryMatch {
  const normalizedText = normalizeCategoryText(text);
  if (!normalizedText) {
    return { categorySlug: 'other', matched: false, score: 0, matchedKeywords: [] };
  }

  const ranked: RankedCategory[] = [];
  for (const category of categories) {
    const categorySlug = String(category.slug || '').trim();
    if (!categorySlug) continue;

    const minusKeywords = keywords(category.minusKeywords);
    if (minusKeywords.some((keyword) => containsKeyword(normalizedText, keyword))) continue;

    const matchedKeywords = keywords(category.plusKeywords)
      .filter((keyword) => containsKeyword(normalizedText, keyword));
    if (matchedKeywords.length === 0) continue;

    ranked.push({
      categorySlug,
      matched: true,
      score: matchedKeywords.reduce((total, keyword) => total + (keyword.length > 5 ? 2 : 1), 0),
      matchedKeywords,
      matchedCharacters: matchedKeywords.reduce((total, keyword) => total + keyword.length, 0),
    });
  }

  ranked.sort((left, right) =>
    right.score - left.score
    || right.matchedKeywords.length - left.matchedKeywords.length
    || right.matchedCharacters - left.matchedCharacters
    || left.categorySlug.localeCompare(right.categorySlug, 'ru-RU')
  );

  const winner = ranked[0];
  if (!winner) {
    return { categorySlug: 'other', matched: false, score: 0, matchedKeywords: [] };
  }
  return {
    categorySlug: winner.categorySlug,
    matched: true,
    score: winner.score,
    matchedKeywords: winner.matchedKeywords,
  };
}
