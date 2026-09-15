import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { prisma } from '@/lib/prisma';
import { hasValidImageSignature, isAllowedImageMimeType, MAX_IMAGE_BYTES } from '@/lib/image-upload';

const DATABASE_IMAGE_KEY = /^img_[A-Za-z0-9_-]{1,100}$/;
const LEGACY_IMAGE_NAME = /^[A-Za-z0-9_-]{1,100}\.(?:jpe?g|png|webp|gif)$/i;
const DATA_URI = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/;
const MAX_BASE64_LENGTH = Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 4;

export async function GET(_request: Request, { params }: { params: Promise<{ filename: string }> }) {
  try {
    const { filename } = await params;
    if (!DATABASE_IMAGE_KEY.test(filename) && !LEGACY_IMAGE_NAME.test(filename)) {
      return new NextResponse('File not found', { status: 404 });
    }

    // 1. Check if it's a database-backed image (starts with img_)
    if (DATABASE_IMAGE_KEY.test(filename)) {
      const setting = await prisma.setting.findUnique({
        where: { key: filename }
      });
      
      if (setting && setting.value.startsWith('data:')) {
        const matches = setting.value.match(DATA_URI);
        if (matches) {
          if (matches[2].length > MAX_BASE64_LENGTH || !isAllowedImageMimeType(matches[1])) {
            return new NextResponse('File not found', { status: 404 });
          }
          const mimeType = matches[1];
          const buffer = Buffer.from(matches[2], 'base64');
          if (!hasValidImageSignature(buffer, mimeType)) {
            return new NextResponse('File not found', { status: 404 });
          }
          return new NextResponse(new Uint8Array(buffer), {
            headers: {
              'Content-Type': mimeType,
              'Cache-Control': 'public, max-age=31536000, immutable',
              'Content-Security-Policy': "default-src 'none'; sandbox",
            },
          });
        }
      }
    }

    // 2. Fallback to file system (legacy)
    let path = join(process.cwd(), 'data', 'uploads', filename);
    let buffer: Buffer;
    try {
      buffer = await readFile(path);
    } catch {
      path = join(process.cwd(), 'public', 'uploads', filename);
      buffer = await readFile(path);
    }
    
    const ext = filename.split('.').pop()?.toLowerCase() || 'png';
    const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/webp';
    if (!hasValidImageSignature(buffer, mimeType)) {
      return new NextResponse('File not found', { status: 404 });
    }
    
    const body = new Uint8Array(buffer);
    return new NextResponse(body, {
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch {
    return new NextResponse('File not found', { status: 404 });
  }
}
