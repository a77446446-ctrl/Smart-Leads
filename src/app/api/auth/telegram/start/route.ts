import { NextResponse } from 'next/server';
import { getAppOrigin } from '@/lib/app-origin';
import { createTelegramLoginRequest, telegramLoginStateCookie } from '@/lib/auth/telegram-oidc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const login = createTelegramLoginRequest();
    const response = NextResponse.redirect(login.authorizationUrl);
    response.cookies.set(telegramLoginStateCookie.name, login.stateCookie, {
      ...telegramLoginStateCookie.options,
      maxAge: telegramLoginStateCookie.maxAge,
    });
    return response;
  } catch (error) {
    console.error('[TELEGRAM AUTH START]', error instanceof Error ? error.message : error);
    return NextResponse.redirect(new URL('/login?error=telegram_not_configured', getAppOrigin(request.url)));
  }
}
