import 'server-only';

function isConfiguredNumericId(value: bigint | string | null | undefined, envValue: string | undefined): boolean {
  if (value === null || value === undefined) return false;
  const normalizedId = value.toString();
  return (envValue || '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => /^\d+$/.test(value))
    .some((configuredId) => configuredId === normalizedId);
}

export function isConfiguredAdminMaxId(maxId: bigint | string | null | undefined): boolean {
  return isConfiguredNumericId(maxId, process.env.ADMIN_MAX_IDS);
}

export function isConfiguredAdminTelegramId(telegramId: bigint | string | null | undefined): boolean {
  return isConfiguredNumericId(telegramId, process.env.ADMIN_TELEGRAM_IDS);
}

export function isConfiguredAdminIdentity(identity: {
  maxId?: bigint | string | null;
  telegramId?: bigint | string | null;
}): boolean {
  return isConfiguredAdminMaxId(identity.maxId) || isConfiguredAdminTelegramId(identity.telegramId);
}
