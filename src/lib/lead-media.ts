import path from 'node:path';

export const MAX_LEAD_PHOTOS = 6;
export const MEDIA_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export type StagedPhoto = { key: string; mimeType: string };
export type PhotoReport = { enabled: boolean; messages: number; found: number; saved: number; errors: number };
export type PhotoMessage = { text: string; id?: string; photos?: StagedPhoto[]; photoError?: string; photoReport?: PhotoReport; engagement?: unknown };

export function mediaRoot() {
  return path.resolve(process.env.LEAD_MEDIA_DIR || path.join(process.cwd(), 'data', 'lead-media'));
}

export function mediaPath(key: string, staging = false) {
  if (!MEDIA_KEY.test(key)) throw new Error('Некорректный идентификатор фотографии');
  return path.join(mediaRoot(), staging ? 'staging' : 'files', key);
}

export function mediaLimitBytes() {
  const mb = Number(process.env.LEAD_MEDIA_MAX_MB || 1024);
  return (Number.isInteger(mb) && mb >= 64 && mb <= 102400 ? mb : 1024) * 1024 * 1024;
}

export function publicationExpiresAt(ttlMinutes: number | undefined, now = Date.now()) {
  const ttl = Number.isInteger(ttlMinutes) && ttlMinutes! > 0 ? Math.min(ttlMinutes!, 525600) : 1440;
  return new Date(now + ttl * 60_000);
}

export function canReadLeadMedia(lead: { accessMode: string; deletedAt: Date | null; expiresAt: Date | null; purchases: { userId: string }[] }, userId: string, now = Date.now()) {
  if (lead.purchases.some(purchase => purchase.userId === userId)) return true;
  return lead.accessMode === 'PUBLIC' && !lead.deletedAt && (!lead.expiresAt || lead.expiresAt.getTime() > now);
}
