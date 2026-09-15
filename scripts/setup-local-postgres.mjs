import { randomBytes } from 'node:crypto';
import { appendFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeRoot = process.env.SMART_LEADS_RUNTIME_DIR || 'C:\\SmartLeadsRuntime';
const postgresRoot = path.join(runtimeRoot, 'PostgreSQL16', 'pgsql');
const postgresBin = path.join(postgresRoot, 'bin');
const dataDir = path.join(runtimeRoot, 'data');
const logFile = path.join(runtimeRoot, 'postgresql.log');
const passwordFile = path.join(runtimeRoot, 'initdb-password.tmp');
const envFile = path.join(projectRoot, '.env.local');
const databasePort = '55432';
const databaseUser = 'smart_leads_admin';
const databaseName = 'smart_leads_local';
const localAdminMaxId = '900000000001';

function executable(name) {
  return path.join(postgresBin, `${name}.exe`);
}

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

function secret(bytes = 32) {
  return randomBytes(bytes).toString('hex');
}

function run(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      cwd: projectRoot,
      env: { ...process.env, ...options.env },
      stdio: options.quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
    child.once('error', reject);
    child.once('exit', (code) => {
      const result = { code: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() };
      if (result.code === 0 || options.allowFailure) resolve(result);
      else reject(new Error(`${path.basename(file)} завершился с кодом ${result.code}: ${result.stderr || result.stdout}`));
    });
  });
}

function parseEnv(source) {
  const result = new Map();
  for (const line of source.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match) continue;
    result.set(match[1], match[2].replace(/^"|"$/g, ''));
  }
  return result;
}

async function loadLocalEnv() {
  if (!(await exists(envFile))) return new Map();
  return parseEnv(await readFile(envFile, 'utf8'));
}

function databasePasswordFromUrl(value) {
  if (!value) return '';
  try {
    return decodeURIComponent(new URL(value).password);
  } catch {
    return '';
  }
}

async function saveLocalEnv(values, existing) {
  const merged = new Map(existing);
  const required = {
    DATABASE_URL: values.databaseUrl,
    DIRECT_URL: values.databaseUrl,
    ADMIN_MAX_IDS: localAdminMaxId,
    DEV_ADMIN_MAX_ID: localAdminMaxId,
    DEV_LOGIN_ENABLED: 'true',
    AUTH_SESSION_SECRET: values.sessionSecret,
    PARSER_PROXY_ENCRYPTION_KEY: values.proxySecret,
    PARSER_SESSION_ENCRYPTION_KEY: values.parserSessionSecret,
    CRON_SECRET: values.cronSecret,
    INGEST_SECRET: values.ingestSecret,
    PARSER_SESSIONS_DIR: path.join(runtimeRoot, 'sessions').replaceAll('\\', '/'),
    NEXT_PUBLIC_APP_URL: 'http://localhost:3100',
  };
  const defaults = {
    PARSER_DEBUG_ARTIFACTS: 'false',
    DISCOVERY_ENABLED: 'false',
    LEGAL_OPERATOR_NAME: 'Тестовый оператор Smart Leads',
    LEGAL_EMAIL: 'demo@localhost',
    LEGAL_SUPPORT_EMAIL: 'demo@localhost',
  };
  for (const [key, value] of Object.entries(required)) merged.set(key, value);
  for (const [key, value] of Object.entries(defaults)) {
    if (!merged.has(key)) merged.set(key, value);
  }
  const lines = [
    '# Локальная среда Smart Leads. Файл исключён из поставки и Git.',
    ...[...merged.entries()].map(([key, value]) => `${key}=${JSON.stringify(value)}`),
    '',
  ];
  await writeFile(envFile, lines.join('\n'), { encoding: 'utf8', mode: 0o600 });
}

async function initializeCluster(databasePassword) {
  if (await exists(path.join(dataDir, 'PG_VERSION'))) return;
  await mkdir(runtimeRoot, { recursive: true });
  await mkdir(path.join(runtimeRoot, 'sessions'), { recursive: true });
  await writeFile(passwordFile, databasePassword, { encoding: 'utf8', mode: 0o600 });
  try {
    await run(executable('initdb'), [
      '--pgdata', dataDir,
      '--username', databaseUser,
      '--pwfile', passwordFile,
      '--encoding', 'UTF8',
      '--locale', 'C',
      '--auth-host', 'scram-sha-256',
      '--auth-local', 'scram-sha-256',
    ]);
  } finally {
    await rm(passwordFile, { force: true });
  }
  await appendFile(path.join(dataDir, 'postgresql.conf'), [
    '',
    '# Локальный экземпляр Smart Leads',
    "listen_addresses = '127.0.0.1'",
    `port = ${databasePort}`,
    'max_connections = 50',
    '',
  ].join('\n'), 'utf8');
}

async function startPostgres(databasePassword) {
  const status = await run(executable('pg_ctl'), ['status', '--pgdata', dataDir], { quiet: true, allowFailure: true });
  if (status.code === 0) return;
  await run(executable('pg_ctl'), [
    'start',
    '--pgdata', dataDir,
    '--log', logFile,
    '--options', `-p ${databasePort}`,
    '--wait',
  ], { env: { PGPASSWORD: databasePassword } });
}

async function ensureDatabase(databasePassword) {
  const pgEnv = {
    PGHOST: '127.0.0.1',
    PGPORT: databasePort,
    PGUSER: databaseUser,
    PGPASSWORD: databasePassword,
  };
  const lookup = await run(executable('psql'), [
    '--dbname', 'postgres',
    '--tuples-only',
    '--no-align',
    '--command', `SELECT 1 FROM pg_database WHERE datname = '${databaseName}'`,
  ], { quiet: true, env: pgEnv });
  if (lookup.stdout.trim() === '1') return;
  await run(executable('createdb'), [databaseName], { env: pgEnv });
}

