import { constants } from 'node:fs';
import { mkdir, open, unlink, lstat, opendir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { isApplicationThemeId, APPLICATION_THEME_SETTING_KEY } from '@/lib/application-theme';
import { MAX_IMAGE_BYTES, hasValidImageSignature } from '@/lib/image-upload';
import { MAX_LEAD_PHOTOS, MEDIA_KEY, mediaPath, mediaRoot, mediaLimitBytes, type PhotoMessage } from '@/lib/lead-media';

/** Ошибка настроек фотографий не должна останавливать получение текста или вход в MAX. */
export async function photoCaptureEnvironment(): Promise<Record<string, string>> {
  try {
    const theme = await prisma.setting.findUnique({ where: { key: APPLICATION_THEME_SETTING_KEY } });
    const enabled = theme && isApplicationThemeId(theme.value)
      && await prisma.category.findFirst({ where: { capturePhotos: true }, select: { id: true } });
    return { PARSER_CAPTURE_PHOTOS: enabled ? '1' : '0' };
  } catch {
    console.error('[ФОТО] Не удалось прочитать настройки фотографий');
    return { PARSER_CAPTURE_PHOTOS: '0' };
  }
}

async function removeFile(file: string) {
  try { await unlink(file); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}

export async function discardStagedPhotos(message: PhotoMessage) {
  for (const photo of (Array.isArray(message.photos) ? message.photos : []).slice(0, MAX_LEAD_PHOTOS)) {
    if (typeof photo?.key === 'string' && MEDIA_KEY.test(photo.key)) {
      try { await removeFile(mediaPath(photo.key, true)); }
      catch { console.error('[ФОТО] Временный файл будет повторно удалён при очистке'); }
    }
  }
}

export async function attachLeadPhotos(leadId: string, message: PhotoMessage) {
  const photos = (Array.isArray(message.photos) ? message.photos : []).slice(0, MAX_LEAD_PHOTOS);
  for (const [position, photo] of photos.entries()) {
    if (!photo || typeof photo.key !== 'string' || !MEDIA_KEY.test(photo.key)) continue;
    const source = mediaPath(photo.key, true);
    const stat = await lstat(source);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_IMAGE_BYTES || !stat.size) continue;
    const handle = await open(source, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    let bytes: Buffer;
    try {
      const current = await handle.stat();
      if (current.size > MAX_IMAGE_BYTES || !current.isFile()) continue;
      bytes = await handle.readFile();
    } finally { await handle.close(); }
    if (!hasValidImageSignature(bytes, photo.mimeType)) continue;
    // Резервирование размера и уникальной позиции происходит под одной блокировкой БД.
    const id = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(72416321)`;
      if (await tx.leadMedia.findUnique({ where: { leadId_position: { leadId, position } } })) return null;
      const used = await tx.leadMedia.aggregate({ _sum: { bytes: true } });
      if ((used._sum.bytes || 0) + bytes.length > mediaLimitBytes()) throw new Error('Достигнут лимит хранилища фотографий');
      const row = await tx.leadMedia.create({ data: { id: randomUUID(), leadId, position, mimeType: photo.mimeType, bytes: bytes.length } });
      return row.id;
    });
    if (!id) continue;
    // Неуспешная запись остаётся ready=false и будет удалена отдельной уборкой.
    await mkdir(path.join(mediaRoot(), 'files'), { recursive: true, mode: 0o700 });
    const output = await open(mediaPath(id), 'wx', 0o600);
    try { await output.writeFile(bytes); } finally { await output.close(); }
    await prisma.leadMedia.update({ where: { id }, data: { ready: true } });
  }
}

/** Запись об осиротевшем файле удаляем только после успешного unlink: ошибки можно повторять. */
export async function cleanupLeadMedia(now = new Date()) {
  const expired = await prisma.lead.findMany({
    where: { accessMode: 'PUBLIC', expiresAt: { lte: now }, purchases: { none: {} } },
    select: { id: true, fingerprint: true, sourceChat: true }, take: 100, orderBy: { expiresAt: 'asc' },
  });
  const removed = await prisma.$transaction(async tx => {
    // Не допускаем повторного появления старой новости при следующем чтении того же чата.
    await tx.parserSeenMessage.createMany({ data: expired.flatMap(lead => lead.fingerprint && lead.sourceChat
      ? [{ fingerprint: lead.fingerprint, sourceChat: lead.sourceChat }] : []), skipDuplicates: true });
    // Сохранённые копии и покупки остаются самостоятельными записями.
    await tx.lead.updateMany({ where: { duplicateOfId: { in: expired.map(lead => lead.id) } }, data: { duplicateOfId: null } });
    return tx.lead.deleteMany({ where: { id: { in: expired.map(lead => lead.id) }, accessMode: 'PUBLIC', expiresAt: { lte: now }, purchases: { none: {} } } });
  });
  const stale = new Date(now.getTime() - 3600_000);
  await prisma.leadMedia.updateMany({ where: { ready: false, createdAt: { lt: stale } }, data: { leadId: null } });
  const orphans = await prisma.leadMedia.findMany({ where: { leadId: null, OR: [{ ready: true }, { createdAt: { lt: stale } }] }, take: 600, orderBy: { createdAt: 'asc' } });
  let files = 0;
  for (const row of orphans) {
    try {
      await removeFile(mediaPath(row.id));
      await prisma.leadMedia.deleteMany({ where: { id: row.id, leadId: null } });
      files++;
    } catch { console.error('[ФОТО] Не удалось удалить файл, очистка повторится', row.id); }
  }
  // Остатки убитых worker ограничены квотой и удаляются через час.
  try {
    const directory = await opendir(path.join(mediaRoot(), 'staging'));
    let checked = 0;
    for await (const entry of directory) {
      if (++checked > 2000) break;
      if (!MEDIA_KEY.test(entry.name) || !entry.isFile()) continue;
      const file = mediaPath(entry.name, true);
      try { if ((await lstat(file)).mtimeMs < stale.getTime()) await removeFile(file); }
      catch { console.error('[ФОТО] Временный файл пока не удалён'); }
    }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  return { publications: removed.count, files };
}
