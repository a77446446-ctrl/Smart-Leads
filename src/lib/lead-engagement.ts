import { cleanLeadText } from './lead-display.ts';

export type LeadEngagement = {
  body: string; show: boolean;
  reactions: { count: string; emoji?: string; image?: string }[];
  views?: string; time?: string; comments?: string;
};

/** Никаких внешних URL или HTML: только ограниченные счётчики и маленькие PNG. */
export function normalizeEngagement(value: unknown, show: boolean): LeadEngagement | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.body !== 'string' || !row.body.trim() || row.body.length > 100_000) return null;
  const count = (input: unknown) => typeof input === 'string' && /^\d[\d\s]{0,12}(?:[.,]\d{1,2})?\s*[KКMМ]?$/iu.test(input.trim())
    ? input.trim() : undefined;
  const reactions: LeadEngagement['reactions'] = [];
  if (show && Array.isArray(row.reactions)) for (const item of row.reactions.slice(0, 16)) {
    if (!item || typeof item !== 'object') continue;
    const amount = count(item.count);
    if (!amount) continue;
    const reaction: LeadEngagement['reactions'][number] = { count: amount };
    if (typeof item.emoji === 'string' && item.emoji.length <= 32 && /\p{Extended_Pictographic}/u.test(item.emoji)) reaction.emoji = item.emoji;
    if (typeof item.image === 'string' && item.image.length <= 12000 && /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(item.image)) reaction.image = item.image;
    reactions.push(reaction);
  }
  return { body: row.body.replace(/\u0000/g, '').trim(), show, reactions,
    ...(show && count(row.views) ? { views: count(row.views) } : {}),
    ...(show && count(row.comments) ? { comments: count(row.comments) } : {}),
    ...(show && typeof row.time === 'string' && /^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(row.time) ? { time: row.time } : {}),
  };
}

/** У старых записей эмодзи утрачены: убираем хвост, не приписывая цифрам значения. */
export function presentLeadEngagement(rawText: string, value: unknown) {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : null;
  const engagement = normalizeEngagement(value, row?.show === true);
  return { text: engagement?.body || cleanLeadText(rawText), engagement };
}
