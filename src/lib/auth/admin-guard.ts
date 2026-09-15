import 'server-only';

import { NextResponse } from 'next/server';
import { AuthenticationError, AuthorizationError, requireAdmin } from '@/lib/auth/current-user';

export async function adminGuard(): Promise<NextResponse | null> {
  try {
    await requireAdmin();
    return null;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error('[ADMIN GUARD]', error);
    return NextResponse.json({ error: 'Не удалось проверить права администратора' }, { status: 500 });
  }
}
