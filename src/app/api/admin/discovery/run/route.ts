import { NextResponse } from 'next/server';
import { adminGuard } from '@/lib/auth/admin-guard';
import { runChatDiscovery } from '@/services/chat-discovery';

export const runtime = 'nodejs';

export async function POST() {
  const denied = await adminGuard();
  if (denied) return denied;
  const result = await runChatDiscovery();
  return NextResponse.json(result, { status: result.success ? 200 : 502 });
}