async function deploySchema(databaseUrl) {
  const prismaCli = path.join(projectRoot, 'node_modules', 'prisma', 'build', 'index.js');
  await run(process.execPath, [prismaCli, 'migrate', 'deploy'], { env: { DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl } });
}

async function seedDemo(databaseUrl) {
  const [{ PrismaClient }, { PrismaPg }, { Pool }] = await Promise.all([
    import('@prisma/client'),
    import('@prisma/adapter-pg'),
    import('pg'),
  ]);
  const pool = new Pool({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const now = new Date();
  try {
    const categories = await Promise.all([
      prisma.category.upsert({
        where: { slug: 'marketing' },
        update: { name: 'Маркетинг', active: true },
        create: { name: 'Маркетинг', slug: 'marketing', plusKeywords: 'реклама, маркетинг, продвижение', leadPrice: 300, active: true },
      }),
      prisma.category.upsert({
        where: { slug: 'development' },
        update: { name: 'Разработка', active: true },
        create: { name: 'Разработка', slug: 'development', plusKeywords: 'сайт, разработка, приложение', leadPrice: 500, active: true },
      }),
      prisma.category.upsert({
        where: { slug: 'design' },
        update: { name: 'Дизайн', active: true },
        create: { name: 'Дизайн', slug: 'design', plusKeywords: 'дизайн, логотип, презентация', leadPrice: 250, active: true },
      }),
    ]);

    const admin = await prisma.user.upsert({
      where: { maxId: BigInt(localAdminMaxId) },
      update: { name: 'Локальный администратор', role: 'ADMIN', deletedAt: null },
      create: { maxId: BigInt(localAdminMaxId), name: 'Локальный администратор', role: 'ADMIN', balance: 5000 },
    });

    const demoUsers = await Promise.all([0, 1, 2].map((offset) => prisma.user.upsert({
      where: { maxId: BigInt(900000000101 + offset) },
      update: { deletedAt: null },
      create: { maxId: BigInt(900000000101 + offset), name: `Тестовый пользователь ${offset + 1}`, role: 'USER' },
    })));

    const demoLeads = [
      ['local-demo-lead-marketing', 'Нужна настройка рекламы для нового проекта', 'Ищем специалиста по рекламе. Тестовая заявка для локальной проверки.', 'Москва', categories[0].id, 300],
      ['local-demo-lead-development', 'Требуется разработка интернет-магазина', 'Нужно разработать интернет-магазин. Тестовая заявка для локальной проверки.', 'Санкт-Петербург', categories[1].id, 500],
      ['local-demo-lead-design', 'Нужен дизайнер презентации', 'Ищем дизайнера презентации. Тестовая заявка для локальной проверки.', 'Казань', categories[2].id, 250],
    ];
    for (const [fingerprint, title, rawText, city, categoryId, price] of demoLeads) {
      await prisma.lead.upsert({
        where: { fingerprint },
        update: { title, rawText, city, categoryId, price, status: 'NEW', deletedAt: null, createdAt: now },
        create: { fingerprint, contentFingerprint: `${fingerprint}-content`, title, rawText, city, categoryId, price, status: 'NEW', sourceChat: 'Учебный источник', createdAt: now },
      });
    }

    await prisma.subscription.upsert({
      where: { id: 'local-demo-subscription' },
      update: { userId: demoUsers[0].id, categoryId: categories[0].id, expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) },
      create: { id: 'local-demo-subscription', userId: demoUsers[0].id, categoryId: categories[0].id, expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) },
    });
    await prisma.transaction.upsert({
      where: { id: 'local-demo-transaction' },
      update: { userId: admin.id, type: 'BUY', amount: 490, deletedAt: null, createdAt: now },
      create: { id: 'local-demo-transaction', userId: admin.id, type: 'BUY', amount: 490, createdAt: now },
    });
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

async function main() {
  if (process.platform !== 'win32') throw new Error('Скрипт предназначен для локальной Windows-среды');
  if (!(await exists(executable('postgres')))) {
    throw new Error(`PostgreSQL не найден: ${postgresRoot}`);
  }

  const localEnv = await loadLocalEnv();
  const existingPassword = databasePasswordFromUrl(localEnv.get('DATABASE_URL'));
  const databasePassword = existingPassword || secret(24);
  const databaseUrl = `postgresql://${databaseUser}:${encodeURIComponent(databasePassword)}@127.0.0.1:${databasePort}/${databaseName}?schema=public`;
  const values = {
    databaseUrl,
    sessionSecret: localEnv.get('AUTH_SESSION_SECRET') || secret(48),
    proxySecret: localEnv.get('PARSER_PROXY_ENCRYPTION_KEY') || secret(48),
    parserSessionSecret: localEnv.get('PARSER_SESSION_ENCRYPTION_KEY') || secret(48),
    cronSecret: localEnv.get('CRON_SECRET') || secret(32),
    ingestSecret: localEnv.get('INGEST_SECRET') || secret(32),
  };

  await initializeCluster(databasePassword);
  await saveLocalEnv(values, localEnv);
  await startPostgres(databasePassword);
  await ensureDatabase(databasePassword);
  await deploySchema(databaseUrl);
  await seedDemo(databaseUrl);
  console.log('Локальная PostgreSQL и тестовые данные Smart Leads готовы.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
