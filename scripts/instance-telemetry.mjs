import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { httpsOrigin, keyIdentity } from '../operator/core.mjs';

export const REPORT_INTERVAL_MS = 5 * 60_000;

export function telemetryConfig(env) {
  const key = env.SMART_LEADS_INSTANCE_KEY?.trim();
  const origin = env.SMART_LEADS_CONTROL_URL?.trim();
  if (!key && !origin) return null;
  if (!keyIdentity(key) || !origin) throw new Error('Проверьте SMART_LEADS_INSTANCE_KEY и SMART_LEADS_CONTROL_URL');
  // Адрес задаёт оператор на своём VPS. Перенаправления при отправке запрещены.
  return { key, endpoint: httpsOrigin(origin, env.NODE_ENV === 'development') + '/api/instance-report' };
}

export async function collectReport(pool, version) {
  const { rows } = await pool.query(`SELECT
    (SELECT count(*)::text FROM "Lead" WHERE "deletedAt" IS NULL) AS materials,
    (SELECT count(*)::text FROM "User" WHERE "deletedAt" IS NULL) AS users,
    (SELECT count(*)::text FROM "BotDelivery" WHERE status IN ('PENDING','RETRY','PROCESSING')) AS "queuePending",
    (SELECT count(*)::text FROM "BotDelivery" WHERE status='FAILED') AS "queueFailed",
    pg_database_size(current_database())::text AS "databaseBytes",
    (SELECT max("lastSuccessAt") FROM "MaksAccount") AS "lastParserSuccessAt"`);
  const row = rows[0];
  return { version, materials: Number(row.materials), users: Number(row.users), queuePending: Number(row.queuePending), queueFailed: Number(row.queueFailed), databaseBytes: Number(row.databaseBytes), lastParserSuccessAt: row.lastParserSuccessAt ? new Date(row.lastParserSuccessAt).toISOString() : null };
}

export async function sendReport(config, report, fetcher = fetch) {
  const response = await fetcher(config.endpoint, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
    headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(report),
  });
  await response.body?.cancel();
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

/** Ошибка мониторинга не выходит наружу и не прерывает другие процессы приложения. */
export async function reportOnce({ pool, version, config, fetcher, log = console.log }) {
  try { await sendReport(config, await collectReport(pool, version), fetcher); log('[МОНИТОРИНГ] Отчёт принят центральной панелью'); return true; }
  catch { log('[МОНИТОРИНГ] Отчёт не принят. Проверьте адрес центра, ключ экземпляра и доступность базы. Повтор через 5 минут'); return false; }
}

async function main() {
  let config;
  try { config = telemetryConfig(process.env); }
  catch { console.error('[МОНИТОРИНГ] Проверьте SMART_LEADS_CONTROL_URL и SMART_LEADS_INSTANCE_KEY. После исправления перезапустите приложение'); return; }
  if (!config) { console.log('[МОНИТОРИНГ] Центральная панель не подключена'); return; }
  if (!process.env.DATABASE_URL) { console.error('[МОНИТОРИНГ] Не задан DATABASE_URL'); return; }
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const version = (process.env.SMART_LEADS_APP_VERSION || pkg.version).trim().slice(0, 80);
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000, statement_timeout: 10_000, idleTimeoutMillis: 30_000, options: '-c default_transaction_read_only=on' });
  pool.on('error', () => console.error('[МОНИТОРИНГ] Подключение к базе прервано; повтор в следующем цикле'));
  let stopped = false, timer;
  async function tick() {
    await reportOnce({ pool, version, config });
    if (!stopped) timer = setTimeout(tick, REPORT_INTERVAL_MS);
  }
  // Небольшая задержка даёт приложению завершить запуск после миграций.
  timer = setTimeout(tick, 15_000);
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
    if (stopped) return;
    stopped = true; clearTimeout(timer); void pool.end();
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Даже непредвиденная ошибка агента не активирует kill-others-on-fail.
  main().catch(() => console.error('[МОНИТОРИНГ] Агент не запущен. Проверьте настройки и перезапустите приложение'));
}
