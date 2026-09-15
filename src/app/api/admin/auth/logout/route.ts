import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { adminGuard } from '@/lib/auth/admin-guard';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const denied = await adminGuard();
  if (denied) return denied;
  try {
    const sessionPath = path.join(process.cwd(), 'sessions/active_session.json');
    await fs.unlink(sessionPath);
    console.log('MAKS Auth: Session deleted (Logout)');
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to logout' }, { status: 500 });
  }
}
