import 'server-only';

export function isConfiguredAdminMaxId(maxId: bigint | string): boolean {
  const normalizedMaxId = maxId.toString();
  return (process.env.ADMIN_MAX_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => /^\d+$/.test(value))
    .some((value) => value === normalizedMaxId);
}
