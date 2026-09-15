import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const excluded = new Set(['node_modules', '.next', '.git']);
const violations = [];
async function walk(directory, relative = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = relative ? relative + '/' + entry.name : entry.name;
    if (entry.isSymbolicLink()) { violations.push(name); continue; }
    if (excluded.has(entry.name) && entry.isDirectory()) continue;
    if (entry.isDirectory()) {
      if ((!relative && ['sessions', 'backups', 'debug_screenshots', '.venv', 'uploads', 'data'].includes(entry.name))
        || name === 'public/uploads' || entry.name === '__pycache__') violations.push(name);
      else await walk(path.join(directory, entry.name), name);
    } else if ((entry.name.startsWith('.env') && entry.name !== '.env.example') || /\.(db|sqlite|sqlite3|log|pyc|rar|zip)(-|$)/i.test(entry.name)) violations.push(name);
  }
}
await walk(root);
if (violations.length) {
  console.error('Перед поставкой исключите приватные файлы и локальное окружение:\n' + violations.join('\n'));
  process.exitCode = 1;
} else console.log('Приватные файлы, базы, сессии и старые загрузки в исходниках поставки не обнаружены.');
