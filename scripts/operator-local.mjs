import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';
import { spawn } from 'node:child_process';
import pg from 'pg';
import { createStore } from '../operator/store.mjs';
import { createOperatorServer } from '../operator/server.mjs';

async function main() {
  if (process.platform === 'win32') await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/start-local-postgres.mjs'], { windowsHide: true, stdio: 'inherit' });
    child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error('Не удалось запустить локальную PostgreSQL')));
  });
  const base = parseEnv(await readFile(new URL('../.env.local', import.meta.url), 'utf8'));
  const connection = new URL(base.DATABASE_URL);
  if (!['127.0.0.1', 'localhost'].includes(connection.hostname)) throw new Error('Локальная панель требует локальную PostgreSQL');
  const pool = new pg.Pool({ connectionString: connection.href, connectionTimeoutMillis: 5000 });
  try {
    const found = await pool.query("SELECT 1 FROM pg_database WHERE datname='smart_leads_operator_local'");
    if (!found.rowCount) await pool.query('CREATE DATABASE smart_leads_operator_local');
  } finally { await pool.end(); }
  connection.pathname = '/smart_leads_operator_local'; connection.search = '';
  const envPath = new URL('../.env.operator.local', import.meta.url);
  let config;
  try { config = parseEnv(await readFile(envPath, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    config = { OPERATOR_DATABASE_URL: connection.href, OPERATOR_PUBLIC_URL: 'http://127.0.0.1:3200', OPERATOR_ADMIN_KEY: randomBytes(32).toString('base64url'), NODE_ENV: 'development' };
    await writeFile(envPath, Object.entries(config).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n', { flag: 'wx', mode: 0o600 });
  }
  if (config.OPERATOR_PUBLIC_URL !== 'http://127.0.0.1:3200' || new URL(config.OPERATOR_DATABASE_URL).pathname !== '/smart_leads_operator_local' || !['127.0.0.1', 'localhost'].includes(new URL(config.OPERATOR_DATABASE_URL).hostname)) throw new Error('Проверьте локальную конфигурацию оператора');
  const store = createStore(config.OPERATOR_DATABASE_URL);
  await store.migrate();
  const server = await createOperatorServer({ store, adminKey: config.OPERATOR_ADMIN_KEY, origin: config.OPERATOR_PUBLIC_URL, production: false });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(3200, '127.0.0.1', resolve); });
  console.log('Панель оператора: http://127.0.0.1:3200');
  console.log('Ключ входа сохранён в .env.operator.local; клиентская база не изменена.');
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => { void store.close(); }));
}

main().catch(error => { console.error(error.message.startsWith('Проверьте') ? error.message : 'Локальная панель не запущена. Проверьте PostgreSQL и .env.operator.local'); process.exitCode = 1; });
