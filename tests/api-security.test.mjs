import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('mutation API не используют raw SQL и закрывают внутреннюю загрузку', async () => {
  const [category, ingest, topup, leads, buy] = await Promise.all([
    read('src/app/api/admin/category/route.ts'),
    read('src/app/api/ingest/route.ts'),
    read('src/app/api/topup/route.ts'),
    read('src/app/api/leads/route.ts'),
    read('src/app/api/buy-lead/route.ts'),
  ]);
  for (const source of [category, leads, buy]) {
    assert.doesNotMatch(source, /\$queryRawUnsafe|\$executeRawUnsafe/);
  }
  assert.match(category, /prisma\.\$transaction/);
  assert.match(category, /tx\.category\.update/);
  assert.match(ingest, /process\.env\.INGEST_SECRET/);
  assert.match(ingest, /status:\s*401/);
  assert.match(topup, /status:\s*501/);
  assert.doesNotMatch(topup, /amount|increment/);
  assert.match(leads, /redactContactInfo/);
  assert.doesNotMatch(buy, /request\.json\(\)[\s\S]{0,100}userId/);
});
