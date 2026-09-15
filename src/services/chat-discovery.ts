import 'server-only';

import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { normalizeMaxChatUrl } from '@/lib/max-chat-url';

const GOOGLE_URL = 'https://customsearch.googleapis.com/customsearch/v1';
const VK_URL = 'https://api.vk.com/method/newsfeed.search';
const LEASE_ID = 'max-chat-discovery';
const URL_PATTERN = /(?:https?:\/\/)?(?:web\.)?max\.ru\/[\p{L}\p{N}._~!$&()*+,;=:@%/?#-]+/giu;
const BLOCKED_PATHS = new Set(['login', 'download', 'support', 'privacy', 'terms', 'about']);
const DEFAULT_QUERIES = [
  'site:max.ru строительство ремонт заказ',
  'site:max.ru новостройки жильцы чат',
  'site:max.ru грузчики переезд заказ',
  'site:max.ru электрик сантехник мастер',
];

type Provider = 'GOOGLE' | 'VK' | 'SEED' | 'MANUAL';
type Candidate = { url: string; name: string | null; provider: Provider; source: string | null; score: number };
type Stats = { skipped: boolean; queries: number; candidates: number; inserted: number; activated: number; updated: number; errors: string[] };
export type DiscoveryResult = Stats & { success: boolean; message: string };

function envInt(name: string, fallback: number, min: number, max: number): number {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function text(value: unknown, limit: number): string | null {
  if (typeof value !== 'string') return null;
  const result = value.replace(/\s+/g, ' ').trim();
  return result ? result.slice(0, limit) : null;
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/([?&](?:key|access_token)=)[^&\s]+/gi, '$1***')
    .replace(/(Bearer\s+)[^\s]+/gi, '$1***')
    .slice(0, 500);
}

export function normalizeDiscoveredChatUrl(value: unknown): string {
  const url = new URL(normalizeMaxChatUrl(value));
  const first = url.pathname.split('/').filter(Boolean)[0]?.toLowerCase();
  if (!first || BLOCKED_PATHS.has(first)) throw new Error('Ссылка не ведёт на публичный объект MAX');
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith('utm_') || ['yclid', 'gclid'].includes(key)) url.searchParams.delete(key);
  }
  return url.toString();
}

export function extractMaxChatUrls(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  const result = new Set<string>();
  for (const match of value.slice(0, 250_000).matchAll(URL_PATTERN)) {
    try { result.add(normalizeDiscoveredChatUrl(match[0].replace(/[),.;!?]+$/u, ''))); } catch { /* пропускаем */ }
  }
  return [...result].slice(0, 100);
}

async function json(url: URL): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), envInt('DISCOVERY_HTTP_TIMEOUT_MS', 10_000, 2_000, 30_000));
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'MAKS-LEAD-HUB/1.0' },
      cache: 'no-store', redirect: 'error', signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Провайдер вернул HTTP ${response.status}`);
    const body = await response.text();
    if (Buffer.byteLength(body) > 2 * 1024 * 1024) throw new Error('Ответ провайдера превышает лимит');
    return JSON.parse(body) as unknown;
  } finally { clearTimeout(timer); }
}

function fromText(value: unknown, base: Omit<Candidate, 'url'>): Candidate[] {
  return extractMaxChatUrls(value).map((url) => ({ ...base, url }));
}

async function google(query: string): Promise<Candidate[]> {
  const key = process.env.DISCOVERY_GOOGLE_API_KEY?.trim();
  const cx = process.env.DISCOVERY_GOOGLE_CX?.trim();
  if (!key || !cx) return [];
  const url = new URL(GOOGLE_URL);
  url.search = new URLSearchParams({ key, cx, q: query, num: '10', safe: 'active', gl: 'ru' }).toString();
  const payload = await json(url) as { items?: Array<{ link?: unknown; title?: unknown; snippet?: unknown }> };
  return (payload.items || []).flatMap((item) => {
    const name = text(item.title, 160);
    const source = text(item.link, 1000);
    return [
      ...fromText(item.link, { provider: 'GOOGLE', name, source, score: 95 }),
      ...fromText(`${String(item.title || '')} ${String(item.snippet || '')}`, { provider: 'GOOGLE', name, source, score: 82 }),
    ];
  });
}

async function vk(query: string): Promise<Candidate[]> {
  const token = process.env.DISCOVERY_VK_TOKEN?.trim();
  if (!token) return [];
  const url = new URL(VK_URL);
  url.search = new URLSearchParams({ access_token: token, v: process.env.DISCOVERY_VK_API_VERSION || '5.199', q: query, count: '100' }).toString();
  const payload = await json(url) as { error?: { error_msg?: unknown }; response?: { items?: unknown[] } };
  if (payload.error) throw new Error(`VK API: ${text(payload.error.error_msg, 200) || 'неизвестная ошибка'}`);
  return (payload.response?.items || []).flatMap((item) => {
    const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const body = text(row.text, 100_000) || '';
    const source = typeof row.source_id === 'number' && typeof row.id === 'number' ? `https://vk.com/wall${row.source_id}_${row.id}` : null;
    return fromText(body, { provider: 'VK', name: text(body, 160), source, score: 88 });
  });
}

