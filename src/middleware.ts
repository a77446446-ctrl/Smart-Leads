import { NextRequest, NextResponse } from 'next/server';
import { sessionCookie, verifySessionToken } from '@/lib/auth/session';

const ADMIN_CRON_PATH = '/api/admin/parser/cron';

function apiError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === ADMIN_CRON_PATH) return NextResponse.next();

  const session = await verifySessionToken(request.cookies.get(sessionCookie.name)?.value);
  const isApi = request.nextUrl.pathname.startsWith('/api/');
  if (!session) {
    if (isApi) return apiError('Требуется авторизация через MAX', 401);
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  const pathname = request.nextUrl.pathname;
  const isAdminOnlyPath = pathname.startsWith('/admin') || pathname.startsWith('/api/admin');

  if (isAdminOnlyPath) {
    if (session.role !== 'ADMIN') {
      if (isApi) return apiError('Недостаточно прав', 403);
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/consent/:path*',
    '/dashboard/:path*',
    '/my-leads/:path*',
    '/archive/:path*',
    '/profile/:path*',
    '/subscriptions/:path*',
    '/admin/:path*',
    '/api/admin/:path*',
  ],
};
