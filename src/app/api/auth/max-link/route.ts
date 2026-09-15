import { NextRequest, NextResponse } from 'next/server';
import { buildMaxMiniAppLink } from '@/lib/max-bot';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const target = buildMaxMiniAppLink('home');
    return NextResponse.redirect(target, 302);
  } catch {
    const login = new URL('/login', request.url);
    login.searchParams.set('error', 'max_not_configured');
    return NextResponse.redirect(login, 302);
  }
}
