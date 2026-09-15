import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { adminGuard } from '@/lib/auth/admin-guard';
import { hasValidImageSignature, isAllowedImageMimeType, MAX_IMAGE_BYTES } from '@/lib/image-upload';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const denied = await adminGuard();
  if (denied) return denied;

  const contentLength = Number(request.headers.get('content-length') || '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES + 512 * 1024) {
    return NextResponse.json({ error: 'Изображение превышает лимит 5 МБ' }, { status: 413 });
  }

  try {
    const data = await request.formData();
    const file = data.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Изображение не загружено' }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'Размер изображения должен быть от 1 байта до 5 МБ' }, { status: 413 });
    }
    if (!isAllowedImageMimeType(file.type)) {
      return NextResponse.json({ error: 'Разрешены только JPEG, PNG, WEBP и GIF' }, { status: 415 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    if (!hasValidImageSignature(buffer, file.type)) {
      return NextResponse.json({ error: 'Содержимое файла не соответствует формату изображения' }, { status: 415 });
    }

    const base64 = buffer.toString('base64');
    const dataUri = `data:${file.type};base64,${base64}`;
    const uniqueId = `img_${randomUUID()}`;

    await prisma.setting.create({
      data: {
        key: uniqueId,
        value: dataUri,
      },
    });

    return NextResponse.json({ url: `/api/uploads/${uniqueId}` });
  } catch (error) {
    console.error('[ADMIN IMAGE UPLOAD]', error instanceof Error ? error.message : 'Неизвестная ошибка');
    return NextResponse.json({ error: 'Не удалось загрузить изображение' }, { status: 500 });
  }
}
