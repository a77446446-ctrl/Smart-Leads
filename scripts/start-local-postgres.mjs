import path from 'node:path';
import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';

const runtimeRoot = process.env.SMART_LEADS_RUNTIME_DIR || 'C:\\SmartLeadsRuntime';
const postgresBin = path.join(runtimeRoot, 'PostgreSQL16', 'pgsql', 'bin');
const dataDir = path.join(runtimeRoot, 'data');
const logFile = path.join(runtimeRoot, 'postgresql.log');

async function exists(target) {
  try { await stat(target); return true; } catch { return false; }
}

function run(file, args, allowFailure = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { windowsHide: true, stdio: 'ignore' });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0 || allowFailure) resolve(code ?? 1);
      else reject(new Error(`${path.basename(file)} завершился с кодом ${code}`));
    });
  });
}

const pgCtl = path.join(postgresBin, 'pg_ctl.exe');
if (!(await exists(pgCtl)) || !(await exists(path.join(dataDir, 'PG_VERSION')))) {
  throw new Error('Локальная база не подготовлена. Сначала выполните npm run setup:local');
}
const status = await run(pgCtl, ['status', '--pgdata', dataDir], true);
if (status !== 0) {
  await run(pgCtl, ['start', '--pgdata', dataDir, '--log', logFile, '--options', '-p 55432', '--wait']);
}
console.log('Локальная PostgreSQL доступна на 127.0.0.1:55432.');
