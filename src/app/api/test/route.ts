import { NextResponse } from 'next/server';
import { adminGuard } from '@/lib/auth/admin-guard';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const denied = await adminGuard();
  if (denied) return denied;
  return NextResponse.json(await prisma.lead.findMany({ orderBy: { createdAt: 'desc' }, take: 10, select: { title: true, createdAt: true } }));
}
