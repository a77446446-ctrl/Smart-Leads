import type { PrismaClient } from '@prisma/client';
import { buildLeadContentFingerprint, isUniqueConstraintError } from './lead-identity.ts';

/** Возобновляемая обработка старых записей. Тексты, покупки и статусы не меняются. */
export async function backfillLeadIdentities(db: Pick<PrismaClient, 'lead'>) {
  let indexed = 0;
  let duplicates = 0;
  let cursor: string | undefined;
  for (;;) {
    const batch = await db.lead.findMany({
      // Проверяем и заполненные ключи: старые правила включали изменяемые счётчики MAX.
      ...(cursor ? { where: { id: { gt: cursor } } } : {}),
      orderBy: { id: 'asc' },
      take: 200,
      select: { id: true, rawText: true, phone: true, contentFingerprint: true, duplicateOfId: true },
    });
    if (!batch.length) return { indexed, duplicates };
    for (const lead of batch) {
      const contentFingerprint = buildLeadContentFingerprint(lead);
      if (lead.contentFingerprint === contentFingerprint && !lead.duplicateOfId) continue;
      try {
        // Уникальный индекс сам выбирает единственного владельца содержимого.
        const result = await db.lead.updateMany({
          where: { id: lead.id, contentFingerprint: lead.contentFingerprint, duplicateOfId: lead.duplicateOfId },
          data: { contentFingerprint, duplicateOfId: null },
        });
        indexed += result.count;
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        const canonical = await db.lead.findUnique({
          where: { contentFingerprint }, select: { id: true },
        });
        if (!canonical) throw error;
        const result = await db.lead.updateMany({
          where: { id: lead.id, contentFingerprint: lead.contentFingerprint, duplicateOfId: lead.duplicateOfId },
          data: { contentFingerprint: null, duplicateOfId: canonical.id },
        });
        duplicates += result.count;
      }
    }
    cursor = batch[batch.length - 1].id;
  }
}
