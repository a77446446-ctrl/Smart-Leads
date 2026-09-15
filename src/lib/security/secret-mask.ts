export const SECRET_MASK = '••••••••';

export function isSecretSettingKey(key: string): boolean {
  return key === 'maks_ai_api_key' || key === 'maks_proxy_draft_encrypted';
}
