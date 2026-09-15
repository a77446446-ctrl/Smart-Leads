import { NextResponse } from 'next/server';
import { AuthenticationError, requireCurrentUser } from '@/lib/auth/current-user';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    await requireCurrentUser();
    return NextResponse.json(
      { error: 'Прямое пополнение отключено. Используйте подтверждённый платёж ЮKassa.', code: 'PAYMENTS_NOT_CONNECTED' },
      { status: 501 },
    );
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: 'Не удалось проверить пользователя' }, { status: 500 });
  }
}
