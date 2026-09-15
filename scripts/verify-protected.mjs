import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const report = JSON.parse(await readFile(new URL('docs/source-integrity.json', root), 'utf8'));
let failed = false;
for (const [file, expected] of Object.entries(report.protectedSha256)) {
  const actual = createHash('sha256').update(await readFile(new URL(file, root))).digest('hex');
  if (actual !== expected) { console.error('Изменён защищённый файл: ' + file); failed = true; }
}
if (failed) process.exitCode = 1;
else console.log('Защищённые файлы совпадают с исходной копией: ' + Object.keys(report.protectedSha256).length);
