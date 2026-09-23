/** Доступ определяется записью, а не текущей темой приложения или нулевой ценой. */
export function isPublicPublication(value: { accessMode?: string | null }): boolean {
  return value.accessMode === 'PUBLIC';
}

export function themeHasPublications(theme: string): boolean {
  return ['news', 'events', 'free'].includes(theme);
}
