import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadTs } from './helpers/load-ts.mjs';

const media = loadTs('src/lib/lead-media.ts', {});
const images = loadTs('src/lib/image-upload.ts', {});
const image = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

test('пути фото не принимают обход каталога; срок публикации считается обычными часами', () => {
  for (const key of ['../secret', '/etc/passwd', 'C:\\secret', 'file.jpg', randomUUID() + '/x']) assert.throws(() => media.mediaPath(key));
  assert.equal(media.publicationExpiresAt(180, 0).getTime(), 3 * 3600_000);
  assert.equal(media.publicationExpiresAt(undefined, 0).getTime(), 24 * 3600_000);
  const lead = { accessMode: 'CONTACT', deletedAt: null, expiresAt: null, purchases: [] };
  assert.equal(media.canReadLeadMedia(lead, 'reader'), false);
  assert.equal(media.canReadLeadMedia({ ...lead, accessMode: 'PUBLIC', expiresAt: new Date(100) }, 'reader', 100), false);
  assert.equal(media.canReadLeadMedia({ ...lead, accessMode: 'PUBLIC', expiresAt: new Date(101) }, 'reader', 100), true);
  assert.equal(media.canReadLeadMedia({ ...lead, deletedAt: new Date(0), purchases: [{ userId: 'reader' }] }, 'reader'), true);
});

test('файлы: импорт, повтор, квота, закрытый HTTP-доступ и повторяемая очистка', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'smart-leads-media-'));
  const previous = process.env.LEAD_MEDIA_DIR;
  process.env.LEAD_MEDIA_DIR = root;
  const rows = [];
  const deleted = [];
  let quota = 0;
  const lead = { accessMode: 'CONTACT', deletedAt: null, expiresAt: null, purchases: [] };
  const prisma = {
    lead: {
      updateMany: async ({ data }) => { assert.deepEqual(data, { duplicateOfId: null }); return { count: 0 }; },
      findMany: async ({ where }) => { assert.equal(where.accessMode, 'PUBLIC'); assert.deepEqual(where.purchases, { none: {} }); return [{ id: 'expired', fingerprint: 'fp', sourceChat: 'chat' }]; },
      deleteMany: async ({ where }) => { assert.equal(where.accessMode, 'PUBLIC'); assert.deepEqual(where.purchases, { none: {} }); return { count: 1 }; },
    },
    parserSeenMessage: { createMany: async input => assert.deepEqual(input.data, [{ fingerprint: 'fp', sourceChat: 'chat' }]) },
    leadMedia: {
      findUnique: async ({ where }) => where.id ? { ...rows.find(row => row.id === where.id), lead } : rows.find(row => row.leadId === where.leadId_position.leadId && row.position === where.leadId_position.position),
      aggregate: async () => ({ _sum: { bytes: quota } }),
      create: async ({ data }) => { const row = { ...data, ready: false }; rows.push(row); return row; },
      update: async ({ where, data }) => Object.assign(rows.find(row => row.id === where.id), data),
      updateMany: async () => ({ count: 0 }),
      findMany: async () => rows.filter(row => row.leadId === null),
      deleteMany: async ({ where }) => { deleted.push(where.id); return { count: 1 }; },
    },
    $executeRaw: async () => 1,
  };
  prisma.$transaction = async callback => callback(prisma);
  const service = loadTs('src/services/lead-media.ts', {
    '@/lib/prisma': { prisma }, '@/lib/application-theme': loadTs('src/lib/application-theme.ts', {}),
    '@/lib/image-upload': images, '@/lib/lead-media': media,
  });
  try {
    await mkdir(path.join(root, 'staging'));
    const key = randomUUID();
    await writeFile(media.mediaPath(key, true), image);
    const message = { text: 'Фото', photos: [{ key, mimeType: 'image/jpeg' }] };
    await service.attachLeadPhotos('lead', message);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].ready, true);
    assert.deepEqual(await readFile(media.mediaPath(rows[0].id)), image);
    await service.attachLeadPhotos('lead', message);
    assert.equal(rows.length, 1);
    quota = media.mediaLimitBytes();
    await assert.rejects(service.attachLeadPhotos('other', message), /лимит хранилища/);
    assert.equal(rows.length, 1);
    await service.discardStagedPhotos(message);
    await assert.rejects(access(media.mediaPath(key, true)));

    class AuthenticationError extends Error {}
    let authorized = true;
    const route = loadTs('src/app/api/lead-media/[id]/route.ts', {
      'next/server': { NextResponse: { json: Response.json } }, '@/lib/prisma': { prisma },
      '@/lib/auth/current-user': { AuthenticationError, requireCurrentUser: async () => { if (!authorized) throw new AuthenticationError('Вход'); return { id: 'reader' }; } },
      '@/lib/lead-media': media, '@/lib/image-upload': images,
    });
    const get = () => route.GET(new Request('https://app.example/api/lead-media/x'), { params: Promise.resolve({ id: rows[0].id }) });
    assert.equal((await get()).status, 404);
    lead.purchases = [{ userId: 'stranger' }];
    assert.equal((await get()).status, 404);
    lead.purchases = [{ userId: 'reader' }];
    const response = await get();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), image);
    authorized = false;
    assert.equal((await get()).status, 401);

    rows[0].leadId = null;
    const blocked = { id: randomUUID(), leadId: null };
    rows.push(blocked);
    await mkdir(media.mediaPath(blocked.id));
    await service.cleanupLeadMedia();
    assert.ok(deleted.includes(rows[0].id));
    assert.ok(!deleted.includes(blocked.id), 'Ошибка unlink не должна терять запись для повторной очистки');
    await assert.rejects(access(media.mediaPath(rows[0].id)));
  } finally {
    if (previous === undefined) delete process.env.LEAD_MEDIA_DIR; else process.env.LEAD_MEDIA_DIR = previous;
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('smart-leads-media-'));
    await rm(root, { recursive: true, force: true });
  }
});

test('настройка фотографий проверяет администратора и происхождение запроса', async () => {
  let admin = false, sameOrigin = false, writes = 0;
  const route = loadTs('src/app/api/admin/category-media/route.ts', {
    'next/server': { NextResponse: { json: Response.json } },
    '@/lib/auth/admin-guard': { adminGuard: async () => admin ? null : Response.json({}, { status: 403 }) },
    '@/lib/same-app-origin': { isSameAppOrigin: () => sameOrigin },
    '@/lib/bounded-json': { readBoundedJson: request => request.json() },
    '@/lib/prisma': { prisma: { category: { updateMany: async ({ where, data }) => { assert.equal(where.id, 'sport'); assert.equal(data.capturePhotos, true); writes++; return { count: 1 }; } } } },
  });
  const post = body => route.POST(new Request('https://app.example/api/admin/category-media', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  assert.equal((await post({})).status, 403);
  admin = true;
  assert.equal((await post({})).status, 403);
  sameOrigin = true;
  assert.equal((await post({ categoryId: 'sport', capturePhotos: 'true' })).status, 400);
  assert.equal(writes, 0);
  assert.equal((await post({ categoryId: 'sport', capturePhotos: true })).status, 200);
  assert.equal(writes, 1);
});
