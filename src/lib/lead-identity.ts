import { createHash } from 'node:crypto';
import { currentLeadContentKey } from './lead-content.ts';

/** Сравниваем весь текст: разные зарплаты, адреса и контакты не объединяются. */
export function buildLeadContentFingerprint(lead: { rawText: string; phone?: string | null }): string {
  return createHash('sha256').update(currentLeadContentKey(lead)).digest('hex');
}

export class DuplicateLeadError extends Error {
  readonly leadId: string;

  constructor(leadId: string) {
    super('Объявление уже сохранено');
    this.name = 'DuplicateLeadError';
    this.leadId = leadId;
  }
}

export function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
