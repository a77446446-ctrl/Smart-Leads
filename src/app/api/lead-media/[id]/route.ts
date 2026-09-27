import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { AuthenticationError, requireCurrentUser } from '@/lib/auth/current-user';
import { prisma } from '@/lib/prisma';
import { MEDIA_KEY, MAX_VIDEO_BYTES, mediaPath, canReadLeadMedia } from '@/lib/lead-media';
import { MAX_IMAGE_BYTES, hasValidImageSignature } from '@/lib/image-upload';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" };
const missing = () => NextResponse.json({ error: 'Медиа недоступно' }, { status: 404, headers });

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    if (!MEDIA_KEY.test(id)) return missing();
    const media = await prisma.leadMedia.findUnique({ where: { id }, include: { lead: { select: {
      accessMode: true, deletedAt: true, expiresAt: true,
      purchases: { where: { userId: user.id }, select: { userId: true } },
    } } } });
    if (!media?.ready || !media.lead || !canReadLeadMedia(media.lead, user.id)) return missing();
    const file = await open(mediaPath(id), constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try {
      const stat = await file.stat();
      const video = media.mimeType === 'video/mp4';
      if (!stat.isFile() || stat.size > (video ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES) || stat.size !== media.bytes) return missing();
      const bytes = await file.readFile();
      if (video ? bytes.length < 12 || bytes.toString('ascii', 4, 8) !== 'ftyp' : !hasValidImageSignature(bytes, media.mimeType)) return missing();
      return new Response(new Uint8Array(bytes), { headers: { ...headers, 'Content-Type': media.mimeType, 'Content-Length': String(bytes.length) } });
    } finally { await file.close(); }
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401, headers });
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return missing();
    console.error('[МЕДИА] Не удалось прочитать файл');
    return NextResponse.json({ error: 'Не удалось загрузить медиа' }, { status: 503, headers });
  }
}
