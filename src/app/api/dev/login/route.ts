import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { sessionCookie, createSessionToken } from '@/lib/auth/session';
import { isConfiguredAdminMaxId } from '@/lib/auth/admin-config';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production' || process.env.DEV_LOGIN_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const maxId = process.env.DEV_ADMIN_MAX_ID || '';
  if (!/^\d+$/.test(maxId) || !isConfiguredAdminMaxId(maxId)) {
    return NextResponse.json({ error: 'Локальный администратор не настроен' }, { status: 503 });
  }

  const user = await prisma.user.upsert({
    where: { maxId: BigInt(maxId) },
    update: { name: 'Локальный администратор', role: 'ADMIN', deletedAt: null, lastLoginAt: new Date() },
    create: { maxId: BigInt(maxId), name: 'Локальный администратор', role: 'ADMIN', lastLoginAt: new Date() },
  });
  const token = await createSessionToken(user.id, 'ADMIN');

  const cookieStore = await cookies();
  cookieStore.set({
    name: sessionCookie.name,
    value: token,
    ...sessionCookie.options,
    maxAge: sessionCookie.maxAge,
  });

  return NextResponse.redirect(new URL('/admin', request.url));
}
