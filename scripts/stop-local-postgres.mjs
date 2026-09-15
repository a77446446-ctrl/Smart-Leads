import path from 'node:path';
import { spawn } from 'node:child_process';

const runtimeRoot = process.env.SMART_LEADS_RUNTIME_DIR || 'C:\\SmartLeadsRuntime';
const pgCtl = path.join(runtimeRoot, 'PostgreSQL16', 'pgsql', 'bin', 'pg_ctl.exe');
const dataDir = path.join(runtimeRoot, 'data');

const child = spawn(pgCtl, ['stop', '--pgdata', dataDir, '--mode', 'fast', '--wait'], {
  windowsHide: true,
  stdio: 'inherit',
});
child.once('error', (error) => {
  console.error(`Не удалось остановить PostgreSQL: ${error.message}`);
  process.exitCode = 1;
});
child.once('exit', (code) => {
  if (code !== 0) process.exitCode = code ?? 1;
  else console.log('Локальная PostgreSQL остановлена.');
});
