import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { originalWorkerSource, ORIGINAL_WORKER_NORMALIZED_SHA256, originalParserSource, ORIGINAL_PARSER_NORMALIZED_SHA256 } from './protected-parser-extension.mjs';

const root = new URL('../', import.meta.url);
const report = JSON.parse(await readFile(new URL('docs/source-integrity.json', root), 'utf8'));
let failed = false;
for (const [file, expected] of Object.entries(report.protectedSha256)) {
  const bytes = await readFile(new URL(file, root));
  const source = file === 'src/services/max-parser.ts' ? originalParserSource(bytes.toString('utf8')) : file === 'scripts/parser_worker.py' ? originalWorkerSource(bytes.toString('utf8')) : bytes;
  const actual = createHash('sha256').update(source).digest('hex');
  const baseline = file === 'src/services/max-parser.ts' ? ORIGINAL_PARSER_NORMALIZED_SHA256 : file === 'scripts/parser_worker.py' ? ORIGINAL_WORKER_NORMALIZED_SHA256 : expected;
  if (actual !== baseline) { console.error('Изменён защищённый файл: ' + file); failed = true; }
}
if (failed) process.exitCode = 1;
else console.log('Проверено защищённых файлов: ' + Object.keys(report.protectedSha256).length + '; учтены согласованные точки тематической обработки и фотографий; вход, сессии, прокси и остальной код совпадают с исходным.');
