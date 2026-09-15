const MAX_SAFE_VALUE = Number.MAX_SAFE_INTEGER;

export function rublesToKopecks(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new Error('Некорректная сумма');
  const rubles = Math.round(value);
  if (rubles > MAX_SAFE_VALUE) throw new Error('Сумма превышает лимит');
  return rubles;
}

export function kopecksToRubles(value: number): number {
  if (value > MAX_SAFE_VALUE || value < -MAX_SAFE_VALUE) throw new Error('Сумма превышает лимит');
  return value;
}
