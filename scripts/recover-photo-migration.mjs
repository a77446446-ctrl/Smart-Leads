import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const migrationName = '20260923020000_lead_photos';

export function shouldRecoverPhotoMigration(rows) {
  const failed = rows.filter((row) => row.finished_at === null && row.rolled_back_at === null);
  if (failed.length === 0) return false;
  if (failed.length !== 1 || failed[0].migration_name !== migrationName) return false;

  // Повторную автоматическую попытку запрещаем: причина ошибки требует изучения.
  if (rows.some((row) => row.migration_name === migrationName && row.rolled_back_at !== null)) {
    throw new Error(`Миграция ${migrationName} уже восстанавливалась автоматически или вручную. Проверьте её ошибку в журнале Prisma.`);
  }
  return true;
}

async function main() {
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Для проверки миграций требуется DIRECT_URL или DATABASE_URL.');

  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10000 });
  let rows;
  try {
    await client.connect();
    ({ rows } = await client.query('SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"'));
  } catch (error) {
    // На пустой базе таблицу истории создаст обычный prisma migrate deploy.
    if (error.code === '42P01') return;
    throw error;
  } finally {
    await client.end().catch(() => {});
  }

  if (!shouldRecoverPhotoMigration(rows)) return;

  console.log(`Восстанавливаем только неудачную миграцию ${migrationName}.`);
  const cli = fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url));
  const result = spawnSync(process.execPath, [cli, 'migrate', 'resolve', '--rolled-back', migrationName], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Не удалось отметить миграцию ${migrationName} для повторного применения.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
