import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

async function loadImageUploadModule() {
  const source = await read('src/lib/image-upload.ts');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

test('загрузка принимает только настоящие изображения разрешённого размера', async () => {
  const images = await loadImageUploadModule();
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const html = new TextEncoder().encode('<html><script>alert(1)</script></html>');

  assert.equal(images.isAllowedImageMimeType('image/png'), true);
  assert.equal(images.isAllowedImageMimeType('image/svg+xml'), false);
  assert.equal(images.hasValidImageSignature(png, 'image/png'), true);
  assert.equal(images.hasValidImageSignature(html, 'image/png'), false);
  assert.equal(images.hasValidImageSignature(new Uint8Array(images.MAX_IMAGE_BYTES + 1), 'image/png'), false);
});

test('маршруты загрузки ограничивают размер, MIME и имя файла', async () => {
  const [upload, download] = await Promise.all([
    read('src/app/api/admin/upload/route.ts'),
    read('src/app/api/uploads/[filename]/route.ts'),
  ]);
  assert.match(upload, /content-length/i);
  assert.match(upload, /file\.size/);
  assert.match(upload, /hasValidImageSignature/);
  assert.match(download, /LEGACY_IMAGE_NAME/);
  assert.match(download, /MAX_BASE64_LENGTH/);
  assert.doesNotMatch(download, /join\([^\n]+params\.filename/);
});
