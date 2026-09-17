import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

export const FRESHNESS_MS = 15 * 60 * 1000;
export const SESSION_SECONDS = 8 * 60 * 60;
export class InputError extends Error {}
export const digest = value => createHash('sha256').update(value).digest('hex');
export const equalSecret = (a, b) => typeof a === 'string' && typeof b === 'string' && timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b)));

export function issueKey(id = randomUUID()) {
  const key = `slk_${id}_${randomBytes(32).toString('base64url')}`;
  return { id, key, keyHash: digest(key) };
}

export function keyIdentity(key) {
  return /^slk_([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})_[A-Za-z0-9_-]{43}$/.exec(key || '')?.[1] || null;
}

export function createSession(secret, now = Date.now()) {
  const value = `${Math.floor(now / 1000) + SESSION_SECONDS}.${randomBytes(24).toString('base64url')}`;
  return `${value}.${createHmac('sha256', secret).update(value).digest('base64url')}`;
}

export function validSession(token, secret, now = Date.now()) {
  if (typeof token !== 'string' || !/^\d{10}\.[A-Za-z0-9_-]{32}\.[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const [expires, nonce, signature] = token.split('.');
  const remaining = Number(expires) - Math.floor(now / 1000);
  return remaining > 0 && remaining <= SESSION_SECONDS && equalSecret(signature, createHmac('sha256', secret).update(`${expires}.${nonce}`).digest('base64url'));
}

export function httpsOrigin(value, allowLocal = false) {
  let url;
  try { url = new URL(value); } catch { throw new InputError('Укажите полный HTTPS-адрес сайта'); }
  const local = allowLocal && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && url.protocol === 'http:';
  if ((!local && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new InputError('Укажите HTTPS-домен без пути, пароля и параметров');
  return url.origin;
}

function text(value, title, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new InputError(`Проверьте поле «${title}» (до ${max} символов)`);
  return value.trim();
}

function date(value, title) {
  if (value === '' || value === null || value === undefined) return null;
  if (typeof value !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new InputError(`Проверьте дату «${title}»`);
  return value;
}

export function validateInstance(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError('Ожидается карточка экземпляра');
  const fee = body.monthlyFeeRub;
  if (typeof fee !== 'string' || !/^\d{1,7}(\.\d{1,2})?$/.test(fee)) throw new InputError('Стоимость: от 0 до 9 999 999,99 ₽, до двух знаков после точки');
  const status = body.serviceStatus;
  if (!['active', 'paused', 'archived'].includes(status)) throw new InputError('Неизвестный статус обслуживания');
  const paidUntil = date(body.paidUntil, 'Оплачено по');
  const backupAt = date(body.backupAt, 'Резервная копия');
  const restoreAt = date(body.restoreAt, 'Проверка восстановления');
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(new Date());
  for (const value of [backupAt, restoreAt]) if (value && value > today) throw new InputError('Дата выполненной проверки не может быть в будущем');
  return {
    name: text(body.name, 'Название', 120, true), customer: text(body.customer, 'Клиент', 160, true),
    domain: httpsOrigin(body.domain), contact: text(body.contact ?? '', 'Контакт', 240),
    plan: text(body.plan ?? '', 'Тариф', 120), monthlyFeeKopecks: Math.round(Number(fee) * 100),
    paidUntil, backupAt, restoreAt, serviceStatus: status, notes: text(body.notes ?? '', 'Заметки', 4000),
  };
}

export function validateReport(body, now = Date.now()) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError('Некорректный отчёт');
  // Белый список: сообщения, контакты и секреты никогда не сохраняются в отчёте.
  const result = { version: text(body.version, 'Версия', 80, true) };
  for (const field of ['materials', 'users', 'queuePending', 'queueFailed', 'databaseBytes']) {
    if (!Number.isSafeInteger(body[field]) || body[field] < 0) throw new InputError('Некорректная числовая метрика');
    result[field] = body[field];
  }
  result.lastParserSuccessAt = null;
  if (body.lastParserSuccessAt !== null) {
    const value = body.lastParserSuccessAt;
    if (typeof value !== 'string' || value.length > 40 || !Number.isFinite(Date.parse(value)) || Date.parse(value) > now + 60_000) throw new InputError('Некорректное время сбора');
    result.lastParserSuccessAt = new Date(value).toISOString();
  }
  return result;
}

export function connectionStatus(row, now = Date.now()) {
  if (!row.keyHash) return 'revoked';
  if (!row.lastSeenAt) return 'waiting';
  return now - new Date(row.lastSeenAt).getTime() <= FRESHNESS_MS ? 'connected' : 'unknown';
}

export function publicInstance(row, now = Date.now()) {
  const { keyHash, ...safe } = row;
  return { ...safe, connectionStatus: connectionStatus(row, now) };
}
