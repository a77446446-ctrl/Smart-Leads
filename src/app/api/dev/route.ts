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

  // Clear locks
  await prisma.parserLease.updateMany({ where: { id: 'max-parser' }, data: { lockedUntil: null } });
  await prisma.setting.upsert({ where: { key: 'syncing' }, update: { value: 'false' }, create: { key: 'syncing', value: 'false' } });

  // Convert categories back to rubles if they are huge
  const categories = await prisma.category.findMany();
  for (const cat of categories) {
    if (cat.leadPrice >= 100) {
      await prisma.category.update({
        where: { id: cat.id },
        data: {
          leadPrice: Math.floor(cat.leadPrice / 100),
          subscriptionPrice: Math.floor(cat.subscriptionPrice / 100)
        }
      });
    }
  }

  // Convert leads back to rubles
  const leads = await prisma.lead.findMany();
  for (const lead of leads) {
    if (lead.price >= 100) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { price: Math.floor(lead.price / 100) }
      });
    }
  }
  
  return NextResponse.json({ ok: true, message: 'Синхронизация разблокирована. Все суммы переведены в рубли.' });
}
