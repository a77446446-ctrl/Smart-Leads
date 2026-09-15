import { decryptProxyUrl, encryptProxyUrl } from '@/lib/parser-accounts';
import { prisma } from '@/lib/prisma';
import { normalizeProxyUrl } from '@/lib/proxy';

export const PROXY_DRAFT_KEY = 'maks_proxy_draft_encrypted';

export type ProxyDraftDescription = {
  protocol: 'http://' | 'socks5://';
  host: string;
  port: string;
  username: string;
  hasPassword: boolean;
};

export async function getProxyDraft(): Promise<string | null> {
  const setting = await prisma.setting.findUnique({ where: { key: PROXY_DRAFT_KEY } });
  return decryptProxyUrl(setting?.value);
}

export async function saveProxyDraft(value: unknown): Promise<string> {
  const normalized = normalizeProxyUrl(value);
  if (!normalized) throw new Error('Прокси не задан');
  const encrypted = encryptProxyUrl(normalized);
  if (!encrypted) throw new Error('Не удалось зашифровать прокси');
  await prisma.setting.upsert({
    where: { key: PROXY_DRAFT_KEY },
    update: { value: encrypted },
    create: { key: PROXY_DRAFT_KEY, value: encrypted },
  });
  return normalized;
}

export function describeProxyDraft(value: string): ProxyDraftDescription {
  const url = new URL(value);
  return {
    protocol: url.protocol.startsWith('socks5') ? 'socks5://' : 'http://',
    host: url.hostname,
    port: url.port,
    username: decodeURIComponent(url.username || ''),
    hasPassword: Boolean(url.password),
  };
}

export async function resolveProxyInput(value: unknown): Promise<string | null> {
  if (value === 'saved') return getProxyDraft();
  return normalizeProxyUrl(value);
}
