import 'server-only';

import { prisma } from '@/lib/prisma';
import { decryptInstanceValue, encryptInstanceValue } from '@/lib/instance-secrets';

export const INSTANCE_FIELDS = [
  'MAX_BOT_TOKEN', 'MAX_BOT_USERNAME', 'MAX_WEBHOOK_SECRET',
  'TELEGRAM_CLIENT_ID', 'TELEGRAM_CLIENT_SECRET',
  'YOOKASSA_SHOP_ID', 'YOOKASSA_SECRET_KEY', 'YOOKASSA_VAT_CODE',
  'LEGAL_OPERATOR_TYPE', 'LEGAL_DOCUMENT_VERSION', 'LEGAL_EFFECTIVE_DATE',
  'LEGAL_OPERATOR_NAME', 'LEGAL_TAX_ID', 'LEGAL_REGISTRATION_ID',
  'LEGAL_ADDRESS', 'LEGAL_EMAIL', 'LEGAL_SUPPORT_EMAIL',
] as const;

export type InstanceField = typeof INSTANCE_FIELDS[number];
export const INSTANCE_SECRET_FIELDS = new Set<InstanceField>([
  'MAX_BOT_TOKEN', 'MAX_WEBHOOK_SECRET', 'TELEGRAM_CLIENT_SECRET', 'YOOKASSA_SECRET_KEY',
]);
const PREFIX = 'instance_env_';

function masterSecret(): string {
  return process.env.AUTH_SESSION_SECRET || '';
}

export function isInstanceSettingKey(key: string): boolean {
  return key.startsWith(PREFIX);
}

export function validateInstanceValue(field: InstanceField, raw: string): string {
  const value = raw.trim();
  if (value.length > 2000 || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('Некорректное значение');
  if (!value) return '';
  switch (field) {
    case 'MAX_BOT_USERNAME':
      if (!/^[A-Za-z0-9_][A-Za-z0-9_-]{1,63}$/.test(value)) throw new Error('Никнейм MAX укажите без @');
      break;
    case 'MAX_WEBHOOK_SECRET':
      if (!/^[A-Za-z0-9_-]{5,256}$/.test(value)) throw new Error('Секрет webhook MAX: 5–256 латинских букв, цифр, _ или -');
      break;
    case 'TELEGRAM_CLIENT_ID':
    case 'YOOKASSA_SHOP_ID':
      if (!/^\d{1,32}$/.test(value)) throw new Error('Укажите числовой ID');
      break;
    case 'TELEGRAM_CLIENT_SECRET':
      if (value.length < 16 || value.length > 512) throw new Error('Client Secret Telegram слишком короткий или длинный');
      break;
    case 'YOOKASSA_VAT_CODE':
      if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 12) throw new Error('Код НДС ЮKassa должен быть от 1 до 12');
      break;
    case 'LEGAL_OPERATOR_TYPE':
      if (!['COMPANY', 'SOLE_PROPRIETOR', 'SELF_EMPLOYED'].includes(value)) throw new Error('Неизвестный тип оператора');
      break;
    case 'LEGAL_TAX_ID':
      if (!/^(?:\d{10}|\d{12})$/.test(value)) throw new Error('ИНН должен содержать 10 или 12 цифр');
      break;
    case 'LEGAL_REGISTRATION_ID':
      if (!/^(?:\d{13}|\d{15})$/.test(value)) throw new Error('ОГРН/ОГРНИП должен содержать 13 или 15 цифр');
      break;
    case 'LEGAL_EMAIL':
    case 'LEGAL_SUPPORT_EMAIL':
      if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value)) throw new Error('Укажите корректный email');
      break;
    default:
      break;
  }
  return value;
}

/** Загружает настройки перед обслуживанием запросов; переменные Coolify остаются резервом. */
export async function loadInstanceConfig(): Promise<void> {
  const rows = await prisma.setting.findMany({
    where: { key: { startsWith: PREFIX } },
    select: { key: true, value: true },
  });
  for (const row of rows) {
    const field = row.key.slice(PREFIX.length) as InstanceField;
    if (!INSTANCE_FIELDS.includes(field)) continue;
    process.env[field] = decryptInstanceValue(row.value, masterSecret());
  }
}

export async function saveInstanceConfig(field: InstanceField, value: string): Promise<void> {
  const normalized = validateInstanceValue(field, value);
  const encrypted = encryptInstanceValue(normalized, masterSecret());
  await prisma.setting.upsert({
    where: { key: PREFIX + field },
    create: { key: PREFIX + field, value: encrypted },
    update: { value: encrypted },
  });
  process.env[field] = normalized;
}

export function publicInstanceConfig(): Record<string, { value: string; configured: boolean }> {
  return Object.fromEntries(INSTANCE_FIELDS.map(field => {
    const value = process.env[field] || '';
    return [field, { value: INSTANCE_SECRET_FIELDS.has(field) ? '' : value, configured: Boolean(value) }];
  }));
}
