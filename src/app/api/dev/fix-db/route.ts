import { NextResponse } from 'next/server';
import { adminGuard } from '@/lib/auth/admin-guard';
import { prisma } from '@/lib/prisma';

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const denied = await adminGuard();
  if (denied) return denied;

  try {
    let output = "";

    const categories = await prisma.category.findMany();
    for (const cat of categories) {
      let changed = false;
      let newLeadPrice = cat.leadPrice;
      let newSubPrice = cat.subscriptionPrice;

      if (newLeadPrice >= 1000) {
        newLeadPrice = Math.floor(newLeadPrice / 100);
        changed = true;
      }
      if (newSubPrice >= 1000) {
        newSubPrice = Math.floor(newSubPrice / 100);
        changed = true;
      }

      if (changed) {
        await prisma.category.update({
          where: { id: cat.id },
          data: { leadPrice: newLeadPrice, subscriptionPrice: newSubPrice }
        });
        output += `Updated category ${cat.name} prices to ${newLeadPrice} and ${newSubPrice}\n`;
      }
    }

    const leads = await prisma.lead.findMany({ where: { price: { gte: 1000 } } });
    for (const lead of leads) {
      const newPrice = Math.floor(lead.price / 100);
      await prisma.lead.update({
        where: { id: lead.id },
        data: { price: newPrice }
      });
      output += `Updated lead ${lead.id} price to ${newPrice}\n`;
    }

    const users = await prisma.user.findMany({ where: { balance: { gte: 1000 } } });
    for (const u of users) {
      const newBal = Math.floor(u.balance / 100);
      await prisma.user.update({
        where: { id: u.id },
        data: { balance: newBal }
      });
      output += `Updated user ${u.name} balance to ${newBal}\n`;
    }

    return new NextResponse(output || "No fixes needed.", { status: 200 });
  } catch (err) {
    return new NextResponse(String(err), { status: 500 });
  }
}