async function acquireLease(): Promise<string | null> {
  const token = randomUUID();
  const now = new Date();
  await prisma.parserLease.upsert({ where: { id: LEASE_ID }, update: {}, create: { id: LEASE_ID } });
  const result = await prisma.parserLease.updateMany({
    where: { id: LEASE_ID, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
    data: { token, lockedUntil: new Date(now.getTime() + 600_000), lastStartedAt: now },
  });
  return result.count === 1 ? token : null;
}

async function releaseLease(token: string, result: string): Promise<void> {
  await prisma.parserLease.updateMany({
    where: { id: LEASE_ID, token },
    data: { token: null, lockedUntil: null, lastFinishedAt: new Date(), lastResult: result.slice(0, 500) },
  });
}

async function store(candidate: Candidate, threshold: number): Promise<'inserted' | 'activated' | 'updated'> {
  const existing = await prisma.targetChat.findUnique({ where: { url: candidate.url } });
  const activate = candidate.score >= threshold;
  if (!existing) {
    await prisma.targetChat.create({ data: {
      url: candidate.url, name: candidate.name, provider: candidate.provider,
      discoveredFrom: candidate.source, score: candidate.score,
      status: activate ? 'ACTIVE' : 'PENDING', active: activate,
    } });
    return activate ? 'activated' : 'inserted';
  }
  const activateNow = existing.status !== 'REJECTED' && !existing.active && activate;
  await prisma.targetChat.update({ where: { id: existing.id }, data: {
    name: existing.name || candidate.name,
    discoveredFrom: existing.discoveredFrom || candidate.source,
    score: Math.max(existing.score, candidate.score), discoveryCount: { increment: 1 },
    lastDiscoveredAt: new Date(), status: activateNow ? 'ACTIVE' : existing.status,
    active: activateNow || existing.active,
  } });
  return activateNow ? 'activated' : 'updated';
}

export async function addManualTargetChat(url: unknown, name?: unknown) {
  const normalized = normalizeDiscoveredChatUrl(url);
  await store({ url: normalized, name: text(name, 160) || 'MAX-чат', provider: 'MANUAL', source: 'admin', score: 100 }, 100);
  return prisma.targetChat.findUnique({ where: { url: normalized } });
}

export async function runChatDiscovery(): Promise<DiscoveryResult> {
  const lease = await acquireLease();
  if (!lease) return { success: true, skipped: true, message: 'Поиск уже выполняется', queries: 0, candidates: 0, inserted: 0, activated: 0, updated: 0, errors: [] };
  const stats: Stats = { skipped: false, queries: 0, candidates: 0, inserted: 0, activated: 0, updated: 0, errors: [] };
  let runId: string | null = null;
  try {
    const run = await prisma.discoveryRun.create({ data: { provider: 'ALL' } });
    runId = run.id;
    const queries = (process.env.DISCOVERY_QUERIES || DEFAULT_QUERIES.join('|')).split('|').map((q) => q.trim()).filter(Boolean).slice(0, 20);
    const candidates = fromText(process.env.DISCOVERY_SEED_URLS || '', { provider: 'SEED', name: 'Импортированный источник', source: 'env', score: 100 });
    const googleEnabled = Boolean(process.env.DISCOVERY_GOOGLE_API_KEY && process.env.DISCOVERY_GOOGLE_CX);
    const vkEnabled = Boolean(process.env.DISCOVERY_VK_TOKEN);
    for (const query of queries) {
      if (googleEnabled) { stats.queries++; try { candidates.push(...await google(query)); } catch (e) { stats.errors.push(`Google: ${safeError(e)}`); } }
      if (vkEnabled) { stats.queries++; try { candidates.push(...await vk(query)); } catch (e) { stats.errors.push(`VK: ${safeError(e)}`); } }
    }
    stats.skipped = !googleEnabled && !vkEnabled && candidates.length === 0;
    const unique = new Map<string, Candidate>();
    for (const item of candidates) if (!unique.has(item.url) || item.score > unique.get(item.url)!.score) unique.set(item.url, item);
    stats.candidates = unique.size;
    const threshold = envInt('DISCOVERY_AUTO_ACTIVATE_SCORE', 85, 0, 100);
    for (const item of unique.values()) {
      try { stats[await store(item, threshold)]++; } catch (e) { stats.errors.push(`${item.provider}: ${safeError(e)}`); }
    }
    const success = stats.errors.length === 0;
    const status = stats.skipped ? 'SKIPPED' : success ? 'SUCCESS' : 'PARTIAL';
    const message = stats.skipped ? 'Провайдеры поиска не настроены' : `Найдено ${stats.candidates}, активировано ${stats.activated}`;
    await prisma.discoveryRun.update({ where: { id: runId }, data: {
      status, queries: stats.queries, candidates: stats.candidates, inserted: stats.inserted,
      activated: stats.activated, error: stats.errors.join('; ').slice(0, 1000) || null, finishedAt: new Date(),
    } });
    await releaseLease(lease, `${status}: ${message}`);
    return { ...stats, success, message };
  } catch (error) {
    const message = safeError(error);
    if (runId) {
      await prisma.discoveryRun.update({ where: { id: runId }, data: { status: 'FAILED', error: message, finishedAt: new Date() } });
    }
    await releaseLease(lease, `FAILED: ${message}`);
    return { ...stats, success: false, message, errors: [...stats.errors, message] };
  }
}
