import { NextRequest, NextResponse } from 'next/server';
import { adminGuard } from '@/lib/auth/admin-guard';
import { describeProxyDraft, getProxyDraft, saveProxyDraft } from '@/lib/proxy-draft';
import { safeParserError } from '@/lib/parser-accounts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const denied = await adminGuard();
  if (denied) return denied;
  try {
    const proxy = await getProxyDraft();
    return NextResponse.json(proxy ? { saved: true, ...describeProxyDraft(proxy) } : { saved: false });
  } catch (error) {
    return NextResponse.json({ saved: false, error: safeParserError(error) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const denied = await adminGuard();
  if (denied) return denied;
  try {
    const body = await request.json() as { proxy?: unknown };
    const proxy = await saveProxyDraft(body.proxy);
    return NextResponse.json({ saved: true, ...describeProxyDraft(proxy) });
  } catch (error) {
    return NextResponse.json({ saved: false, error: safeParserError(error) }, { status: 400 });
  }
}
